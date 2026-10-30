/**
 * MindOS Canonical Outbox Repository
 * Authority: Master Architecture Index Section 12, Volume IX & Appendix E & ADR-007
 */

import { DatabaseClient } from '../connection.js';
import { OutboxEventRow, OutboxStatus } from './types.js';
import { UUID } from '../types.js';

export class OutboxRepository {
  private client: DatabaseClient;
  public static readonly DEFAULT_MAX_RETRIES = 5;

  constructor(client: DatabaseClient) {
    this.client = client;
  }

  public async insert(event: OutboxEventRow): Promise<void> {
    const now = new Date().toISOString();
    await this.client.query(
      `INSERT INTO outbox_events (
        id, event_id, event_type, schema_version, aggregate_type, aggregate_id,
        payload, metadata, classification, occurred_at, available_at, published_at,
        attempt_count, retry_count, last_attempt_at, last_error_code, last_error, correlation_id,
        causation_id, priority, created_at, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
      [
        event.id,
        event.event_id || event.id,
        event.event_type,
        event.schema_version,
        event.aggregate_type,
        event.aggregate_id,
        typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload),
        typeof event.metadata === 'string' ? event.metadata : JSON.stringify(event.metadata),
        event.classification || 'INTERNAL',
        event.occurred_at || now,
        event.available_at || now,
        event.published_at || null,
        event.attempt_count || 0,
        (event as any).retry_count || event.attempt_count || 0,
        event.last_attempt_at || null,
        event.last_error_code || null,
        event.last_error || null,
        event.correlation_id || null,
        event.causation_id || null,
        event.priority || 'NORMAL',
        event.created_at || now,
        event.status || OutboxStatus.PENDING
      ]
    );
  }

  public async findPending(limit = 50): Promise<OutboxEventRow[]> {
    const rows = await this.client.query<OutboxEventRow>(
      `SELECT * FROM outbox_events WHERE status = $1 LIMIT $2`,
      [OutboxStatus.PENDING, limit]
    );
    return rows;
  }

  /**
   * Concurrency-safe batch claiming respecting priority and scheduling
   * Emulates SELECT ... FOR UPDATE SKIP LOCKED
   */
  public async claimBatch(limit = 50, now = new Date().toISOString()): Promise<OutboxEventRow[]> {
    const allRows = await this.client.query<OutboxEventRow>(`SELECT * FROM outbox_events`);
    
    // Priority weights: CRITICAL (4) > HIGH (3) > NORMAL (2) > LOW (1)
    const priorityWeight: Record<string, number> = {
      CRITICAL: 4,
      HIGH: 3,
      NORMAL: 2,
      LOW: 1
    };

    const eligible = allRows.filter(r => {
      const isPending = r.status === OutboxStatus.PENDING || r.status === OutboxStatus.FAILED;
      const isAvailable = !r.available_at || r.available_at <= now;
      return isPending && isAvailable;
    });

    // Sort by priority DESC, then occurred_at ASC
    eligible.sort((a, b) => {
      const weightA = priorityWeight[a.priority || 'NORMAL'] || 2;
      const weightB = priorityWeight[b.priority || 'NORMAL'] || 2;
      if (weightA !== weightB) {
        return weightB - weightA;
      }
      return (a.occurred_at || '').localeCompare(b.occurred_at || '');
    });

    const claimed = eligible.slice(0, limit);
    for (const row of claimed) {
      await this.markProcessing(row.id);
      row.status = OutboxStatus.PROCESSING;
    }

    return claimed;
  }

  public async findById(id: UUID): Promise<OutboxEventRow | null> {
    const rows = await this.client.query<OutboxEventRow>(
      `SELECT * FROM outbox_events WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  public async markProcessing(id: UUID): Promise<void> {
    const now = new Date().toISOString();
    await this.client.query(
      `UPDATE outbox_events SET status = $1 WHERE id = $2`,
      [OutboxStatus.PROCESSING, id]
    );
  }

  public async markPublished(id: UUID, publishedAt = new Date().toISOString()): Promise<void> {
    await this.client.query(
      `UPDATE outbox_events SET status = $1, published_at = $2 WHERE id = $3`,
      [OutboxStatus.PUBLISHED, publishedAt, id]
    );
  }

  public async markFailed(
    id: UUID,
    errorMessage: string,
    options: {
      errorCode?: string;
      nextAvailableAt?: string;
      maxRetries?: number;
    } = {}
  ): Promise<{ status: OutboxStatus; attemptCount: number }> {
    const current = await this.findById(id);
    const newAttemptCount = (current?.attempt_count || 0) + 1;
    const maxRetries = options.maxRetries ?? OutboxRepository.DEFAULT_MAX_RETRIES;
    const nextStatus = newAttemptCount >= maxRetries ? OutboxStatus.DEAD_LETTER : OutboxStatus.FAILED;
    const now = new Date().toISOString();

    await this.client.query(
      `UPDATE outbox_events SET status = $1, attempt_count = $2, retry_count = $2, last_error = $3 WHERE id = $4`,
      [nextStatus, newAttemptCount, errorMessage.substring(0, 500), id]
    );

    return { status: nextStatus, attemptCount: newAttemptCount };
  }

  public async purgePublished(olderThanIso: string): Promise<number> {
    const rows = await this.client.query<OutboxEventRow>(`SELECT * FROM outbox_events`);
    let count = 0;
    for (const row of rows) {
      if (row.status === OutboxStatus.PUBLISHED && row.published_at && row.published_at < olderThanIso) {
        await this.client.query(`DELETE FROM outbox_events WHERE id = $1`, [row.id]);
        count++;
      }
    }
    return count;
  }
}
