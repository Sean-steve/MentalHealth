/**
 * MindOS Canonical Transactional Outbox Types
 * Authority: Master Architecture Index Section 12, Volume IX & Appendix E & ADR-007
 */

import { UUID, UtcIsoTimestamp } from '../types.js';

export enum OutboxStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER'
}

export interface OutboxEventRow {
  id: UUID;
  event_id?: UUID;
  event_type: string;
  schema_version: number;
  aggregate_type: string;
  aggregate_id: string;
  payload: string | Record<string, unknown>; // JSON string or object
  metadata: string | Record<string, unknown>; // JSON string or object
  classification?: string;
  occurred_at: UtcIsoTimestamp;
  available_at?: UtcIsoTimestamp;
  published_at?: UtcIsoTimestamp | null;
  attempt_count: number;
  last_attempt_at?: UtcIsoTimestamp | null;
  last_error_code?: string | null;
  last_error?: string | null;
  correlation_id?: string;
  causation_id?: string;
  priority?: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
  created_at?: UtcIsoTimestamp;
  status: OutboxStatus;
}
