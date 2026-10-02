import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';
import { AuthorizationError, DomainInvariantError, NotFoundError } from '../../platform/errors/index.js';
import {
  CareRelationshipService,
  RelationshipAccessEvaluator,
  CareRelationshipState,
  DataDomain,
  ActionPermission
} from '../../care_relationships/index.js';
import {
  ProfessionalMessageThread,
  ProfessionalThreadParticipant,
  ProfessionalMessage,
  ProfessionalMessageAttachment
} from '../domain/entities.js';
import {
  ProfessionalThreadStatus,
  MessageDeliveryStatus,
  ProfessionalThreadType,
  ThreadParticipantType,
  ThreadParticipantStatus,
  ProfessionalMessageType
} from '../domain/types.js';
import { IProfessionalMessagingRepository } from '../repositories/interfaces.js';
import {
  ProfessionalMessagingSafetyPort,
  ProfessionalMessagingNotificationPort,
  MessagingAvailabilityPolicyPort,
  UnconfiguredMessagingSafetyAdapter,
  NoopProfessionalMessagingNotificationAdapter,
  UnknownMessagingAvailabilityAdapter
} from './ports.js';

export interface OpenThreadParams {
  care_relationship_id: string;
  thread_type: ProfessionalThreadType;
  purpose: string;
  created_by: string;
  creator_type: ThreadParticipantType.USER | ThreadParticipantType.PROFESSIONAL;
  professional_id?: string;
  response_expectation_reference?: string;
}

export interface SendMessageParams {
  thread_id: string;
  sender_type: ThreadParticipantType.USER | ThreadParticipantType.PROFESSIONAL;
  sender_id: string;
  message_type: ProfessionalMessageType;
  content_reference: string;
  idempotency_key: string;
  reply_to_message_id?: string;
}

export class ProfessionalMessagingService {
  private static repository: IProfessionalMessagingRepository;
  private static safetyPort: ProfessionalMessagingSafetyPort = new UnconfiguredMessagingSafetyAdapter();
  private static notificationPort: ProfessionalMessagingNotificationPort = new NoopProfessionalMessagingNotificationAdapter();
  private static availabilityPort: MessagingAvailabilityPolicyPort = new UnknownMessagingAvailabilityAdapter();

  public static setRepository(repo: IProfessionalMessagingRepository): void { ProfessionalMessagingService.repository = repo; }
  public static setSafetyPort(port: ProfessionalMessagingSafetyPort): void { ProfessionalMessagingService.safetyPort = port; }
  public static setNotificationPort(port: ProfessionalMessagingNotificationPort): void { ProfessionalMessagingService.notificationPort = port; }
  public static setAvailabilityPolicyPort(port: MessagingAvailabilityPolicyPort): void { ProfessionalMessagingService.availabilityPort = port; }

  private static assertRepository(): void {
    if (!ProfessionalMessagingService.repository) throw new DomainInvariantError('ProfessionalMessagingRepository not initialized.');
  }

  public static async openThread(params: OpenThreadParams): Promise<ProfessionalMessageThread> {
    ProfessionalMessagingService.assertRepository();
    const relationship = await CareRelationshipService.getRelationship(params.care_relationship_id);
    if (!relationship) throw new NotFoundError(`CareRelationship ${params.care_relationship_id} not found.`);
    if (relationship.status !== CareRelationshipState.ACTIVE) {
      throw new DomainInvariantError('Professional messaging requires an active care relationship.');
    }
    if (params.creator_type === ThreadParticipantType.USER && params.created_by !== relationship.subject_user_id) {
      throw new AuthorizationError('User may only open a thread for their own care relationship.', { errorCode: 'AUTHZ_003' });
    }
    const professionalId = params.professional_id || relationship.primary_provider_id;
    if (!professionalId) throw new DomainInvariantError('Professional messaging thread requires an eligible professional participant.');
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId: relationship.id,
      professionalId,
      dataDomain: DataDomain.MESSAGING,
      action: ActionPermission.MESSAGE,
      purpose: 'CARE_COORDINATION'
    });

    const availability = await ProfessionalMessagingService.availabilityPort.getAvailability({
      professional_id: professionalId, at: new Date().toISOString()
    });
    const now = new Date().toISOString();
    const thread: ProfessionalMessageThread = {
      id: generateUUIDv7(), subject_user_id: relationship.subject_user_id,
      care_relationship_id: relationship.id, thread_type: params.thread_type,
      purpose: params.purpose, status: ProfessionalThreadStatus.OPEN,
      created_by: params.created_by, created_at: now,
      response_expectation_reference: params.response_expectation_reference || availability.response_expectation_reference,
      version: 1
    };
    await ProfessionalMessagingService.repository.saveThread(thread);
    await ProfessionalMessagingService.saveParticipant(thread.id, ThreadParticipantType.USER, relationship.subject_user_id, 'SUBJECT', params.created_by);
    await ProfessionalMessagingService.saveParticipant(thread.id, ThreadParticipantType.PROFESSIONAL, professionalId, 'CARE_PROFESSIONAL', params.created_by);

    EventBus.enqueue('care.thread_opened', 'professional_messaging', thread.id, DataClassification.CLINICAL_RECORD, {
      thread_id: thread.id, relationship_id: relationship.id, subject_user_id: relationship.subject_user_id
    });
    return thread;
  }

  private static async saveParticipant(threadId: string, actorType: ThreadParticipantType, actorId: string, role: string, addedBy: string): Promise<ProfessionalThreadParticipant> {
    const existing = await ProfessionalMessagingService.repository.findParticipant(threadId, actorId);
    if (existing?.status === ThreadParticipantStatus.ACTIVE) return existing;
    const p: ProfessionalThreadParticipant = {
      id: existing?.id || generateUUIDv7(), thread_id: threadId, actor_type: actorType, actor_id: actorId,
      participant_role: role, status: ThreadParticipantStatus.ACTIVE, joined_at: new Date().toISOString(),
      access_scope: ['MESSAGE_READ', 'MESSAGE_SEND']
    };
    await ProfessionalMessagingService.repository.saveParticipant(p);
    EventBus.enqueue('care.thread_participant_added', 'professional_messaging', p.id, DataClassification.CLINICAL_RECORD, {
      thread_id: threadId, participant_id: p.id, actor_type: actorType
    });
    AuditService.record({
      actor_type: 'STAFF', actor_id: addedBy, action: 'CARE_MESSAGE_THREAD.PARTICIPANT_ADDED',
      resource_type: 'professional_message_thread', resource_id: threadId, purpose: 'Care Coordination',
      authorization_basis: { threadId }, result: 'ALLOWED', metadata: { participantType: actorType }
    });
    return p;
  }

  public static async addProfessionalParticipant(threadId: string, professionalId: string, addedByProfessionalId: string, role = 'CARE_TEAM'): Promise<ProfessionalThreadParticipant> {
    const thread = await ProfessionalMessagingService.getThread(threadId);
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId: thread.care_relationship_id, professionalId: addedByProfessionalId,
      dataDomain: DataDomain.MESSAGING, action: ActionPermission.MESSAGE, purpose: 'CARE_COORDINATION'
    });
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId: thread.care_relationship_id, professionalId,
      dataDomain: DataDomain.MESSAGING, action: ActionPermission.MESSAGE, purpose: 'CARE_COORDINATION'
    });
    return ProfessionalMessagingService.saveParticipant(threadId, ThreadParticipantType.PROFESSIONAL, professionalId, role, addedByProfessionalId);
  }

  public static async removeParticipant(threadId: string, actorId: string, removedByProfessionalId: string): Promise<void> {
    const thread = await ProfessionalMessagingService.getThread(threadId);
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId: thread.care_relationship_id, professionalId: removedByProfessionalId,
      dataDomain: DataDomain.MESSAGING, action: ActionPermission.MESSAGE, purpose: 'CARE_COORDINATION'
    });
    const p = await ProfessionalMessagingService.repository.findParticipant(threadId, actorId);
    if (!p || p.status !== ThreadParticipantStatus.ACTIVE) return;
    if (p.actor_type === ThreadParticipantType.USER && p.actor_id === thread.subject_user_id) {
      throw new DomainInvariantError('The subject user cannot be removed from their own care thread.');
    }
    p.status = ThreadParticipantStatus.REMOVED; p.left_at = new Date().toISOString();
    await ProfessionalMessagingService.repository.saveParticipant(p);
    EventBus.enqueue('care.thread_participant_removed', 'professional_messaging', p.id, DataClassification.CLINICAL_RECORD, {
      thread_id: threadId, participant_id: p.id
    });
  }

  public static async sendMessage(params: SendMessageParams): Promise<ProfessionalMessage> {
    ProfessionalMessagingService.assertRepository();
    if (!params.idempotency_key) throw new DomainInvariantError('Professional message send requires an idempotency key.');
    const existing = await ProfessionalMessagingService.repository.findMessageByIdempotencyKey(params.thread_id, params.idempotency_key);
    if (existing) return existing;
    const thread = await ProfessionalMessagingService.getThread(params.thread_id);
    if (thread.status !== ProfessionalThreadStatus.OPEN) {
      throw new DomainInvariantError(`Cannot send message to ${thread.status} care thread.`);
    }
    const participant = await ProfessionalMessagingService.repository.findParticipant(thread.id, params.sender_id);
    if (!participant || participant.status !== ThreadParticipantStatus.ACTIVE || participant.actor_type !== params.sender_type) {
      throw new AuthorizationError('Sender is not an active participant in this care thread.', { errorCode: 'AUTHZ_003' });
    }
    if (params.sender_type === ThreadParticipantType.USER) {
      if (params.sender_id !== thread.subject_user_id) {
        throw new AuthorizationError('User may only send within their own care thread.', { errorCode: 'AUTHZ_003' });
      }
    } else {
      await RelationshipAccessEvaluator.assertAccess({
        relationshipId: thread.care_relationship_id, professionalId: params.sender_id,
        dataDomain: DataDomain.MESSAGING, action: ActionPermission.MESSAGE, purpose: 'CARE_COORDINATION'
      });
    }
    if (!params.content_reference) throw new DomainInvariantError('Message requires a protected content reference; raw content is not stored in the thread metadata record.');

    const messageId = generateUUIDv7();
    const safety = await ProfessionalMessagingService.safetyPort.evaluateCandidate({
      subject_user_id: thread.subject_user_id, thread_id: thread.id, message_id: messageId,
      sender_type: params.sender_type, content_reference: params.content_reference
    });
    const message: ProfessionalMessage = {
      id: messageId, thread_id: thread.id, sender_type: params.sender_type, sender_id: params.sender_id,
      message_type: params.message_type, content_reference: params.content_reference,
      status: MessageDeliveryStatus.SENT, sent_at: new Date().toISOString(), reply_to_message_id: params.reply_to_message_id,
      clinical_significance: safety.candidate_signal ? 'REVIEW_REQUIRED' : 'ROUTINE',
      safety_monitoring_status: !safety.configured ? 'NOT_CONFIGURED' : safety.candidate_signal ? 'CANDIDATE_SIGNAL_FORWARDED' : 'EVALUATED_NO_SIGNAL',
      safety_reference: safety.safety_reference, idempotency_key: params.idempotency_key
    };
    await ProfessionalMessagingService.repository.saveMessage(message);
    EventBus.enqueue('care.message_sent', 'professional_messaging', message.id, DataClassification.CLINICAL_RECORD, {
      message_id: message.id, thread_id: thread.id, sender_type: message.sender_type,
      safety_monitoring_status: message.safety_monitoring_status
    });
    if (safety.candidate_signal) {
      EventBus.enqueue('care.message_safety_escalated', 'professional_messaging', message.id, DataClassification.CLINICAL_RECORD, {
        message_id: message.id, thread_id: thread.id, safety_reference: safety.safety_reference
      });
    }
    const recipients = (await ProfessionalMessagingService.repository.findParticipants(thread.id))
      .filter(p => p.status === ThreadParticipantStatus.ACTIVE && p.actor_id !== params.sender_id)
      .map(p => ({ actor_type: p.actor_type, actor_id: p.actor_id }));
    await ProfessionalMessagingService.notificationPort.notifyNewMessage({
      thread_id: thread.id,
      message_id: message.id,
      recipients
    });
    return message;
  }

  public static async markDelivered(messageId: string): Promise<ProfessionalMessage> {
    const message = await ProfessionalMessagingService.getMessage(messageId);
    if (message.status === MessageDeliveryStatus.SENT) {
      validateStateTransition('MessageDeliveryStatus', message.status, MessageDeliveryStatus.DELIVERED, message.id, 'system');
      message.status = MessageDeliveryStatus.DELIVERED; message.delivered_at = new Date().toISOString();
      await ProfessionalMessagingService.repository.saveMessage(message);
      EventBus.enqueue('care.message_delivered', 'professional_messaging', message.id, DataClassification.CLINICAL_RECORD, { message_id: message.id, thread_id: message.thread_id });
    }
    return message;
  }

  public static async markRead(messageId: string, actorId: string): Promise<ProfessionalMessage> {
    const message = await ProfessionalMessagingService.getMessage(messageId);
    const participant = await ProfessionalMessagingService.repository.findParticipant(message.thread_id, actorId);
    if (!participant || participant.status !== ThreadParticipantStatus.ACTIVE) throw new AuthorizationError('Only an active thread participant may mark a message read.', { errorCode: 'AUTHZ_003' });
    if (message.status !== MessageDeliveryStatus.READ) {
      validateStateTransition('MessageDeliveryStatus', message.status, MessageDeliveryStatus.READ, message.id, actorId);
      message.status = MessageDeliveryStatus.READ; message.read_at = new Date().toISOString();
      await ProfessionalMessagingService.repository.saveMessage(message);
    }
    return message;
  }

  public static async addAttachment(params: { thread_id: string; message_id: string; actor_id: string; evidence_reference: string; mime_type: string; size_bytes: number; scan_status: ProfessionalMessageAttachment['scan_status']; data_classification: string; }): Promise<ProfessionalMessageAttachment> {
    const thread = await ProfessionalMessagingService.getThread(params.thread_id);
    const message = await ProfessionalMessagingService.getMessage(params.message_id);
    if (message.thread_id !== thread.id) throw new DomainInvariantError('Attachment message/thread mismatch.');
    const participant = await ProfessionalMessagingService.repository.findParticipant(thread.id, params.actor_id);
    if (!participant || participant.status !== ThreadParticipantStatus.ACTIVE) throw new AuthorizationError('Only an active participant may attach files.', { errorCode: 'AUTHZ_003' });
    if (params.scan_status !== 'CLEAN') throw new DomainInvariantError('Only malware-scanned CLEAN attachments may be linked to a care message.');+    const a: ProfessionalMessageAttachment = { id: generateUUIDv7(), thread_id: thread.id, message_id: message.id, evidence_reference: params.evidence_reference, mime_type: params.mime_type, size_bytes: params.size_bytes, scan_status: params.scan_status, data_classification: params.data_classification, created_at: new Date().toISOString() };
    await ProfessionalMessagingService.repository.saveAttachment(a); return a;
  }

  public static async closeThread(threadId: string, actorProfessionalId: string): Promise<ProfessionalMessageThread> {
    const thread = await ProfessionalMessagingService.getThread(threadId);
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId: thread.care_relationship_id, professionalId: actorProfessionalId,
      dataDomain: DataDomain.MESSAGING, action: ActionPermission.MESSAGE, purpose: 'CARE_COORDINATION'
    });
    if (thread.status === ProfessionalThreadStatus.CLOSED || thread.status === ProfessionalThreadStatus.ARCHIVED) return thread;
    validateStateTransition('ProfessionalThreadStatus', thread.status, ProfessionalThreadStatus.CLOSED, thread.id, actorProfessionalId);
    thread.status = ProfessionalThreadStatus.CLOSED; thread.closed_at = new Date().toISOString(); thread.version += 1;
    await ProfessionalMessagingService.repository.saveThread(thread);
    EventBus.enqueue('care.thread_closed', 'professional_messaging', thread.id, DataClassification.CLINICAL_RECORD, { thread_id: thread.id, relationship_id: thread.care_relationship_id });
    return thread;
  }

  public static async reconcileRelationship(relationshipId: string): Promise<string[]> {
    const relationship = await CareRelationshipService.getRelationship(relationshipId);
    if (!relationship) return [];
    if (![CareRelationshipState.TERMINATED, CareRelationshipState.REVOKED].includes(relationship.status)) return [];
    const closed: string[] = [];
    for (const thread of await ProfessionalMessagingService.repository.findThreadsByRelationshipId(relationshipId)) {
      if (thread.status === ProfessionalThreadStatus.OPEN || thread.status === ProfessionalThreadStatus.PAUSED) {
        // Reconciliation is system-governed; preserve history but prevent new messages immediately.
        thread.status = ProfessionalThreadStatus.CLOSED; thread.closed_at = new Date().toISOString(); thread.version += 1;
        await ProfessionalMessagingService.repository.saveThread(thread); closed.push(thread.id);
        EventBus.enqueue('care.thread_closed', 'professional_messaging', thread.id, DataClassification.CLINICAL_RECORD, { thread_id: thread.id, relationship_id: relationshipId, reason: 'RELATIONSHIP_ENDED' });
      }
    }
    return closed;
  }

  public static async getThread(threadId: string): Promise<ProfessionalMessageThread> {
    ProfessionalMessagingService.assertRepository();
    const t = await ProfessionalMessagingService.repository.findThreadById(threadId);
    if (!t) throw new NotFoundError(`ProfessionalMessageThread ${threadId} not found.`);
    return t;
  }
  public static async getThreadForActor(threadId: string, actorId: string): Promise<ProfessionalMessageThread> {
    const thread = await ProfessionalMessagingService.getThread(threadId);
    const participant = await ProfessionalMessagingService.repository.findParticipant(thread.id, actorId);
    if (!participant || participant.status !== ThreadParticipantStatus.ACTIVE) {
      throw new AuthorizationError('Only active thread participants may access this care thread.', { errorCode: 'AUTHZ_003' });
    }
    if (participant.actor_type === ThreadParticipantType.USER) {
      if (thread.subject_user_id !== actorId) {
        throw new AuthorizationError('User may only access their own care thread.', { errorCode: 'AUTHZ_003' });
      }
    } else if (participant.actor_type === ThreadParticipantType.PROFESSIONAL) {
      await RelationshipAccessEvaluator.assertAccess({
        relationshipId: thread.care_relationship_id,
        professionalId: actorId,
        dataDomain: DataDomain.MESSAGING,
        action: ActionPermission.READ,
        purpose: 'CARE_COORDINATION'
      });
    }
    return thread;
  }

  public static async listThreadsForRelationship(
    relationshipId: string,
    actorId: string
  ): Promise<ProfessionalMessageThread[]> {
    ProfessionalMessagingService.assertRepository();
    const threads = await ProfessionalMessagingService.repository.findThreadsByRelationshipId(relationshipId);
    const visible: ProfessionalMessageThread[] = [];
    for (const thread of threads) {
      try {
        await ProfessionalMessagingService.getThreadForActor(thread.id, actorId);
        visible.push(thread);
      } catch (err) {
        if (err instanceof AuthorizationError) continue;
        throw err;
      }
    }
    return visible;
  }

  public static async getMessage(messageId: string): Promise<ProfessionalMessage> {
    ProfessionalMessagingService.assertRepository();
    const m = await ProfessionalMessagingService.repository.findMessageById(messageId);
    if (!m) throw new NotFoundError(`ProfessionalMessage ${messageId} not found.`);
    return m;
  }
  public static async listMessages(threadId: string, actorId: string): Promise<ProfessionalMessage[]> {
    const thread = await ProfessionalMessagingService.getThread(threadId);
    const p = await ProfessionalMessagingService.repository.findParticipant(thread.id, actorId);
    if (!p || p.status !== ThreadParticipantStatus.ACTIVE) throw new AuthorizationError('Only active thread participants may read messages.', { errorCode: 'AUTHZ_003' });
    if (p.actor_type === ThreadParticipantType.PROFESSIONAL) {
      await RelationshipAccessEvaluator.assertAccess({ relationshipId: thread.care_relationship_id, professionalId: actorId, dataDomain: DataDomain.MESSAGING, action: ActionPermission.READ, purpose: 'CARE_COORDINATION' });
    }
    return ProfessionalMessagingService.repository.findMessages(thread.id);
  }
}