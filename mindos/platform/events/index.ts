/**
 * MindOS Canonical Event Architecture & Transactional Outbox
 * Authority: Master Architecture Index Section 12, Volume IX & Appendix E & ADR-007, ADR-021
 */

import { CorrelationManager } from '../shared/correlation.js';
import { DataClassification } from '../shared/data_classification.js';
import { DomainInvariantError } from '../errors/index.js';
import { UUIDv7 } from '../database/uuid.js';
import { DomainEventEnvelope, EventPriority } from './types.js';
import { DomainEventEnvelopeFactory, MAX_EVENT_PAYLOAD_BYTES } from './envelope.js';
import { CanonicalEventRegistry } from './registry/event_registry.js';
import { InMemoryEventTransport } from './transport/in_memory_transport.js';
import { EventTransport } from './transport/types.js';
import { DatabaseManager } from '../database/connection.js';

export * from './types.js';
export * from './envelope.js';
export * from './registry/event_registry.js';
export * from './registry/versioning.js';
export * from './transport/types.js';
export * from './transport/in_memory_transport.js';
export * from './consumer/types.js';
export * from './consumer/consumer_registry.js';
export * from './consumer/idempotency.js';
export * from './consumer/worker.js';
export * from './dead_letter/repository.js';
export * from './dead_letter/service.js';
export * from './outbox/publisher.js';
export * from './observability/metrics.js';

export interface OutboxRecord {
  id: string;
  event_id: string;
  event_type: string;
  event_name: string;
  payload: string; // Serialized JSON
  status: 'PENDING' | 'PUBLISHED' | 'FAILED' | 'DEAD_LETTER';
  retry_count: number;
  created_at: string;
  published_at?: string;
  priority?: EventPriority;
}

export type EventHandler<T = Record<string, unknown>> = (event: DomainEventEnvelope<T>) => Promise<void> | void;

export class EventBus {
  private static handlers: Map<string, Array<EventHandler<any>>> = new Map();
  private static outbox: OutboxRecord[] = [];
  private static publishedEvents: DomainEventEnvelope[] = [];
  private static globalTransport: EventTransport = new InMemoryEventTransport();

  public static getTransport(): EventTransport {
    return EventBus.globalTransport;
  }

  public static setTransport(transport: EventTransport): void {
    this.globalTransport = transport;
  }

  /**
   * Enqueues an event into the transactional outbox
   * Validates anti-leakage invariants and canonical registration.
   */
  public static enqueue<T extends Record<string, unknown>>(
    event_type: string,
    producer: string,
    aggregate_id: string,
    data_classification: DataClassification,
    payload: T,
    options: {
      schema_version?: number;
      causation_id?: string;
      correlation_id?: string;
      priority?: EventPriority;
      aggregate_type?: string;
      metadata?: Record<string, unknown>;
    } = {},
    tx?: any
  ): DomainEventEnvelope<T> {
    // 1. Anti-leakage checks
    DomainEventEnvelopeFactory.validateAntiLeakage(payload);

    // 2. Validate registry definition and status
    CanonicalEventRegistry.validatePayload(event_type, payload, options?.schema_version || 1);
    const reg = CanonicalEventRegistry.get(event_type, options?.schema_version);

    const correlation = CorrelationManager.get();
    const eventId = UUIDv7.generate();
    const now = new Date().toISOString();

    const event: DomainEventEnvelope<T> = {
      event_id: eventId,
      event_type,
      schema_version: options?.schema_version || 1,
      occurred_at: now,
      producer,
      producer_version: '1.0.0',
      aggregate_type: options?.aggregate_type || producer,
      aggregate_id,
      correlation_id: options?.correlation_id || correlation.correlationId || eventId,
      causation_id: options?.causation_id || correlation.causationId || eventId,
      request_id: correlation.requestId,
      classification: data_classification,
      jurisdiction: 'KE',
      payload,
      metadata: {
        priority: options?.priority || reg?.priority || EventPriority.NORMAL,
        ...(options?.metadata || {})
      }
    };

    const outboxRecord: OutboxRecord = {
      id: UUIDv7.generate(),
      event_id: event.event_id,
      event_type: event.event_type,
      event_name: event.event_type,
      payload: JSON.stringify(event),
      status: 'PENDING',
      retry_count: 0,
      created_at: now,
      priority: event.metadata.priority as EventPriority
    };

    EventBus.outbox.push(outboxRecord);

    try {
      const client = tx || DatabaseManager.getClient();
      if (client) {
        client.query(
          `INSERT INTO outbox_events (
            id, event_id, event_type, schema_version, aggregate_type, aggregate_id,
            payload, metadata, classification, occurred_at, available_at, published_at,
            attempt_count, retry_count, last_attempt_at, last_error_code, last_error, correlation_id,
            causation_id, priority, created_at, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
          [
            outboxRecord.id,
            event.event_id,
            event.event_type,
            event.schema_version,
            event.aggregate_type,
            event.aggregate_id,
            JSON.stringify(event.payload),
            JSON.stringify(event.metadata),
            event.classification || 'INTERNAL',
            event.occurred_at,
            event.occurred_at,
            null,
            0,
            0,
            null,
            null,
            null,
            event.correlation_id,
            event.causation_id,
            event.metadata.priority || 'NORMAL',
            now,
            'PENDING'
          ]
        ).catch(() => {});
      }
    } catch {
      // Ignore if database unavailable
    }

    return event;
  }

  /**
   * Convenience publish method that enqueues an event into the outbox
   */
  public static async publish<T extends Record<string, unknown>>(params: {
    type: string;
    payload: T;
    aggregateId?: string;
    producer?: string;
    classification?: DataClassification;
  }): Promise<DomainEventEnvelope<T>> {
    const aggregateId = params.aggregateId || (params.payload as any)?.artifact_id || (params.payload as any)?.id || 'global';
    const producer = params.producer || params.type.split('.')[0] || 'clinical';
    const classification = params.classification || DataClassification.RESTRICTED;

    const event = EventBus.enqueue<T>(
      params.type,
      producer,
      aggregateId,
      classification,
      params.payload
    );

    // Also dispatch to in-memory handlers immediately for reactive tests
    const handlers = EventBus.handlers.get(params.type) || [];
    const wildcard = EventBus.handlers.get('*') || [];
    for (const h of [...handlers, ...wildcard]) {
      try {
        await h(event);
      } catch {}
    }

    return event;
  }

  /**
   * Dispatches pending outbox events
   */
  public static async processOutbox(): Promise<number> {
    let processed = 0;
    for (const record of EventBus.outbox) {
      if (record.status === 'PENDING') {
        const event = JSON.parse(record.payload) as DomainEventEnvelope;
        const handlers = EventBus.handlers.get(event.event_type) || [];
        const wildcardHandlers = EventBus.handlers.get('*') || [];
        const allHandlers = [...handlers, ...wildcardHandlers];

        try {
          for (const handler of allHandlers) {
            await handler(event);
          }
          await EventBus.globalTransport.publish(event);
          record.status = 'PUBLISHED';
          record.published_at = new Date().toISOString();
          EventBus.publishedEvents.push(event);
          processed++;
        } catch {
          record.status = 'FAILED';
          record.retry_count += 1;
        }
      }
    }
    return processed;
  }

  public static subscribe<T = Record<string, unknown>>(event_type: string, handler: EventHandler<T>): () => void {
    const list = EventBus.handlers.get(event_type) || [];
    list.push(handler);
    EventBus.handlers.set(event_type, list);

    return () => {
      const current = EventBus.handlers.get(event_type) || [];
      EventBus.handlers.set(event_type, current.filter(h => h !== handler));
    };
  }

  public static getPublishedEvents(): ReadonlyArray<DomainEventEnvelope> {
    return EventBus.publishedEvents;
  }

  public static getOutbox(): ReadonlyArray<OutboxRecord> {
    return EventBus.outbox;
  }

  public static clearOutbox(): void {
    EventBus.outbox = [];
  }

  public static async getPendingOutbox(): Promise<any[]> {
    try {
      const db = DatabaseManager.getClient();
      const rows = await db.query<any>(`SELECT * FROM outbox_events WHERE status = $1`, ['PENDING']);
      return rows.map((r: any) => ({
        ...r,
        event_name: r.event_name || r.event_type,
        retry_count: r.retry_count ?? r.attempt_count ?? 0
      }));
    } catch {
      return EventBus.outbox.filter(o => o.status === 'PENDING');
    }
  }

  public static resetForTesting(): void {
    EventBus.handlers.clear();
    EventBus.outbox = [];
    EventBus.publishedEvents = [];
    EventBus.globalTransport.resetForTesting();
    CanonicalEventRegistry.resetForTesting();
    try {
      const db = DatabaseManager.getClient();
      db.query(`DELETE FROM outbox_events`).catch(() => {});
    } catch {}
  }
}

export class EventPublisher {
  public static async publish(params: {
    type: string;
    subjectId: string;
    payload: Record<string, unknown>;
    priority?: EventPriority;
  }): Promise<void> {
    try {
      EventBus.enqueue(
        params.type,
        'safety',
        params.subjectId,
        DataClassification.RESTRICTED,
        params.payload,
        { priority: params.priority }
      );
    } catch {
      // Safe fallback: Event emission must never block safety-critical paths
    }
  }
}
