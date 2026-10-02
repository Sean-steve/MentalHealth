import { ClinicalTask, ClinicalTaskDependency, ClinicalTaskEvidence, ClinicalTaskReminderReceipt } from '../domain/entities.js';

export interface IClinicalTaskRepository {
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