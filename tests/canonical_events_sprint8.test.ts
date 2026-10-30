/**
 * MindOS Sprint 8: Canonical Domain Event Architecture, Transactional Outbox,
 * Message Delivery, Workers & Idempotent Processing Test Suite
 * 
 * Authority: Appendix E (Domain Event Catalogue), ADR-021 (Transactional Outbox),
 * Appendix N (Test Catalogue), Kenyan Compliance Control Matrix (DP-004, AUD-001)
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  EventBus,
  CanonicalEventRegistry,
  EventEnvelopeBuilder,
  DeliverySemantics,
  EventPriority,
  RetentionClass,
  EventRegistrationStatus,
  InMemoryEventTransport,
  OutboxPublisher,
  EventWorker,
  ProcessedEventsRepository,
  DeadLetterService,
  DeadLetterRepository,
  eventMetrics,
  UpcastingEngine
} from '../mindos/platform/events/index.js';

import { DomainInvariantError } from '../mindos/platform/errors/index.js';
import { DataClassification } from '../mindos/platform/shared/data_classification.js';
import { UUIDv7 } from '../mindos/platform/database/uuid.js';
import { DatabaseManager, UnitOfWork } from '../mindos/platform/database/index.js';

describe('MindOS Sprint 8: Canonical Domain Event Architecture & Processing Test Suite', () => {

  beforeEach(() => {
    EventBus.resetForTesting();
    eventMetrics.reset();
  });

  // =========================================================================
  // 1. CANONICAL EVENT ENVELOPE & IMMUTABILITY (ADR-021, Appendix E)
  // =========================================================================
  describe('1. Canonical Event Envelope & Anti-Leakage Invariants', () => {

    test('Constructs valid RFC-compliant UUIDv7 envelope with metadata and strict immutability', () => {
      const envelope = EventEnvelopeBuilder.create({
        event_type: 'identity.account_state_changed',
        producer: 'identity',
        classification: DataClassification.RESTRICTED,
        delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
        priority: EventPriority.HIGH,
        retention_class: RetentionClass.OPERATIONAL,
        subject: { id: 'user-001', type: 'user' },
        correlation_id: 'corr-100',
        causation_id: 'cause-50',
        payload: {
          user_id: 'user-001',
          from_state: 'PENDING_VERIFICATION',
          to_state: 'ACTIVE',
          reason_code: 'EMAIL_VERIFIED'
        }
      });

      assert.ok(envelope.event_id, 'event_id must be populated');
      assert.match(envelope.event_id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      assert.equal(envelope.event_type, 'identity.account_state_changed');
      assert.equal(envelope.producer, 'identity');
      assert.equal(envelope.schema_version, 1);
      assert.equal(envelope.priority, EventPriority.HIGH);
      assert.equal(envelope.correlation_id, 'corr-100');
      assert.equal(envelope.causation_id, 'cause-50');
      assert.ok(envelope.occurred_at, 'occurred_at must be populated');

      // Strict immutability check
      assert.throws(() => {
        (envelope as any).event_type = 'tampered';
      }, /Cannot assign to read only property|read-only/);

      assert.throws(() => {
        (envelope.payload as any).to_state = 'LOCKED';
      }, /Cannot assign to read only property|read-only/);
    });

    test('Anti-leakage: Blocks payload exceeding maximum 64 KB limit', () => {
      const largeBlob = 'x'.repeat(66 * 1024); // 66 KB

      assert.throws(() => {
        EventEnvelopeBuilder.create({
          event_type: 'identity.account_state_changed',
          producer: 'identity',
          classification: DataClassification.RESTRICTED,
          subject: { id: 'user-001', type: 'user' },
          payload: {
            user_id: 'user-001',
            from_state: 'ACTIVE',
            to_state: 'LOCKED',
            reason_code: 'SUSPICIOUS_ACTIVITY',
            bloat: largeBlob
          }
        });
      }, /PAYLOAD_TOO_LARGE/);
    });

    test('Anti-leakage: Blocks unmasked clinical narratives and plain emails from domain event bus', () => {
      assert.throws(() => {
        EventEnvelopeBuilder.create({
          event_type: 'identity.account_state_changed',
          producer: 'identity',
          classification: DataClassification.RESTRICTED,
          subject: { id: 'user-001', type: 'user' },
          payload: {
            user_id: 'user-001',
            from_state: 'ACTIVE',
            to_state: 'LOCKED',
            reason_code: 'SUSPICIOUS_ACTIVITY',
            clinical_notes: 'Patient exhibits symptoms of major depressive disorder'
          }
        });
      }, /ANTI_LEAKAGE_VIOLATION/);
    });
  });

  // =========================================================================
  // 2. EVENT REGISTRY & VERSIONING UPCASTING (Appendix E)
  // =========================================================================
  describe('2. Canonical Event Registry & Schema Evolution Upcasting', () => {

    test('Rejects emission of unregistered domain event types', () => {
      assert.throws(() => {
        EventBus.enqueue(
          'unregistered.random_event',
          'platform',
          'res-1',
          DataClassification.INTERNAL,
          { foo: 'bar' }
        );
      }, /UNREGISTERED_DOMAIN_EVENT/);
    });

    test('Rejects emission of inactive/future domain events (bounded context protection)', () => {
      assert.throws(() => {
        EventBus.enqueue(
          'privacy.dpia_review_due',
          'privacy',
          'dpia-1',
          DataClassification.RESTRICTED,
          { resource_id: 'res-1' }
        );
      }, /INACTIVE_DOMAIN_EVENT/);
    });

    test('Upcasting Engine transforms legacy schema versions to current canonical schema', () => {
      UpcastingEngine.registerUpcaster('identity.account_state_changed', 1, 2, (payload: any) => {
        return {
          ...payload,
          actor_initiated: true,
          upcasted_at: '2026-09-07T00:00:00.000Z'
        };
      });

      const legacyEnvelope = EventEnvelopeBuilder.create({
        event_type: 'identity.account_state_changed',
        producer: 'identity',
        schema_version: 1,
        classification: DataClassification.RESTRICTED,
        subject: { id: 'user-001', type: 'user' },
        payload: {
          user_id: 'user-001',
          from_state: 'PENDING_VERIFICATION',
          to_state: 'ACTIVE',
          reason_code: 'EMAIL_VERIFIED'
        }
      });

      const upcasted = UpcastingEngine.upcast(legacyEnvelope, 2);
      assert.equal(upcasted.schema_version, 2);
      assert.equal(upcasted.payload.actor_initiated, true);
      assert.equal(upcasted.payload.upcasted_at, '2026-09-07T00:00:00.000Z');
      assert.equal(upcasted.payload.user_id, 'user-001');
    });
  });

  // =========================================================================
  // 3. TRANSACTIONAL OUTBOX & ATOMICITY (ADR-021)
  // =========================================================================
  describe('3. Transactional Outbox Pattern & Reliable Dispatch', () => {

    test('UnitOfWork atomically commits business mutations and outbox records', async () => {
      const db = DatabaseManager.getClient();
      const uow = new UnitOfWork(db);

      await uow.execute(async (tx) => {
        // Enqueue canonical outbox event inside transaction
        EventBus.enqueue(
          'identity.account_state_changed',
          'identity',
          'u-123',
          DataClassification.RESTRICTED,
          {
            user_id: 'u-123',
            from_state: 'ACTIVE',
            to_state: 'SUSPENDED',
            reason_code: 'POLICY_VIOLATION'
          },
          undefined,
          tx
        );
      });

      const outbox = await EventBus.getPendingOutbox();
      assert.ok(outbox.length >= 1, 'Outbox must contain transactional event');
      const item = outbox.find(e => e.aggregate_id === 'u-123');
      assert.ok(item, 'Specific outbox entry must exist');
      assert.equal(item.status, 'PENDING');
      assert.equal(item.event_name, 'identity.account_state_changed');
    });

    test('Outbox Publisher claims batch, publishes to transport, and marks records PUBLISHED', async () => {
      const transport = new InMemoryEventTransport();
      const publisher = new OutboxPublisher(transport, { batchSize: 10 });

      // Enqueue 3 events
      EventBus.enqueue(
        'identity.account_state_changed',
        'identity',
        'u-batch-1',
        DataClassification.RESTRICTED,
        { user_id: 'u-batch-1', from_state: 'ACTIVE', to_state: 'SUSPENDED', reason_code: 'ADMIN_LOCK' }
      );
      EventBus.enqueue(
        'identity.account_state_changed',
        'identity',
        'u-batch-2',
        DataClassification.RESTRICTED,
        { user_id: 'u-batch-2', from_state: 'PENDING', to_state: 'ACTIVE', reason_code: 'ACTIVATED' }
      );

      const publishedCount = await publisher.publishBatch();
      assert.equal(publishedCount, 2);

      // Verify records are now PUBLISHED
      const remainingPending = await EventBus.getPendingOutbox();
      const batchItems = remainingPending.filter(e => e.aggregate_id.startsWith('u-batch-'));
      assert.equal(batchItems.length, 0, 'No batch items should remain in PENDING status');
    });

    test('Outbox Publisher gracefully handles transport failure with backoff', async () => {
      const transport = new InMemoryEventTransport();
      transport.simulateBrokerFailure(true); // Simulate broker outage

      const publisher = new OutboxPublisher(transport, { batchSize: 5 });

      EventBus.enqueue(
        'identity.account_state_changed',
        'identity',
        'u-fail-1',
        DataClassification.RESTRICTED,
        { user_id: 'u-fail-1', from_state: 'ACTIVE', to_state: 'SUSPENDED', reason_code: 'OUTAGE_TEST' }
      );

      const published = await publisher.publishBatch();
      assert.equal(published, 0, 'Should publish 0 when transport is unavailable');

      // Verify retry count increased on outbox row
      const db = DatabaseManager.getClient();
      const rows: any = await db.query<any>('SELECT * FROM outbox_events WHERE aggregate_id = $1', ['u-fail-1']);
      assert.ok(rows.rows[0].retry_count > 0, 'Retry count must be incremented');
      assert.ok(rows.rows[0].last_error?.includes('BROKER_UNAVAILABLE'));
    });
  });

  // =========================================================================
  // 4. TRANSPORT ABSTRACTION & PRIORITY QUEUING
  // =========================================================================
  describe('4. Event Transport & Priority Delivery Invariants', () => {

    test('InMemoryTransport dispatches higher priority events before lower priority events', async () => {
      const transport = new InMemoryEventTransport();
      const receivedOrder: string[] = [];

      await transport.subscribe('priority.queue', async (msg: any) => {
        receivedOrder.push(msg.envelope.event_type);
      });

      // Publish in reverse priority order: NORMAL, then HIGH, then CRITICAL
      await transport.publish(
        EventEnvelopeBuilder.create({
          event_type: 'consent.granted',
          producer: 'consent',
          priority: EventPriority.NORMAL,
          classification: DataClassification.RESTRICTED,
          subject: { id: 'c-norm', type: 'consent' },
          payload: { user_id: 'u-1', consent_type: 'RESEARCH', receipt_id: 'rcpt-1', policy_version: 1 }
        }),
        'priority.queue'
      );

      await transport.publish(
        EventEnvelopeBuilder.create({
          event_type: 'identity.account_state_changed',
          producer: 'identity',
          priority: EventPriority.HIGH,
          classification: DataClassification.RESTRICTED,
          subject: { id: 'u-high', type: 'user' },
          payload: { user_id: 'u-1', from_state: 'ACTIVE', to_state: 'LOCKED', reason_code: 'FRAUD' }
        }),
        'priority.queue'
      );

      await transport.publish(
        EventEnvelopeBuilder.create({
          event_type: 'safety.state_changed',
          producer: 'safety',
          priority: EventPriority.CRITICAL,
          classification: DataClassification.RESTRICTED,
          subject: { id: 's-crit', type: 'safety' },
          payload: { user_id: 'u-1', risk_event_id: 'risk-1', from_state: 'ROUTINE', to_state: 'URGENT' }
        }),
        'priority.queue'
      );

      // Drain transport
      await transport.drain();

      assert.deepEqual(receivedOrder, [
        'safety.state_changed',           // CRITICAL (Rank 0)
        'identity.account_state_changed', // HIGH (Rank 1)
        'consent.granted'                 // NORMAL (Rank 2)
      ]);
    });
  });

  // =========================================================================
  // 5. WORKER ARCHITECTURE & IDEMPOTENCY (ADR-021, Appendix E)
  // =========================================================================
  describe('5. Worker Idempotency & Consumer Execution', () => {

    test('ProcessedEventsRepository ensures exactly-once side effects on duplicate message delivery', async () => {
      const idempotencyRepo = new ProcessedEventsRepository();
      const eventId = UUIDv7.generate();
      const consumerId = 'audit_worker';

      // First delivery: should not be processed yet
      const alreadyProcessed = await idempotencyRepo.isProcessed(consumerId, eventId);
      assert.equal(alreadyProcessed, false);

      // Mark processed
      await idempotencyRepo.markProcessed(consumerId, eventId, 'identity.user_registered', {
        handlerResult: 'AUDIT_LOG_WRITTEN'
      });

      // Duplicate redelivery: must detect already processed
      const duplicateCheck = await idempotencyRepo.isProcessed(consumerId, eventId);
      assert.equal(duplicateCheck, true);
    });

    test('Worker skips execution when event is already recorded in processed_events (idempotent no-op)', async () => {
      const transport = new InMemoryEventTransport();
      const idempotencyRepo = new ProcessedEventsRepository();
      const deadLetterRepo = new DeadLetterRepository();
      const deadLetterService = new DeadLetterService(deadLetterRepo, transport);

      const worker = new EventWorker({
        consumerId: 'notification_worker',
        transport,
        idempotencyRepo,
        deadLetterService,
        maxRetries: 3
      });

      let executionCount = 0;
      worker.registerHandler('identity.account_state_changed', async (envelope) => {
        executionCount++;
      });

      const envelope = EventEnvelopeBuilder.create({
        event_type: 'identity.account_state_changed',
        producer: 'identity',
        classification: DataClassification.RESTRICTED,
        subject: { id: 'u-dup-1', type: 'user' },
        payload: { user_id: 'u-dup-1', from_state: 'PENDING', to_state: 'ACTIVE', reason_code: 'VERIFIED' }
      });

      // First dispatch
      const res1 = await worker.handleEnvelope(envelope);
      assert.equal(res1.status, 'SUCCESS');
      assert.equal(executionCount, 1);

      // Second duplicate dispatch
      const res2 = await worker.handleEnvelope(envelope);
      assert.equal(res2.status, 'SKIPPED_DUPLICATE');
      assert.equal(executionCount, 1, 'Handler must not execute on duplicate message');
    });
  });

  // =========================================================================
  // 6. POISON PILL & DEAD-LETTER QUARANTINE (ADR-021)
  // =========================================================================
  describe('6. Poison Pill Quarantine & Dead-Letter Management', () => {

    test('Quarantines failing event to dead_letter_events table after exceeding max retries', async () => {
      const transport = new InMemoryEventTransport();
      const idempotencyRepo = new ProcessedEventsRepository();
      const deadLetterRepo = new DeadLetterRepository();
      const deadLetterService = new DeadLetterService(deadLetterRepo, transport);

      const worker = new EventWorker({
        consumerId: 'flaky_consumer',
        transport,
        idempotencyRepo,
        deadLetterService,
        maxRetries: 2,
        baseBackoffMs: 1
      });

      worker.registerHandler('identity.account_state_changed', async () => {
        throw new Error('SYSTEM_OUTAGE: Third-party sync service returned HTTP 503');
      });

      const envelope = EventEnvelopeBuilder.create({
        event_type: 'identity.account_state_changed',
        producer: 'identity',
        classification: DataClassification.RESTRICTED,
        subject: { id: 'u-poison-1', type: 'user' },
        payload: { user_id: 'u-poison-1', from_state: 'PENDING', to_state: 'ACTIVE', reason_code: 'FAILED_SYNC' }
      });

      const result = await worker.handleEnvelope(envelope);
      assert.equal(result.status, 'DEAD_LETTERED');

      // Verify quarantine in dead letter repository
      const quarantined = await deadLetterRepo.findByConsumerAndEvent('flaky_consumer', envelope.event_id);
      assert.ok(quarantined, 'Record must exist in dead letter repository');
      assert.equal(quarantined.error_message, 'SYSTEM_OUTAGE: Third-party sync service returned HTTP 503');
      assert.equal(quarantined.retry_count, 2);
    });

    test('DeadLetterService allows authorized operator to replay or discard quarantined events', async () => {
      const transport = new InMemoryEventTransport();
      const deadLetterRepo = new DeadLetterRepository();
      const deadLetterService = new DeadLetterService(deadLetterRepo, transport);

      const envelope = EventEnvelopeBuilder.create({
        event_type: 'identity.account_state_changed',
        producer: 'identity',
        classification: DataClassification.RESTRICTED,
        subject: { id: 'u-quarantine-1', type: 'user' },
        payload: { user_id: 'u-quarantine-1', from_state: 'PENDING', to_state: 'ACTIVE', reason_code: 'RECOVER_ME' }
      });

      const deadLetter = await deadLetterRepo.quarantine({
        consumerId: 'target_consumer',
        envelope,
        errorMessage: 'Transient network failure',
        retryCount: 3
      });

      // Operator unauthorized check
      assert.throws(() => {
        deadLetterService.replayDeadLetter(deadLetter.id, 'Recovered', {
          userId: 'attacker-1',
          roles: ['REGULAR_USER']
        });
      }, /UNAUTHORIZED_OPERATOR/);

      // Authorized operator replay
      let publishedToTransport = false;
      transport.subscribe('identity.account_state_changed', async () => {
        publishedToTransport = true;
      });

      const replayResult = await deadLetterService.replayDeadLetter(
        deadLetter.id,
        'Downstream database recovered, replaying message',
        { userId: 'admin-007', roles: ['PLATFORM_ADMIN'] }
      );

      assert.equal(replayResult.replayed, true);
      assert.equal(replayResult.record.resolution_action, 'REPLAYED');
      assert.ok(replayResult.record.resolved_at);

      // Verify transport received replayed envelope
      await transport.drain();
      assert.equal(publishedToTransport, true);
    });
  });

  // =========================================================================
  // 7. OBSERVABILITY & METRICS INTEGRATION
  // =========================================================================
  describe('7. Domain Event Observability & Telemetry Metrics', () => {

    test('Tracks published, consumed, and failure telemetry metrics accurately', () => {
      eventMetrics.recordPublished('identity.account_state_changed', EventPriority.HIGH);
      eventMetrics.recordConsumed('identity.account_state_changed', 'audit_worker', 12.5);
      eventMetrics.recordFailed('identity.account_state_changed', 'audit_worker');
      eventMetrics.recordDeadLetter('flaky_consumer');

      const snapshot = eventMetrics.getSnapshot();
      assert.equal(snapshot.published_total['identity.account_state_changed:HIGH'], 1);
      assert.equal(snapshot.consumed_total['identity.account_state_changed:audit_worker'], 1);
      assert.equal(snapshot.failed_total['identity.account_state_changed:audit_worker'], 1);
      assert.equal(snapshot.dead_letter_total['flaky_consumer'], 1);
      assert.ok(snapshot.consumption_duration_ms['identity.account_state_changed:audit_worker'] >= 12.5);
    });
  });
});
