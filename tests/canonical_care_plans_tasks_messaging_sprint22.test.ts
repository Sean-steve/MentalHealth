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
import { CarePlanService, CarePlanProgressService, resetCarePlansForTesting, CarePlanType } from '../mindos/care_plans/index.js';
import { AuthorizationError, DomainInvariantError } from '../mindos/platform/errors/index.js';

const userId = 'user-s22-0001';
const professionalId = 'prof-s22-0001';
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
});