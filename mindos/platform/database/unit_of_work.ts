/**
 * MindOS Unit of Work & Transaction Boundaries
 * Authority: Master Architecture Index Section 8, Volume III & ADR-007
 * 
 * Rules:
 * - Application services own transactions; HTTP controllers do not scatter transactions.
 * - Outbox events are registered directly onto the Unit of Work and committed atomically with domain mutations.
 * - Prohibits external network calls (AI inference, SMS/email, payment gateways) during open transactions.
 */

import { DatabaseClient, DatabaseManager } from './connection.js';
import { DomainInvariantError, InfrastructureError } from '../errors/index.js';
import { logger } from '../observability/logger.js';
import { UUID, UtcIsoTimestamp } from './types.js';
import { DataClassification } from '../shared/data_classification.js';
import { generateUUIDv7 } from './uuid.js';

export interface OutboxEventEntry {
  id: UUID;
  event_type: string;
  schema_version: number;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  metadata: {
    correlation_id: string;
    causation_id?: string;
    data_classification: DataClassification;
    producer_domain: string;
  };
  occurred_at: UtcIsoTimestamp;
}

export interface IUnitOfWork {
  getClient(): DatabaseClient;
  registerOutboxEvent(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
    metadata: {
      correlation_id: string;
      causation_id?: string;
      data_classification: DataClassification;
      producer_domain: string;
      schema_version?: number;
    }
  ): OutboxEventEntry;
  assertNotInTransaction(actionName: string): void;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  execute?<T>(
    workFn: (tx: DatabaseClient) => Promise<T>,
    isolationLevel?: 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE'
  ): Promise<T>;
}

export class UnitOfWork implements IUnitOfWork {
  private client: DatabaseClient;
  private pendingOutboxEvents: OutboxEventEntry[] = [];
  private committed = false;
  private rolledBack = false;

  constructor(client: DatabaseClient) {
    this.client = client;
  }

  public async execute<T>(
    workFn: (tx: DatabaseClient) => Promise<T>,
    isolationLevel: 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE' = 'READ_COMMITTED'
  ): Promise<T> {
    return await this.client.transaction(async (txClient) => {
      const result = await workFn(txClient);
      await this.flushOutbox();
      this.committed = true;
      return result;
    }, isolationLevel);
  }

  public static async run<T>(
    workFn: (uow: UnitOfWork) => Promise<T>,
    isolationLevel: 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE' = 'READ_COMMITTED'
  ): Promise<T> {
    const client = DatabaseManager.getClient();

    return await client.transaction(async (txClient) => {
      const uow = new UnitOfWork(txClient);
      try {
        const result = await workFn(uow);
        await uow.flushOutbox();
        uow.committed = true;
        return result;
      } catch (err) {
        await uow.rollback();
        throw err;
      }
    }, isolationLevel);
  }

  public getClient(): DatabaseClient {
    return this.client;
  }

  /**
   * Registers an outbox event to be atomically committed with domain state mutations
   */
  public registerOutboxEvent(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
    metadata: {
      correlation_id: string;
      causation_id?: string;
      data_classification: DataClassification;
      producer_domain: string;
      schema_version?: number;
    }
  ): OutboxEventEntry {
    // Invariant: Prohibit raw clinical narratives and plain text journals from event payloads
    const forbiddenPayloadKeys = [
      'journal_text',
      'ciphertext',
      'content_ciphertext',
      'raw_answers',
      'notes_text',
      'clinical_note',
      'clinical_notes',
      'diagnosis'
    ];

    for (const key of Object.keys(payload)) {
      if (forbiddenPayloadKeys.includes(key)) {
        throw new DomainInvariantError(
          `EVENT_PAYLOAD_SECURITY_VIOLATION: Sensitive key '${key}' cannot be written into outbox payloads.`
        );
      }
    }

    const entry: OutboxEventEntry = {
      id: generateUUIDv7(),
      event_type: eventType,
      schema_version: metadata.schema_version || 1,
      aggregate_type: aggregateType,
      aggregate_id: aggregateId,
      payload,
      metadata: {
        correlation_id: metadata.correlation_id,
        causation_id: metadata.causation_id,
        data_classification: metadata.data_classification,
        producer_domain: metadata.producer_domain
      },
      occurred_at: new Date().toISOString()
    };

    this.pendingOutboxEvents.push(entry);
    return entry;
  }

  /**
   * Guards against external network side effects during open transactions (Section 44 & 45)
   */
  public assertNotInTransaction(actionName: string): void {
    if (this.client.isInTransaction()) {
      throw new DomainInvariantError(
        `TRANSACTION_SIDE_EFFECT_PROHIBITED: Cannot execute external side effect "${actionName}" while database transaction is held open.`
      );
    }
  }

  public async flushOutbox(): Promise<void> {
    for (const event of this.pendingOutboxEvents) {
      await this.client.query(
        `INSERT INTO outbox_events (
          id, event_type, schema_version, aggregate_type, aggregate_id,
          payload, metadata, occurred_at, published_at, attempt_count, last_error, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          event.id,
          event.event_type,
          event.schema_version,
          event.aggregate_type,
          event.aggregate_id,
          JSON.stringify(event.payload),
          JSON.stringify(event.metadata),
          event.occurred_at,
          null,
          0,
          null,
          'PENDING'
        ]
      );
    }
    this.pendingOutboxEvents = [];
  }

  public async commit(): Promise<void> {
    if (this.rolledBack) {
      throw new InfrastructureError('Cannot commit an already rolled-back Unit of Work');
    }
    await this.flushOutbox();
    this.committed = true;
  }

  public async rollback(): Promise<void> {
    this.pendingOutboxEvents = [];
    this.rolledBack = true;
  }
}
