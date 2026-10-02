import { Router, Request, Response, NextFunction } from 'express';
import {
  ProfessionalMessagingService,
  ProfessionalThreadType,
  ThreadParticipantType,
  ProfessionalMessageType
} from '../index.js';
import { AuthorizationError } from '../../platform/errors/index.js';

export const professionalMessagingRouter = Router();

function actor(req: Request): {
  id: string;
  type: ThreadParticipantType.USER | ThreadParticipantType.PROFESSIONAL;
} {
  const id = String(req.headers['x-actor-id'] || '');
  const rawType = String(req.headers['x-actor-type'] || '').toUpperCase();
  if (!id) throw new AuthorizationError('x-actor-id is required.', { errorCode: 'AUTHZ_001' });
  if (rawType !== ThreadParticipantType.USER && rawType !== ThreadParticipantType.PROFESSIONAL) {
    throw new AuthorizationError('Care messaging HTTP access is limited to USER or PROFESSIONAL actors.', { errorCode: 'AUTHZ_002' });
  }
  return { id, type: rawType as ThreadParticipantType.USER | ThreadParticipantType.PROFESSIONAL };
}

professionalMessagingRouter.get('/threads', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    const relationshipId = String(req.query.relationship_id || '');
    if (!relationshipId) return res.status(400).json({ error: 'relationship_id is required.' });
    const threads = await ProfessionalMessagingService.listThreadsForRelationship(relationshipId, a.id);
    res.json({ total: threads.length, threads });
  } catch (err) {
    next(err);
  }
});

professionalMessagingRouter.post('/threads', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    const { care_relationship_id, thread_type, purpose, professional_id, response_expectation_reference } = req.body || {};
    if (!care_relationship_id || !thread_type || !purpose) {
      return res.status(400).json({ error: 'care_relationship_id, thread_type and purpose are required.' });
    }

    const thread = await ProfessionalMessagingService.openThread({
      care_relationship_id,
      thread_type: thread_type as ProfessionalThreadType,
      purpose,
      created_by: a.id,
      creator_type: a.type,
      professional_id: a.type === ThreadParticipantType.PROFESSIONAL ? a.id : professional_id,
      response_expectation_reference
    });
    res.status(201).json({ thread });
  } catch (err) {
    next(err);
  }
});

professionalMessagingRouter.get('/threads/:threadId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    const thread = await ProfessionalMessagingService.getThreadForActor(req.params.threadId, a.id);
    res.json({ thread });
  } catch (err) {
    next(err);
  }
});

professionalMessagingRouter.get('/threads/:threadId/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    const messages = await ProfessionalMessagingService.listMessages(req.params.threadId, a.id);
    res.json({ total: messages.length, messages });
  } catch (err) {
    next(err);
  }
});

professionalMessagingRouter.post('/threads/:threadId/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    const { message_type, content_reference, idempotency_key, reply_to_message_id } = req.body || {};
    if (!message_type || !content_reference || !idempotency_key) {
      return res.status(400).json({
        error: 'message_type, content_reference and idempotency_key are required. Raw message content is not accepted by this metadata endpoint.'
      });
    }

    const message = await ProfessionalMessagingService.sendMessage({
      thread_id: req.params.threadId,
      sender_type: a.type,
      sender_id: a.id,
      message_type: message_type as ProfessionalMessageType,
      content_reference,
      idempotency_key,
      reply_to_message_id
    });
    res.status(201).json({ message });
  } catch (err) {
    next(err);
  }
});

professionalMessagingRouter.post('/threads/:threadId/messages/:messageId/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    await ProfessionalMessagingService.getThreadForActor(req.params.threadId, a.id);
    const message = await ProfessionalMessagingService.getMessage(req.params.messageId);
    if (message.thread_id !== req.params.threadId) {
      return res.status(404).json({ error: 'Message does not belong to the requested thread.' });
    }
    const updated = await ProfessionalMessagingService.markRead(message.id, a.id);
    res.json({ message: updated });
  } catch (err) {
    next(err);
  }
});

professionalMessagingRouter.post('/threads/:threadId/participants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    if (a.type !== ThreadParticipantType.PROFESSIONAL) {
      throw new AuthorizationError('Only an authorized professional may add care-team participants.', { errorCode: 'AUTHZ_002' });
    }
    const { professional_id, participant_role } = req.body || {};
    if (!professional_id) return res.status(400).json({ error: 'professional_id is required.' });
    const participant = await ProfessionalMessagingService.addProfessionalParticipant(
      req.params.threadId,
      professional_id,
      a.id,
      participant_role || 'CARE_TEAM'
    );
    res.status(201).json({ participant });
  } catch (err) {
    next(err);
  }
});

professionalMessagingRouter.delete('/threads/:threadId/participants/:actorId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    if (a.type !== ThreadParticipantType.PROFESSIONAL) {
      throw new AuthorizationError('Only an authorized professional may remove care-team participants.', { errorCode: 'AUTHZ_002' });
    }
    await ProfessionalMessagingService.removeParticipant(req.params.threadId, req.params.actorId, a.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

professionalMessagingRouter.post('/threads/:threadId/close', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = actor(req);
    if (a.type !== ThreadParticipantType.PROFESSIONAL) {
      throw new AuthorizationError('Only an authorized professional may close a care thread.', { errorCode: 'AUTHZ_002' });
    }
    const thread = await ProfessionalMessagingService.closeThread(req.params.threadId, a.id);
    res.json({ thread });
  } catch (err) {
    next(err);
  }
});

// Attachment linking is intentionally not exposed here.
// A future media service must establish malware-scan status and protected evidence reference
// before ProfessionalMessagingService.addAttachment can be called by an internal trusted adapter.
