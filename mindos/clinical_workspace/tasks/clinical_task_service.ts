/**
 * MindOS Clinical Task Management Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { AuditService } from '../../platform/audit/index.js';
import { NotFoundError } from '../../platform/errors/index.js';
import { ClinicalTask } from '../domain/entities.js';
import { ClinicalTaskType, ClinicalTaskStatus } from '../domain/types.js';
import { IClinicalWorkspaceRepository } from '../repositories/interfaces.js';
import {
  RelationshipAccessEvaluator,
  CareRelationshipService,
  DataDomain,
  ActionPermission
} from '../../care_relationships/index.js';

export interface CreateClinicalTaskParams {
  relationshipId: string;
  assignedToUserId?: string;
  assignedToProfessionalId?: string;
  taskType: ClinicalTaskType;
  title: string;
  description: string;
  dueDate?: string;
  creatorProfessionalId: string;
  actorId: string;
}

export class ClinicalTaskService {
  private static repository: IClinicalWorkspaceRepository;

  public static setRepository(repo: IClinicalWorkspaceRepository): void {
    ClinicalTaskService.repository = repo;
  }

  public static async createTask(params: CreateClinicalTaskParams): Promise<ClinicalTask> {
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId: params.relationshipId,
      professionalId: params.creatorProfessionalId,
      dataDomain: DataDomain.CARE_PLANS,
      action: ActionPermission.WRITE,
      purpose: 'CARE_DELIVERY'
    });

    const rel = await CareRelationshipService.getRelationship(params.relationshipId);
    if (!rel) {
      throw new NotFoundError(`CareRelationship ${params.relationshipId} not found.`);
    }

    const taskId = generateUUIDv7();
    const now = new Date().toISOString();

    const task: ClinicalTask = {
      id: taskId,
      care_relationship_id: params.relationshipId,
      subject_user_id: rel.subject_user_id,
      assigned_to_user_id: params.assignedToUserId,
      assigned_to_professional_id: params.assignedToProfessionalId,
      task_type: params.taskType,
      title: params.title,
      description: params.description,
      status: ClinicalTaskStatus.PENDING,
      due_date: params.dueDate,
      created_by: params.creatorProfessionalId,
      created_at: now,
      updated_at: now
    };

    await ClinicalTaskService.repository.saveTask(task);

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.actorId,
      action: 'CLINICAL_TASK.CREATED',
      resource_type: 'clinical_task',
      resource_id: taskId,
      purpose: 'Care Coordination Task Assignment',
      authorization_basis: { relationshipId: params.relationshipId },
      result: 'ALLOWED',
      metadata: { taskType: params.taskType, title: params.title }
    });

    return task;
  }

  public static async updateTaskStatus(
    taskId: string,
    status: ClinicalTaskStatus,
    actorId: string
  ): Promise<ClinicalTask> {
    const task = await ClinicalTaskService.repository.findTaskById(taskId);
    if (!task) {
      throw new NotFoundError(`ClinicalTask ${taskId} not found.`);
    }

    const now = new Date().toISOString();
    task.status = status;
    task.updated_at = now;
    if (status === ClinicalTaskStatus.COMPLETED) {
      task.completed_at = now;
    }

    await ClinicalTaskService.repository.saveTask(task);

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: actorId,
      action: `CLINICAL_TASK.STATUS_UPDATED.${status}`,
      resource_type: 'clinical_task',
      resource_id: taskId,
      purpose: 'Clinical Task Tracking',
      authorization_basis: { taskId },
      result: 'ALLOWED',
      metadata: { status }
    });

    return task;
  }

  public static async listTasksForRelationship(
    relationshipId: string,
    requestingProfessionalId: string,
    status?: ClinicalTaskStatus
  ): Promise<ClinicalTask[]> {
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId,
      professionalId: requestingProfessionalId,
      dataDomain: DataDomain.CARE_PLANS,
      action: ActionPermission.READ,
      purpose: 'CARE_DELIVERY'
    });

    return ClinicalTaskService.repository.findTasksByRelationshipId(relationshipId, status);
  }
}
