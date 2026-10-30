/**
 * MindOS Canonical Audit Record Domain Model
 * Authority: Master Architecture Index Section 14, Volumes III, VIII, X, Appendix B & M
 * ADR-022, ADR-023, ADR-024
 */

import { createHash } from 'node:crypto';
import { DataClassification } from '../../shared/data_classification.js';
import { AuditAction, AuditActorType, AuditResult } from './taxonomy.js';

export interface AuditRecord {
  id: string;
  event_type: string;
  actor_id: string;
  actor_type: AuditActorType | string;
  action: AuditAction | string;
  resource_type: string;
  resource_id?: string;
  resource_classification: DataClassification | string;
  purpose: string;
  authorization_basis: Record<string, unknown>;
  policy_reference?: string;
  consent_reference?: string;
  governance_reference?: string;
  result: AuditResult | string;
  reason_code: string;
  occurred_at: string;
  correlation_id: string;
  request_id: string;
  session_id?: string;
  source: string;
  metadata: Record<string, unknown>;
  prev_hash: string;
  integrity_hash: string;
  is_break_glass?: boolean;
  supersedes_id?: string;
  created_at: string;
}

export interface AuditRecordInput {
  id?: string;
  event_type?: string;
  actor_id: string;
  actor_type: AuditActorType | string;
  action: AuditAction | string;
  resource_type: string;
  resource_id?: string;
  resource_classification?: DataClassification | string;
  purpose?: string;
  authorization_basis?: Record<string, unknown>;
  policy_reference?: string;
  consent_reference?: string;
  governance_reference?: string;
  result: AuditResult | string;
  reason_code?: string;
  occurred_at?: string;
  correlation_id?: string;
  request_id?: string;
  session_id?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  is_break_glass?: boolean;
  supersedes_id?: string;
}

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Computes deterministic SHA-256 integrity hash for an audit record linked to the previous record hash.
 */
export function computeAuditRecordHash(
  prevHash: string,
  record: {
    id: string;
    actor_type: string;
    actor_id: string;
    action: string;
    resource_type: string;
    resource_id?: string;
    occurred_at: string;
    result: string;
    reason_code?: string;
    purpose?: string;
  }
): string {
  const payload = [
    prevHash,
    record.id,
    record.actor_type,
    record.actor_id,
    record.action,
    record.resource_type,
    record.resource_id || '',
    record.occurred_at,
    record.result,
    record.reason_code || '',
    record.purpose || ''
  ].join('|');

  return createHash('sha256').update(payload, 'utf8').digest('hex');
}
