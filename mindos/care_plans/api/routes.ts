import { Router, Request, Response, NextFunction } from 'express';
import {
  CarePlanService,
  CarePlanProgressService,
  CarePlanReviewService,
  AssignmentService,
  CarePlanType,
  CarePlanState,
  CarePlanReviewType,
  CarePlanReviewOutcome
} from '../index.js';
import {
  RelationshipAccessEvaluator,
  DataDomain,
  ActionPermission
} from '../../care_relationships/index.js';
import { AuthorizationError, NotFoundError } from '../../platform/errors/index.js';

export const carePlanRouter = Router();

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
    const status = req.query.status as CarePlanState | undefined;
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

    const plan = await CarePlanService.createDraftPlan({
      relationshipId: relationship_id,
      authorProfessionalId: a.id,
      planType: plan_type as CarePlanType,
      summary,
      goals,
      interventions,
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

    const version = await CarePlanService.createNewVersion({
      planId: req.params.id,
      authorProfessionalId: a.id,
      summary,
      goals,
      interventions,
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
    const review = await CarePlanReviewService.scheduleReview({
      planId: req.params.id,
      reviewType: review_type as CarePlanReviewType,
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

    const review = await CarePlanReviewService.executeReview({
      reviewId: req.params.reviewId,
      outcome: outcome as CarePlanReviewOutcome,
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
