import { IClinicalTaskRepository } from './interfaces.js';
import { ClinicalTask, ClinicalTaskDependency, ClinicalTaskEvidence } from '../domain/entities.js';

export class InMemoryClinicalTaskRepository implements IClinicalTaskRepository {
  private tasks = new Map<string, ClinicalTask>();
  private dependencies = new Map<string, ClinicalTaskDependency>();
  private evidence = new Map<string, ClinicalTaskEvidence>();

  async saveTask(task: ClinicalTask): Promise<void> { this.tasks.set(task.id, structuredClone(task)); }
  async findTaskById(id: string): Promise<ClinicalTask | null> {
    const task = this.tasks.get(id); return task ? structuredClone(task) : null;
  }
  async findTasksByRelationshipId(relationshipId: string): Promise<ClinicalTask[]> {
    return Array.from(this.tasks.values()).filter(t => t.care_relationship_id === relationshipId).map(x => structuredClone(x));
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
  async listTasks(): Promise<ClinicalTask[]> { return Array.from(this.tasks.values()).map(x => structuredClone(x)); }
  clear(): void { this.tasks.clear(); this.dependencies.clear(); this.evidence.clear(); }
}