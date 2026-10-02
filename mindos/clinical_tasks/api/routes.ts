import { Router, Request, Response, NextFunction } from 'express';
import {
  ClinicalTaskService,
  ClinicalTaskType,
  ClinicalTaskAssigneeType,
  ClinicalTaskPriority,
  ClinicalTaskCompletionAuthority,
  ClinicalTaskEvidenceType
} from '../index.js';
import { AuthorizationError, DomainInvariantError } from '../../platform/errors/index.js';

export const clinicalTaskRouter = Router();

function actor(req: Request): {
  id: string;
  type: ClinicalTaskAssigneeType.USER | ClinicalTaskAssigneeType.PROFESSIONAL;
} {
  const id = String(req.headers['x-actor-id'] || '');
  const rawType = String(req.headers['x-actor-type'] || '').toUpperCase();
  if (!id) throw new AuthorizationError('x-actor-id is required.', { errorCode: 'AUTHZ_001' });
  if (rawType !== ClinicalTaskAssigneeType.USER && rawType !== ClinicalTaskAssigneeType.PROFESSIONAL) {
    throw new AuthorizationError('HTTP clinical-task access is limited to USER or PROFESSIONAL actors.', { errorCode: 'AUTHZ_002' });
  }
  return { id, type: rawType as ClinicalTaskAssigneeType.USER | ClinicalTaskAssigneeType.PROFESSIONAL };
}

clinicalTaskRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    if (a.type === ClinicalTaskAssigneeType.USER) {
      const tasks = await ClinicalTaskService.listTasksForUser(a.id);
      return res.json({ total: tasks.length, tasks });
    }
    const relationshipId = String(req.query.relationship_id || '');
    if (!relationshipId) {
      return res.status(400).json({ error: 'relationship_id is required for professional task listing.' });
    }
    const tasks = await ClinicalTaskService.listTasksForRelationship(relationshipId, a.id);
    return res.json({ total: tasks.length, tasks });
  } catch (err) {
    next(err);
  }
});

clinicalTaskRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    const task = await ClinicalTaskService.getTaskForActor(req.params.id, a.id, a.type);
    res.json({ task });
  } catch (err) {
    next(err);
  }
});

clinicalTaskRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    if (a.type !== ClinicalTaskAssigneeType.PROFESSIONAL) {
      throw new AuthorizationError('Only an authorized professional may create a clinical task through this API.', { errorCode: 'AUTHZ_002' });
    }
    const {
      care_relationship_id,
      care_plan_id,
      care_goal_id,
      task_type,
      assigned_to_type,
      assigned_to_id,
      priority,
      title,
      instruction_reference,
      due_at,
      recurrence_rule,
      source_type,
      source_reference,
      completion_authority,
      owner_domain,
      dependency_task_ids,
      policy_version,
      idempotency_key
    } = req.body || {};

    if (!care_relationship_id || !task_type || !assigned_to_type || !assigned_to_id ||
        !title || !instruction_reference || !source_type || !source_reference || !policy_version) {
      return res.status(400).json({
        error: 'care_relationship_id, task_type, assigned_to_type, assigned_to_id, title, instruction_reference, source_type, source_reference and policy_version are required.'
      });
    }

    const task = await ClinicalTaskService.createTask({
      care_relationship_id,
      care_plan_id,
      care_goal_id,
      task_type: task_type as ClinicalTaskType,
      assigned_to_type: assigned_to_type as ClinicalTaskAssigneeType,
      assigned_to_id,
      priority: priority as ClinicalTaskPriority | undefined,
      title,
      instruction_reference,
      due_at,
      recurrence_rule,
      source_type,
      source_reference,
      completion_authority: completion_authority as ClinicalTaskCompletionAuthority | undefined,
      owner_domain,
      dependency_task_ids,
      policy_version,
      idempotency_key,
      creator_professional_id: a.id
    });

    res.status(201).json({ task });
  } catch (err) {
    next(err);
  }
});

clinicalTaskRouter.post('/:id/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    await ClinicalTaskService.getTaskForActor(req.params.id, a.id, a.type);
    const task = await ClinicalTaskService.startTask(req.params.id, a.id);
    res.json({ task });
  } catch (err) {
    next(err);
  }
});

clinicalTaskRouter.post('/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    const task = await ClinicalTaskService.getTaskForActor(req.params.id, a.id, a.type);

    if (task.completion_authority === ClinicalTaskCompletionAuthority.OWNER_DOMAIN ||
        task.completion_authority === ClinicalTaskCompletionAuthority.SYSTEM) {
      throw new AuthorizationError(
        'This task must be completed by its authoritative internal domain/service, not through the external HTTP endpoint.',
        { errorCode: 'AUTHZ_004' }
      );
    }

    const evidenceReference = String(req.body?.evidence_reference || '');
    if (!evidenceReference) {
      return res.status(400).json({ error: 'evidence_reference is required.' });
    }

    const evidenceType = a.type === ClinicalTaskAssigneeType.USER
      ? ClinicalTaskEvidenceType.USER_ATTESTATION
      : ClinicalTaskEvidenceType.PROFESSIONAL_ATTESTATION;

    const completed = await ClinicalTaskService.completeTask({
      task_id: task.id,
      actor_id: a.id,
      actor_type: a.type,
      evidence_type: evidenceType,
      evidence_reference: evidenceReference
    });

    res.json({ task: completed });
  } catch (err) {
    next(err);
  }
});

clinicalTaskRouter.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    if (a.type !== ClinicalTaskAssigneeType.PROFESSIONAL) {
      throw new AuthorizationError('Only an authorized professional may cancel a clinical task.', { errorCode: 'AUTHZ_002' });
    }
    const task = await ClinicalTaskService.cancelTask(req.params.id, a.id);
    res.json({ task });
  } catch (err) {
    next(err);
  }
});

// Owner-domain completions must use the internal application service/event-consumer path.
// This route is intentionally absent: POST /:id/complete-as-domain
// A browser/client must never be able to forge Assessment/Appointment/Content completion.
void DomainInvariantError;
