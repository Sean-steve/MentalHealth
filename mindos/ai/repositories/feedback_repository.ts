/**
 * MindOS Governed AI User Feedback Repository
 * Authority: Volumes IV, XV & Appendices B / H
 */

import { AIFeedbackEntity } from '../domain/types.js';
import { B29MutableStateStore } from '../../b29/mutable_state_store.js';

export class FeedbackRepository {
  private static feedbackList: AIFeedbackEntity[] = [];
  private static durablePersistenceEnabled = false;

  public static async enableDurablePersistence(): Promise<void> {
    this.durablePersistenceEnabled = true;
    this.feedbackList = (await B29MutableStateStore.list<AIFeedbackEntity>('AI','FEEDBACK')).map(x => x.payload);
  }

  public static disableDurablePersistenceForTesting(): void {
    this.durablePersistenceEnabled = false;
  }

  public static async saveFeedback(feedback: AIFeedbackEntity): Promise<void> {
    const idx=FeedbackRepository.feedbackList.findIndex(x=>x.id===feedback.id);
    if(idx>=0)FeedbackRepository.feedbackList[idx]={...feedback}; else FeedbackRepository.feedbackList.push({ ...feedback });
    if(this.durablePersistenceEnabled){
      await B29MutableStateStore.put({
        domain:'AI',entity_type:'FEEDBACK',entity_id:feedback.id,owner_id:feedback.user_id,
        parent_id:feedback.conversation_id,status:feedback.rating,payload:feedback
      });
    }
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
