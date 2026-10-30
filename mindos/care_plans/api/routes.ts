import { Router, Request, Response, NextFunction } from 'express';
import {
  CarePlanService,
  CarePlanProgressService,
  CarePlanReviewService,
  AssignmentService,
  CarePlanType,
  CarePlanState,
  CarePlanReviewType,
  CarePlanReviewOutcome,
  CareGoalType,
  CareGoalProvenance,
  GoalPriority,
  GoalTargetType,
  CareInterventionType,
  CareGoalStatus,
  CareGoal,
  CareIntervention
} from '../index.js';
import {
  RelationshipAccessEvaluator,
  DataDomain,
  ActionPermission
} from '../../care_relationships/index.js';
import { AuthorizationError, DomainInvariantError, NotFoundError } from '../../platform/errors/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';

export const carePlanRouter = Router();

function isEnumValue<T extends Record<string, string>>(
  enumeration: T,
  value: unknown
): value is T[keyof T] {
  return typeof value === 'string' &&
    Object.values(enumeration).includes(value as T[keyof T]);
}

function normalizeProfessionalGoals(raw: unknown, actorId: string): CareGoal[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new DomainInvariantError('goals must be an array.');
  }

  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new DomainInvariantError(`Goal at index ${index} must be an object.`);
    }
    const goal = entry as Record<string, unknown>;
    if (!isEnumValue(CareGoalType, goal.goal_type)) {
      throw new DomainInvariantError(`Goal at index ${index} has invalid goal_type.`);
    }
    if (!isEnumValue(GoalPriority, goal.priority)) {
      throw new DomainInvariantError(`Goal at index ${index} has invalid priority.`);
    }
    if (!isEnumValue(GoalTargetType, goal.target_type)) {
      throw new DomainInvariantError(`Goal at index ${index} has invalid target_type.`);
    }

    const provenance =
      goal.provenance === undefined
        ? CareGoalProvenance.PROFESSIONAL_RECOMMENDED
        : goal.provenance;
    if (
      provenance !== CareGoalProvenance.PROFESSIONAL_RECOMMENDED &&
      provenance !== CareGoalProvenance.COLLABORATIVE
    ) {
      throw new DomainInvariantError(
        'Professional Care Plan API may only record PROFESSIONAL_RECOMMENDED or COLLABORATIVE goal provenance.'
      );
    }

    const title = String(goal.title || '').trim();
    const descriptionReference = String(goal.description_reference || '').trim();
    if (!title || !descriptionReference) {
      throw new DomainInvariantError(
        `Goal at index ${index} requires title and description_reference.`
      );
    }

    const now = new Date().toISOString();
    return {
      id: generateUUIDv7(),
      care_plan_version_id: 'PENDING_VERSION_ASSIGNMENT',
      goal_code: String(goal.goal_code || ''),
      goal_type: goal.goal_type,
      title,
      description_reference: descriptionReference,
      priority: goal.priority,
      target_type: goal.target_type,
      target_value:
        typeof goal.target_value === 'string' || typeof goal.target_value === 'number'
          ? goal.target_value
          : undefined,
      baseline_reference:
        typeof goal.baseline_reference === 'string' || typeof goal.baseline_reference === 'number'
          ? goal.baseline_reference
          : undefined,
      status: CareGoalStatus.NOT_STARTED,
      provenance,
      started_at: now,
      target_date: typeof goal.target_date === 'string' ? goal.target_date : undefined,
      created_by: actorId,
      created_at: now,
      updated_at: now
    };
  });
}

function normalizeProfessionalInterventions(
  raw: unknown,
  status: CareIntervention['status']
): CareIntervention[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new DomainInvariantError('interventions must be an array.');
  }

  const referenceTypes = new Set([
    'CONTENT_VERSION',
    'EXERCISE_DEFINITION',
    'ASSESSMENT_INSTRUMENT',
    'SERVICE_OFFERING',
    'SAFETY_PLAN',
    'CUSTOM'
  ]);
  const responsibleActorTypes = new Set([
    'USER',
    'PROFESSIONAL',
    'CARE_TEAM_ROLE'
  ]);

  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new DomainInvariantError(`Intervention at index ${index} must be an object.`);
    }
    const intervention = entry as Record<string, unknown>;
    if (!isEnumValue(CareInterventionType, intervention.intervention_type)) {
      throw new DomainInvariantError(
        `Intervention at index ${index} has invalid intervention_type.`
      );
    }

    const referenceType = String(intervention.reference_type || '');
    const responsibleActorType = String(intervention.responsible_actor_type || '');
    if (!referenceTypes.has(referenceType)) {
      throw new DomainInvariantError(
        `Intervention at index ${index} has invalid reference_type.`
      );
    }
    if (!responsibleActorTypes.has(responsibleActorType)) {
      throw new DomainInvariantError(
        `Intervention at index ${index} has invalid responsible_actor_type.`
      );
    }

    const referenceId = String(intervention.reference_id || '').trim();
    const title = String(intervention.title || '').trim();
    const frequency = String(intervention.frequency || '').trim();
    if (!referenceId || !title || !frequency) {
      throw new DomainInvariantError(
        `Intervention at index ${index} requires reference_id, title and frequency.`
      );
    }

    return {
      id: generateUUIDv7(),
      care_plan_version_id: 'PENDING_VERSION_ASSIGNMENT',
      intervention_type: intervention.intervention_type,
      reference_type: referenceType as CareIntervention['reference_type'],
      reference_id: referenceId,
      title,
      frequency,
      duration:
        typeof intervention.duration === 'string' ? intervention.duration : undefined,
      responsible_actor_type:
        responsibleActorType as CareIntervention['responsible_actor_type'],
      // External clients cannot forge arbitrary actor IDs. Ownership is resolved
      // from the relationship/care-team context by later governed workflows.
      responsible_actor_id: undefined,
      status,
      clinical_artifact_reference:
        typeof intervention.clinical_artifact_reference === 'string'
          ? intervention.clinical_artifact_reference
          : undefined,
      created_at: new Date().toISOString()
    };
  });
}


type PlanActor = { id: string; type: 'USER' | 'PROFESSIONAL' };

function actor(req: Request): PlanActor {
  const id = String(req.headers['x-actor-id'] || '');
  const type = String(req.headers['x-actor-type'] || '').toUpperCase();
  if (!id) throw new AuthorizationError('x-actor-id is required.', { errorCode: 'AUTHZ_001' });
  if (type !== 'USER' && type !== 'PROFESSIONAL') {
    throw new AuthorizationError('Care Plan HTTP access is limited to USER or PROFESSIONAL actors.', { errorCode: 'AUTHZ_002' });
  }
  return { id, type: type as PlanActor['type'] };
}

async function authorizePlan(planId: string, a: PlanActor, action: ActionPermission): Promise<void> {
  const plan = await CarePlanService.getPlan(planId);
  if (!plan) throw new NotFoundError(`CarePlan ${planId} not found.`);

  if (a.type === 'USER') {
    if (plan.subject_user_id !== a.id || action !== ActionPermission.READ) {
      throw new AuthorizationError('User may only read their own Care Plan through this endpoint.', { errorCode: 'AUTHZ_003' });
    }
    return;
  }

  await RelationshipAccessEvaluator.assertAccess({
    relationshipId: plan.care_relationship_id,
    professionalId: a.id,
    dataDomain: DataDomain.CARE_PLANS,
    action,
    purpose: 'CARE_DELIVERY'
  });
}

carePlanRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    const rawStatus = req.query.status;
    if (rawStatus !== undefined && !isEnumValue(CarePlanState, rawStatus)) {
      return res.status(400).json({ error: 'Invalid Care Plan status filter.' });
    }
    const status = rawStatus as CarePlanState | undefined;
    const plans = a.type === 'USER'
      ? await CarePlanService.listPlansForUser(a.id, status)
      : await CarePlanService.listPlansForProfessional(a.id, status);
    res.json({ total: plans.length, plans });
  } catch (err) {
    next(err);
  }
});

carePlanRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    await authorizePlan(req.params.id, a, ActionPermission.READ);
    const plan = await CarePlanService.getPlan(req.params.id);
    const version = await CarePlanService.getActiveVersion(req.params.id);
    res.json({ plan, active_version: version });
  } catch (err) {
    next(err);
  }
});

carePlanRouter.get('/:id/progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    await authorizePlan(req.params.id, a, ActionPermission.READ);
    const progress = await CarePlanProgressService.getProgress(req.params.id);
    res.json({ progress });
  } catch (err) {
    next(err);
  }
});

carePlanRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    if (a.type !== 'PROFESSIONAL') {
      throw new AuthorizationError('Only an authorized professional may create a Care Plan.', { errorCode: 'AUTHZ_002' });
    }

    const {
      relationship_id,
      plan_type,
      summary,
      goals,
      interventions,
      review_frequency_days,
      requires_user_acknowledgement
    } = req.body || {};

    if (!relationship_id || !plan_type || !summary || !review_frequency_days) {
      return res.status(400).json({
        error: 'relationship_id, plan_type, summary and governed review_frequency_days are required.'
      });
    }

    if (!isEnumValue(CarePlanType, plan_type)) {
      return res.status(400).json({ error: 'Invalid plan_type.' });
    }
    const normalizedGoals = normalizeProfessionalGoals(goals, a.id);
    const normalizedInterventions = normalizeProfessionalInterventions(
      interventions,
      'PLANNED'
    );

    const plan = await CarePlanService.createDraftPlan({
      relationshipId: relationship_id,
      authorProfessionalId: a.id,
      planType: plan_type,
      summary,
      goals: normalizedGoals,
      interventions: normalizedInterventions,
      reviewFrequencyDays: Number(review_frequency_days),
      requiresUserAcknowledgement: Boolean(requires_user_acknowledgement),
      actorId: a.id
    });

    res.status(201).json({ plan });
  } catch (err) {
    next(err);
  }
});

carePlanRouter.post('/:id/acknowledge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    if (a.type !== 'USER') {
      throw new AuthorizationError('Only the subject user may acknowledge a Care Plan.', { errorCode: 'AUTHZ_002' });
    }
    const plan = await CarePlanService.userAcknowledgePlan(req.params.id, a.id);
    res.json({ plan });
  } catch (err) {
    next(err);
  }
});

carePlanRouter.post('/:id/activate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    if (a.type !== 'PROFESSIONAL') {
      throw new AuthorizationError('Only an authorized professional may activate a Care Plan.', { errorCode: 'AUTHZ_002' });
    }
    await authorizePlan(req.params.id, a, ActionPermission.WRITE);
    const plan = await CarePlanService.activatePlan(req.params.id, a.id);
    res.json({ plan });
  } catch (err) {
    next(err);
  }
});

carePlanRouter.post('/:id/versions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    if (a.type !== 'PROFESSIONAL') {
      throw new AuthorizationError('Only an authorized professional may revise a Care Plan.', { errorCode: 'AUTHZ_002' });
    }
    await authorizePlan(req.params.id, a, ActionPermission.WRITE);

    const { summary, goals, interventions, change_rationale, review_frequency_days } = req.body || {};
    if (!summary || !Array.isArray(goals) || !Array.isArray(interventions) || !change_rationale) {
      return res.status(400).json({ error: 'summary, goals, interventions and change_rationale are required.' });
    }

    const normalizedGoals = normalizeProfessionalGoals(goals, a.id);
    const normalizedInterventions = normalizeProfessionalInterventions(
      interventions,
      'ACTIVE'
    );

    const version = await CarePlanService.createNewVersion({
      planId: req.params.id,
      authorProfessionalId: a.id,
      summary,
      goals: normalizedGoals,
      interventions: normalizedInterventions,
      changeRationale: change_rationale,
      reviewFrequencyDays: review_frequency_days ? Number(review_frequency_days) : undefined,
      actorId: a.id
    });
    res.status(201).json({ version });
  } catch (err) {
    next(err);
  }
});

carePlanRouter.post('/:id/reviews', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    if (a.type !== 'PROFESSIONAL') {
      throw new AuthorizationError('Only an authorized professional may schedule a Care Plan review.', { errorCode: 'AUTHZ_002' });
    }
    await authorizePlan(req.params.id, a, ActionPermission.WRITE);
    const { review_type, scheduled_for } = req.body || {};
    if (!review_type || !scheduled_for) {
      return res.status(400).json({ error: 'review_type and scheduled_for are required.' });
    }
    if (!isEnumValue(CarePlanReviewType, review_type)) {
      return res.status(400).json({ error: 'Invalid review_type.' });
    }
    const review = await CarePlanReviewService.scheduleReview({
      planId: req.params.id,
      reviewType: review_type,
      scheduledFor: scheduled_for,
      reviewerId: a.id
    });
    res.status(201).json({ review });
  } catch (err) {
    next(err);
  }
});

carePlanRouter.post('/reviews/:reviewId/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    if (a.type !== 'PROFESSIONAL') {
      throw new AuthorizationError('Only an authorized professional may complete a Care Plan review.', { errorCode: 'AUTHZ_002' });
    }
    const { outcome, goal_reviews, recommended_changes, new_version } = req.body || {};
    if (!outcome) return res.status(400).json({ error: 'outcome is required.' });
    if (!isEnumValue(CarePlanReviewOutcome, outcome)) {
      return res.status(400).json({ error: 'Invalid Care Plan review outcome.' });
    }

    const review = await CarePlanReviewService.executeReview({
      reviewId: req.params.reviewId,
      outcome,
      goalReviews: Array.isArray(goal_reviews) ? goal_reviews : [],
      recommendedChanges: Array.isArray(recommended_changes) ? recommended_changes : undefined,
      newVersionParams: new_version,
      reviewerId: a.id
    });
    res.json({ review });
  } catch (err) {
    next(err);
  }
});

carePlanRouter.post('/:id/assignments/content', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    if (a.type !== 'PROFESSIONAL') {
      throw new AuthorizationError('Only an authorized professional may assign governed content.', { errorCode: 'AUTHZ_002' });
    }
    await authorizePlan(req.params.id, a, ActionPermission.WRITE);
    const { intervention_id, content_id, content_version, due_date } = req.body || {};
    if (!content_id || !content_version) {
      return res.status(400).json({ error: 'content_id and content_version are required.' });
    }
    const assignment = await AssignmentService.assignContent({
      planId: req.params.id,
      interventionId: intervention_id,
      contentId: content_id,
      contentVersion: Number(content_version),
      assignedBy: a.id,
      dueDate: due_date
    });
    res.status(201).json({ assignment });
  } catch (err) {
    next(err);
  }
});

carePlanRouter.post('/:id/assignments/assessment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    if (a.type !== 'PROFESSIONAL') {
      throw new AuthorizationError('Only an authorized professional may assign an assessment.', { errorCode: 'AUTHZ_002' });
    }
    await authorizePlan(req.params.id, a, ActionPermission.WRITE);
    const { intervention_id, instrument_type, instrument_version, assignment_purpose, due_window } = req.body || {};
    if (!instrument_type || !assignment_purpose || !due_window?.start_date || !due_window?.end_date) {
      return res.status(400).json({
        error: 'instrument_type, assignment_purpose and due_window.start_date/end_date are required.'
      });
    }
    const assignment = await AssignmentService.assignAssessment({
      planId: req.params.id,
      interventionId: intervention_id,
      instrumentType: instrument_type,
      instrumentVersion: instrument_version ? Number(instrument_version) : undefined,
      assignmentPurpose: assignment_purpose,
      dueWindow: { startDate: due_window.start_date, endDate: due_window.end_date },
      assignedBy: a.id
    });
    res.status(201).json({ assignment });
  } catch (err) {
    next(err);
  }
});
