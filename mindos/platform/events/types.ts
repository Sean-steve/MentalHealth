/**
 * MindOS Canonical Domain Event Architecture Types
 * Authority: Master Architecture Index Section 12, Volume IX & Appendix E
 */

import { DataClassification } from '../shared/data_classification.js';
import { UUID, UtcIsoTimestamp } from '../database/types.js';

export enum EventPriority {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
  LOW = 'LOW'
}

export enum DeliverySemantics {
  AT_LEAST_ONCE = 'AT_LEAST_ONCE'
}

export enum RetentionClass {
  OPERATIONAL = 'OPERATIONAL',
  AUDIT = 'AUDIT',
  LONG_TERM = 'LONG_TERM',
  EPHEMERAL = 'EPHEMERAL'
}

export enum EventRegistrationStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DEPRECATED = 'DEPRECATED'
}

export enum DeadLetterResolutionAction {
  REPLAYED = 'REPLAYED',
  DISCARDED = 'DISCARDED',
  MANUALLY_RESOLVED = 'MANUALLY_RESOLVED'
}

export interface DomainEventEnvelope<T = Record<string, unknown>> {
  event_id: UUID; // Canonical UUIDv7
  event_type: string;
  schema_version: number;
  occurred_at: UtcIsoTimestamp; // ISO-8601 UTC
  producer: string; // Domain name (e.g., 'identity', 'consent')
  producer_version: string;
  aggregate_type: string;
  aggregate_id: string;
  correlation_id: string;
  causation_id?: string;
  request_id?: string;
  classification: DataClassification;
  jurisdiction: string;
  payload: T;
  priority?: EventPriority;
  metadata: Record<string, unknown>;
}

export interface EventRegistrationDefinition {
  event_type: string;
  domain: string;
  producer: string;
  schema_version: number;
  description: string;
  classification: DataClassification;
  delivery_semantics: DeliverySemantics;
  priority: EventPriority;
  retention_class: RetentionClass;
  status: EventRegistrationStatus;
  allowed_consumers: string[];
  payload_validator?: (payload: unknown) => { valid: boolean; errors?: string[] };
}

export interface DeadLetterRecord {
  id: UUID;
  event_id: UUID;
  event_type: string;
  consumer_id: string;
  attempts: number;
  retry_count?: number;
  failure_code: string;
  error_message?: string;
  dead_lettered_at: UtcIsoTimestamp;
  resolved_at?: UtcIsoTimestamp | null;
  resolution_action?: DeadLetterResolutionAction | null;
  resolution_reason?: string | null;
  resolved_by?: UUID | null;
  payload_summary?: Record<string, unknown>;
  correlation_id?: string;
}

export interface ProcessedEventRecord {
  id: UUID;
  consumer_id: string;
  event_id: UUID;
  event_type: string;
  processed_at: UtcIsoTimestamp;
  result: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  error_details?: string | null;
}
