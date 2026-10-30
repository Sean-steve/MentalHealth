/**
 * MindOS Canonical Security Event Domain Model
 * Authority: Master Architecture Index Section 14, Volumes III, VIII, X, Appendix M
 * ADR-022, ADR-024
 */

import { SecurityEventCategory, SecurityEventSeverity } from './taxonomy.js';

export interface SecurityEvent {
  id: string;
  category: SecurityEventCategory | string;
  severity: SecurityEventSeverity | string;
  actor_reference?: string;
  account_reference?: string;
  source: string;
  occurred_at: string;
  correlation_id: string;
  signal: string;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SecurityEventInput {
  id?: string;
  category: SecurityEventCategory | string;
  severity: SecurityEventSeverity | string;
  actor_reference?: string;
  account_reference?: string;
  source?: string;
  occurred_at?: string;
  correlation_id?: string;
  signal: string;
  status?: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';
  metadata?: Record<string, unknown>;
}
