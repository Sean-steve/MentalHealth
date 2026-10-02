import { getPool } from '../../platform/database/index.js';
import { IClinicalTaskRepository } from './interfaces.js';
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

type TaskRow = {
  id: string;
  subject_user_id: string;
  care_relationship_id: string;
  care_plan_id: string | null;
  care_goal_id: string | null;
  task_type: string;
  assigned_to_type: string;
  assigned_to_id: string;
  status: string;
  priority: string;
  title: string;
  instruction_reference: string;
  created_at: string;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  recurrence_rule: string | null;
  source_type: string;
  source_reference: string;
  completion_authority: string;
  owner_domain: string | null;
  policy_version: string;
  idempotency_key: string | null;
  updated_at: string;
};

type DependencyRow = {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: string;
  created_at: string;
};

type EvidenceRow = {
  id: string;
  task_id: string;
  evidence_type: string;
  evidence_reference: string;
  recorded_by: string;
  recorded_at: string;
};

const toTask = (row: TaskRow): ClinicalTask => ({
  id: row.id,
  subject_user_id: row.subject_user_id,
  care_relationship_id: row.care_relationship_id,
  care_plan_id: row.care_plan_id || undefined,
  care_goal_id: row.care_goal_id || undefined,
  task_type: row.task_type as ClinicalTaskType,
  assigned_to_type: row.assigned_to_type as ClinicalTaskAssigneeType,
  assigned_to_id: row.assigned_to_id,
  status: row.status as ClinicalTaskState,
  priority: row.priority as ClinicalTaskPriority,
  title: row.title,
  instruction_reference: row.instruction_reference,
  created_at: row.created_at,
  due_at: row.due_at || undefined,
  started_at: row.started_at || undefined,
  completed_at: row.completed_at || undefined,
  recurrence_rule: row.recurrence_rule || undefined,
  source_type: row.source_type,
  source_reference: row.source_reference,
  completion_authority: row.completion_authority as ClinicalTaskCompletionAuthority,
  owner_domain: row.owner_domain || undefined,
  policy_version: row.policy_version,
  idempotency_key: row.idempotency_key || undefined,
  updated_at: row.updated_at
});

const toDependency = (row: DependencyRow): ClinicalTaskDependency => ({
  id: row.id,
  task_id: row.task_id,
  depends_on_task_id: row.depends_on_task_id,
  dependency_type: row.dependency_type as ClinicalTaskDependencyType,
  created_at: row.created_at
});

const toEvidence = (row: EvidenceRow): ClinicalTaskEvidence => ({
  id: row.id,
  task_id: row.task_id,
  evidence_type: row.evidence_type as ClinicalTaskEvidenceType,
  evidence_reference: row.evidence_reference,
  recorded_by: row.recorded_by,
  recorded_at: row.recorded_at
});

export class PgClinicalTaskRepository implements IClinicalTaskRepository {
  public async saveTask(task: ClinicalTask): Promise<void> {
    const pool = getPool();
    await pool.query(
      'INSERT INTO clinical_tasks (id, subject_user_id, care_relationship_id, care_plan_id, care_goal_id, task_type, assigned_to_type, assigned_to_id, status, priority, title, instruction_reference, due_at, started_at, completed_at, recurrence_rule, source_type, source_reference, completion_authority, owner_domain, policy_version, idempotency_key, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, priority=EXCLUDED.priority, title=EXCLUDED.title, instruction_reference=EXCLUDED.instruction_reference, due_at=EXCLUDED.due_at, started_at=EXCLUDED.started_at, completed_at=EXCLUDED.completed_at, recurrence_rule=EXCLUDED.recurrence_rule, assigned_to_type=EXCLUDED.assigned_to_type, assigned_to_id=EXCLUDED.assigned_to_id, completion_authority=EXCLUDED.completion_authority, owner_domain=EXCLUDED.owner_domain, updated_at=EXCLUDED.updated_at',
      [
        task.id, task.subject_user_id, task.care_relationship_id, task.care_plan_id || null,
        task.care_goal_id || null, task.task_type, task.assigned_to_type, task.assigned_to_id,
        task.status, task.priority, task.title, task.instruction_reference, task.due_at || null,
        task.started_at || null, task.completed_at || null, task.recurrence_rule || null,
        task.source_type, task.source_reference, task.completion_authority, task.owner_domain || null,
        task.policy_version, task.idempotency_key || null, task.created_at, task.updated_at
      ]
    );
  }

  public async findTaskById(id: string): Promise<ClinicalTask | null> {
    const res = await getPool().query<TaskRow>('SELECT * FROM clinical_tasks WHERE id = $1', [id]);
    return res.rows[0] ? toTask(res.rows[0]) : null;
  }

  public async findTasksByRelationshipId(relationshipId: string): Promise<ClinicalTask[]> {
    const res = await getPool().query<TaskRow>(
      'SELECT * FROM clinical_tasks WHERE care_relationship_id = $1 ORDER BY due_at NULLS LAST, created_at ASC, id ASC',
      [relationshipId]
    );
    return res.rows.map(toTask);
  }

  public async findTasksByAssignee(assigneeType: string, assigneeId: string): Promise<ClinicalTask[]> {
    const res = await getPool().query<TaskRow>(
      'SELECT * FROM clinical_tasks WHERE assigned_to_type = $1 AND assigned_to_id = $2 ORDER BY due_at NULLS LAST, created_at ASC, id ASC',
      [assigneeType, assigneeId]
    );
    return res.rows.map(toTask);
  }

  public async findTaskByIdempotencyKey(key: string): Promise<ClinicalTask | null> {
    const res = await getPool().query<TaskRow>('SELECT * FROM clinical_tasks WHERE idempotency_key = $1', [key]);
    return res.rows[0] ? toTask(res.rows[0]) : null;
  }

  public async saveDependency(dependency: ClinicalTaskDependency): Promise<void> {
    await getPool().query(
      'INSERT INTO clinical_task_dependencies (id, task_id, depends_on_task_id, dependency_type, created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (task_id, depends_on_task_id) DO NOTHING',
      [dependency.id, dependency.task_id, dependency.depends_on_task_id, dependency.dependency_type, dependency.created_at]
    );
  }

  public async findDependencies(taskId: string): Promise<ClinicalTaskDependency[]> {
    const res = await getPool().query<DependencyRow>(
      'SELECT * FROM clinical_task_dependencies WHERE task_id = $1 ORDER BY created_at ASC, id ASC',
      [taskId]
    );
    return res.rows.map(toDependency);
  }

  public async findDependents(taskId: string): Promise<ClinicalTaskDependency[]> {
    const res = await getPool().query<DependencyRow>(
      'SELECT * FROM clinical_task_dependencies WHERE depends_on_task_id = $1 ORDER BY created_at ASC, id ASC',
      [taskId]
    );
    return res.rows.map(toDependency);
  }

  public async saveEvidence(evidence: ClinicalTaskEvidence): Promise<void> {
    await getPool().query(
      'INSERT INTO clinical_task_evidence (id, task_id, evidence_type, evidence_reference, recorded_by, recorded_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING',
      [evidence.id, evidence.task_id, evidence.evidence_type, evidence.evidence_reference, evidence.recorded_by, evidence.recorded_at]
    );
  }

  public async findEvidence(taskId: string): Promise<ClinicalTaskEvidence[]> {
    const res = await getPool().query<EvidenceRow>(
      'SELECT * FROM clinical_task_evidence WHERE task_id = $1 ORDER BY recorded_at ASC, id ASC',
      [taskId]
    );
    return res.rows.map(toEvidence);
  }

  public async listTasks(): Promise<ClinicalTask[]> {
    const res = await getPool().query<TaskRow>('SELECT * FROM clinical_tasks ORDER BY created_at ASC, id ASC');
    return res.rows.map(toTask);
  }

  public async clear(): Promise<void> {
    const pool = getPool();
    await pool.query('DELETE FROM clinical_task_evidence');
    await pool.query('DELETE FROM clinical_task_dependencies');
    await pool.query('DELETE FROM clinical_tasks');
  }
}
