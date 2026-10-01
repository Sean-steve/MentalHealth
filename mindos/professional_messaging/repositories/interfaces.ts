import {
  ProfessionalMessageThread,
  ProfessionalThreadParticipant,
  ProfessionalMessage,
  ProfessionalMessageAttachment
} from '../domain/entities.js';

export interface IProfessionalMessagingRepository {
  saveThread(thread: ProfessionalMessageThread): Promise<void>;
  findThreadById(id: string): Promise<ProfessionalMessageThread | null>;
  findThreadsByRelationshipId(relationshipId: string): Promise<ProfessionalMessageThread[]>;
  saveParticipant(participant: ProfessionalThreadParticipant): Promise<void>;
  findParticipant(threadId: string, actorId: string): Promise<ProfessionalThreadParticipant | null>;
  findParticipants(threadId: string): Promise<ProfessionalThreadParticipant[]>;
  saveMessage(message: ProfessionalMessage): Promise<void>;
  findMessageById(id: string): Promise<ProfessionalMessage | null>;
  findMessageByIdempotencyKey(threadId: string, idempotencyKey: string): Promise<ProfessionalMessage | null>;
  findMessages(threadId: string): Promise<ProfessionalMessage[]>;
  saveAttachment(attachment: ProfessionalMessageAttachment): Promise<void>;
  findAttachments(messageId: string): Promise<ProfessionalMessageAttachment[]>;
  clear(): void;
}