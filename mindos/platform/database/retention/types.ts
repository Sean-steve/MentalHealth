/**
 * MindOS Retention Foundation Types
 * Authority: Master Architecture Index Section 8, Volume VIII & Appendix B / Q
 */

import { UUID, UtcIsoTimestamp, DeletionStrategy, DataLifecycleState } from '../types.js';

export interface RetentionPolicy {
  id: UUID;
  data_type: string;
  domain: string;
  retention_period_days: number; // 0 = transient, -1 = permanent / indefinite
  retention_action: DeletionStrategy;
  legal_basis: string; // e.g. "Kenya Health Act 2017, Sec 11", "Kenya Data Protection Act 2019, Sec 39"
  jurisdiction: string; // "KE", "GLOBAL"
  version: number;
  effective_at: UtcIsoTimestamp;
  description: string;
}

export interface DataLifecycleRecord {
  id: UUID;
  entity_type: string;
  entity_id: UUID;
  current_state: DataLifecycleState;
  retention_policy_id?: UUID;
  legal_hold_reason?: string;
  legal_hold_placed_by?: UUID;
  scheduled_deletion_at?: UtcIsoTimestamp;
  transitioned_at: UtcIsoTimestamp;
}
