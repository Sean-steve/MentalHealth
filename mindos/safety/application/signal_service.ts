/**
 * MindOS Safety Signal Service
 * Authority: Volumes I, V & Clinical Safety Policy Catalogue Section 4
 * 
 * Rules:
 * - Normalizes and validates inbound signals.
 * - Deduplicates within active window while recording recurrence.
 * - Emits canonical safety.risk_signal_detected event.
 */

import { ISafetyRepository } from '../repositories/safety_repository.js';
import { RawSignalInput, SignalNormalizer, NormalizedSignalResult } from '../signals/normalizer.js';
import { SignalDeduplicator, DeduplicationAssessment } from '../signals/deduplicator.js';
import { SafetySignalEntity, SignalStatus } from '../domain/types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventPublisher } from '../../platform/events/index.js';
import { CanonicalEventTypes, EventPriority } from '../../platform/events/registry/event_registry.js';
import { SafetyMetrics } from '../infrastructure/metrics.js';

export interface IngestSignalResult {
  signal: SafetySignalEntity;
  normalized: NormalizedSignalResult;
  deduplication: DeduplicationAssessment;
}

export class SafetySignalService {
  constructor(private repo: ISafetyRepository) {}

  /**
   * Ingests, normalizes, deduplicates, and persists a safety signal.
   */
  public async ingestSignal(input: RawSignalInput): Promise<IngestSignalResult> {
    // 1. Normalize and classify
    const normalized = SignalNormalizer.normalize(input);

    // 2. Evaluate deduplication & recurrence
    const deduplication = SignalDeduplicator.evaluate(input.subject_user_id, normalized);

    // 3. Construct entity
    const signalEntity: SafetySignalEntity = {
      id: generateUUIDv7(),
      subject_user_id: input.subject_user_id,
      signal_type: normalized.signal_type,
      signal_code: normalized.signal_code,
      source_type: normalized.source_type,
      source_reference: normalized.source_reference,
      provenance: normalized.provenance,
      severity: normalized.severity,
      confidence: normalized.confidence,
      observed_at: normalized.observed_at,
      received_at: normalized.received_at,
      raw_evidence_reference: normalized.raw_evidence_reference,
      normalized_evidence: normalized.normalized_evidence,
      jurisdiction: normalized.jurisdiction,
      status: deduplication.isDuplicate ? SignalStatus.SUPERSEDED : SignalStatus.ACTIVE,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // 4. Persist
    await this.repo.saveSignal(signalEntity);

    // 5. Record metrics
    SafetyMetrics.recordSignalDetected(signalEntity.signal_code, signalEntity.severity);

    // 6. Publish domain event
    try {
      await EventPublisher.publish({
        type: CanonicalEventTypes.SAFETY_RISK_SIGNAL_DETECTED,
        subjectId: signalEntity.subject_user_id,
        payload: {
          signalId: signalEntity.id,
          signalCode: signalEntity.signal_code,
          signalType: signalEntity.signal_type,
          severity: signalEntity.severity,
          confidence: signalEntity.confidence,
          sourceType: signalEntity.source_type,
          recurrenceCount: deduplication.recurrenceCount,
          isDuplicate: deduplication.isDuplicate
        },
        priority: signalEntity.severity === 'CRITICAL' ? EventPriority.CRITICAL : EventPriority.HIGH
      });
    } catch (err) {
      // Non-blocking for event publish failure in signal service
    }

    return {
      signal: signalEntity,
      normalized,
      deduplication
    };
  }
}
