/**
 * MindOS Governed AI User Feedback Repository
 * Authority: Volumes IV, XV & Appendices B / H
 */

import { AIFeedbackEntity } from '../domain/types.js';

export class FeedbackRepository {
  private static feedbackList: AIFeedbackEntity[] = [];

  public static async saveFeedback(feedback: AIFeedbackEntity): Promise<void> {
    FeedbackRepository.feedbackList.push({ ...feedback });
  }

  public static async listFeedbackForUser(userId: string): Promise<AIFeedbackEntity[]> {
    return FeedbackRepository.feedbackList.filter(f => f.user_id === userId);
  }

  public static async listFeedbackForConversation(conversationId: string): Promise<AIFeedbackEntity[]> {
    return FeedbackRepository.feedbackList.filter(f => f.conversation_id === conversationId);
  }

  public static resetForTesting(): void {
    FeedbackRepository.feedbackList = [];
  }
}
