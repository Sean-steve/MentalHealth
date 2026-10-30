import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { UnitOfWork } from '../../platform/database/index.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { CorrelationManager } from '../../platform/shared/correlation.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';
import { AuthorizationError, DomainInvariantError, NotFoundError } from '../../platform/errors/index.js';
import {
  RelationshipAccessEvaluator,
  CareRelationshipService,
  CareRelationshipState,
  CareTeamService,
  CareTeamMembershipState,
  DataDomain,
  ActionPermission
} from '../../care_relationships/index.js';
import { ClinicalTask, ClinicalTaskDependency, ClinicalTaskEvidence, ClinicalTaskReminderReceipt } from '../domain/entities.js';
import {
  ClinicalTaskState,
  ClinicalTaskType,
  ClinicalTaskAssigneeType,
  ClinicalTaskPriority,
  ClinicalTaskCompletionAuthority,
  ClinicalTaskDependencyType,
  ClinicalTaskEvidenceType
} from '../domain/types.js';
import { IClinicalTaskRepository } from '../repositories/interfaces.js';
import { CarePlanService } from '../../care_plans/plans/care_plan_service.js';
import { CareGoalService } from '../../care_plans/goals/care_goal_service.js';
import { CarePlanState } from '../../care_plans/domain/types.js';

const OWNER_DOMAIN_BY_TASK: Partial<Record<ClinicalTaskType, string>> = {
  [ClinicalTaskType.ASSESSMENT]: 'assessments',
  [ClinicalTaskType.CONTENT]: 'content',
  [ClinicalTaskType.EXERCISE]: 'content',
  [ClinicalTaskType.APPOINTMENT]: 'appointments',
  [ClinicalTaskType.CARE_REVIEW]: 'care_plans'
};

export interface CreateClinicalTaskParams {
  care_relationship_id: string;
  care_plan_id?: string;
  care_goal_id?: string;
  task_type: ClinicalTaskType;
  assigned_to_type: ClinicalTaskAssigneeType;
  assigned_to_id: string;
  priority?: ClinicalTaskPriority;
  title: string;
  instruction_reference: string;
  due_at?: string;
  recurrence_rule?: string;
  recurrence_parent_task_id?: string;
  recurrence_sequence?: number;
  source_type: string;
  source_reference: string;
  completion_authority?: ClinicalTaskCompletionAuthority;
  owner_domain?: string;
  dependency_task_ids?: string[];
  policy_version: string;
  idempotency_key?: string;
  creator_professional_id: string;
}

export interface CompleteClinicalTaskParams {
  task_id: string;
  actor_id: string;
  actor_type: ClinicalTaskAssigneeType;
  completion_source?: string;
  evidence_type: ClinicalTaskEvidenceType;
  evidence_reference: string;
}

export class ClinicalTaskService {
  private static repository: IClinicalTaskRepository;

  public static setRepository(repo: IClinicalTaskRepository): void { ClinicalTaskService.repository = repo; }

  private static assertRepository(): void {
    if (!ClinicalTaskService.repository) throw new DomainInvariantError('ClinicalTaskRepository not initialized.');
  }

  private static async persistTaskStateMutation(
    task: ClinicalTask,
    expectedState: ClinicalTaskState,
    event?: { type: string; payload: Record<string, unknown> }
  ): Promise<void> {
    if (ClinicalTaskService.repository.requiresUnitOfWork()) {
      await UnitOfWork.run(async uow => {
        await ClinicalTaskService.repository.saveTaskWithExpectedState(
          task,
          expectedState,
          uow.getClient()
        );
        if (event) {
          uow.registerOutboxEvent(
            event.type,
            'clinical_tasks',
            task.id,
            event.payload,
            {
              correlation_id: CorrelationManager.getCorrelationId(),
              data_classification: DataClassification.CLINICAL_RECORD,
              producer_domain: 'clinical_tasks'
            }
          );
        }
      }, 'SERIALIZABLE');
      return;
    }

    await ClinicalTaskService.repository.saveTaskWithExpectedState(
      task,
      expectedState
    );
    if (event) {
      EventBus.enqueue(
        event.type,
        'clinical_tasks',
        task.id,
        DataClassification.CLINICAL_RECORD,
        event.payload
      );
    }
  }

  private static async persistTaskCompletion(
    task: ClinicalTask,
    evidence: ClinicalTaskEvidence,
    expectedState: ClinicalTaskState,
    event: { type: string; payload: Record<string, unknown> }
  ): Promise<void> {
    if (ClinicalTaskService.repository.requiresUnitOfWork()) {
      await UnitOfWork.run(async uow => {
        await ClinicalTaskService.repository.completeTaskAggregate(
          task,
          evidence,
          expectedState,
          uow.getClient()
        );
        uow.registerOutboxEvent(
          event.type,
          'clinical_tasks',
          task.id,
          event.payload,
          {
            correlation_id: CorrelationManager.getCorrelationId(),
            data_classification: DataClassification.CLINICAL_RECORD,
            producer_domain: 'clinical_tasks'
          }
        );
      }, 'SERIALIZABLE');
      return;
    }

    await ClinicalTaskService.repository.completeTaskAggregate(
      task,
      evidence,
      expectedState
    );
    EventBus.enqueue(
      event.type,
      'clinical_tasks',
      task.id,
      DataClassification.CLINICAL_RECORD,
      event.payload
    );
  }

  public static async createTask(params: CreateClinicalTaskParams): Promise<ClinicalTask> {
    ClinicalTaskService.assertRepository();
    if (params.idempotency_key) {
      const existing = await ClinicalTaskService.repository.findTaskByIdempotencyKey(params.idempotency_key);
      if (existing) return existing;
    }

    await RelationshipAccessEvaluator.assertAccess({
      relationshipId: params.care_relationship_id,
      professionalId: params.creator_professional_id,
      dataDomain: DataDomain.CARE_PLANS,
      action: ActionPermission.WRITE,
      purpose: 'CARE_DELIVERY'
    });
    const relationship = await CareRelationshipService.getRelationship(params.care_relationship_id);
    if (!relationship) throw new NotFoundError(`CareRelationship ${params.care_relationship_id} not found.`);
    if (relationship.status !== CareRelationshipState.ACTIVE) {
      throw new DomainInvariantError('Clinical Task creation requires an active care relationship.');
    }

    if (
      params.assigned_to_type === ClinicalTaskAssigneeType.USER &&
      params.assigned_to_id !== relationship.subject_user_id
    ) {
      throw new AuthorizationError(
        'User-assigned clinical task must target the subject of the care relationship.',
        { errorCode: 'AUTHZ_003' }
      );
    }

    if (params.assigned_to_type === ClinicalTaskAssigneeType.PROFESSIONAL) {
      await RelationshipAccessEvaluator.assertAccess({
        relationshipId: relationship.id,
        professionalId: params.assigned_to_id,
        dataDomain: DataDomain.CARE_PLANS,
        action: ActionPermission.WRITE,
        purpose: 'CARE_DELIVERY'
      });
    }

    if (
      params.assigned_to_type === ClinicalTaskAssigneeType.CARE_TEAM_ROLE &&
      !String(params.assigned_to_id || '').trim()
    ) {
      throw new DomainInvariantError('Care-team-role task requires an explicit role identifier.');
    }

    let linkedPlanCurrentVersionId: string | undefined;
    if (params.care_plan_id) {
      const plan = await CarePlanService.getPlan(params.care_plan_id);
      if (!plan) throw new NotFoundError(`CarePlan ${params.care_plan_id} not found.`);
      if (plan.care_relationship_id !== relationship.id) {
        throw new AuthorizationError(
          'Clinical Task Care Plan does not belong to the requested care relationship.',
          { errorCode: 'AUTHZ_003' }
        );
      }
      if (plan.status !== CarePlanState.ACTIVE) {
        throw new DomainInvariantError('Clinical Task linked Care Plan must be ACTIVE.');
      }
      linkedPlanCurrentVersionId = plan.current_version_id;
    }

    if (params.care_goal_id) {
      if (!params.care_plan_id || !linkedPlanCurrentVersionId) {
        throw new DomainInvariantError('Clinical Task care_goal_id requires care_plan_id.');
      }
      const goal = await CareGoalService.getGoal(params.care_goal_id);
      if (!goal) throw new NotFoundError(`CareGoal ${params.care_goal_id} not found.`);
      if (goal.care_plan_version_id !== linkedPlanCurrentVersionId) {
        throw new AuthorizationError(
          'Clinical Task Care Goal does not belong to the current Care Plan version.',
          { errorCode: 'AUTHZ_003' }
        );
      }
    }

    const ownerDomain = params.owner_domain || OWNER_DOMAIN_BY_TASK[params.task_type];
    const completionAuthority = params.completion_authority ||
      (ownerDomain ? ClinicalTaskCompletionAuthority.OWNER_DOMAIN :
        params.assigned_to_type === ClinicalTaskAssigneeType.USER
          ? ClinicalTaskCompletionAuthority.USER_SELF_REPORT
          : ClinicalTaskCompletionAuthority.PROFESSIONAL);

    if (completionAuthority === ClinicalTaskCompletionAuthority.OWNER_DOMAIN && !ownerDomain) {
      throw new DomainInvariantError('Owner-domain task requires owner_domain.');
    }
    if (params.due_at && Number.isNaN(Date.parse(params.due_at))) {
      throw new DomainInvariantError('Clinical task due_at must be a valid ISO date-time.');
    }

    const now = new Date().toISOString();
    const task: ClinicalTask = {
      id: generateUUIDv7(),
      subject_user_id: relationship.subject_user_id,
      care_relationship_id: relationship.id,
      care_plan_id: params.care_plan_id,
      care_goal_id: params.care_goal_id,
      task_type: params.task_type,
      assigned_to_type: params.assigned_to_type,
      assigned_to_id: params.assigned_to_id,
      status: ClinicalTaskState.PENDING,
      priority: params.priority || ClinicalTaskPriority.NORMAL,
      title: params.title,
      instruction_reference: params.instruction_reference,
      created_at: now,
      due_at: params.due_at,
      recurrence_rule: params.recurrence_rule,
      recurrence_parent_task_id: params.recurrence_parent_task_id,
      recurrence_sequence: params.recurrence_sequence || 0,
      created_by_professional_id: params.creator_professional_id,
      source_type: params.source_type,
      source_reference: params.source_reference,
      completion_authority: completionAuthority,
      owner_domain: ownerDomain,
      policy_version: params.policy_version,
      idempotency_key: params.idempotency_key,
      updated_at: now
    };

    const dependencies: ClinicalTaskDependency[] = [];
    const uniqueDependencyIds = [...new Set(params.dependency_task_ids || [])];
    let ready = true;
    for (const dependencyId of uniqueDependencyIds) {
      if (dependencyId === task.id) {
        throw new DomainInvariantError('Clinical task cannot depend on itself.');
      }
      const upstream = await ClinicalTaskService.getTask(dependencyId);
      if (upstream.care_relationship_id !== task.care_relationship_id) {
        throw new AuthorizationError(
          'Clinical Task dependency must belong to the same care relationship.',
          { errorCode: 'AUTHZ_003' }
        );
      }
      if (
        task.care_plan_id &&
        upstream.care_plan_id &&
        upstream.care_plan_id !== task.care_plan_id
      ) {
        throw new AuthorizationError(
          'Clinical Task dependency must belong to the same Care Plan.',
          { errorCode: 'AUTHZ_003' }
        );
      }
      if (upstream.status !== ClinicalTaskState.COMPLETED) ready = false;
      dependencies.push({
        id: generateUUIDv7(),
        task_id: task.id,
        depends_on_task_id: upstream.id,
        dependency_type: ClinicalTaskDependencyType.COMPLETION_REQUIRED,
        created_at: now
      });
    }

    const initialTarget = ready ? ClinicalTaskState.READY : ClinicalTaskState.BLOCKED;
    validateStateTransition(
      'ClinicalTaskState',
      ClinicalTaskState.PENDING,
      initialTarget,
      task.id,
      params.creator_professional_id
    );
    task.status = initialTarget;

    const createdPayload = {
      task_id: task.id,
      subject_user_id: task.subject_user_id,
      relationship_id: task.care_relationship_id,
      task_type: task.task_type
    };
    let result: { created: boolean; task_id: string };

    if (ClinicalTaskService.repository.requiresUnitOfWork()) {
      result = await UnitOfWork.run(async uow => {
        const created = await ClinicalTaskService.repository.createTaskAggregate(
          task,
          dependencies,
          uow.getClient()
        );
        if (created.created) {
          uow.registerOutboxEvent(
            'care.task_created',
            'clinical_tasks',
            task.id,
            createdPayload,
            {
              correlation_id: CorrelationManager.getCorrelationId(),
              data_classification: DataClassification.CLINICAL_RECORD,
              producer_domain: 'clinical_tasks'
            }
          );
          if (initialTarget === ClinicalTaskState.READY) {
            uow.registerOutboxEvent(
              'care.task_ready',
              'clinical_tasks',
              task.id,
              { task_id: task.id },
              {
                correlation_id: CorrelationManager.getCorrelationId(),
                data_classification: DataClassification.CLINICAL_RECORD,
                producer_domain: 'clinical_tasks'
              }
            );
          }
        }
        return created;
      }, 'SERIALIZABLE');
    } else {
      result = await ClinicalTaskService.repository.createTaskAggregate(
        task,
        dependencies
      );
      if (result.created) {
        EventBus.enqueue(
          'care.task_created',
          'clinical_tasks',
          task.id,
          DataClassification.CLINICAL_RECORD,
          createdPayload
        );
        if (initialTarget === ClinicalTaskState.READY) {
          EventBus.enqueue(
            'care.task_ready',
            'clinical_tasks',
            task.id,
            DataClassification.CLINICAL_RECORD,
            { task_id: task.id }
          );
        }
      }
    }

    const saved = await ClinicalTaskService.getTask(result.task_id);
    if (!result.created) return saved;

    AuditService.record({
      actor_type: 'STAFF', actor_id: params.creator_professional_id, action: 'CLINICAL_TASK.CREATED',
      resource_type: 'clinical_task', resource_id: task.id, purpose: 'Care Coordination',
      authorization_basis: { relationshipId: task.care_relationship_id }, result: 'ALLOWED',
      metadata: { taskType: task.task_type, completionAuthority: task.completion_authority }
    });
    return saved;
  }
  public static async getTask(taskId: string): Promise<ClinicalTask> {
    ClinicalTaskService.assertRepository();
    const task = await ClinicalTaskService.repository.findTaskById(taskId);
    if (!task) throw new NotFoundError(`ClinicalTask ${taskId} not found.`);
    return task;
  }

  public static async getTaskForActor(
    taskId: string,
    actorId: string,
    actorType: ClinicalTaskAssigneeType.USER | ClinicalTaskAssigneeType.PROFESSIONAL
  ): Promise<ClinicalTask> {
    const task = await ClinicalTaskService.getTask(taskId);
    if (actorType === ClinicalTaskAssigneeType.USER) {
      if (task.subject_user_id !== actorId) {
        throw new AuthorizationError('User may only access their own clinical tasks.', { errorCode: 'AUTHZ_003' });
      }
      return task;
    }
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId: task.care_relationship_id,
      professionalId: actorId,
      dataDomain: DataDomain.CARE_PLANS,
      action: ActionPermission.READ,
      purpose: 'CARE_DELIVERY'
    });
    return task;
  }

  public static async listTasksForUser(userId: string): Promise<ClinicalTask[]> {
    ClinicalTaskService.assertRepository();
    const assigned = await ClinicalTaskService.repository.findTasksByAssignee(ClinicalTaskAssigneeType.USER, userId);
    return assigned.filter(task => task.subject_user_id === userId);
  }

  public static async listTasksForRelationship(
    relationshipId: string,
    professionalId: string
  ): Promise<ClinicalTask[]> {
    ClinicalTaskService.assertRepository();
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId,
      professionalId,
      dataDomain: DataDomain.CARE_PLANS,
      action: ActionPermission.READ,
      purpose: 'CARE_DELIVERY'
    });
    return ClinicalTaskService.repository.findTasksByRelationshipId(relationshipId);
  }

  public static async listTasksForPlan(planId: string): Promise<ClinicalTask[]> {
    ClinicalTaskService.assertRepository();
    return ClinicalTaskService.repository.findTasksByPlanId(planId);
  }

  /** Internal scheduler boundary; not exposed directly through the HTTP API. */
  public static async listTasksForScheduler(): Promise<ClinicalTask[]> {
    ClinicalTaskService.assertRepository();
    return ClinicalTaskService.repository.listTasks();
  }

  public static async saveReminderReceipt(receipt: ClinicalTaskReminderReceipt): Promise<void> {
    ClinicalTaskService.assertRepository();
    return ClinicalTaskService.repository.saveReminderReceipt(receipt);
  }

  public static async findReminderReceipt(taskId: string, reminderKey: string): Promise<ClinicalTaskReminderReceipt | null> {
    ClinicalTaskService.assertRepository();
    return ClinicalTaskService.repository.findReminderReceipt(taskId, reminderKey);
  }

  public static async addDependency(taskId: string, dependsOnTaskId: string): Promise<ClinicalTaskDependency> {
    ClinicalTaskService.assertRepository();
    if (taskId === dependsOnTaskId) throw new DomainInvariantError('Clinical task cannot depend on itself.');
    await ClinicalTaskService.getTask(taskId);
    await ClinicalTaskService.getTask(dependsOnTaskId);
    if (await ClinicalTaskService.pathExists(dependsOnTaskId, taskId)) {
      throw new DomainInvariantError('Clinical task dependency would create a cycle.');
    }
    const existing = (await ClinicalTaskService.repository.findDependencies(taskId)).find(d => d.depends_on_task_id === dependsOnTaskId);
    if (existing) return existing;
    const dependency: ClinicalTaskDependency = {
      id: generateUUIDv7(), task_id: taskId, depends_on_task_id: dependsOnTaskId,
      dependency_type: ClinicalTaskDependencyType.COMPLETION_REQUIRED, created_at: new Date().toISOString()
    };
    await ClinicalTaskService.repository.saveDependency(dependency);
    return dependency;
  }

  private static async pathExists(fromTaskId: string, targetTaskId: string, seen = new Set<string>()): Promise<boolean> {
    if (fromTaskId === targetTaskId) return true;
    if (seen.has(fromTaskId)) return false;
    seen.add(fromTaskId);
    const dependencies = await ClinicalTaskService.repository.findDependencies(fromTaskId);
    for (const dep of dependencies) if (await ClinicalTaskService.pathExists(dep.depends_on_task_id, targetTaskId, seen)) return true;
    return false;
  }

  public static async refreshReadiness(taskId: string, actorId = 'system'): Promise<ClinicalTask> {
    const task = await ClinicalTaskService.getTask(taskId);
    if ([ClinicalTaskState.COMPLETED, ClinicalTaskState.CANCELLED, ClinicalTaskState.SKIPPED].includes(task.status)) return task;
    const dependencies = await ClinicalTaskService.repository.findDependencies(task.id);
    let ready = true;
    for (const dep of dependencies) {
      const upstream = await ClinicalTaskService.repository.findTaskById(dep.depends_on_task_id);
      if (!upstream || upstream.status !== ClinicalTaskState.COMPLETED) { ready = false; break; }
    }
    const target = ready ? ClinicalTaskState.READY : ClinicalTaskState.BLOCKED;
    if (task.status !== target) {
      const expectedState = task.status;
      validateStateTransition('ClinicalTaskState', task.status, target, task.id, actorId);
      task.status = target;
      task.updated_at = new Date().toISOString();
      await ClinicalTaskService.persistTaskStateMutation(
        task,
        expectedState,
        target === ClinicalTaskState.READY
          ? { type:'care.task_ready', payload:{task_id:task.id} }
          : undefined
      );
    }
    return task;
  }

  private static async assertActorMatchesAssignment(
    task: ClinicalTask,
    actorId: string,
    actorType: ClinicalTaskAssigneeType
  ): Promise<void> {
    const relationship = await CareRelationshipService.getRelationship(task.care_relationship_id);
    if (!relationship ||
        [CareRelationshipState.TERMINATED, CareRelationshipState.REVOKED].includes(relationship.status)) {
      throw new AuthorizationError(
        'Clinical task is not actionable because the care relationship is no longer active for care delivery.',
        { errorCode: 'AUTHZ_003' }
      );
    }

    if (task.assigned_to_type === ClinicalTaskAssigneeType.USER) {
      if (actorType !== ClinicalTaskAssigneeType.USER || actorId !== task.assigned_to_id) {
        throw new AuthorizationError('Only the assigned user may act on this clinical task.', { errorCode: 'AUTHZ_003' });
      }
      return;
    }

    if (task.assigned_to_type === ClinicalTaskAssigneeType.PROFESSIONAL) {
      if (actorType !== ClinicalTaskAssigneeType.PROFESSIONAL || actorId !== task.assigned_to_id) {
        throw new AuthorizationError('Only the assigned professional may act on this clinical task.', { errorCode: 'AUTHZ_003' });
      }
      await RelationshipAccessEvaluator.assertAccess({
        relationshipId: task.care_relationship_id,
        professionalId: actorId,
        dataDomain: DataDomain.CARE_PLANS,
        action: ActionPermission.WRITE,
        purpose: 'CARE_DELIVERY'
      });
      return;
    }

    if (task.assigned_to_type === ClinicalTaskAssigneeType.CARE_TEAM_ROLE) {
      if (actorType !== ClinicalTaskAssigneeType.PROFESSIONAL) {
        throw new AuthorizationError('Care-team-role task requires an eligible professional.', { errorCode: 'AUTHZ_003' });
      }
      const membership = await CareTeamService.getMembership(task.care_relationship_id, actorId);
      if (!membership ||
          membership.status !== CareTeamMembershipState.ACTIVE ||
          membership.team_role !== task.assigned_to_id) {
        throw new AuthorizationError(
          'Professional is not an active member of the care-team role assigned to this task.',
          { errorCode: 'AUTHZ_003' }
        );
      }
      await RelationshipAccessEvaluator.assertAccess({
        relationshipId: task.care_relationship_id,
        professionalId: actorId,
        dataDomain: DataDomain.CARE_PLANS,
        action: ActionPermission.WRITE,
        purpose: 'CARE_DELIVERY'
      });
      return;
    }

    if (task.assigned_to_type === ClinicalTaskAssigneeType.SYSTEM) {
      if (actorType !== ClinicalTaskAssigneeType.SYSTEM || actorId !== task.assigned_to_id) {
        throw new AuthorizationError('Only the assigned trusted system actor may act on this clinical task.', { errorCode: 'AUTHZ_004' });
      }
      return;
    }

    throw new AuthorizationError('Unsupported clinical-task assignee type.', { errorCode: 'AUTHZ_004' });
  }

  public static async startTask(
    taskId: string,
    actorId: string,
    actorType?: ClinicalTaskAssigneeType
  ): Promise<ClinicalTask> {
    const task = await ClinicalTaskService.getTask(taskId);
    const effectiveActorType =
      actorType ||
      (task.assigned_to_type === ClinicalTaskAssigneeType.CARE_TEAM_ROLE
        ? ClinicalTaskAssigneeType.PROFESSIONAL
        : task.assigned_to_type);
    await ClinicalTaskService.assertActorMatchesAssignment(task, actorId, effectiveActorType);
    const expectedState = task.status;
    validateStateTransition('ClinicalTaskState', task.status, ClinicalTaskState.IN_PROGRESS, task.id, actorId);
    task.status = ClinicalTaskState.IN_PROGRESS;
    task.started_at = new Date().toISOString();
    task.updated_at = task.started_at;
    await ClinicalTaskService.persistTaskStateMutation(task, expectedState);
    return task;
  }

  public static async completeTask(params: CompleteClinicalTaskParams): Promise<ClinicalTask> {
    const task = await ClinicalTaskService.getTask(params.task_id);
    if (task.completion_authority === ClinicalTaskCompletionAuthority.OWNER_DOMAIN) {
      if (params.actor_type !== ClinicalTaskAssigneeType.SYSTEM ||
          !params.completion_source ||
          params.completion_source !== task.owner_domain) {
        throw new AuthorizationError(
          'This task can only be completed by its authoritative owning domain through a trusted system actor.',
          { errorCode: 'AUTHZ_004' }
        );
      }
    } else if (task.completion_authority === ClinicalTaskCompletionAuthority.USER_SELF_REPORT) {
      await ClinicalTaskService.assertActorMatchesAssignment(
        task,
        params.actor_id,
        params.actor_type
      );
    } else if (task.completion_authority === ClinicalTaskCompletionAuthority.PROFESSIONAL) {
      await ClinicalTaskService.assertActorMatchesAssignment(
        task,
        params.actor_id,
        params.actor_type
      );
    } else if (task.completion_authority === ClinicalTaskCompletionAuthority.SYSTEM) {
      await ClinicalTaskService.assertActorMatchesAssignment(
        task,
        params.actor_id,
        params.actor_type
      );
    }

    if (![ClinicalTaskState.READY, ClinicalTaskState.IN_PROGRESS, ClinicalTaskState.OVERDUE].includes(task.status)) {
      throw new DomainInvariantError(`Clinical task ${task.id} cannot complete from ${task.status}.`);
    }
    const expectedState = task.status;
    validateStateTransition('ClinicalTaskState', task.status, ClinicalTaskState.COMPLETED, task.id, params.actor_id);
    const now = new Date().toISOString();
    task.status = ClinicalTaskState.COMPLETED;
    task.completed_at = now;
    task.updated_at = now;
    const evidence: ClinicalTaskEvidence = {
      id: generateUUIDv7(), task_id: task.id, evidence_type: params.evidence_type,
      evidence_reference: params.evidence_reference, recorded_by: params.actor_id, recorded_at: now
    };
    await ClinicalTaskService.persistTaskCompletion(
      task,
      evidence,
      expectedState,
      {
        type:'care.task_completed',
        payload:{
          task_id:task.id,
          subject_user_id:task.subject_user_id,
          completion_source:params.completion_source || params.actor_type
        }
      }
    );
    const dependents = await ClinicalTaskService.repository.findDependents(task.id);
    for (const dep of dependents) await ClinicalTaskService.refreshReadiness(dep.task_id, 'system');
    return task;
  }

  public static async cancelTask(taskId: string, actorProfessionalId: string): Promise<ClinicalTask> {
    const task = await ClinicalTaskService.getTask(taskId);
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId: task.care_relationship_id, professionalId: actorProfessionalId,
      dataDomain: DataDomain.CARE_PLANS, action: ActionPermission.WRITE, purpose: 'CARE_DELIVERY'
    });
    const expectedState = task.status;
    validateStateTransition('ClinicalTaskState', task.status, ClinicalTaskState.CANCELLED, task.id, actorProfessionalId);
    task.status = ClinicalTaskState.CANCELLED;
    task.updated_at = new Date().toISOString();
    await ClinicalTaskService.persistTaskStateMutation(
      task,
      expectedState,
      {type:'care.task_cancelled',payload:{task_id:task.id}}
    );
    return task;
  }

  public static async reconcileRelationshipClosure(
    relationshipId: string
  ): Promise<{ cancelled: string[] }> {
    ClinicalTaskService.assertRepository();
    const relationship = await CareRelationshipService.getRelationship(relationshipId);
    if (!relationship ||
        ![CareRelationshipState.TERMINATED, CareRelationshipState.REVOKED].includes(relationship.status)) {
      return { cancelled: [] };
    }

    const cancelled: string[] = [];
    const terminal = new Set<ClinicalTaskState>([
      ClinicalTaskState.COMPLETED,
      ClinicalTaskState.SKIPPED,
      ClinicalTaskState.CANCELLED
    ]);

    for (const task of await ClinicalTaskService.repository.findTasksByRelationshipId(relationshipId)) {
      if (terminal.has(task.status)) continue;
      const priorStatus = task.status;
      validateStateTransition('ClinicalTaskState', task.status, ClinicalTaskState.CANCELLED, task.id, 'system');
      task.status = ClinicalTaskState.CANCELLED;
      task.updated_at = new Date().toISOString();
      await ClinicalTaskService.persistTaskStateMutation(
        task,
        priorStatus,
        {
          type:'care.task_cancelled',
          payload:{
            task_id:task.id,
            relationship_id:relationshipId,
            reason:'CARE_RELATIONSHIP_ENDED'
          }
        }
      );
      cancelled.push(task.id);
      AuditService.record({
        actor_type: 'SYSTEM',
        actor_id: 'sprint22-reconciliation',
        action: 'CLINICAL_TASK.CANCELLED_RELATIONSHIP_CLOSURE',
        resource_type: 'clinical_task',
        resource_id: task.id,
        purpose: 'Care Relationship Closure',
        authorization_basis: { relationshipId },
        result: 'ALLOWED',
        metadata: { priorStatus }
      });
    }

    return { cancelled };
  }

  public static async reconcile(now = new Date()): Promise<{ overdue: string[]; readied: string[] }> {
    ClinicalTaskService.assertRepository();
    const overdue: string[] = []; const readied: string[] = [];
    for (const task of await ClinicalTaskService.repository.listTasks()) {
      if ([ClinicalTaskState.PENDING, ClinicalTaskState.BLOCKED].includes(task.status)) {
        const refreshed = await ClinicalTaskService.refreshReadiness(task.id, 'system');
        if (refreshed.status === ClinicalTaskState.READY) readied.push(task.id);
      }
      const current = await ClinicalTaskService.repository.findTaskById(task.id);
      if (current?.due_at && Date.parse(current.due_at) < now.getTime() &&
          [ClinicalTaskState.READY, ClinicalTaskState.IN_PROGRESS].includes(current.status)) {
        const expectedState = current.status;
        validateStateTransition('ClinicalTaskState', current.status, ClinicalTaskState.OVERDUE, current.id, 'system');
        current.status = ClinicalTaskState.OVERDUE;
        current.updated_at = now.toISOString();
        await ClinicalTaskService.persistTaskStateMutation(
          current,
          expectedState,
          {type:'care.task_overdue',payload:{task_id:current.id}}
        );
        overdue.push(current.id);
      }
    }
    return { overdue, readied };
  }
}