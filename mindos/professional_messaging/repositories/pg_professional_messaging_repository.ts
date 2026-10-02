import { getPool } from '../../platform/database/index.js';
import { IProfessionalMessagingRepository } from './interfaces.js';
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
  ProfessionalMessageType,
  SafetyMonitoringStatus
} from '../domain/types.js';

type ThreadRow = {
  id: string;
  subject_user_id: string;
  care_relationship_id: string;
  thread_type: string;
  purpose: string;
  status: string;
  created_by: string;
  created_at: string;
  closed_at: string | null;
  response_expectation_reference: string;
  version: number;
};

type ParticipantRow = {
  id: string;
  thread_id: string;
  actor_type: string;
  actor_id: string;
  participant_role: string;
  status: string;
  joined_at: string;
  left_at: string | null;
  access_scope: unknown;
};

type MessageRow = {
  id: string;
  thread_id: string;
  sender_type: string;
  sender_id: string;
  message_type: string;
  content_reference: string;
  status: string;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  reply_to_message_id: string | null;
  clinical_significance: 'ROUTINE' | 'REVIEW_REQUIRED';
  safety_monitoring_status: SafetyMonitoringStatus;
  safety_reference: string | null;
  idempotency_key: string;
};

type AttachmentRow = {
  id: string;
  thread_id: string;
  message_id: string;
  evidence_reference: string;
  mime_type: string;
  size_bytes: number | string;
  scan_status: 'PENDING' | 'CLEAN' | 'QUARANTINED' | 'REJECTED';
  data_classification: string;
  created_at: string;
};

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

const toThread = (row: ThreadRow): ProfessionalMessageThread => ({
  id: row.id,
  subject_user_id: row.subject_user_id,
  care_relationship_id: row.care_relationship_id,
  thread_type: row.thread_type as ProfessionalThreadType,
  purpose: row.purpose,
  status: row.status as ProfessionalThreadStatus,
  created_by: row.created_by,
  created_at: row.created_at,
  closed_at: row.closed_at || undefined,
  response_expectation_reference: row.response_expectation_reference,
  version: Number(row.version)
});

const toParticipant = (row: ParticipantRow): ProfessionalThreadParticipant => ({
  id: row.id,
  thread_id: row.thread_id,
  actor_type: row.actor_type as ThreadParticipantType,
  actor_id: row.actor_id,
  participant_role: row.participant_role,
  status: row.status as ThreadParticipantStatus,
  joined_at: row.joined_at,
  left_at: row.left_at || undefined,
  access_scope: parseStringArray(row.access_scope)
});

const toMessage = (row: MessageRow): ProfessionalMessage => ({
  id: row.id,
  thread_id: row.thread_id,
  sender_type: row.sender_type as ThreadParticipantType,
  sender_id: row.sender_id,
  message_type: row.message_type as ProfessionalMessageType,
  content_reference: row.content_reference,
  status: row.status as MessageDeliveryStatus,
  sent_at: row.sent_at,
  delivered_at: row.delivered_at || undefined,
  read_at: row.read_at || undefined,
  reply_to_message_id: row.reply_to_message_id || undefined,
  clinical_significance: row.clinical_significance,
  safety_monitoring_status: row.safety_monitoring_status,
  safety_reference: row.safety_reference || undefined,
  idempotency_key: row.idempotency_key
});

const toAttachment = (row: AttachmentRow): ProfessionalMessageAttachment => ({
  id: row.id,
  thread_id: row.thread_id,
  message_id: row.message_id,
  evidence_reference: row.evidence_reference,
  mime_type: row.mime_type,
  size_bytes: Number(row.size_bytes),
  scan_status: row.scan_status,
  data_classification: row.data_classification,
  created_at: row.created_at
});

export class PgProfessionalMessagingRepository implements IProfessionalMessagingRepository {
  public async saveThread(thread: ProfessionalMessageThread): Promise<void> {
    await getPool().query(
      'INSERT INTO professional_message_threads (id, subject_user_id, care_relationship_id, thread_type, purpose, status, created_by, created_at, closed_at, response_expectation_reference, version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, closed_at=EXCLUDED.closed_at, response_expectation_reference=EXCLUDED.response_expectation_reference, version=EXCLUDED.version',
      [
        thread.id, thread.subject_user_id, thread.care_relationship_id, thread.thread_type,
        thread.purpose, thread.status, thread.created_by, thread.created_at,
        thread.closed_at || null, thread.response_expectation_reference, thread.version
      ]
    );
  }

  public async findThreadById(id: string): Promise<ProfessionalMessageThread | null> {
    const res = await getPool().query<ThreadRow>('SELECT * FROM professional_message_threads WHERE id = $1', [id]);
    return res.rows[0] ? toThread(res.rows[0]) : null;
  }

  public async findThreadsByRelationshipId(relationshipId: string): Promise<ProfessionalMessageThread[]> {
    const res = await getPool().query<ThreadRow>(
      'SELECT * FROM professional_message_threads WHERE care_relationship_id = $1 ORDER BY created_at ASC, id ASC',
      [relationshipId]
    );
    return res.rows.map(toThread);
  }

  public async saveParticipant(participant: ProfessionalThreadParticipant): Promise<void> {
    await getPool().query(
      'INSERT INTO professional_thread_participants (id, thread_id, actor_type, actor_id, participant_role, status, joined_at, left_at, access_scope) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (thread_id, actor_id) DO UPDATE SET actor_type=EXCLUDED.actor_type, participant_role=EXCLUDED.participant_role, status=EXCLUDED.status, joined_at=EXCLUDED.joined_at, left_at=EXCLUDED.left_at, access_scope=EXCLUDED.access_scope',
      [
        participant.id, participant.thread_id, participant.actor_type, participant.actor_id,
        participant.participant_role, participant.status, participant.joined_at,
        participant.left_at || null, JSON.stringify(participant.access_scope || [])
      ]
    );
  }

  public async findParticipant(threadId: string, actorId: string): Promise<ProfessionalThreadParticipant | null> {
    const res = await getPool().query<ParticipantRow>(
      'SELECT * FROM professional_thread_participants WHERE thread_id = $1 AND actor_id = $2',
      [threadId, actorId]
    );
    return res.rows[0] ? toParticipant(res.rows[0]) : null;
  }

  public async findParticipants(threadId: string): Promise<ProfessionalThreadParticipant[]> {
    const res = await getPool().query<ParticipantRow>(
      'SELECT * FROM professional_thread_participants WHERE thread_id = $1 ORDER BY joined_at ASC, id ASC',
      [threadId]
    );
    return res.rows.map(toParticipant);
  }

  public async saveMessage(message: ProfessionalMessage): Promise<void> {
    await getPool().query(
      'INSERT INTO professional_messages (id, thread_id, sender_type, sender_id, message_type, content_reference, status, sent_at, delivered_at, read_at, reply_to_message_id, clinical_significance, safety_monitoring_status, safety_reference, idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, delivered_at=EXCLUDED.delivered_at, read_at=EXCLUDED.read_at, clinical_significance=EXCLUDED.clinical_significance, safety_monitoring_status=EXCLUDED.safety_monitoring_status, safety_reference=EXCLUDED.safety_reference',
      [
        message.id, message.thread_id, message.sender_type, message.sender_id, message.message_type,
        message.content_reference, message.status, message.sent_at, message.delivered_at || null,
        message.read_at || null, message.reply_to_message_id || null, message.clinical_significance,
        message.safety_monitoring_status, message.safety_reference || null, message.idempotency_key
      ]
    );
  }

  public async findMessageById(id: string): Promise<ProfessionalMessage | null> {
    const res = await getPool().query<MessageRow>('SELECT * FROM professional_messages WHERE id = $1', [id]);
    return res.rows[0] ? toMessage(res.rows[0]) : null;
  }

  public async findMessageByIdempotencyKey(threadId: string, idempotencyKey: string): Promise<ProfessionalMessage | null> {
    const res = await getPool().query<MessageRow>(
      'SELECT * FROM professional_messages WHERE thread_id = $1 AND idempotency_key = $2',
      [threadId, idempotencyKey]
    );
    return res.rows[0] ? toMessage(res.rows[0]) : null;
  }

  public async findMessages(threadId: string): Promise<ProfessionalMessage[]> {
    const res = await getPool().query<MessageRow>(
      'SELECT * FROM professional_messages WHERE thread_id = $1 ORDER BY sent_at ASC, id ASC',
      [threadId]
    );
    return res.rows.map(toMessage);
  }

  public async saveAttachment(attachment: ProfessionalMessageAttachment): Promise<void> {
    await getPool().query(
      'INSERT INTO professional_message_attachments (id, thread_id, message_id, evidence_reference, mime_type, size_bytes, scan_status, data_classification, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO UPDATE SET scan_status=EXCLUDED.scan_status, data_classification=EXCLUDED.data_classification',
      [
        attachment.id, attachment.thread_id, attachment.message_id, attachment.evidence_reference,
        attachment.mime_type, attachment.size_bytes, attachment.scan_status,
        attachment.data_classification, attachment.created_at
      ]
    );
  }

  public async findAttachments(messageId: string): Promise<ProfessionalMessageAttachment[]> {
    const res = await getPool().query<AttachmentRow>(
      'SELECT * FROM professional_message_attachments WHERE message_id = $1 ORDER BY created_at ASC, id ASC',
      [messageId]
    );
    return res.rows.map(toAttachment);
  }

  public async clear(): Promise<void> {
    const pool = getPool();
    await pool.query('DELETE FROM professional_message_attachments');
    await pool.query('DELETE FROM professional_messages');
    await pool.query('DELETE FROM professional_thread_participants');
    await pool.query('DELETE FROM professional_message_threads');
  }
}
