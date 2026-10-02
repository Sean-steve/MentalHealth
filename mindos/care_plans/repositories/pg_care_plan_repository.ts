import { DatabaseManager, getPool } from '../../platform/database/index.js';
import { ICarePlanRepository } from './interfaces.js';
import {
  CarePlan,
  CarePlanVersion,
  CareGoal,
  CareGoalReview,
  CareIntervention,
  CarePlanReview,
  ContentAssignment,
  AssessmentAssignment
} from '../domain/entities.js';
import {
  CarePlanState,
  CareGoalStatus,
  CarePlanVersionStatus,
  CarePlanType,
  CareGoalType,
  CareGoalProvenance,
  GoalPriority,
  GoalTargetType,
  CareInterventionType,
  CarePlanReviewType,
  CarePlanReviewOutcome
} from '../domain/types.js';

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const jsonValue = (value: unknown): string | null =>
  value === undefined ? null : JSON.stringify(value);

type PlanRow = any;
type VersionRow = any;
type GoalRow = any;
type GoalReviewRow = any;
type InterventionRow = any;
type PlanReviewRow = any;
type ContentAssignmentRow = any;
type AssessmentAssignmentRow = any;

const toPlan = (r: PlanRow): CarePlan => ({
  id: r.id,
  subject_user_id: r.subject_user_id,
  care_relationship_id: r.care_relationship_id,
  primary_professional_id: r.primary_professional_id,
  care_team_id: r.care_team_id || undefined,
  plan_type: r.plan_type as CarePlanType,
  status: r.status as CarePlanState,
  current_version_id: r.current_version_id,
  started_at: r.started_at,
  target_end_at: r.target_end_at || undefined,
  completed_at: r.completed_at || undefined,
  terminated_at: r.terminated_at || undefined,
  created_at: r.created_at,
  updated_at: r.updated_at,
  version: Number(r.version)
});

const toGoal = (r: GoalRow): CareGoal => ({
  id: r.id,
  care_plan_version_id: r.care_plan_version_id,
  goal_code: r.goal_code || '',
  goal_type: r.goal_type as CareGoalType,
  title: r.title,
  description_reference: r.description_reference || '',
  priority: r.priority as GoalPriority,
  target_type: r.target_type as GoalTargetType,
  target_value: parseJson(r.target_value, undefined as any),
  baseline_reference: parseJson(r.baseline_reference, undefined as any),
  current_value: parseJson(r.current_value, undefined as any),
  status: r.status as CareGoalStatus,
  provenance: r.provenance as CareGoalProvenance,
  started_at: r.started_at,
  target_date: r.target_date || undefined,
  completed_at: r.completed_at || undefined,
  created_by: r.created_by,
  created_at: r.created_at,
  updated_at: r.updated_at || r.created_at
});

const toIntervention = (r: InterventionRow): CareIntervention => ({
  id: r.id,
  care_plan_version_id: r.care_plan_version_id,
  intervention_type: r.intervention_type as CareInterventionType,
  reference_type: r.reference_type,
  reference_id: r.reference_id,
  title: r.title || '',
  frequency: r.frequency,
  duration: r.duration || undefined,
  schedule_reference: r.schedule_reference || undefined,
  responsible_actor_type: r.responsible_actor_type,
  responsible_actor_id: r.responsible_actor_id || undefined,
  status: r.status,
  clinical_artifact_reference: r.clinical_artifact_reference || undefined,
  created_at: r.created_at
});

const toGoalReview = (r: GoalReviewRow): CareGoalReview => ({
  id: r.id,
  goal_id: r.goal_id,
  reviewed_by: r.reviewed_by,
  reviewed_at: r.reviewed_at,
  status_before: r.status_before as CareGoalStatus,
  status_after: r.status_after as CareGoalStatus,
  evidence_refs: parseJson<string[]>(r.evidence_refs, []),
  reason_codes: parseJson<string[]>(r.reason_codes, []),
  notes_reference: r.notes_reference || undefined
});

const toPlanReview = (r: PlanReviewRow): CarePlanReview => ({
  id: r.id,
  care_plan_id: r.care_plan_id,
  care_plan_version_id: r.care_plan_version_id,
  review_type: r.review_type as CarePlanReviewType,
  scheduled_for: r.scheduled_for,
  started_at: r.started_at || undefined,
  completed_at: r.completed_at || undefined,
  reviewer_id: r.reviewer_id,
  outcome: r.outcome as CarePlanReviewOutcome,
  goal_reviews: parseJson<CareGoalReview[]>(r.goal_reviews, []),
  recommended_changes: parseJson<string[]>(r.recommended_changes, []),
  new_version_id: r.new_version_id || undefined,
  created_at: r.created_at
});

export class PgCarePlanRepository implements ICarePlanRepository {
  public async createPlanWithInitialVersion(plan: CarePlan, version: CarePlanVersion): Promise<void> {
    const client = DatabaseManager.getClient();
    await client.transaction(async tx => {
      await tx.query(
        'INSERT INTO care_plans (id, subject_user_id, care_relationship_id, primary_professional_id, care_team_id, plan_type, status, current_version_id, started_at, target_end_at, completed_at, terminated_at, created_at, updated_at, version) VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,$10,$11,$12,$13,$14)',
        [plan.id, plan.subject_user_id, plan.care_relationship_id, plan.primary_professional_id, plan.care_team_id || null, plan.plan_type, plan.status, plan.started_at, plan.target_end_at || null, plan.completed_at || null, plan.terminated_at || null, plan.created_at, plan.updated_at, plan.version]
      );
      await tx.query(
        'INSERT INTO care_plan_versions (id, care_plan_id, version, status, summary, review_frequency_days, next_review_due, effective_from, effective_until, authored_by, approved_by, acknowledged_by_user, acknowledged_at, supersedes_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
        [version.id, version.care_plan_id, version.version, version.status, version.summary, version.review_schedule.frequency_days, version.review_schedule.next_review_due, version.effective_from, version.effective_until || null, version.authored_by, version.approved_by || null, Boolean(version.acknowledged_by_user), version.acknowledged_at || null, version.supersedes_id || null, version.created_at]
      );
      await tx.query('UPDATE care_plans SET current_version_id = $1 WHERE id = $2', [version.id, plan.id]);
    });
  }

  public async savePlan(plan: CarePlan): Promise<void> {
    await getPool().query(
      'INSERT INTO care_plans (id, subject_user_id, care_relationship_id, primary_professional_id, care_team_id, plan_type, status, current_version_id, started_at, target_end_at, completed_at, terminated_at, created_at, updated_at, version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, current_version_id=EXCLUDED.current_version_id, target_end_at=EXCLUDED.target_end_at, completed_at=EXCLUDED.completed_at, terminated_at=EXCLUDED.terminated_at, updated_at=EXCLUDED.updated_at, version=EXCLUDED.version',
      [plan.id, plan.subject_user_id, plan.care_relationship_id, plan.primary_professional_id, plan.care_team_id || null, plan.plan_type, plan.status, plan.current_version_id, plan.started_at, plan.target_end_at || null, plan.completed_at || null, plan.terminated_at || null, plan.created_at, plan.updated_at, plan.version]
    );
  }

  public async findPlanById(id: string): Promise<CarePlan | null> {
    const r = await getPool().query<PlanRow>('SELECT * FROM care_plans WHERE id = $1', [id]);
    return r.rows[0] ? toPlan(r.rows[0]) : null;
  }

  public async findPlanByRelationshipId(relationshipId: string): Promise<CarePlan | null> {
    const r = await getPool().query<PlanRow>('SELECT * FROM care_plans WHERE care_relationship_id = $1 ORDER BY created_at DESC LIMIT 1', [relationshipId]);
    return r.rows[0] ? toPlan(r.rows[0]) : null;
  }

  public async findPlansByUserId(userId: string, status?: CarePlanState): Promise<CarePlan[]> {
    const sql = status
      ? 'SELECT * FROM care_plans WHERE subject_user_id = $1 AND status = $2 ORDER BY created_at DESC'
      : 'SELECT * FROM care_plans WHERE subject_user_id = $1 ORDER BY created_at DESC';
    const r = await getPool().query<PlanRow>(sql, status ? [userId, status] : [userId]);
    return r.rows.map(toPlan);
  }

  public async findPlansByProfessionalId(professionalId: string, status?: CarePlanState): Promise<CarePlan[]> {
    const sql = status
      ? 'SELECT * FROM care_plans WHERE primary_professional_id = $1 AND status = $2 ORDER BY created_at DESC'
      : 'SELECT * FROM care_plans WHERE primary_professional_id = $1 ORDER BY created_at DESC';
    const r = await getPool().query<PlanRow>(sql, status ? [professionalId, status] : [professionalId]);
    return r.rows.map(toPlan);
  }

  public async saveVersion(version: CarePlanVersion): Promise<void> {
    await getPool().query(
      'INSERT INTO care_plan_versions (id, care_plan_id, version, status, summary, review_frequency_days, next_review_due, effective_from, effective_until, authored_by, approved_by, acknowledged_by_user, acknowledged_at, supersedes_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, approved_by=EXCLUDED.approved_by, acknowledged_by_user=EXCLUDED.acknowledged_by_user, acknowledged_at=EXCLUDED.acknowledged_at, effective_until=EXCLUDED.effective_until',
      [version.id, version.care_plan_id, version.version, version.status, version.summary, version.review_schedule.frequency_days, version.review_schedule.next_review_due, version.effective_from, version.effective_until || null, version.authored_by, version.approved_by || null, Boolean(version.acknowledged_by_user), version.acknowledged_at || null, version.supersedes_id || null, version.created_at]
    );
  }

  private async hydrateVersion(row: VersionRow): Promise<CarePlanVersion> {
    const goals = await this.findGoalsByVersionId(row.id);
    const interventions = await this.findInterventionsByVersionId(row.id);
    return {
      id: row.id,
      care_plan_id: row.care_plan_id,
      version: Number(row.version),
      status: row.status as CarePlanVersionStatus,
      summary: row.summary,
      goals,
      interventions,
      review_schedule: { frequency_days: Number(row.review_frequency_days), next_review_due: row.next_review_due },
      effective_from: row.effective_from,
      effective_until: row.effective_until || undefined,
      authored_by: row.authored_by,
      approved_by: row.approved_by || undefined,
      acknowledged_by_user: Boolean(row.acknowledged_by_user),
      acknowledged_at: row.acknowledged_at || undefined,
      supersedes_id: row.supersedes_id || undefined,
      created_at: row.created_at
    };
  }

  public async findVersionById(id: string): Promise<CarePlanVersion | null> {
    const r = await getPool().query<VersionRow>('SELECT * FROM care_plan_versions WHERE id = $1', [id]);
    return r.rows[0] ? this.hydrateVersion(r.rows[0]) : null;
  }

  public async findVersionsByPlanId(planId: string): Promise<CarePlanVersion[]> {
    const r = await getPool().query<VersionRow>('SELECT * FROM care_plan_versions WHERE care_plan_id = $1 ORDER BY version ASC', [planId]);
    return Promise.all(r.rows.map(row => this.hydrateVersion(row)));
  }

  public async findActiveVersion(planId: string): Promise<CarePlanVersion | null> {
    const r = await getPool().query<VersionRow>("SELECT * FROM care_plan_versions WHERE care_plan_id = $1 AND status = 'ACTIVE' ORDER BY version DESC LIMIT 1", [planId]);
    return r.rows[0] ? this.hydrateVersion(r.rows[0]) : null;
  }

  public async saveGoal(goal: CareGoal): Promise<void> {
    await getPool().query(
      'INSERT INTO care_goals (id, care_plan_version_id, goal_code, goal_type, title, description_reference, priority, target_type, target_value, baseline_reference, current_value, status, provenance, started_at, target_date, completed_at, created_by, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, description_reference=EXCLUDED.description_reference, priority=EXCLUDED.priority, target_value=EXCLUDED.target_value, baseline_reference=EXCLUDED.baseline_reference, current_value=EXCLUDED.current_value, status=EXCLUDED.status, target_date=EXCLUDED.target_date, completed_at=EXCLUDED.completed_at, updated_at=EXCLUDED.updated_at',
      [goal.id, goal.care_plan_version_id, goal.goal_code, goal.goal_type, goal.title, goal.description_reference, goal.priority, goal.target_type, jsonValue(goal.target_value), jsonValue(goal.baseline_reference), jsonValue(goal.current_value), goal.status, goal.provenance, goal.started_at, goal.target_date || null, goal.completed_at || null, goal.created_by, goal.created_at, goal.updated_at]
    );
  }

  public async findGoalById(id: string): Promise<CareGoal | null> {
    const r = await getPool().query<GoalRow>('SELECT * FROM care_goals WHERE id = $1', [id]);
    return r.rows[0] ? toGoal(r.rows[0]) : null;
  }

  public async findGoalsByVersionId(versionId: string, status?: CareGoalStatus): Promise<CareGoal[]> {
    const sql = status
      ? 'SELECT * FROM care_goals WHERE care_plan_version_id = $1 AND status = $2 ORDER BY created_at ASC, id ASC'
      : 'SELECT * FROM care_goals WHERE care_plan_version_id = $1 ORDER BY created_at ASC, id ASC';
    const r = await getPool().query<GoalRow>(sql, status ? [versionId, status] : [versionId]);
    return r.rows.map(toGoal);
  }

  public async saveGoalReview(review: CareGoalReview): Promise<void> {
    await getPool().query(
      'INSERT INTO care_goal_reviews (id, goal_id, reviewed_by, reviewed_at, status_before, status_after, evidence_refs, reason_codes, notes_reference) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING',
      [review.id, review.goal_id, review.reviewed_by, review.reviewed_at, review.status_before, review.status_after, JSON.stringify(review.evidence_refs), JSON.stringify(review.reason_codes), review.notes_reference || null]
    );
  }

  public async findGoalReviews(goalId: string): Promise<CareGoalReview[]> {
    const r = await getPool().query<GoalReviewRow>('SELECT * FROM care_goal_reviews WHERE goal_id = $1 ORDER BY reviewed_at ASC, id ASC', [goalId]);
    return r.rows.map(toGoalReview);
  }

  public async saveIntervention(i: CareIntervention): Promise<void> {
    await getPool().query(
      'INSERT INTO care_interventions (id, care_plan_version_id, intervention_type, reference_type, reference_id, title, frequency, duration, schedule_reference, responsible_actor_type, responsible_actor_id, status, clinical_artifact_reference, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, frequency=EXCLUDED.frequency, duration=EXCLUDED.duration, schedule_reference=EXCLUDED.schedule_reference, responsible_actor_type=EXCLUDED.responsible_actor_type, responsible_actor_id=EXCLUDED.responsible_actor_id',
      [i.id, i.care_plan_version_id, i.intervention_type, i.reference_type, i.reference_id, i.title, i.frequency, i.duration || null, i.schedule_reference || null, i.responsible_actor_type, i.responsible_actor_id || null, i.status, i.clinical_artifact_reference || null, i.created_at]
    );
  }

  public async findInterventionById(id: string): Promise<CareIntervention | null> {
    const r = await getPool().query<InterventionRow>('SELECT * FROM care_interventions WHERE id = $1', [id]);
    return r.rows[0] ? toIntervention(r.rows[0]) : null;
  }

  public async findInterventionsByVersionId(versionId: string): Promise<CareIntervention[]> {
    const r = await getPool().query<InterventionRow>('SELECT * FROM care_interventions WHERE care_plan_version_id = $1 ORDER BY created_at ASC, id ASC', [versionId]);
    return r.rows.map(toIntervention);
  }

  public async savePlanReview(review: CarePlanReview): Promise<void> {
    await getPool().query(
      'INSERT INTO care_plan_reviews (id, care_plan_id, care_plan_version_id, review_type, scheduled_for, started_at, completed_at, reviewer_id, outcome, goal_reviews, recommended_changes, new_version_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (id) DO UPDATE SET started_at=EXCLUDED.started_at, completed_at=EXCLUDED.completed_at, reviewer_id=EXCLUDED.reviewer_id, outcome=EXCLUDED.outcome, goal_reviews=EXCLUDED.goal_reviews, recommended_changes=EXCLUDED.recommended_changes, new_version_id=EXCLUDED.new_version_id',
      [review.id, review.care_plan_id, review.care_plan_version_id, review.review_type, review.scheduled_for, review.started_at || null, review.completed_at || null, review.reviewer_id, review.outcome, JSON.stringify(review.goal_reviews || []), JSON.stringify(review.recommended_changes || []), review.new_version_id || null, review.created_at]
    );
  }

  public async findPlanReviewById(id: string): Promise<CarePlanReview | null> {
    const r = await getPool().query<PlanReviewRow>('SELECT * FROM care_plan_reviews WHERE id = $1', [id]);
    return r.rows[0] ? toPlanReview(r.rows[0]) : null;
  }

  public async findPlanReviewsByPlanId(planId: string): Promise<CarePlanReview[]> {
    const r = await getPool().query<PlanReviewRow>('SELECT * FROM care_plan_reviews WHERE care_plan_id = $1 ORDER BY scheduled_for ASC, id ASC', [planId]);
    return r.rows.map(toPlanReview);
  }

  public async saveContentAssignment(a: ContentAssignment): Promise<void> {
    await getPool().query(
      'INSERT INTO content_assignments (id, care_plan_id, care_plan_version_id, intervention_id, subject_user_id, assigned_by, content_id, content_version, status, due_date, completed_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, due_date=EXCLUDED.due_date, completed_at=EXCLUDED.completed_at',
      [a.id, a.care_plan_id, a.care_plan_version_id, a.intervention_id || null, a.subject_user_id, a.assigned_by, a.content_id, a.content_version, a.status, a.due_date || null, a.completed_at || null, a.created_at]
    );
  }

  public async findContentAssignmentById(id: string): Promise<ContentAssignment | null> {
    const r = await getPool().query<ContentAssignmentRow>('SELECT * FROM content_assignments WHERE id = $1', [id]);
    return r.rows[0] ? r.rows[0] as ContentAssignment : null;
  }

  public async findContentAssignmentsByPlanId(planId: string): Promise<ContentAssignment[]> {
    const r = await getPool().query<ContentAssignmentRow>('SELECT * FROM content_assignments WHERE care_plan_id = $1 ORDER BY created_at ASC, id ASC', [planId]);
    return r.rows as ContentAssignment[];
  }

  public async saveAssessmentAssignment(a: AssessmentAssignment): Promise<void> {
    await getPool().query(
      'INSERT INTO assessment_assignments (id, care_plan_id, care_plan_version_id, intervention_id, subject_user_id, assigned_by, instrument_type, instrument_version, assignment_purpose, due_window, status, completed_assessment_id, completed_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, completed_assessment_id=EXCLUDED.completed_assessment_id, completed_at=EXCLUDED.completed_at',
      [a.id, a.care_plan_id, a.care_plan_version_id, a.intervention_id || null, a.subject_user_id, a.assigned_by, a.instrument_type, a.instrument_version || null, a.assignment_purpose, JSON.stringify(a.due_window), a.status, a.completed_assessment_id || null, a.completed_at || null, a.created_at]
    );
  }

  public async findAssessmentAssignmentById(id: string): Promise<AssessmentAssignment | null> {
    const r = await getPool().query<AssessmentAssignmentRow>('SELECT * FROM assessment_assignments WHERE id = $1', [id]);
    if (!r.rows[0]) return null;
    const row = r.rows[0];
    return { ...row, due_window: parseJson(row.due_window, { start_date: '', end_date: '' }), instrument_version: row.instrument_version ? Number(row.instrument_version) : undefined } as AssessmentAssignment;
  }

  public async findAssessmentAssignmentsByPlanId(planId: string): Promise<AssessmentAssignment[]> {
    const r = await getPool().query<AssessmentAssignmentRow>('SELECT * FROM assessment_assignments WHERE care_plan_id = $1 ORDER BY created_at ASC, id ASC', [planId]);
    return r.rows.map(row => ({ ...row, due_window: parseJson(row.due_window, { start_date: '', end_date: '' }), instrument_version: row.instrument_version ? Number(row.instrument_version) : undefined } as AssessmentAssignment));
  }

  public async clear(): Promise<void> {
    const pool = getPool();
    await pool.query('DELETE FROM assessment_assignments');
    await pool.query('DELETE FROM content_assignments');
    await pool.query('DELETE FROM care_plan_reviews');
    await pool.query('DELETE FROM care_interventions');
    await pool.query('DELETE FROM care_goal_reviews');
    await pool.query('DELETE FROM care_goals');
    await pool.query('DELETE FROM care_plan_versions');
    await pool.query('DELETE FROM care_plans');
  }
}
