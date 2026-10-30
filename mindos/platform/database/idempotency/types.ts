/**
 * MindOS Idempotency Foundation Types
 * Authority: Master Architecture Index Section 8, Volume III & API Catalog
 */

import { UUID, UtcIsoTimestamp } from '../types.js';

export enum IdempotencyStatus {
  STARTED = 'STARTED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export interface IdempotencyRecord {
  id: UUID;
  idempotency_key: string;
  scope: string; // e.g. 'appointments:booking', 'billing:payment'
  request_hash: string;
  response_status?: number;
  response_body?: string; // JSON
  status: IdempotencyStatus;
  expires_at: UtcIsoTimestamp;
  created_at: UtcIsoTimestamp;
}
