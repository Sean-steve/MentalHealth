/**
 * MindOS Dead-Letter Quarantine Repository
 * Authority: Master Architecture Index Section 12, Volume IX & Appendix E & ADR-021
 */

import { DatabaseClient, DatabaseManager } from '../../database/connection.js';
import { DeadLetterRecord, DeadLetterResolutionAction } from '../types.js';
import { UUID } from '../../database/types.js';
import { UUIDv7 } from '../../database/uuid.js';

export class DeadLetterRepository {
  private client: DatabaseClient;

  constructor(client?: DatabaseClient) {
    this.client = client || DatabaseManager.getClient();
  }

  public async insert(record: Omit<DeadLetterRecord, 'id' | 'dead_lettered_at'>): Promise<DeadLetterRecord> {
    const id = UUIDv7.generate();
    const now = new Date().toISOString();

    const fullRecord: DeadLetterRecord = {
      id,
      dead_lettered_at: now,
      retry_count: (record as any).retry_count ?? record.attempts,
      ...record
    };

    await this.client.query(
      `INSERT INTO dead_letter_events (
        id, event_id, event_type, consumer_id, attempts, retry_count, failure_code,
        error_message, dead_lettered_at, resolved_at, resolution_action,
        resolution_reason, resolved_by, payload_summary, correlation_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        fullRecord.id,
        fullRecord.event_id,
        fullRecord.event_type,
        fullRecord.consumer_id,
        fullRecord.attempts,
        fullRecord.retry_count,
        fullRecord.failure_code,
        fullRecord.error_message || null,
        fullRecord.dead_lettered_at,
        fullRecord.resolved_at || null,
        fullRecord.resolution_action || null,
        fullRecord.resolution_reason || null,
        fullRecord.resolved_by || null,
        fullRecord.payload_summary ? JSON.stringify(fullRecord.payload_summary) : null,
        fullRecord.correlation_id || null
      ]
    );

    return fullRecord;
  }

  public async findById(id: UUID): Promise<DeadLetterRecord | null> {
    const rows = await this.client.query<DeadLetterRecord>(
      `SELECT * FROM dead_letter_events WHERE id = $1`,
      [id]
    );
    if (!rows[0]) return null;
    return {
      ...rows[0],
      retry_count: rows[0].attempts ?? (rows[0] as any).retry_count ?? 0
    };
  }

  public async findByEventId(eventId: UUID): Promise<DeadLetterRecord[]> {
    const rows = await this.client.query<DeadLetterRecord>(
      `SELECT * FROM dead_letter_events WHERE event_id = $1`,
      [eventId]
    );
    return rows.map(r => ({ ...r, retry_count: r.attempts ?? (r as any).retry_count ?? 0 }));
  }

  public async findByConsumerAndEvent(consumerId: string, eventId: UUID): Promise<DeadLetterRecord | null> {
    const rows = await this.client.query<DeadLetterRecord>(
      `SELECT * FROM dead_letter_events WHERE consumer_id = $1 AND event_id = $2`,
      [consumerId, eventId]
    );
    if (!rows[0]) return null;
    return {
      ...rows[0],
      retry_count: rows[0].attempts ?? (rows[0] as any).retry_count ?? 0
    };
  }

  public async quarantine(params: {
    consumerId: string;
    envelope: any;
    errorMessage: string;
    retryCount: number;
    failureCode?: string;
  }): Promise<DeadLetterRecord> {
    return this.insert({
      event_id: params.envelope.event_id,
      event_type: params.envelope.event_type,
      consumer_id: params.consumerId,
      attempts: params.retryCount,
      failure_code: params.failureCode || 'EXECUTION_FAILURE',
      error_message: params.errorMessage,
      payload_summary: params.envelope.payload,
      correlation_id: params.envelope.correlation_id
    });
  }

  public async listAll(unresolvedOnly = false): Promise<DeadLetterRecord[]> {
    const rows = await this.client.query<DeadLetterRecord>(
      `SELECT * FROM dead_letter_events ORDER BY dead_lettered_at DESC`
    );
    if (unresolvedOnly) {
      return rows.filter(r => !r.resolved_at);
    }
    return rows;
  }

  public async markResolved(
    id: UUID,
    action: DeadLetterResolutionAction,
    reason: string,
    resolvedBy?: UUID
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.client.query(
      `UPDATE dead_letter_events SET resolved_at = $1, resolution_action = $2, resolution_reason = $3, resolved_by = $4 WHERE id = $5`,
      [now, action, reason, resolvedBy || null, id]
    );
  }

  public async clearForTesting(): Promise<void> {
    await this.client.query(`DELETE FROM dead_letter_events WHERE id IS NOT NULL`);
  }
}
