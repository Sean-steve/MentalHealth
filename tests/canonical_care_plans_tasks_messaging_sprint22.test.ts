import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  CareRelationshipService,
  CareRelationshipType,
  CareRelationshipOriginType,
  resetCareRelationshipsForTesting
} from '../mindos/care_relationships/index.js';
import { ConsentService } from '../mindos/consent/index.js';
import { ProfessionalService } from '../mindos/professionals/service.js';
import {
  ProfessionalType,
  ProfessionalState,
  ProfessionalVerificationState,
  DeliveryMode,
  ProfileVisibility
} from '../mindos/professionals/domain/types.js';
import {
  ClinicalTaskService,
  ClinicalTaskType,
  ClinicalTaskAssigneeType,
  ClinicalTaskCompletionAuthority,
  ClinicalTaskEvidenceType,
  ClinicalTaskState,
  ClinicalTaskScheduler,
  PolicyRegistryClinicalTaskRecurrenceAdapter,
  resetClinicalTasksForTesting
} from '../mindos/clinical_tasks/index.js';
import {
  ProfessionalMessagingService,
  ProfessionalThreadType,
  ThreadParticipantType,
  ProfessionalMessageType,
  ProfessionalThreadStatus,
  resetProfessionalMessagingForTesting
} from '../mindos/professional_messaging/index.js';
import {
  CarePlanService,
  CarePlanProgressService,
  CarePlanReviewService,
  CareGoalService,
  CareInterventionService,
  resetCarePlansForTesting,
  CarePlanType,
  CarePlanState,
  CarePlanReviewType,
  CarePlanReviewOutcome,
  CareGoalType,
  CareGoalProvenance,
  GoalPriority,
  GoalTargetType,
  CareInterventionType
} from '../mindos/care_plans/index.js';
import { reconcileSprint22RelationshipClosure } from '../mindos/sprint22/index.js';
import { AuthorizationError, DomainInvariantError } from '../mindos/platform/errors/index.js';
import { EventBus } from '../mindos/platform/events/index.js';

const userId = 'user-s22-0001';
const professionalId = 'prof-s22-0001';
const unrelatedProfessionalId = 'prof-s22-unrelated';
let relationshipId = '';

describe('MindOS Sprint 22 reconciliation: Care Plans, Clinical Tasks & Professional Messaging', () => {
  before(async () => {
    ConsentService.resetForTesting();
    resetCareRelationshipsForTesting();
    resetClinicalTasksForTesting();
    resetProfessionalMessagingForTesting();
    resetCarePlansForTesting();

    ConsentService.recordConsent({ userId, consentType: 'CLINICAL_CONSULTATION', status: 'GRANTED' });
    await ProfessionalService.getRepository().saveProfile({
      id: professionalId,
      user_id: 'user-prof-s22-0001',
      professional_type: ProfessionalType.CLINICAL_PSYCHOLOGIST,
      display_name: 'Sprint 22 Test Clinician',
      legal_name_reference: 'Sprint 22 Test Clinician',
      status: ProfessionalState.ACTIVE,
      verification_status: ProfessionalVerificationState.VERIFIED,
      jurisdictions: ['KE'], languages: ['en'], specialties: ['TEST'],
      delivery_modes: [DeliveryMode.TELEHEALTH], organization_refs: [],
      profile_visibility: ProfileVisibility.INTERNAL_ONLY,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    });
    await ProfessionalService.getRepository().saveProfile({
      id: unrelatedProfessionalId,
      user_id: 'user-prof-s22-unrelated',
      professional_type: ProfessionalType.CLINICAL_PSYCHOLOGIST,
      display_name: 'Unrelated Sprint 22 Clinician',
      legal_name_reference: 'Unrelated Sprint 22 Clinician',
      status: ProfessionalState.ACTIVE,
      verification_status: ProfessionalVerificationState.VERIFIED,
      jurisdictions: ['KE'], languages: ['en'], specialties: ['TEST'],
      delivery_modes: [DeliveryMode.TELEHEALTH], organization_refs: [],
      profile_visibility: ProfileVisibility.INTERNAL_ONLY,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    });
    const relationship = await CareRelationshipService.createRelationship({
      subjectUserId: userId,
      primaryProviderId: professionalId,
      relationshipType: CareRelationshipType.PSYCHOLOGY,
      originType: CareRelationshipOriginType.CARE_NAVIGATION,
      originReference: 'sprint-22-reconciliation',
      jurisdiction: 'KE', purpose: 'CARE_DELIVERY', activateImmediately: true,
      actorId: professionalId
    });
    relationshipId = relationship.id;
  });

  it('does not invent a care-plan review cadence', async () => {
    await assert.rejects(
      () => CarePlanService.createDraftPlan({
        relationshipId, authorProfessionalId: professionalId,
        planType: CarePlanType.PSYCHOLOGICAL_SUPPORT,
        summary: 'Governed plan', actorId: professionalId
      }),
      (err: Error) => err instanceof DomainInvariantError && /review frequency/i.test(err.message)
    );
  });

  it('enforces service-level relationship authorization for goals and interventions', async () => {
    const plan = await CarePlanService.createDraftPlan({
      relationshipId,
      authorProfessionalId: professionalId,
      planType: CarePlanType.PSYCHOLOGICAL_SUPPORT,
      summary: 'Authorization boundary plan',
      reviewFrequencyDays: 14,
      actorId: professionalId
    });

    await assert.rejects(
      () => CareGoalService.createGoal({
        carePlanVersionId: plan.current_version_id,
        goalCode: 'UNAUTHORIZED_GOAL',
        goalType: CareGoalType.WELLBEING,
        title: 'Must not be created',
        descriptionReference: 'protected-description:unauthorized',
        priority: GoalPriority.NORMAL,
        targetType: GoalTargetType.USER_RATING,
        provenance: CareGoalProvenance.PROFESSIONAL_RECOMMENDED,
        creatorId: unrelatedProfessionalId,
        actorRole: 'PROFESSIONAL'
      }),
      AuthorizationError
    );

    await assert.rejects(
      () => CareInterventionService.createIntervention({
        carePlanVersionId: plan.current_version_id,
        interventionType: CareInterventionType.CONTENT,
        referenceType: 'CONTENT_VERSION',
        referenceId: 'content:test',
        title: 'Must not be created',
        frequency: 'governed-schedule:test',
        responsibleActorType: 'USER',
        creatorId: unrelatedProfessionalId
      }),
      AuthorizationError
    );
  });

  it('limits user-created goals to the subject and USER_SELECTED provenance', async () => {
    const plan = await CarePlanService.createDraftPlan({
      relationshipId,
      authorProfessionalId: professionalId,
      planType: CarePlanType.PSYCHOLOGICAL_SUPPORT,
      summary: 'User goal boundary plan',
      reviewFrequencyDays: 14,
      actorId: professionalId
    });

    await assert.rejects(
      () => CareGoalService.createGoal({
        carePlanVersionId: plan.current_version_id,
        goalCode: 'USER_PROVENANCE_FORGERY',
        goalType: CareGoalType.WELLBEING,
        title: 'Forged provenance',
        descriptionReference: 'protected-description:forged',
        priority: GoalPriority.NORMAL,
        targetType: GoalTargetType.USER_RATING,
        provenance: CareGoalProvenance.PROFESSIONAL_RECOMMENDED,
        creatorId: userId,
        actorRole: 'USER'
      }),
      AuthorizationError
    );

    const goal = await CareGoalService.createGoal({
      carePlanVersionId: plan.current_version_id,
      goalCode: 'USER_SELECTED_GOAL',
      goalType: CareGoalType.WELLBEING,
      title: 'My own wellbeing goal',
      descriptionReference: 'protected-description:user-selected',
      priority: GoalPriority.NORMAL,
      targetType: GoalTargetType.USER_RATING,
      provenance: CareGoalProvenance.USER_SELECTED,
      creatorId: userId,
      actorRole: 'USER'
    });

    assert.equal(goal.created_by, userId);
    assert.equal(goal.provenance, CareGoalProvenance.USER_SELECTED);
  });

  it('rejects goal and intervention mutation against a superseded plan version', async () => {
    const plan = await CarePlanService.createDraftPlan({
      relationshipId,
      authorProfessionalId: professionalId,
      planType: CarePlanType.PSYCHOLOGICAL_SUPPORT,
      summary: 'Version binding plan',
      reviewFrequencyDays: 14,
      actorId: professionalId
    });
    await CarePlanService.activatePlan(plan.id, professionalId);
    const oldVersionId = plan.current_version_id;

    await CarePlanService.createNewVersion({
      planId: plan.id,
      authorProfessionalId: professionalId,
      summary: 'Replacement version',
      goals: [],
      interventions: [],
      changeRationale: 'Version-binding regression',
      reviewFrequencyDays: 14,
      actorId: professionalId
    });

    await assert.rejects(
      () => CareGoalService.createGoal({
        carePlanVersionId: oldVersionId,
        goalCode: 'STALE_GOAL',
        goalType: CareGoalType.WELLBEING,
        title: 'Stale goal',
        descriptionReference: 'protected-description:stale',
        priority: GoalPriority.NORMAL,
        targetType: GoalTargetType.USER_RATING,
        provenance: CareGoalProvenance.PROFESSIONAL_RECOMMENDED,
        creatorId: professionalId,
        actorRole: 'PROFESSIONAL'
      }),
      AuthorizationError
    );

    await assert.rejects(
      () => CareInterventionService.createIntervention({
        carePlanVersionId: oldVersionId,
        interventionType: CareInterventionType.CONTENT,
        referenceType: 'CONTENT_VERSION',
        referenceId: 'content:stale',
        title: 'Stale intervention',
        frequency: 'governed-schedule:stale',
        responsibleActorType: 'USER',
        creatorId: professionalId
      }),
      AuthorizationError
    );
  });

  it('enforces task dependencies and rejects cycles', async () => {
    const first = await ClinicalTaskService.createTask({
      care_relationship_id: relationshipId,
      task_type: ClinicalTaskType.USER_ACTION,
      assigned_to_type: ClinicalTaskAssigneeType.USER,
      assigned_to_id: userId,
      title: 'First governed action', instruction_reference: 'instruction:first',
      source_type: 'CARE_PLAN', source_reference: 'plan:test', policy_version: 'test-v1',
      creator_professional_id: professionalId
    });
    assert.equal(first.status, ClinicalTaskState.READY);

    const second = await ClinicalTaskService.createTask({
      care_relationship_id: relationshipId,
      task_type: ClinicalTaskType.USER_ACTION,
      assigned_to_type: ClinicalTaskAssigneeType.USER,
      assigned_to_id: userId,
      title: 'Dependent action', instruction_reference: 'instruction:second',
      source_type: 'CARE_PLAN', source_reference: 'plan:test', policy_version: 'test-v1',
      dependency_task_ids: [first.id], creator_professional_id: professionalId
    });
    assert.equal(second.status, ClinicalTaskState.BLOCKED);
    await assert.rejects(() => ClinicalTaskService.addDependency(first.id, second.id), DomainInvariantError);
  });

  it('requires owner-domain evidence for assessment task completion', async () => {
    const task = await ClinicalTaskService.createTask({
      care_relationship_id: relationshipId, task_type: ClinicalTaskType.ASSESSMENT,
      assigned_to_type: ClinicalTaskAssigneeType.USER, assigned_to_id: userId,
      title: 'Assessment', instruction_reference: 'assessment:PHQ9',
      source_type: 'CARE_PLAN', source_reference: 'plan:test', policy_version: 'test-v1',
      completion_authority: ClinicalTaskCompletionAuthority.OWNER_DOMAIN,
      owner_domain: 'assessments', creator_professional_id: professionalId
    });
    await assert.rejects(() => ClinicalTaskService.completeTask({
      task_id: task.id, actor_id: userId, actor_type: ClinicalTaskAssigneeType.USER,
      completion_source: 'assessments',
      evidence_type: ClinicalTaskEvidenceType.USER_ATTESTATION, evidence_reference: 'spoofed-assessment-completion'
    }), AuthorizationError);
    const completed = await ClinicalTaskService.completeTask({
      task_id: task.id, actor_id: 'assessment-service', actor_type: ClinicalTaskAssigneeType.SYSTEM,
      completion_source: 'assessments', evidence_type: ClinicalTaskEvidenceType.DOMAIN_EVENT,
      evidence_reference: 'assessment.completed:event-1'
    });
    assert.equal(completed.status, ClinicalTaskState.COMPLETED);
  });


  it('projects real clinical-task state into Care Plan progress without calling task completion a clinical outcome', async () => {
    const plan = await CarePlanService.createDraftPlan({
      relationshipId,
      authorProfessionalId: professionalId,
      planType: CarePlanType.PSYCHOLOGICAL_SUPPORT,
      summary: 'Sprint 22 progress projection plan',
      reviewFrequencyDays: 14,
      actorId: professionalId
    });
    await CarePlanService.activatePlan(plan.id, professionalId);

    const task = await ClinicalTaskService.createTask({
      care_relationship_id: relationshipId,
      care_plan_id: plan.id,
      task_type: ClinicalTaskType.USER_ACTION,
      assigned_to_type: ClinicalTaskAssigneeType.USER,
      assigned_to_id: userId,
      title: 'User-reported routine action',
      instruction_reference: 'instruction:routine',
      source_type: 'CARE_PLAN',
      source_reference: plan.id,
      policy_version: 'test-v1',
      creator_professional_id: professionalId
    });

    let projection = await CarePlanProgressService.getProgress(plan.id);
    assert.equal(projection.tasks_summary.total, 1);
    assert.equal(projection.tasks_summary.pending, 1);
    assert.equal(projection.tasks_summary.completed, 0);

    await ClinicalTaskService.completeTask({
      task_id: task.id,
      actor_id: userId,
      actor_type: ClinicalTaskAssigneeType.USER,
      evidence_type: ClinicalTaskEvidenceType.USER_ATTESTATION,
      evidence_reference: 'user-report:routine-done'
    });

    projection = await CarePlanProgressService.getProgress(plan.id);
    assert.equal(projection.tasks_summary.total, 1);
    assert.equal(projection.tasks_summary.pending, 0);
    assert.equal(projection.tasks_summary.completed, 1);
  });

  it('creates relationship-scoped care messaging without pretending safety monitoring is configured', async () => {
    const thread = await ProfessionalMessagingService.openThread({
      care_relationship_id: relationshipId, thread_type: ProfessionalThreadType.CARE_COMMUNICATION,
      purpose: 'CARE_COORDINATION', created_by: userId, creator_type: ThreadParticipantType.USER,
      professional_id: professionalId
    });
    assert.equal(thread.status, ProfessionalThreadStatus.OPEN);
    assert.equal(thread.response_expectation_reference, 'MESSAGING_NOT_EMERGENCY_MONITORING');

    const message = await ProfessionalMessagingService.sendMessage({
      thread_id: thread.id, sender_type: ThreadParticipantType.USER, sender_id: userId,
      message_type: ProfessionalMessageType.TEXT, content_reference: 'protected-message:001',
      idempotency_key: 's22-message-001'
    });
    assert.equal(message.safety_monitoring_status, 'NOT_CONFIGURED');
    const retry = await ProfessionalMessagingService.sendMessage({
      thread_id: thread.id, sender_type: ThreadParticipantType.USER, sender_id: userId,
      message_type: ProfessionalMessageType.TEXT, content_reference: 'protected-message:001',
      idempotency_key: 's22-message-001'
    });
    assert.equal(retry.id, message.id);
  });

  it('generates one idempotent next occurrence from an explicit recurrence policy', async () => {
    ClinicalTaskScheduler.setRecurrencePort(
      new PolicyRegistryClinicalTaskRecurrenceAdapter([
        {
          rule_key: 'TEST_HOURLY',
          interval_minutes: 60,
          anchor: 'COMPLETED_AT',
          max_occurrences: 3,
          policy_version: 'test-v1'
        }
      ])
    );

    const task = await ClinicalTaskService.createTask({
      care_relationship_id: relationshipId,
      task_type: ClinicalTaskType.USER_ACTION,
      assigned_to_type: ClinicalTaskAssigneeType.USER,
      assigned_to_id: userId,
      title: 'Recurring governed action',
      instruction_reference: 'instruction:recurring',
      recurrence_rule: 'TEST_HOURLY',
      source_type: 'CARE_PLAN',
      source_reference: 'plan:test',
      policy_version: 'test-v1',
      creator_professional_id: professionalId
    });

    await ClinicalTaskService.completeTask({
      task_id: task.id,
      actor_id: userId,
      actor_type: ClinicalTaskAssigneeType.USER,
      evidence_type: ClinicalTaskEvidenceType.USER_ATTESTATION,
      evidence_reference: 'user-report:recurrence-root-done'
    });

    const first = await ClinicalTaskScheduler.spawnNextOccurrence(task.id);
    const retry = await ClinicalTaskScheduler.spawnNextOccurrence(task.id);

    assert.equal(first.status, 'CREATED');
    assert.equal(retry.status, 'CREATED');
    assert.equal(first.task_id, retry.task_id);

    const next = await ClinicalTaskService.getTask(first.task_id!);
    assert.equal(next.recurrence_parent_task_id, task.id);
    assert.equal(next.recurrence_sequence, 1);
    assert.equal(next.recurrence_rule, 'TEST_HOURLY');
  });

  it('deduplicates policy-driven task reminders with persistent receipts', async () => {
    let notifications = 0;
    ClinicalTaskScheduler.setReminderPort({
      async notifyDue() {
        notifications += 1;
        return {
          accepted: true,
          notification_reference: `notification:${notifications}`
        };
      }
    });

    const now = new Date();
    const task = await ClinicalTaskService.createTask({
      care_relationship_id: relationshipId,
      task_type: ClinicalTaskType.USER_ACTION,
      assigned_to_type: ClinicalTaskAssigneeType.USER,
      assigned_to_id: userId,
      title: 'Reminder governed action',
      instruction_reference: 'instruction:reminder',
      due_at: new Date(now.getTime() + 5 * 60_000).toISOString(),
      source_type: 'CARE_PLAN',
      source_reference: 'plan:test',
      policy_version: 'test-v1',
      creator_professional_id: professionalId
    });

    const first = await ClinicalTaskScheduler.sendDueReminders({
      now,
      horizon_minutes: 10,
      reminder_key: 'TEST_T_MINUS_10'
    });
    const retry = await ClinicalTaskScheduler.sendDueReminders({
      now,
      horizon_minutes: 10,
      reminder_key: 'TEST_T_MINUS_10'
    });

    assert.ok(first.sent.includes(task.id));
    assert.ok(retry.skipped.includes(task.id));
    assert.equal(notifications, 1);
  });

  it('fails closed for care-message attachments until governed media policy is configured', async () => {
    const thread = await ProfessionalMessagingService.openThread({
      care_relationship_id: relationshipId,
      thread_type: ProfessionalThreadType.CARE_COMMUNICATION,
      purpose: 'CARE_COORDINATION',
      created_by: userId,
      creator_type: ThreadParticipantType.USER,
      professional_id: professionalId
    });
    const message = await ProfessionalMessagingService.sendMessage({
      thread_id: thread.id,
      sender_type: ThreadParticipantType.USER,
      sender_id: userId,
      message_type: ProfessionalMessageType.TEXT,
      content_reference: 'protected-message:attachment-test',
      idempotency_key: 's22-attachment-message'
    });

    await assert.rejects(
      () => ProfessionalMessagingService.addAttachment({
        thread_id: thread.id,
        message_id: message.id,
        actor_id: userId,
        evidence_reference: 'protected-file:001',
        mime_type: 'application/pdf',
        size_bytes: 1024,
        scan_status: 'CLEAN',
        data_classification: 'CLINICAL_RECORD'
      }),
      (err: Error) =>
        err instanceof DomainInvariantError &&
        /attachment rejected by governed policy/i.test(err.message)
    );
  });

  it('reconciles plan, unfinished tasks and messaging when a care relationship terminates', async () => {
    const closureUserId = 'user-s22-closure';
    ConsentService.recordConsent({
      userId: closureUserId,
      consentType: 'CLINICAL_CONSULTATION',
      status: 'GRANTED'
    });

    const relationship = await CareRelationshipService.createRelationship({
      subjectUserId: closureUserId,
      primaryProviderId: professionalId,
      relationshipType: CareRelationshipType.PSYCHOLOGY,
      originType: CareRelationshipOriginType.CARE_NAVIGATION,
      originReference: 'sprint-22-closure',
      jurisdiction: 'KE',
      purpose: 'CARE_DELIVERY',
      activateImmediately: true,
      actorId: professionalId
    });

    const plan = await CarePlanService.createDraftPlan({
      relationshipId: relationship.id,
      authorProfessionalId: professionalId,
      planType: CarePlanType.PSYCHOLOGICAL_SUPPORT,
      summary: 'Closure reconciliation plan',
      reviewFrequencyDays: 14,
      actorId: professionalId
    });
    await CarePlanService.activatePlan(plan.id, professionalId);

    const task = await ClinicalTaskService.createTask({
      care_relationship_id: relationship.id,
      care_plan_id: plan.id,
      task_type: ClinicalTaskType.USER_ACTION,
      assigned_to_type: ClinicalTaskAssigneeType.USER,
      assigned_to_id: closureUserId,
      title: 'Action cancelled on relationship close',
      instruction_reference: 'instruction:closure',
      source_type: 'CARE_PLAN',
      source_reference: plan.id,
      policy_version: 'test-v1',
      creator_professional_id: professionalId
    });

    const thread = await ProfessionalMessagingService.openThread({
      care_relationship_id: relationship.id,
      thread_type: ProfessionalThreadType.CARE_COMMUNICATION,
      purpose: 'CARE_COORDINATION',
      created_by: closureUserId,
      creator_type: ThreadParticipantType.USER,
      professional_id: professionalId
    });

    await CareRelationshipService.terminateRelationship(
      relationship.id,
      'Test closure',
      professionalId
    );

    const result = await reconcileSprint22RelationshipClosure(relationship.id);
    assert.equal(result.care_plan.action, 'TERMINATED');
    assert.ok(result.clinical_tasks.cancelled.includes(task.id));
    assert.ok(result.professional_messaging.closed_threads.includes(thread.id));

    const reconciledPlan = await CarePlanService.getPlan(plan.id);
    const reconciledTask = await ClinicalTaskService.getTask(task.id);
    const reconciledThread = await ProfessionalMessagingService.getThread(thread.id);

    assert.equal(reconciledPlan?.status, CarePlanState.TERMINATED);
    assert.equal(reconciledTask.status, ClinicalTaskState.CANCELLED);
    assert.equal(reconciledThread.status, ProfessionalThreadStatus.CLOSED);

    const retry = await reconcileSprint22RelationshipClosure(relationship.id);
    assert.equal(retry.care_plan.action, 'NONE');
    assert.equal(retry.clinical_tasks.cancelled.length, 0);
    assert.equal(retry.professional_messaging.closed_threads.length, 0);
  });


  it('denies new care messages immediately after relationship termination before reconciliation', async () => {
    const raceUserId = 'user-s22-message-race';
    ConsentService.recordConsent({
      userId: raceUserId,
      consentType: 'CLINICAL_CONSULTATION',
      status: 'GRANTED'
    });

    const relationship = await CareRelationshipService.createRelationship({
      subjectUserId: raceUserId,
      primaryProviderId: professionalId,
      relationshipType: CareRelationshipType.PSYCHOLOGY,
      originType: CareRelationshipOriginType.CARE_NAVIGATION,
      originReference: 'sprint-22-message-race',
      jurisdiction: 'KE',
      purpose: 'CARE_DELIVERY',
      activateImmediately: true,
      actorId: professionalId
    });

    const thread = await ProfessionalMessagingService.openThread({
      care_relationship_id: relationship.id,
      thread_type: ProfessionalThreadType.CARE_COMMUNICATION,
      purpose: 'CARE_COORDINATION',
      created_by: raceUserId,
      creator_type: ThreadParticipantType.USER,
      professional_id: professionalId
    });

    await CareRelationshipService.terminateRelationship(
      relationship.id,
      'Test immediate messaging authorization cutoff',
      professionalId
    );

    await assert.rejects(
      () => ProfessionalMessagingService.sendMessage({
        thread_id: thread.id,
        sender_type: ThreadParticipantType.USER,
        sender_id: raceUserId,
        message_type: ProfessionalMessageType.TEXT,
        content_reference: 'protected-message:must-not-send',
        idempotency_key: 's22-message-race-denied'
      }),
      (err: Error) =>
        err instanceof AuthorizationError &&
        /active care relationship/i.test(err.message)
    );

    await reconcileSprint22RelationshipClosure(relationship.id);
    const reconciled = await ProfessionalMessagingService.getThread(thread.id);
    assert.equal(reconciled.status, ProfessionalThreadStatus.CLOSED);
  });

  it('denies task action immediately after relationship termination before reconciliation', async () => {
    const raceUserId = 'user-s22-race';
    ConsentService.recordConsent({
      userId: raceUserId,
      consentType: 'CLINICAL_CONSULTATION',
      status: 'GRANTED'
    });

    const relationship = await CareRelationshipService.createRelationship({
      subjectUserId: raceUserId,
      primaryProviderId: professionalId,
      relationshipType: CareRelationshipType.PSYCHOLOGY,
      originType: CareRelationshipOriginType.CARE_NAVIGATION,
      originReference: 'sprint-22-race',
      jurisdiction: 'KE',
      purpose: 'CARE_DELIVERY',
      activateImmediately: true,
      actorId: professionalId
    });

    const task = await ClinicalTaskService.createTask({
      care_relationship_id: relationship.id,
      task_type: ClinicalTaskType.USER_ACTION,
      assigned_to_type: ClinicalTaskAssigneeType.USER,
      assigned_to_id: raceUserId,
      title: 'Race-condition task',
      instruction_reference: 'instruction:race',
      source_type: 'CARE_PLAN',
      source_reference: 'plan:race',
      policy_version: 'test-v1',
      creator_professional_id: professionalId
    });

    await CareRelationshipService.terminateRelationship(
      relationship.id,
      'Test immediate authorization cutoff',
      professionalId
    );

    await assert.rejects(
      () => ClinicalTaskService.startTask(
        task.id,
        raceUserId,
        ClinicalTaskAssigneeType.USER
      ),
      AuthorizationError
    );

    await reconcileSprint22RelationshipClosure(relationship.id);
    const reconciled = await ClinicalTaskService.getTask(task.id);
    assert.equal(reconciled.status, ClinicalTaskState.CANCELLED);
  });


  it('rejects cross-user task assignment outside the care relationship subject', async () => {
    await assert.rejects(
      () => ClinicalTaskService.createTask({
        care_relationship_id: relationshipId,
        task_type: ClinicalTaskType.USER_ACTION,
        assigned_to_type: ClinicalTaskAssigneeType.USER,
        assigned_to_id: 'different-user-s22',
        title: 'Cross-user task must be denied',
        instruction_reference: 'instruction:deny-cross-user',
        source_type: 'CARE_PLAN',
        source_reference: 'plan:test',
        policy_version: 'test-v1',
        creator_professional_id: professionalId
      }),
      AuthorizationError
    );
  });


  it('rejects a reply reference that points into another care thread', async () => {
    const firstThread = await ProfessionalMessagingService.openThread({
      care_relationship_id: relationshipId,
      thread_type: ProfessionalThreadType.CARE_COMMUNICATION,
      purpose: 'CARE_COORDINATION',
      created_by: userId,
      creator_type: ThreadParticipantType.USER,
      professional_id: professionalId
    });
    const secondThread = await ProfessionalMessagingService.openThread({
      care_relationship_id: relationshipId,
      thread_type: ProfessionalThreadType.FOLLOW_UP,
      purpose: 'CARE_COORDINATION',
      created_by: userId,
      creator_type: ThreadParticipantType.USER,
      professional_id: professionalId
    });

    const firstMessage = await ProfessionalMessagingService.sendMessage({
      thread_id: firstThread.id,
      sender_type: ThreadParticipantType.USER,
      sender_id: userId,
      message_type: ProfessionalMessageType.TEXT,
      content_reference: 'protected-message:reply-origin',
      idempotency_key: 's22-reply-origin'
    });

    await assert.rejects(
      () => ProfessionalMessagingService.sendMessage({
        thread_id: secondThread.id,
        sender_type: ThreadParticipantType.USER,
        sender_id: userId,
        message_type: ProfessionalMessageType.TEXT,
        content_reference: 'protected-message:cross-thread-reply',
        idempotency_key: 's22-cross-thread-reply',
        reply_to_message_id: firstMessage.id
      }),
      (err: Error) =>
        err instanceof DomainInvariantError &&
        /same care thread/i.test(err.message)
    );
  });


  it('resumes a MODIFY review after completion persistence fails without duplicating the plan version', async () => {
    const plan = await CarePlanService.createDraftPlan({
      relationshipId,
      authorProfessionalId: professionalId,
      planType: CarePlanType.PSYCHOLOGICAL_SUPPORT,
      summary: 'Review saga failure plan',
      reviewFrequencyDays: 14,
      actorId: professionalId
    });
    await CarePlanService.activatePlan(plan.id, professionalId);

    const review = await CarePlanReviewService.scheduleReview({
      planId: plan.id,
      reviewType: CarePlanReviewType.SCHEDULED,
      scheduledFor: new Date().toISOString(),
      reviewerId: professionalId
    });

    const repository = CarePlanService.getRepository() as any;
    const originalFinalize = repository.savePlanReviewTransactional.bind(repository);
    let failFinalizeOnce = true;
    repository.savePlanReviewTransactional = async (...args: any[]) => {
      if (failFinalizeOnce) {
        failFinalizeOnce = false;
        throw new Error('SIMULATED_REVIEW_COMPLETION_PERSISTENCE_FAILURE');
      }
      return originalFinalize(...args);
    };

    const request = {
      reviewId: review.id,
      outcome: CarePlanReviewOutcome.MODIFY,
      goalReviews: [],
      reviewerId: professionalId,
      recommendedChanges: ['Adjust governed plan'],
      newVersionParams: {
        summary: 'Review-created replacement version',
        goals: [],
        interventions: [],
        changeRationale: 'Failure-injection review modification',
        reviewFrequencyDays: 14
      }
    };

    try {
      await assert.rejects(
        () => CarePlanReviewService.executeReview(request),
        /SIMULATED_REVIEW_COMPLETION_PERSISTENCE_FAILURE/
      );

      const started = await CarePlanReviewService.getReview(review.id);
      const afterAction = await CarePlanService.getPlan(plan.id);
      assert.ok(started?.started_at);
      assert.equal(started?.completed_at, undefined);
      assert.ok(started?.new_version_id);
      assert.equal(afterAction?.current_version_id, started?.new_version_id);

      repository.savePlanReviewTransactional = originalFinalize;
      const completed = await CarePlanReviewService.executeReview(request);
      assert.ok(completed.completed_at);
      assert.equal(completed.new_version_id, started?.new_version_id);

      const versions = await repository.findVersionsByPlanId(plan.id);
      assert.equal(versions.length, 2);
    } finally {
      repository.savePlanReviewTransactional = originalFinalize;
    }
  });

  it('does not allow an in-progress Care Plan review to change outcome on retry', async () => {
    const plan = await CarePlanService.createDraftPlan({
      relationshipId,
      authorProfessionalId: professionalId,
      planType: CarePlanType.PSYCHOLOGICAL_SUPPORT,
      summary: 'Review outcome lock plan',
      reviewFrequencyDays: 14,
      actorId: professionalId
    });
    await CarePlanService.activatePlan(plan.id, professionalId);

    const review = await CarePlanReviewService.scheduleReview({
      planId: plan.id,
      reviewType: CarePlanReviewType.SCHEDULED,
      scheduledFor: new Date().toISOString(),
      reviewerId: professionalId
    });

    const repository = CarePlanService.getRepository() as any;
    const originalFinalize = repository.savePlanReviewTransactional.bind(repository);
    repository.savePlanReviewTransactional = async () => {
      throw new Error('SIMULATED_REVIEW_FINALIZE_FAILURE');
    };

    try {
      await assert.rejects(
        () => CarePlanReviewService.executeReview({
          reviewId: review.id,
          outcome: CarePlanReviewOutcome.CONTINUE,
          goalReviews: [],
          reviewerId: professionalId
        }),
        /SIMULATED_REVIEW_FINALIZE_FAILURE/
      );

      repository.savePlanReviewTransactional = originalFinalize;
      await assert.rejects(
        () => CarePlanReviewService.executeReview({
          reviewId: review.id,
          outcome: CarePlanReviewOutcome.TERMINATE,
          goalReviews: [],
          reviewerId: professionalId
        }),
        (err: Error) =>
          err instanceof DomainInvariantError &&
          /different outcome/i.test(err.message)
      );
    } finally {
      repository.savePlanReviewTransactional = originalFinalize;
    }
  });

  it('emits exactly one Care Plan review completion event under concurrent finalization', async () => {
    const plan = await CarePlanService.createDraftPlan({
      relationshipId,
      authorProfessionalId: professionalId,
      planType: CarePlanType.PSYCHOLOGICAL_SUPPORT,
      summary: 'Concurrent review finalization plan',
      reviewFrequencyDays: 14,
      actorId: professionalId
    });
    await CarePlanService.activatePlan(plan.id, professionalId);

    const review = await CarePlanReviewService.scheduleReview({
      planId: plan.id,
      reviewType: CarePlanReviewType.SCHEDULED,
      scheduledFor: new Date().toISOString(),
      reviewerId: professionalId
    });

    EventBus.clearOutbox();
    const request = {
      reviewId: review.id,
      outcome: CarePlanReviewOutcome.CONTINUE,
      goalReviews: [],
      reviewerId: professionalId
    };

    const [first, second] = await Promise.all([
      CarePlanReviewService.executeReview(request),
      CarePlanReviewService.executeReview(request)
    ]);

    assert.ok(first.completed_at);
    assert.equal(second.completed_at, first.completed_at);
    const completionEvents = EventBus.getOutbox().filter(
      record =>
        record.event_type === 'care.plan_review_completed' &&
        JSON.parse(record.payload).aggregate_id === review.id
    );
    assert.equal(completionEvents.length, 1);
  });

  it('makes completed Care Plan review retries idempotent', async () => {
    const plan = await CarePlanService.createDraftPlan({
      relationshipId,
      authorProfessionalId: professionalId,
      planType: CarePlanType.PSYCHOLOGICAL_SUPPORT,
      summary: 'Review retry plan',
      reviewFrequencyDays: 14,
      actorId: professionalId
    });
    await CarePlanService.activatePlan(plan.id, professionalId);

    const review = await CarePlanReviewService.scheduleReview({
      planId: plan.id,
      reviewType: CarePlanReviewType.SCHEDULED,
      scheduledFor: new Date().toISOString(),
      reviewerId: professionalId
    });

    const first = await CarePlanReviewService.executeReview({
      reviewId: review.id,
      outcome: CarePlanReviewOutcome.CONTINUE,
      goalReviews: [],
      reviewerId: professionalId
    });
    const retry = await CarePlanReviewService.executeReview({
      reviewId: review.id,
      outcome: CarePlanReviewOutcome.TERMINATE,
      goalReviews: [],
      reviewerId: professionalId
    });

    assert.equal(retry.id, first.id);
    assert.equal(retry.completed_at, first.completed_at);
    assert.equal(retry.outcome, CarePlanReviewOutcome.CONTINUE);
  });

  it('rejects a stale Care Plan review after the current plan version changes', async () => {
    const plan = await CarePlanService.createDraftPlan({
      relationshipId,
      authorProfessionalId: professionalId,
      planType: CarePlanType.PSYCHOLOGICAL_SUPPORT,
      summary: 'Stale review plan',
      reviewFrequencyDays: 14,
      actorId: professionalId
    });
    await CarePlanService.activatePlan(plan.id, professionalId);

    const review = await CarePlanReviewService.scheduleReview({
      planId: plan.id,
      reviewType: CarePlanReviewType.SCHEDULED,
      scheduledFor: new Date().toISOString(),
      reviewerId: professionalId
    });

    await CarePlanService.createNewVersion({
      planId: plan.id,
      authorProfessionalId: professionalId,
      summary: 'Newer plan version',
      goals: [],
      interventions: [],
      changeRationale: 'Test stale review protection',
      reviewFrequencyDays: 14,
      actorId: professionalId
    });

    await assert.rejects(
      () => CarePlanReviewService.executeReview({
        reviewId: review.id,
        outcome: CarePlanReviewOutcome.CONTINUE,
        goalReviews: [],
        reviewerId: professionalId
      }),
      (err: Error) =>
        err instanceof DomainInvariantError &&
        /stale/i.test(err.message)
    );
  });


  it('does not let a professional bypass required user acknowledgement', async () => {
    const plan = await CarePlanService.createDraftPlan({
      relationshipId,
      authorProfessionalId: professionalId,
      planType: CarePlanType.PSYCHOLOGICAL_SUPPORT,
      summary: 'Acknowledgement-gated plan',
      reviewFrequencyDays: 14,
      requiresUserAcknowledgement: true,
      actorId: professionalId
    });

    await assert.rejects(
      () => CarePlanService.activatePlan(plan.id, professionalId),
      (err: Error) =>
        err instanceof DomainInvariantError &&
        /acknowledgement/i.test(err.message)
    );

    const acknowledged = await CarePlanService.userAcknowledgePlan(plan.id, userId);
    assert.equal(acknowledged.status, CarePlanState.ACTIVE);
    const versionAfterFirstAck = acknowledged.version;

    const retry = await CarePlanService.userAcknowledgePlan(plan.id, userId);
    assert.equal(retry.status, CarePlanState.ACTIVE);
    assert.equal(retry.version, versionAfterFirstAck);
  });

  it('does not allow a terminal Care Plan to be resurrected through a new version', async () => {
    const plan = await CarePlanService.createDraftPlan({
      relationshipId,
      authorProfessionalId: professionalId,
      planType: CarePlanType.PSYCHOLOGICAL_SUPPORT,
      summary: 'Terminal plan',
      reviewFrequencyDays: 14,
      actorId: professionalId
    });
    await CarePlanService.activatePlan(plan.id, professionalId);
    await CarePlanService.completePlan(plan.id, professionalId);

    await assert.rejects(
      () => CarePlanService.createNewVersion({
        planId: plan.id,
        authorProfessionalId: professionalId,
        summary: 'Attempted resurrection',
        goals: [],
        interventions: [],
        changeRationale: 'Must fail',
        reviewFrequencyDays: 14,
        actorId: professionalId
      }),
      (err: Error) =>
        err instanceof DomainInvariantError &&
        /cannot create a replacement active version/i.test(err.message)
    );
  });

});