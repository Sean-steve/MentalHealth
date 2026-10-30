/**
 * MindOS Canonical Domain Event Envelope & Validation Kernel
 * Authority: Master Architecture Index Section 12, Volume IX & Appendix E & ADR-004
 */

import { DomainEventEnvelope, EventPriority } from './types.js';
import { DataClassification } from '../shared/data_classification.js';
import { CorrelationManager } from '../shared/correlation.js';
import { UUIDv7 } from '../database/uuid.js';
import { DomainInvariantError, ValidationError } from '../errors/index.js';

export const MAX_EVENT_PAYLOAD_BYTES = 64 * 1024; // 64 KB strictly enforced

export const PROHIBITED_PAYLOAD_KEYS = [
  'password',
  'password_hash',
  'salt',
  'token',
  'access_token',
  'refresh_token',
  'reset_token',
  'verification_token',
  'secret',
  'private_key',
  'journal_text',
  'ciphertext',
  'content_ciphertext',
  'raw_answers',
  'notes_text',
  'clinical_note',
  'clinical_notes',
  'diagnosis',
  'symptom',
  'phq9',
  'gad7',
  'medication',
  'treatment'
];

export interface CreateEventParams<T = Record<string, unknown>> {
  event_type: string;
  producer: string;
  producer_version?: string;
  aggregate_type?: string;
  aggregate_id?: string;
  subject?: { id: string; type: string };
  classification: DataClassification;
  payload: T;
  schema_version?: number;
  priority?: EventPriority;
  delivery_semantics?: any;
  retention_class?: any;
  jurisdiction?: string;
  causation_id?: string;
  correlation_id?: string;
  request_id?: string;
  metadata?: Record<string, unknown>;
}

export class DomainEventEnvelopeFactory {
  /**
   * Constructs and validates a canonical DomainEventEnvelope
   */
  public static create<T extends Record<string, unknown>>(
    params: CreateEventParams<T>
  ): DomainEventEnvelope<T> {
    DomainEventEnvelopeFactory.validateAntiLeakage(params.payload);

    const serializedPayload = JSON.stringify(params.payload ?? {});
    const payloadSize = Buffer.byteLength(serializedPayload, 'utf8');
    if (payloadSize > MAX_EVENT_PAYLOAD_BYTES) {
      throw new DomainInvariantError(
        `EVENT_PAYLOAD_EXCEEDS_MAX_SIZE: Event payload is ${payloadSize} bytes; maximum allowed is ${MAX_EVENT_PAYLOAD_BYTES} bytes. (PAYLOAD_TOO_LARGE)`
      );
    }

    const correlation = CorrelationManager.get();
    const eventId = UUIDv7.generate();
    const now = new Date().toISOString();

    const aggType = params.subject?.type ?? params.aggregate_type ?? 'entity';
    const aggId = params.subject?.id ?? params.aggregate_id ?? eventId;

    if (params.payload && typeof params.payload === 'object') {
      Object.freeze(params.payload);
    }

    const envelope: DomainEventEnvelope<T> = {
      event_id: eventId,
      event_type: params.event_type,
      schema_version: params.schema_version ?? 1,
      occurred_at: now,
      producer: params.producer,
      producer_version: params.producer_version ?? '1.0.0',
      aggregate_type: aggType,
      aggregate_id: aggId,
      correlation_id: params.correlation_id ?? correlation.correlationId ?? eventId,
      causation_id: params.causation_id ?? correlation.causationId ?? eventId,
      request_id: params.request_id ?? correlation.requestId,
      classification: params.classification,
      jurisdiction: params.jurisdiction ?? 'KE',
      priority: params.priority ?? EventPriority.NORMAL,
      payload: params.payload,
      metadata: {
        priority: params.priority ?? EventPriority.NORMAL,
        ...(params.metadata ?? {})
      }
    };

    DomainEventEnvelopeFactory.validateEnvelope(envelope);
    Object.freeze(envelope);
    return envelope;
  }

  /**
   * Enforces privacy and security invariants prohibiting raw clinical, credential or secret data.
   */
  public static validateAntiLeakage(payload: unknown): void {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const checkObj = (obj: Record<string, unknown>, path = ''): void => {
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        for (const prohibited of PROHIBITED_PAYLOAD_KEYS) {
          if (lowerKey === prohibited || lowerKey.endsWith(`_${prohibited}`)) {
            throw new DomainInvariantError(
              `ANTI_LEAKAGE_VIOLATION: Prohibited sensitive attribute "${key}" detected at path "${path}${key}". Clinical records, raw journals, and credentials must not be published into domain events.`
            );
          }
        }
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          checkObj(value as Record<string, unknown>, `${path}${key}.`);
        }
      }
    };

    checkObj(payload as Record<string, unknown>);
  }

  /**
   * Validates structure of a DomainEventEnvelope
   */
  public static validateEnvelope(envelope: DomainEventEnvelope): void {
    if (!envelope.event_id || typeof envelope.event_id !== 'string') {
      throw new ValidationError('EVENT_VALIDATION_ERROR: event_id must be a non-empty string');
    }
    if (!envelope.event_type || typeof envelope.event_type !== 'string') {
      throw new ValidationError('EVENT_VALIDATION_ERROR: event_type must be a non-empty string');
    }
    if (typeof envelope.schema_version !== 'number' || envelope.schema_version < 1) {
      throw new ValidationError('EVENT_VALIDATION_ERROR: schema_version must be a positive integer');
    }
    if (!envelope.occurred_at || isNaN(Date.parse(envelope.occurred_at))) {
      throw new ValidationError('EVENT_VALIDATION_ERROR: occurred_at must be a valid ISO-8601 timestamp');
    }
    if (!envelope.producer) {
      throw new ValidationError('EVENT_VALIDATION_ERROR: producer must be defined');
    }
    if (!envelope.aggregate_id) {
      throw new ValidationError('EVENT_VALIDATION_ERROR: aggregate_id must be defined');
    }
    if (!envelope.correlation_id) {
      throw new ValidationError('EVENT_VALIDATION_ERROR: correlation_id must be defined');
    }
    if (!envelope.classification) {
      throw new ValidationError('EVENT_VALIDATION_ERROR: classification must be defined');
    }
  }
}

export { DomainEventEnvelopeFactory as EventEnvelopeBuilder };
