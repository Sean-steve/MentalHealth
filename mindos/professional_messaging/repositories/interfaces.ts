import {
  ProfessionalMessageThread,
  ProfessionalThreadParticipant,
  ProfessionalMessage,
  ProfessionalMessageAttachment
} from '../domain/entities.js';
import {
  MessageDeliveryStatus,
  ProfessionalThreadStatus
} from '../domain/types.js';
import { DatabaseClient } from '../../platform/database/index.js';

export interface MessagingCreateResult {
  created: boolean;
  id: string;
}

export interface IProfessionalMessagingRepository {
  requiresUnitOfWork(): boolean;

  createThreadAggregate(
    thread: ProfessionalMessageThread,
    participants: ProfessionalThreadParticipant[],
    tx?: DatabaseClient
  ): Promise<void>;

  createMessageIdempotent(
    message: ProfessionalMessage,
    tx?: DatabaseClient
  ): Promise<MessagingCreateResult>;

  saveMessageWithExpectedStatus(
    message: ProfessionalMessage,
    expectedStatus: MessageDeliveryStatus,
    tx?: DatabaseClient
  ): Promise<void>;

  saveThreadWithExpectedVersion(
    thread: ProfessionalMessageThread,
    expectedVersion: number,
    tx?: DatabaseClient
  ): Promise<void>;

  saveParticipantTransactional(
    participant: ProfessionalThreadParticipant,
    tx?: DatabaseClient
  ): Promise<void>;
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