/**
 * MindOS Canonical Persistence Kernel & Transaction Architecture Test Suite
 * Authority: Master Architecture Index Section 8, Volume III, VIII, IX, X & ADR-004/005/007/011/012/013
 * 
 * Verifies:
 * 1. Connection pooling, client lifecycle, health check, statement timeouts.
 * 2. SQLSTATE mapping to canonical MindOS errors (unique, fk, not null, concurrency).
 * 3. Unit of Work atomicity, outbox flushing, side effect guards, and payload scrubbing.
 * 4. Transactional Outbox status transitions, retries, and dead-letter queueing.
 * 5. Idempotency store acquire, conflict detection on concurrent in-flight, and result replay.
 * 6. Field-level envelope encryption (AES-256-GCM), tamper detection, and key rotation.
 * 7. Provenance & Truth Layer boundary enforcement (AI vs Clinical diagnosis).
 * 8. Statutory retention policies, legal hold enforcement, and erasure governance.
 * 9. Domain repositories (User, Appointment) with optimistic concurrency version checking and minor unit money.
 * 10. UUIDv7 time-sortability and monotonicity.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  DatabaseManager,
  DatabaseConnectionPool,
  CanonicalPostgresDriver,
  PostgresErrorMapper,
  ConcurrencyError,
  UnitOfWork,
  generateUUIDv7,
  isValidUUID,
  extractTimestampFromUUIDv7,
  FieldEncryptor,
  MindOsKmsProvider,
  OutboxRepository,
  OutboxStatus,
  IdempotencyStore,
  IdempotencyStatus,
  RetentionRegistry,
  TruthLayerValidator,
  UserRepository,
  UserEntity,
  AppointmentRepository,
  AppointmentEntity,
  AppointmentState,
  MoneyUtils,
  DeletionStrategy,
  DataLifecycleState,
  ProvenanceSource,
  TruthCategory
} from '../mindos/platform/database/index.js';

import { AccountState } from '../mindos/platform/shared/state_machines.js';
import { DataClassification } from '../mindos/platform/shared/data_classification.js';
import {
  ConflictError,
  ValidationError,
  DomainInvariantError,
  SecurityError
} from '../mindos/platform/errors/index.js';

describe('MindOS Canonical Persistence Kernel Test Suite', () => {
  beforeEach(() => {
    DatabaseManager.resetForTesting();
    DatabaseConnectionPool.resetForTesting();
    MindOsKmsProvider.resetForTesting();
  });

  // 1. Connection Pool & Health Check
  test('DatabaseManager verifies operational database health and executes SELECT 1', async () => {
    const isHealthy = await DatabaseManager.checkHealth();
    assert.equal(isHealthy, true);

    const client = DatabaseManager.getClient();
    const result = await client.query<{ '?column?': number }>('SELECT 1');
    assert.equal(result.length, 1);
  });

  test('DatabaseConnectionPool maintains pool configuration limits and timeouts', async () => {
    const poolConfig = DatabaseConnectionPool.getPoolConfig();
    assert.ok(poolConfig.min >= 2);
    assert.ok(poolConfig.max >= 10);
    assert.equal(poolConfig.statementTimeoutMs, 5000);
    assert.equal(poolConfig.ssl, false); // Local/test mock driver

    const client = await DatabaseConnectionPool.acquire();
    assert.ok(client);
    assert.equal(client.getStatementTimeoutMs(), 5000);
  });

  // 2. Error Mapping Architecture
  test('PostgresErrorMapper maps SQLSTATE codes into typed MindOS exceptions', () => {
    // 23505 Unique Violation -> ConflictError
    const uniqueErr = PostgresErrorMapper.mapError({ code: '23505', constraint: 'uq_email', table: 'users' });
    assert.ok(uniqueErr instanceof ConflictError);
    assert.ok(uniqueErr.message.includes('Unique constraint violation'));

    // 23503 Foreign Key Violation -> ValidationError
    const fkErr = PostgresErrorMapper.mapError({ code: '23503', constraint: 'fk_user_id', table: 'appointments' });
    assert.ok(fkErr instanceof ValidationError);
    assert.ok(fkErr.message.includes('Referential integrity violation'));

    // 23502 Not Null Violation -> ValidationError
    const notNullErr = PostgresErrorMapper.mapError({ code: '23502', table: 'users' });
    assert.ok(notNullErr instanceof ValidationError);
    assert.ok(notNullErr.message.includes('Required field missing'));

    // 40001 / 40P01 Serialization Failure -> ConcurrencyError
    const concurErr = PostgresErrorMapper.mapError({ code: '40001', table: 'appointments' });
    assert.ok(concurErr instanceof ConcurrencyError);
    assert.ok(concurErr.message.includes('Concurrent modification detected'));
  });

  // 3. UUIDv7 Generation & Monotonicity
  test('generateUUIDv7 creates valid, time-sortable RFC-compliant UUIDv7 identifiers', async () => {
    const id1 = generateUUIDv7();
    // Small delay to verify timestamp progression
    await new Promise(res => setTimeout(res, 2));
    const id2 = generateUUIDv7();

    assert.equal(isValidUUID(id1), true);
    assert.equal(isValidUUID(id2), true);
    assert.ok(id1 < id2, `Expected ${id1} < ${id2} for time-ordered UUIDv7`);

    const ts1 = extractTimestampFromUUIDv7(id1);
    const ts2 = extractTimestampFromUUIDv7(id2);
    assert.ok(ts1 <= ts2);
    assert.ok(ts1 > 1700000000000); // Reasonably recent epoch timestamp
  });

  // 4. Unit of Work & Outbox Pattern
  test('UnitOfWork commits domain mutations and atomically writes outbox events', async () => {
    const userId = generateUUIDv7();

    await UnitOfWork.run(async (uow) => {
      const userRepo = new UserRepository(uow.getClient());
      const now = new Date().toISOString();

      await userRepo.save({
        id: userId,
        emailNormalized: 'outbox.test@mindos.ke',
        accountState: AccountState.ACTIVE,
        createdAt: now,
        updatedAt: now,
        version: 1
      });

      uow.registerOutboxEvent(
        'identity.user_registered',
        'User',
        userId,
        { userId, email: 'outbox.test@mindos.ke' },
        {
          correlation_id: 'corr-001',
          data_classification: DataClassification.PERSONAL,
          producer_domain: 'identity'
        }
      );
    });

    const client = DatabaseManager.getClient();
    const userRepo = new UserRepository(client);
    const savedUser = await userRepo.findById(userId);
    assert.ok(savedUser);
    assert.equal(savedUser.emailNormalized, 'outbox.test@mindos.ke');

    const outboxRepo = new OutboxRepository(client);
    const pendingEvents = await outboxRepo.findPending();
    const userEvent = pendingEvents.find(e => e.aggregate_id === userId);
    assert.ok(userEvent);
    assert.equal(userEvent.event_type, 'identity.user_registered');
    assert.equal(userEvent.status, OutboxStatus.PENDING);
  });

  test('UnitOfWork scrubs sensitive clinical narratives from outbox event payloads', async () => {
    await assert.rejects(
      async () => {
        await UnitOfWork.run(async (uow) => {
          uow.registerOutboxEvent(
            'care.clinical_note_created',
            'ClinicalNote',
            generateUUIDv7(),
            {
              note_id: 'note-1',
              clinical_notes: 'Patient reports severe acute symptoms' // Sensitive key
            },
            {
              correlation_id: 'corr-002',
              data_classification: DataClassification.CLINICAL_RECORD,
              producer_domain: 'care'
            }
          );
        });
      },
      /EVENT_PAYLOAD_SECURITY_VIOLATION/
    );
  });

  test('UnitOfWork guards against external side-effects during active transaction', async () => {
    await assert.rejects(
      async () => {
        await UnitOfWork.run(async (uow) => {
          uow.assertNotInTransaction('Call Third-Party SMS Gateway');
        });
      },
      /TRANSACTION_SIDE_EFFECT_PROHIBITED/
    );
  });

  test('UnitOfWork rollback restores database state and discards pending outbox events', async () => {
    const doomedUserId = generateUUIDv7();

    await assert.rejects(
      async () => {
        await UnitOfWork.run(async (uow) => {
          const userRepo = new UserRepository(uow.getClient());
          const now = new Date().toISOString();

          await userRepo.save({
            id: doomedUserId,
            emailNormalized: 'doomed@mindos.ke',
            accountState: AccountState.ACTIVE,
            createdAt: now,
            updatedAt: now,
            version: 1
          });

          uow.registerOutboxEvent(
            'identity.doomed_event',
            'User',
            doomedUserId,
            { doomed: true },
            {
              correlation_id: 'corr-003',
              data_classification: DataClassification.PERSONAL,
              producer_domain: 'identity'
            }
          );

          throw new Error('Simulated transactional failure');
        });
      },
      /Simulated transactional failure/
    );

    const client = DatabaseManager.getClient();
    const userRepo = new UserRepository(client);
    const notSaved = await userRepo.findById(doomedUserId);
    assert.equal(notSaved, null);

    const outboxRepo = new OutboxRepository(client);
    const pendingEvents = await outboxRepo.findPending();
    assert.equal(pendingEvents.some(e => e.aggregate_id === doomedUserId), false);
  });

  // 5. Outbox Repository Lifecycle & Retries
  test('OutboxRepository transitions status and moves to DEAD_LETTER after max retries', async () => {
    const client = DatabaseManager.getClient();
    const outboxRepo = new OutboxRepository(client);
    const eventId = generateUUIDv7();

    await outboxRepo.insert({
      id: eventId,
      event_type: 'billing.payment_received',
      schema_version: 1,
      aggregate_type: 'Payment',
      aggregate_id: 'pay-123',
      payload: { amount: 1500 },
      metadata: { correlation_id: 'corr-99', data_classification: 'FINANCIAL' },
      occurred_at: new Date().toISOString(),
      attempt_count: 0,
      status: OutboxStatus.PENDING
    });

    await outboxRepo.markProcessing(eventId);
    let event = await outboxRepo.findById(eventId);
    assert.equal(event?.status, OutboxStatus.PROCESSING);

    // Fail 4 times (below default max 5)
    for (let i = 1; i <= 4; i++) {
      const res = await outboxRepo.markFailed(eventId, 'Downstream Kafka connection refused');
      assert.equal(res.status, OutboxStatus.FAILED);
      assert.equal(res.attemptCount, i);
    }

    // 5th failure -> DEAD_LETTER
    const finalFail = await outboxRepo.markFailed(eventId, 'Exceeded max retries');
    assert.equal(finalFail.status, OutboxStatus.DEAD_LETTER);
    assert.equal(finalFail.attemptCount, 5);

    event = await outboxRepo.findById(eventId);
    assert.equal(event?.status, OutboxStatus.DEAD_LETTER);
  });

  // 6. Idempotency Store
  test('IdempotencyStore enforces atomic lock and replays completed responses', async () => {
    const client = DatabaseManager.getClient();
    const idempotencyStore = new IdempotencyStore(client);
    const key = 'idem-key-888';
    const scope = 'billing.create_charge';
    const reqHash = 'hash-abc-123';

    // 1st Acquire -> Success
    const firstAcquire = await idempotencyStore.acquire(key, scope, reqHash);
    assert.equal(firstAcquire.acquired, true);

    // Concurrent in-flight request with same key -> ConflictError
    await assert.rejects(
      async () => {
        await idempotencyStore.acquire(key, scope, reqHash);
      },
      /IDEMPOTENCY_CONFLICT/
    );

    // Complete the first operation
    await idempotencyStore.complete(key, scope, 201, { chargeId: 'ch_123', status: 'PAID' });

    // Subsequent call -> Returns existing completed record without re-running
    const secondAcquire = await idempotencyStore.acquire(key, scope, reqHash);
    assert.equal(secondAcquire.acquired, false);
    assert.ok(secondAcquire.existingRecord);
    assert.equal(secondAcquire.existingRecord.status, IdempotencyStatus.COMPLETED);
    assert.equal(secondAcquire.existingRecord.response_status, 201);
  });

  // 7. Field-Level Encryption & Key Rotation
  test('FieldEncryptor performs AES-256-GCM envelope encryption with non-deterministic IV', async () => {
    const plaintext = 'Dr. Jane Kariuki observed patient presenting with persistent fatigue.';
    const env1 = await FieldEncryptor.encryptField('clinical_notes', 'content_ciphertext', plaintext);
    const env2 = await FieldEncryptor.encryptField('clinical_notes', 'content_ciphertext', plaintext);

    // IV must be unique per encryption run (non-deterministic)
    assert.notEqual(env1, env2);

    const decrypted1 = await FieldEncryptor.decryptField<string>(env1);
    const decrypted2 = await FieldEncryptor.decryptField<string>(env2);
    assert.equal(decrypted1, plaintext);
    assert.equal(decrypted2, plaintext);
  });

  test('FieldEncryptor detects tampered ciphertext and rejects with SecurityError', async () => {
    const plaintext = 'Confidential psychological consultation notes.';
    const serialized = await FieldEncryptor.encryptField('clinical_notes', 'content_ciphertext', plaintext);
    const envelope = JSON.parse(serialized);

    // Tamper with ciphertext
    envelope.ciphertext = Buffer.from('TAMPERED_CIPHERTEXT_BYTES').toString('base64');
    const tamperedSerialized = JSON.stringify(envelope);

    await assert.rejects(
      async () => {
        await FieldEncryptor.decryptField(tamperedSerialized);
      },
      /CIPHERTEXT_TAMPER_DETECTED/
    );
  });

  test('FieldEncryptor supports seamless key rotation and re-encryption', async () => {
    const kms = MindOsKmsProvider.getInstance();
    const plaintext = 'Sensitive patient medical history';

    const envV1 = await FieldEncryptor.encryptField('clinical_notes', 'ciphertext', plaintext);
    const parsedV1 = JSON.parse(envV1);
    assert.equal(parsedV1.keyVersion, 1);

    // Rotate KMS key to v2
    const nextVersion = await kms.rotateKey('clinical-records-master');
    assert.equal(nextVersion, 2);

    // Re-encrypt for rotation
    const envV2 = await FieldEncryptor.reencryptForRotation(envV1);
    const parsedV2 = JSON.parse(envV2);
    assert.equal(parsedV2.keyVersion, 2);

    // Decrypt both to verify validity
    const decrypted = await FieldEncryptor.decryptField<string>(envV2);
    assert.equal(decrypted, plaintext);
  });

  // 8. Provenance & Truth Layer Validation
  test('TruthLayerValidator enforces boundary between AI inferences and clinical findings', () => {
    // 1. AI cannot produce DIAGNOSIS
    assert.throws(
      () => {
        TruthLayerValidator.validate({
          source: ProvenanceSource.AI_INFERRED,
          truthCategory: TruthCategory.DIAGNOSIS,
          recordedBy: generateUUIDv7(),
          recordedAt: new Date().toISOString(),
          confidenceScore: 0.95
        });
      },
      /CLINICAL_PROVENANCE_VIOLATION/
    );

    // 2. AI must declare confidenceScore
    assert.throws(
      () => {
        TruthLayerValidator.validate({
          source: ProvenanceSource.AI_INFERRED,
          truthCategory: TruthCategory.INTERPRETATION,
          recordedBy: generateUUIDv7(),
          recordedAt: new Date().toISOString()
          // missing confidenceScore
        });
      },
      /AI_PROVENANCE_VIOLATION/
    );

    // 3. Non-clinical role cannot author DIAGNOSIS
    assert.throws(
      () => {
        TruthLayerValidator.validate(
          {
            source: ProvenanceSource.CLINICALLY_ASSESSED,
            truthCategory: TruthCategory.DIAGNOSIS,
            recordedBy: generateUUIDv7(),
            recordedAt: new Date().toISOString()
          },
          ['PEER_MEMBER', 'COMMUNITY_MODERATOR']
        );
      },
      /UNAUTHORIZED_CLINICAL_AUTHORSHIP/
    );

    // 4. User self-report cannot be saved as DIAGNOSIS
    assert.throws(
      () => {
        TruthLayerValidator.validate({
          source: ProvenanceSource.USER_REPORTED,
          truthCategory: TruthCategory.DIAGNOSIS,
          recordedBy: generateUUIDv7(),
          recordedAt: new Date().toISOString()
        });
      },
      /USER_DIAGNOSIS_VIOLATION/
    );

    // 5. Valid verified clinician diagnosis succeeds
    assert.doesNotThrow(() => {
      TruthLayerValidator.validate(
        {
          source: ProvenanceSource.CLINICALLY_ASSESSED,
          truthCategory: TruthCategory.DIAGNOSIS,
          recordedBy: generateUUIDv7(),
          recordedAt: new Date().toISOString()
        },
        ['VERIFIED_PROFESSIONAL']
      );
    });
  });

  // 9. Statutory Retention Policies & Legal Hold Invariants
  test('RetentionRegistry enforces statutory retention periods and legal hold immunity', () => {
    // Verify registered statutory baseline
    const clinicalPolicy = RetentionRegistry.getPolicy('care', 'clinical_notes');
    assert.ok(clinicalPolicy);
    assert.equal(clinicalPolicy.retention_period_days, 3650); // 10 years
    assert.ok(clinicalPolicy.legal_basis.includes('Kenya Health Act 2017'));

    const ledgerPolicy = RetentionRegistry.getPolicy('billing', 'ledger_entries');
    assert.ok(ledgerPolicy);
    assert.equal(ledgerPolicy.retention_period_days, 2555); // 7 years

    // Active Legal Hold blocks deletion
    assert.throws(
      () => {
        RetentionRegistry.validateLifecycleTransition(
          {
            id: generateUUIDv7(),
            entity_type: 'clinical_notes',
            entity_id: generateUUIDv7(),
            current_state: DataLifecycleState.LEGAL_HOLD,
            legal_hold_reason: 'Court Subpoena Ref #HC-2026-99',
            transitioned_at: new Date().toISOString()
          },
          DataLifecycleState.DELETED
        );
      },
      /LEGAL_HOLD_VIOLATION/
    );

    // Statutory retention records cannot be hard-deleted before expiry
    assert.throws(
      () => {
        RetentionRegistry.validateLifecycleTransition(
          {
            id: generateUUIDv7(),
            entity_type: 'clinical_notes',
            entity_id: generateUUIDv7(),
            current_state: DataLifecycleState.ACTIVE,
            retention_policy_id: clinicalPolicy.id,
            transitioned_at: new Date().toISOString()
          },
          DataLifecycleState.DELETED
        );
      },
      /STATUTORY_RETENTION_VIOLATION/
    );
  });

  // 10. Domain Repositories & Optimistic Concurrency
  test('UserRepository enforces optimistic concurrency locking on conflicting versions', async () => {
    const client = DatabaseManager.getClient();
    const userRepo = new UserRepository(client);
    const userId = generateUUIDv7();
    const now = new Date().toISOString();

    // Insert user at version 1
    const user: UserEntity = {
      id: userId,
      emailNormalized: 'concurrency.test@mindos.ke',
      accountState: AccountState.ACTIVE,
      createdAt: now,
      updatedAt: now,
      version: 1
    };

    const saved = await userRepo.save(user);
    assert.equal(saved.version, 1);

    // First update at version 1 succeeds -> bumps to version 2
    const updatedUser = {
      ...saved,
      accountState: AccountState.LOCKED
    };
    const savedV2 = await userRepo.save(updatedUser);
    assert.equal(savedV2.version, 2);

    // Second concurrent worker attempts update using stale version 1 -> ConcurrencyError
    const staleWorkerUser = {
      ...saved,
      emailNormalized: 'stale.override@mindos.ke',
      version: 1 // Outdated version
    };

    await assert.rejects(
      async () => {
        await userRepo.save(staleWorkerUser);
      },
      /CONCURRENCY_CONFLICT/
    );
  });

  test('AppointmentRepository calculates minor currency units and enforces timezone snapshots', async () => {
    const client = DatabaseManager.getClient();
    const appointmentRepo = new AppointmentRepository(client);
    const appointmentId = generateUUIDv7();
    const userId = generateUUIDv7();
    const now = new Date().toISOString();

    const userRepo = new UserRepository(client);
    await userRepo.save({
      id: userId,
      emailNormalized: 'appt.patient@mindos.ke',
      accountState: AccountState.ACTIVE,
      createdAt: now,
      updatedAt: now,
      version: 1
    });

    const price = MoneyUtils.fromMajor(3500.50, 'KES'); // KES 3500.50 -> 350050 minor units
    assert.equal(price.amountMinor, 350050n);

    const appointment: AppointmentEntity = {
      id: appointmentId,
      userId,
      professionalId: generateUUIDv7(),
      serviceId: generateUUIDv7(),
      state: AppointmentState.REQUESTED,
      startsAt: '2026-10-15T09:00:00Z',
      endsAt: '2026-10-15T09:50:00Z',
      timezoneSnapshot: 'Africa/Nairobi',
      price,
      idempotencyKey: 'idem-appt-001',
      createdAt: now,
      updatedAt: now,
      version: 1
    };

    await appointmentRepo.save(appointment);

    const retrieved = await appointmentRepo.findById(appointmentId);
    assert.ok(retrieved);
    assert.equal(retrieved.state, AppointmentState.REQUESTED);
    assert.equal(retrieved.timezoneSnapshot, 'Africa/Nairobi');
    assert.equal(retrieved.price.amountMinor, 350050n);
    assert.equal(retrieved.price.formatted, 'KES 3,500.50');

    // Lookup by idempotency key
    const retrievedByKey = await appointmentRepo.findByIdempotencyKey('idem-appt-001');
    assert.ok(retrievedByKey);
    assert.equal(retrievedByKey.id, appointmentId);
  });
});
