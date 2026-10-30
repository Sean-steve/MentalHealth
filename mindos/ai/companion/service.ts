/**
 * MindOS Governed AI Companion Application Service
 * Authority: Master Architecture Index Section 7, Volumes I, IV, XV
 */

import { AICompanionOrchestrator } from './orchestrator.js';
import { ConversationRepository } from '../repositories/conversation_repository.js';
import { FeedbackRepository } from '../repositories/feedback_repository.js';
import {
  AICompanionTurnRequest,
  AICompanionTurnResponse,
  ConversationEntity,
  ConversationMessageEntity,
  AIFeedbackEntity,
  ConversationState
} from '../domain/types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { ForbiddenError, NotFoundError } from '../../platform/errors/index.js';
import { AuditService } from '../../platform/audit/index.js';

export class AICompanionService {
  public static async executeTurn(request: AICompanionTurnRequest): Promise<AICompanionTurnResponse> {
    return AICompanionOrchestrator.executeTurn(request);
  }

  public static async listConversations(userId: string): Promise<ConversationEntity[]> {
    const convs = await ConversationRepository.listActiveConversationsForUser(userId);
    return convs.map(c => c.toEntity());
  }

  public static async getConversationHistory(userId: string, conversationId: string): Promise<{
    conversation: ConversationEntity;
    messages: ConversationMessageEntity[];
  }> {
    const conv = await ConversationRepository.getConversationOrThrow(conversationId);
    if (conv.userId !== userId) {
      throw new ForbiddenError('Unauthorized access to conversation history.');
    }
    const messages = await ConversationRepository.getMessagesForConversation(conversationId);
    return {
      conversation: conv.toEntity(),
      messages: messages.map(m => m.toEntity())
    };
  }

  public static async closeConversation(userId: string, conversationId: string): Promise<ConversationEntity> {
    const conv = await ConversationRepository.getConversationOrThrow(conversationId);
    if (conv.userId !== userId) {
      throw new ForbiddenError('Unauthorized access to conversation.');
    }
    conv.transitionTo(ConversationState.CLOSED, userId);
    await ConversationRepository.saveConversation(conv);

    AuditService.record({
      actor_type: 'USER',
      actor_id: userId,
      action: 'AI.CONVERSATION.CLOSE',
      resource_type: 'AI_CONVERSATION',
      resource_id: conversationId,
      purpose: 'User-Initiated Conversation Closure',
      authorization_basis: { conversation_id: conversationId },
      result: 'ALLOWED'
    });

    return conv.toEntity();
  }

  public static async submitFeedback(params: {
    userId: string;
    conversationId: string;
    messageId: string;
    rating: 'HELPFUL' | 'UNHELPFUL' | 'SAFETY_CONCERN';
    feedbackTags?: string[];
    comments?: string;
  }): Promise<AIFeedbackEntity> {
    const conv = await ConversationRepository.getConversationOrThrow(params.conversationId);
    if (conv.userId !== params.userId) {
      throw new ForbiddenError('Unauthorized access to submit feedback.');
    }

    const feedback: AIFeedbackEntity = {
      id: generateUUIDv7(),
      conversation_id: params.conversationId,
      message_id: params.messageId,
      user_id: params.userId,
      rating: params.rating,
      feedback_tags: params.feedbackTags || [],
      comments: params.comments,
      created_at: new Date().toISOString()
    };

    await FeedbackRepository.saveFeedback(feedback);

    AuditService.record({
      actor_type: 'USER',
      actor_id: params.userId,
      action: 'AI.FEEDBACK.SUBMIT',
      resource_type: 'AI_FEEDBACK',
      resource_id: feedback.id,
      purpose: 'User Feedback on AI Turn',
      authorization_basis: { message_id: params.messageId },
      result: 'ALLOWED',
      metadata: { rating: params.rating, tags: params.feedbackTags }
    });

    return feedback;
  }
}
