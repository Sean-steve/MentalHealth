import { IClinicalTaskRepository, ClinicalTaskCreateResult } from './interfaces.js';
import { ClinicalTask, ClinicalTaskDependency, ClinicalTaskEvidence, ClinicalTaskReminderReceipt } from '../domain/entities.js';
import { ClinicalTaskState } from '../domain/types.js';

export class InMemoryClinicalTaskRepository implements IClinicalTaskRepository {
  private tasks = new Map<string, ClinicalTask>();
  private dependencies = new Map<string, ClinicalTaskDependency>();
  private evidence = new Map<string, ClinicalTaskEvidence>();
  private reminders = new Map<string, ClinicalTaskReminderReceipt>();

  requiresUnitOfWork(): boolean { return false; }

  async createTaskAggregate(
    task: ClinicalTask,
    dependencies: ClinicalTaskDependency[]
  ): Promise<ClinicalTaskCreateResult> {
    if (task.idempotency_key) {
      const existing = Array.from(this.tasks.values())
        .find(item => item.idempotency_key === task.idempotency_key);
      if (existing) return { created: false, task_id: existing.id };
    }

    const tasksSnapshot = new Map(this.tasks);
    const dependenciesSnapshot = new Map(this.dependencies);
    try {
      this.tasks.set(task.id, structuredClone(task));
      for (const dependency of dependencies) {
        this.dependencies.set(dependency.id, structuredClone(dependency));
      }
      return { created: true, task_id: task.id };
    } catch (error) {
      this.tasks = tasksSnapshot;
      this.dependencies = dependenciesSnapshot;
      throw error;
    }
  }

  async saveTaskWithExpectedState(
    task: ClinicalTask,
    expectedState: ClinicalTaskState
  ): Promise<void> {
    const current = this.tasks.get(task.id);
    if (!current || current.status !== expectedState) {
      throw new Error(
        'CONCURRENCY_CONFLICT: Clinical Task state changed before update.'
      );
    }
    this.tasks.set(task.id, structuredClone(task));
  }

  async completeTaskAggregate(
    task: ClinicalTask,
    evidence: ClinicalTaskEvidence,
    expectedState: ClinicalTaskState
  ): Promise<void> {
    const current = this.tasks.get(task.id);
    if (!current || current.status !== expectedState) {
      throw new Error(
        'CONCURRENCY_CONFLICT: Clinical Task state changed before completion.'
      );
    }

    const tasksSnapshot = new Map(this.tasks);
    const evidenceSnapshot = new Map(this.evidence);
    try {
      this.tasks.set(task.id, structuredClone(task));
      this.evidence.set(evidence.id, structuredClone(evidence));
    } catch (error) {
      this.tasks = tasksSnapshot;
      this.evidence = evidenceSnapshot;
      throw error;
    }
  }

  async saveTask(task: ClinicalTask): Promise<void> { this.tasks.set(task.id, structuredClone(task)); }
  async findTaskById(id: string): Promise<ClinicalTask | null> {
    const task = this.tasks.get(id); return task ? structuredClone(task) : null;
  }
  async findTasksByRelationshipId(relationshipId: string): Promise<ClinicalTask[]> {
    return Array.from(this.tasks.values()).filter(t => t.care_relationship_id === relationshipId).map(x => structuredClone(x));
  }
  async findTasksByPlanId(planId: string): Promise<ClinicalTask[]> {
    return Array.from(this.tasks.values())
      .filter(t => t.care_plan_id === planId)
      .map(x => structuredClone(x));
  }
  async findTasksByAssignee(assigneeType: string, assigneeId: string): Promise<ClinicalTask[]> {
    return Array.from(this.tasks.values()).filter(t => t.assigned_to_type === assigneeType && t.assigned_to_id === assigneeId).map(x => structuredClone(x));
  }
  async findTaskByIdempotencyKey(key: string): Promise<ClinicalTask | null> {
    const task = Array.from(this.tasks.values()).find(t => t.idempotency_key === key); return task ? structuredClone(task) : null;
  }
  async saveDependency(dependency: ClinicalTaskDependency): Promise<void> { this.dependencies.set(dependency.id, structuredClone(dependency)); }
  async findDependencies(taskId: string): Promise<ClinicalTaskDependency[]> {
    return Array.from(this.dependencies.values()).filter(d => d.task_id === taskId).map(x => structuredClone(x));
  }
  async findDependents(taskId: string): Promise<ClinicalTaskDependency[]> {
    return Array.from(this.dependencies.values()).filter(d => d.depends_on_task_id === taskId).map(x => structuredClone(x));
  }
  async saveEvidence(evidence: ClinicalTaskEvidence): Promise<void> { this.evidence.set(evidence.id, structuredClone(evidence)); }
  async findEvidence(taskId: string): Promise<ClinicalTaskEvidence[]> {
    return Array.from(this.evidence.values()).filter(e => e.task_id === taskId).map(x => structuredClone(x));
  }
  async saveReminderReceipt(receipt: ClinicalTaskReminderReceipt): Promise<void> {
    this.reminders.set(`${receipt.task_id}:${receipt.reminder_key}`, structuredClone(receipt));
  }
  async findReminderReceipt(taskId: string, reminderKey: string): Promise<ClinicalTaskReminderReceipt | null> {
    const receipt = this.reminders.get(`${taskId}:${reminderKey}`);
    return receipt ? structuredClone(receipt) : null;
  }
  async listTasks(): Promise<ClinicalTask[]> { return Array.from(this.tasks.values()).map(x => structuredClone(x)); }
  clear(): void { this.tasks.clear(); this.dependencies.clear(); this.evidence.clear(); this.reminders.clear(); }
}