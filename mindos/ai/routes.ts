/**
 * MindOS Governed AI Companion REST API Routes
 * Authority: Master Architecture Index Section 7, Volumes I, IV, XV & Appendices B / C / H / Q
 */

import { Router, Request, Response, NextFunction } from 'express';
import { AICompanionService } from './companion/service.js';
import { AIMemoryService } from './memory/service.js';
import { COMPANION_TOOLS } from './tools/definitions.js';
import { AuthenticationMiddleware } from '../platform/auth/middleware.js';
import { ValidationError } from '../platform/errors/index.js';

export const aiRouter = Router();

function getUserId(req: Request): string {
  return req.user?.id || req.user?.accountId || 'anonymous';
}

// 1. Execute Turn
aiRouter.post(
  '/companion/turn',
  AuthenticationMiddleware.authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message_text, conversation_id, purpose, locale, jurisdiction, idempotency_key } = req.body;
      if (!message_text || typeof message_text !== 'string') {
        throw new ValidationError('message_text is required and must be a string.');
      }

      const response = await AICompanionService.executeTurn({
        user_id: getUserId(req),
        conversation_id,
        message_text,
        purpose,
        locale,
        jurisdiction,
        idempotency_key
      });

      res.status(200).json({ status: 'SUCCESS', data: response });
    } catch (err) {
      next(err);
    }
  }
);

// 2. List Active Conversations
aiRouter.get(
  '/companion/conversations',
  AuthenticationMiddleware.authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const list = await AICompanionService.listConversations(getUserId(req));
      res.status(200).json({ status: 'SUCCESS', data: list });
    } catch (err) {
      next(err);
    }
  }
);

// 3. Get Conversation History
aiRouter.get(
  '/companion/conversations/:id',
  AuthenticationMiddleware.authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AICompanionService.getConversationHistory(getUserId(req), req.params.id);
      res.status(200).json({ status: 'SUCCESS', data: result });
    } catch (err) {
      next(err);
    }
  }
);

// 4. Close Conversation
aiRouter.post(
  '/companion/conversations/:id/close',
  AuthenticationMiddleware.authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const closed = await AICompanionService.closeConversation(getUserId(req), req.params.id);
      res.status(200).json({ status: 'SUCCESS', data: closed });
    } catch (err) {
      next(err);
    }
  }
);

// 5. Submit Feedback
aiRouter.post(
  '/companion/feedback',
  AuthenticationMiddleware.authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversation_id, message_id, rating, feedback_tags, comments } = req.body;
      if (!conversation_id || !message_id || !rating) {
        throw new ValidationError('conversation_id, message_id, and rating are required.');
      }

      const record = await AICompanionService.submitFeedback({
        userId: getUserId(req),
        conversationId: conversation_id,
        messageId: message_id,
        rating,
        feedbackTags: feedback_tags,
        comments
      });

      res.status(201).json({ status: 'SUCCESS', data: record });
    } catch (err) {
      next(err);
    }
  }
);

// 6. List User Memories
aiRouter.get(
  '/memories',
  AuthenticationMiddleware.authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const memories = await AIMemoryService.getUserMemories(getUserId(req));
      res.status(200).json({ status: 'SUCCESS', data: memories });
    } catch (err) {
      next(err);
    }
  }
);

// 7. Create User Memory
aiRouter.post(
  '/memories',
  AuthenticationMiddleware.authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { category, memory_text, source_conversation_id } = req.body;
      if (!category || !memory_text) {
        throw new ValidationError('category and memory_text are required.');
      }

      const mem = await AIMemoryService.createMemory({
        userId: getUserId(req),
        category,
        memoryText: memory_text,
        sourceConversationId: source_conversation_id
      });

      res.status(201).json({ status: 'SUCCESS', data: mem });
    } catch (err) {
      next(err);
    }
  }
);

// 8. Update User Memory
aiRouter.put(
  '/memories/:id',
  AuthenticationMiddleware.authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { memory_text } = req.body;
      if (!memory_text) {
        throw new ValidationError('memory_text is required.');
      }

      const updated = await AIMemoryService.updateMemory(getUserId(req), req.params.id, memory_text);
      res.status(200).json({ status: 'SUCCESS', data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// 9. Delete Single User Memory
aiRouter.delete(
  '/memories/:id',
  AuthenticationMiddleware.authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await AIMemoryService.deleteMemory(getUserId(req), req.params.id);
      res.status(200).json({ status: 'SUCCESS', message: 'Memory deleted successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

// 10. Clear All User Memories (Kenya DPA 2019 Right to Erasure)
aiRouter.delete(
  '/memories',
  AuthenticationMiddleware.authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const count = await AIMemoryService.clearAllUserMemories(getUserId(req));
      res.status(200).json({ status: 'SUCCESS', message: `Cleared ${count} memories.` });
    } catch (err) {
      next(err);
    }
  }
);

// 11. List Approved Companion Tools
aiRouter.get(
  '/tools',
  AuthenticationMiddleware.authenticate,
  async (req: Request, res: Response) => {
    res.status(200).json({ status: 'SUCCESS', data: Object.values(COMPANION_TOOLS) });
  }
);
