/**
 * MindOS Governed Conversation & Message Repository
 * Authority: Master Architecture Index Section 7, Volumes I, IV, XV & Appendices B / C / H / Q
 */

import { Conversation } from '../domain/conversation.js';
import { ConversationMessage } from '../domain/message.js';
import { ConversationEntity, ConversationMessageEntity, ConversationState } from '../domain/types.js';
import { NotFoundError } from '../../platform/errors/index.js';

export class ConversationRepository {
  private static conversations: Map<string, ConversationEntity> = new Map();
  private static messagesByConversation: Map<string, ConversationMessageEntity[]> = new Map();

  public static async saveConversation(conversation: Conversation): Promise<void> {
    ConversationRepository.conversations.set(conversation.id, conversation.toEntity());
  }

  public static async getConversation(id: string): Promise<Conversation | null> {
    const entity = ConversationRepository.conversations.get(id);
    if (!entity) return null;
    return new Conversation(entity);
  }

  public static async getConversationOrThrow(id: string): Promise<Conversation> {
    const conv = await ConversationRepository.getConversation(id);
    if (!conv) {
      throw new NotFoundError(`Conversation with ID ${id} not found.`);
    }
    return conv;
  }

  public static async listActiveConversationsForUser(userId: string): Promise<Conversation[]> {
    const list: Conversation[] = [];
    for (const entity of ConversationRepository.conversations.values()) {
      if (entity.user_id === userId && entity.state === ConversationState.ACTIVE) {
        list.push(new Conversation(entity));
      }
    }
    return list.sort((a, b) => new Date(b.entity.last_active_at).getTime() - new Date(a.entity.last_active_at).getTime());
  }

  public static async saveMessage(message: ConversationMessage): Promise<void> {
    const entity = message.toEntity();
    const list = ConversationRepository.messagesByConversation.get(entity.conversation_id) || [];
    list.push(entity);
    ConversationRepository.messagesByConversation.set(entity.conversation_id, list);
  }

  public static async getMessagesForConversation(conversationId: string): Promise<ConversationMessage[]> {
    const entities = ConversationRepository.messagesByConversation.get(conversationId) || [];
    return entities
      .sort((a, b) => a.sequence_number - b.sequence_number)
      .map(e => new ConversationMessage(e));
  }

  public static async getLatestMessages(conversationId: string, limit = 10): Promise<ConversationMessage[]> {
    const all = await ConversationRepository.getMessagesForConversation(conversationId);
    return all.slice(-limit);
  }

  public static resetForTesting(): void {
    ConversationRepository.conversations.clear();
    ConversationRepository.messagesByConversation.clear();
  }
}
