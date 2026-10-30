/**
 * MindOS Canonical Consumer Idempotency Registry
 * Authority: Master Architecture Index Section 12, Volume IX & Appendix E & ADR-021
 */

import { DatabaseClient, DatabaseManager } from '../../database/connection.js';
import { DomainEventEnvelope, ProcessedEventRecord } from '../types.js';
import { UUIDv7 } from '../../database/uuid.js';

export class ProcessedEventsRepository {
  private client: DatabaseClient;

  constructor(client?: DatabaseClient) {
    this.client = client || DatabaseManager.getClient();
  }

  /**
   * Checks if an event has already been processed by a designated consumer
   */
  public async isProcessed(consumerId: string, eventId: string): Promise<boolean> {
    const rows = await this.client.query<ProcessedEventRecord>(
      `SELECT * FROM processed_events WHERE consumer_id = $1 AND event_id = $2`,
      [consumerId, eventId]
    );
    return rows.length > 0 && rows[0].result === 'SUCCESS';
  }

  /**
   * Records that an event has been processed by a consumer
   */
  public async recordProcessed(
    consumerId: string,
    eventId: string,
    eventType: string,
    result: 'SUCCESS' | 'FAILED' | 'SKIPPED' = 'SUCCESS',
    errorDetails?: string
  ): Promise<void> {
    const id = UUIDv7.generate();
    const now = new Date().toISOString();

    await this.client.query(
      `INSERT INTO processed_events (
        id, consumer_id, event_id, event_type, processed_at, result, error_details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, consumerId, eventId, eventType, now, result, errorDetails || null]
    );
  }

  public async markProcessed(
    consumerId: string,
    eventId: string,
    eventType: string,
    resultOrDetails?: any
  ): Promise<void> {
    const result = typeof resultOrDetails === 'string' && ['SUCCESS', 'FAILED', 'SKIPPED'].includes(resultOrDetails)
      ? (resultOrDetails as 'SUCCESS' | 'FAILED' | 'SKIPPED')
      : 'SUCCESS';
    const details = typeof resultOrDetails === 'object'
      ? JSON.stringify(resultOrDetails)
      : (typeof resultOrDetails === 'string' && result !== resultOrDetails ? resultOrDetails : undefined);
    return this.recordProcessed(consumerId, eventId, eventType, result, details);
  }

  /**
   * Executes a business action wrapped in idempotency check and recording.
   * If already processed, skips execution and returns { executed: false }.
   */
  public async executeIdempotent<T>(
    consumerId: string,
    event: DomainEventEnvelope,
    action: () => Promise<T>
  ): Promise<{ executed: boolean; result?: T }> {
    const alreadyDone = await this.isProcessed(consumerId, event.event_id);
    if (alreadyDone) {
      return { executed: false };
    }

    try {
      const result = await action();
      await this.recordProcessed(consumerId, event.event_id, event.event_type, 'SUCCESS');
      return { executed: true, result };
    } catch (err: any) {
      // Record failure or let caller handle retry
      await this.recordProcessed(consumerId, event.event_id, event.event_type, 'FAILED', err.message);
      throw err;
    }
  }

  /**
   * Returns all processed event records for inspection
   */
  public async getHistory(consumerId?: string): Promise<ProcessedEventRecord[]> {
    if (consumerId) {
      return this.client.query<ProcessedEventRecord>(
        `SELECT * FROM processed_events WHERE consumer_id = $1 ORDER BY processed_at DESC`,
        [consumerId]
      );
    }
    return this.client.query<ProcessedEventRecord>(
      `SELECT * FROM processed_events ORDER BY processed_at DESC`
    );
  }

  public async clearForTesting(): Promise<void> {
    await this.client.query(`DELETE FROM processed_events WHERE id IS NOT NULL`);
  }
}
