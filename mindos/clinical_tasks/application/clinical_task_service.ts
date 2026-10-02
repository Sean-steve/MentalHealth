import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';
import { AuthorizationError, DomainInvariantError, NotFoundError } from '../../platform/errors/index.js';
import {
  RelationshipAccessEvaluator,
  CareRelationshipService,
  DataDomain,
  ActionPermission
} from '../../care_relationships/index.js';
import { ClinicalTask, ClinicalTaskDependency, ClinicalTaskEvidence } from '../domain/entities.js';
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
      source_type: params.source_type,
      source_reference: params.source_reference,
      completion_authority: completionAuthority,
      owner_domain: ownerDomain,
      policy_version: params.policy_version,
      idempotency_key: params.idempotency_key,
      updated_at: now
    };
    await ClinicalTaskService.repository.saveTask(task);

    for (const dependencyId of params.dependency_task_ids || []) {
      await ClinicalTaskService.addDependency(task.id, dependencyId);
    }
    await ClinicalTaskService.refreshReadiness(task.id, params.creator_professional_id);
    const saved = await ClinicalTaskService.getTask(task.id);

    EventBus.enqueue('care.task_created', 'clinical_tasks', task.id, DataClassification.CLINICAL_RECORD, {
      task_id: task.id,
      subject_user_id: task.subject_user_id,
      relationship_id: task.care_relationship_id,
      task_type: task.task_type
    });
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
      validateStateTransition('ClinicalTaskState', task.status, target, task.id, actorId);
      task.status = target; task.updated_at = new Date().toISOString();
      await ClinicalTaskService.repository.saveTask(task);
      if (target === ClinicalTaskState.READY) {
        EventBus.enqueue('care.task_ready', 'clinical_tasks', task.id, DataClassification.CLINICAL_RECORD, { task_id: task.id });
      }
    }
    return task;
  }

  public static async startTask(taskId: string, actorId: string): Promise<ClinicalTask> {
    const task = await ClinicalTaskService.getTask(taskId);
    if (task.assigned_to_id !== actorId && task.assigned_to_type !== ClinicalTaskAssigneeType.SYSTEM) {
      throw new AuthorizationError('Only the assigned actor may start this clinical task.', { errorCode: 'AUTHZ_003' });
    }
    validateStateTransition('ClinicalTaskState', task.status, ClinicalTaskState.IN_PROGRESS, task.id, actorId);
    task.status = ClinicalTaskState.IN_PROGRESS; task.started_at = new Date().toISOString(); task.updated_at = task.started_at;
    await ClinicalTaskService.repository.saveTask(task); return task;
  }

  public static async completeTask(params: CompleteClinicalTaskParams): Promise<ClinicalTask> {
    const task = await ClinicalTaskService.getTask(params.task_id);
    if (task.completion_authority === ClinicalTaskCompletionAuthority.OWNER_DOMAIN) {
      if (!params.completion_source || params.completion_source !== task.owner_domain) {
        throw new AuthorizationError('This task can only be completed by its authoritative owning domain.', { errorCode: 'AUTHZ_004' });
      }
    } else if (task.completion_authority === ClinicalTaskCompletionAuthority.USER_SELF_REPORT) {
      if (params.actor_type !== ClinicalTaskAssigneeType.USER || params.actor_id !== task.assigned_to_id) {
        throw new AuthorizationError('Only the assigned user may self-report completion.', { errorCode: 'AUTHZ_003' });
      }
    } else if (task.completion_authority === ClinicalTaskCompletionAuthority.PROFESSIONAL) {
      await RelationshipAccessEvaluator.assertAccess({
        relationshipId: task.care_relationship_id, professionalId: params.actor_id,
        dataDomain: DataDomain.CARE_PLANS, action: ActionPermission.WRITE, purpose: 'CARE_DELIVERY'
      });
    }

    if (![ClinicalTaskState.READY, ClinicalTaskState.IN_PROGRESS, ClinicalTaskState.OVERDUE].includes(task.status)) {
      throw new DomainInvariantError(`Clinical task ${task.id} cannot complete from ${task.status}.`);
    }
    validateStateTransition('ClinicalTaskState', task.status, ClinicalTaskState.COMPLETED, task.id, params.actor_id);
    const now = new Date().toISOString();
    task.status = ClinicalTaskState.COMPLETED; task.completed_at = now; task.updated_at = now;
    await ClinicalTaskService.repository.saveTask(task);
    const evidence: ClinicalTaskEvidence = {
      id: generateUUIDv7(), task_id: task.id, evidence_type: params.evidence_type,
      evidence_reference: params.evidence_reference, recorded_by: params.actor_id, recorded_at: now
    };
    await ClinicalTaskService.repository.saveEvidence(evidence);
    EventBus.enqueue('care.task_completed', 'clinical_tasks', task.id, DataClassification.CLINICAL_RECORD, {
      task_id: task.id, subject_user_id: task.subject_user_id, completion_source: params.completion_source || params.actor_type
    });
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
    validateStateTransition('ClinicalTaskState', task.status, ClinicalTaskState.CANCELLED, task.id, actorProfessionalId);
    task.status = ClinicalTaskState.CANCELLED; task.updated_at = new Date().toISOString();
    await ClinicalTaskService.repository.saveTask(task);
    EventBus.enqueue('care.task_cancelled', 'clinical_tasks', task.id, DataClassification.CLINICAL_RECORD, { task_id: task.id });
    return task;
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
        validateStateTransition('ClinicalTaskState', current.status, ClinicalTaskState.OVERDUE, current.id, 'system');
        current.status = ClinicalTaskState.OVERDUE; current.updated_at = now.toISOString();
        await ClinicalTaskService.repository.saveTask(current); overdue.push(current.id);
        EventBus.enqueue('care.task_overdue', 'clinical_tasks', current.id, DataClassification.CLINICAL_RECORD, { task_id: current.id });
      }
    }
    return { overdue, readied };
  }
}