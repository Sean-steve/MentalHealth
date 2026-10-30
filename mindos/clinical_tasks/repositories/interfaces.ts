import { ClinicalTask, ClinicalTaskDependency, ClinicalTaskEvidence, ClinicalTaskReminderReceipt } from '../domain/entities.js';
import { ClinicalTaskState } from '../domain/types.js';
import { DatabaseClient } from '../../platform/database/index.js';

export interface ClinicalTaskCreateResult {
  created: boolean;
  task_id: string;
}

export interface IClinicalTaskRepository {
  requiresUnitOfWork(): boolean;

  createTaskAggregate(
    task: ClinicalTask,
    dependencies: ClinicalTaskDependency[],
    tx?: DatabaseClient
  ): Promise<ClinicalTaskCreateResult>;

  saveTaskWithExpectedState(
    task: ClinicalTask,
    expectedState: ClinicalTaskState,
    tx?: DatabaseClient
  ): Promise<void>;

  completeTaskAggregate(
    task: ClinicalTask,
    evidence: ClinicalTaskEvidence,
    expectedState: ClinicalTaskState,
    tx?: DatabaseClient
  ): Promise<void>;
  saveTask(task: ClinicalTask): Promise<void>;
  findTaskById(id: string): Promise<ClinicalTask | null>;
  findTasksByRelationshipId(relationshipId: string): Promise<ClinicalTask[]>;
  findTasksByPlanId(planId: string): Promise<ClinicalTask[]>;
  findTasksByAssignee(assigneeType: string, assigneeId: string): Promise<ClinicalTask[]>;
  findTaskByIdempotencyKey(key: string): Promise<ClinicalTask | null>;
  saveDependency(dependency: ClinicalTaskDependency): Promise<void>;
  findDependencies(taskId: string): Promise<ClinicalTaskDependency[]>;
  findDependents(taskId: string): Promise<ClinicalTaskDependency[]>;
  saveEvidence(evidence: ClinicalTaskEvidence): Promise<void>;
  findEvidence(taskId: string): Promise<ClinicalTaskEvidence[]>;
  saveReminderReceipt(receipt: ClinicalTaskReminderReceipt): Promise<void>;
  findReminderReceipt(taskId: string, reminderKey: string): Promise<ClinicalTaskReminderReceipt | null>;
  listTasks(): Promise<ClinicalTask[]>;
  clear(): void;
}