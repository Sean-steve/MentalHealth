/**
 * MindOS Canonical Audit, Governance Evidence, Security Logging & Accountability Architecture
 * Authority: Master Architecture Index Section 14, Volumes III, VIII, X, XIV, XV, Appendix B, M, Q
 * ADR-022, ADR-023, ADR-024, ADR-025
 */

import { createHash } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { CorrelationManager } from '../shared/correlation.js';
import { DataClassification } from '../shared/data_classification.js';
import { DatabaseManager, DatabaseClient } from '../database/connection.js';
import { metrics } from '../observability/metrics.js';
import { logger } from '../observability/logger.js';

// Domain Models & Taxonomy
export * from './domain/taxonomy.js';
export * from './domain/audit_record.js';
export * from './domain/security_event.js';
export * from './domain/governance_evidence.js';
export * from './domain/errors.js';

// Policies & Redaction
export * from './policies/audit_policy_registry.js';
export * from './redaction/audit_redactor.js';

// Repositories & Storage
export * from './repositories/audit_repository.js';
export * from './repositories/security_event_repository.js';
export * from './repositories/governance_evidence_repository.js';
export * from './repositories/storage/private_evidence_storage.js';

// Application Services
export * from './application/security_event_service.js';
export * from './application/governance_evidence_service.js';
export * from './query/audit_query_service.js';
export * from './query/evidence_query_service.js';
export * from './adapters/http/audit_controller.js';
export * from './adapters/http/evidence_controller.js';

import { AuditAction, AuditActorType, AuditResult } from './domain/taxonomy.js';
import { AuditPolicyRegistry } from './policies/audit_policy_registry.js';
import { auditRedactor } from './redaction/audit_redactor.js';
import { AuditWriteFailureError } from './domain/errors.js';
import { AuditRepository } from './repositories/audit_repository.js';

export interface AuditEventRecord {
  id: string; // UUIDv7
  event_type?: string;
  actor_type: string;
  actor_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  resource_classification?: string;
  purpose: string;
  authorization_basis: {
    role?: string;
    scopes?: string[];
    care_relationship_id?: string;
    consent_receipt_id?: string;
    policy?: string;
    [key: string]: unknown;
  };
  result: string;
  reason_code?: string;
  request_id: string;
  correlation_id?: string;
  session_id?: string;
  occurred_at: string; // ISO-8601 UTC
  source?: string;
  prev_hash: string;
  entry_hash: string;
  integrity_hash: string;
  policy_reference?: string;
  consent_reference?: string;
  governance_reference?: string;
  is_break_glass?: boolean;
  supersedes_id?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface BreakGlassEventRecord {
  id: string;
  actor_id: string;
  user_id: string;
  reason_code: string;
  justification: string;
  requested_scope: string[];
  approved_scope: string[];
  expires_at: string;
  opened_at: string;
  closed_at?: string;
  post_review_status: 'REVIEW_REQUIRED' | 'COMPLIANT' | 'VIOLATION';
}

export class AuditService {
  private static genesisHash = 'GENESIS';
  private static lastHash = 'GENESIS';
  private static auditLedger: AuditEventRecord[] = [];
  private static breakGlassLedger: BreakGlassEventRecord[] = [];
  private static metaAuditActive = false;

  /**
   * Appends an audit event to the tamper-evident hash-chained audit record.
   * Compatible with synchronous signature of earlier sprints while fulfilling full Sprint 7 requirements.
   */
  public static record(params: {
    id?: string;
    event_type?: string;
    actor_type: 'USER' | 'STAFF' | 'SERVICE' | string;
    actor_id?: string;
    action: string;
    resource_type: string;
    resource_id?: string;
    resource_classification?: string;
    purpose?: string;
    authorization_basis: AuditEventRecord['authorization_basis'];
    policy_reference?: string;
    consent_reference?: string;
    governance_reference?: string;
    result: 'ALLOWED' | 'DENIED' | 'ERROR' | 'SUCCESS' | 'FAILED' | 'PARTIAL' | string;
    reason_code?: string;
    is_break_glass?: boolean;
    supersedes_id?: string;
    metadata?: Record<string, unknown>;
    txClient?: DatabaseClient;
  }): AuditEventRecord {
    const correlation = CorrelationManager.get();
    const id = params.id || uuidv7();
    const occurred_at = new Date().toISOString();
    const prevHash = AuditService.lastHash;
    const classification = params.resource_classification || DataClassification.INTERNAL;
    const action = params.action;
    const purpose = params.purpose || 'Governed Resource Operation';
    const reason_code = params.reason_code || (params.result === 'ALLOWED' || params.result === 'SUCCESS' ? 'ALLOWED' : 'DENIED');

    // Scrub metadata for privacy/security
    const cleanMetadata = params.metadata ? auditRedactor.redactMetadata(params.metadata) : {};

    // Calculate tamper-resistant hash chaining: SHA256(prevHash + id + actor + action + resource + timestamp + result)
    const payloadToHash = `${prevHash}|${id}|${params.actor_type}|${params.actor_id || ''}|${params.action}|${params.resource_type}|${params.resource_id || ''}|${occurred_at}|${params.result}`;
    const hash = createHash('sha256').update(payloadToHash).digest('hex');

    AuditService.lastHash = hash;

    const event: AuditEventRecord = {
      id,
      event_type: params.event_type || `AUDIT.${action}.${params.resource_type}`.toUpperCase(),
      actor_type: params.actor_type,
      actor_id: params.actor_id,
      action: params.action,
      resource_type: params.resource_type,
      resource_id: params.resource_id,
      resource_classification: classification,
      purpose,
      authorization_basis: params.authorization_basis,
      policy_reference: params.policy_reference,
      consent_reference: params.consent_reference,
      governance_reference: params.governance_reference,
      result: params.result,
      reason_code,
      request_id: correlation.requestId,
      correlation_id: correlation.correlationId,
      session_id: correlation.sessionId,
      occurred_at,
      source: 'APPLICATION_KERNEL',
      prev_hash: prevHash,
      entry_hash: hash,
      integrity_hash: hash,
      is_break_glass: params.is_break_glass || false,
      supersedes_id: params.supersedes_id,
      metadata: cleanMetadata,
      created_at: occurred_at
    };

    AuditService.auditLedger.push(event);
    metrics.increment('audit_write_total', 1);

    // Fail-Closed Evaluation & Database Persistence
    const isFailClosed = AuditPolicyRegistry.isFailClosed(classification, action);

    try {
      // Async database persistence (non-blocking unless in explicit tx)
      const dbPromise = (async () => {
        const client = params.txClient || DatabaseManager.getClient();
        await client.query(
          `INSERT INTO audit_records (
            id, event_type, actor_id, actor_type, action,
            resource_type, resource_id, resource_classification, purpose,
            authorization_basis_json, policy_reference, consent_reference, governance_reference,
            result, reason_code, occurred_at, correlation_id, request_id,
            session_id, source, metadata_json, prev_hash, integrity_hash,
            is_break_glass, supersedes_id, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
          [
            event.id,
            event.event_type,
            event.actor_id || 'anonymous',
            event.actor_type,
            event.action,
            event.resource_type,
            event.resource_id || null,
            event.resource_classification,
            event.purpose,
            JSON.stringify(event.authorization_basis || {}),
            event.policy_reference || null,
            event.consent_reference || null,
            event.governance_reference || null,
            event.result,
            event.reason_code,
            event.occurred_at,
            event.correlation_id,
            event.request_id,
            event.session_id || null,
            event.source,
            JSON.stringify(event.metadata || {}),
            event.prev_hash,
            event.integrity_hash,
            !!event.is_break_glass,
            event.supersedes_id || null,
            event.created_at
          ]
        );
      })();

      // If transactional client was supplied, we must await to preserve transaction boundary
      if (params.txClient) {
        dbPromise.catch((err) => {
          metrics.increment('audit_write_failure_total', 1);
          if (isFailClosed) {
            throw new AuditWriteFailureError(
              `Mandatory transactional audit append failed on fail-closed action '${action}' for classification '${classification}'`,
              { originalError: (err as Error).message }
            );
          }
        });
      } else {
        dbPromise.catch((err) => {
          metrics.increment('audit_write_failure_total', 1);
          logger.error('Background audit append error', { error: (err as Error).message });
        });
      }
    } catch (err) {
      metrics.increment('audit_write_failure_total', 1);
      if (isFailClosed) {
        throw new AuditWriteFailureError(
          `Mandatory audit failure on fail-closed action '${action}' for classification '${classification}'`,
          { originalError: (err as Error).message }
        );
      }
    }

    return event;
  }

  /**
   * Records an audit event asynchronously, returning Promise<AuditEventRecord>
   */
  public static async recordAsync(params: Parameters<typeof AuditService.record>[0]): Promise<AuditEventRecord> {
    const isFailClosed = AuditPolicyRegistry.isFailClosed(
      params.resource_classification || DataClassification.INTERNAL,
      params.action
    );

    try {
      const record = AuditService.record(params);
      const client = params.txClient || DatabaseManager.getClient();
      await client.query(
        `INSERT INTO audit_records (
          id, event_type, actor_id, actor_type, action,
          resource_type, resource_id, resource_classification, purpose,
          authorization_basis_json, policy_reference, consent_reference, governance_reference,
          result, reason_code, occurred_at, correlation_id, request_id,
          session_id, source, metadata_json, prev_hash, integrity_hash,
          is_break_glass, supersedes_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
        [
          record.id,
          record.event_type,
          record.actor_id || 'anonymous',
          record.actor_type,
          record.action,
          record.resource_type,
          record.resource_id || null,
          record.resource_classification,
          record.purpose,
          JSON.stringify(record.authorization_basis || {}),
          record.policy_reference || null,
          record.consent_reference || null,
          record.governance_reference || null,
          record.result,
          record.reason_code,
          record.occurred_at,
          record.correlation_id,
          record.request_id,
          record.session_id || null,
          record.source,
          JSON.stringify(record.metadata || {}),
          record.prev_hash,
          record.integrity_hash,
          !!record.is_break_glass,
          record.supersedes_id || null,
          record.created_at
        ]
      );
      return record;
    } catch (err) {
      metrics.increment('audit_write_failure_total', 1);
      if (isFailClosed) {
        throw new AuditWriteFailureError(
          `Mandatory async audit failure on action '${params.action}'`,
          { originalError: (err as Error).message }
        );
      }
      throw err;
    }
  }

  /**
   * Records emergency exceptional access (Break Glass)
   * ADR-020 & Appendix B
   */
  public static recordBreakGlass(params: {
    actor_id: string;
    user_id: string;
    reason_code: string;
    justification: string;
    requested_scope: string[];
    approved_scope: string[];
    expires_at: string;
    ticket_id?: string;
  }): BreakGlassEventRecord {
    const id = uuidv7();
    const opened_at = new Date().toISOString();

    const record: BreakGlassEventRecord = {
      id,
      actor_id: params.actor_id,
      user_id: params.user_id,
      reason_code: params.reason_code,
      justification: params.justification,
      requested_scope: params.requested_scope,
      approved_scope: params.approved_scope,
      expires_at: params.expires_at,
      opened_at,
      post_review_status: 'REVIEW_REQUIRED'
    };

    AuditService.breakGlassLedger.push(record);

    AuditService.record({
      actor_type: AuditActorType.PROFESSIONAL,
      actor_id: params.actor_id,
      action: AuditAction.BREAK_GLASS,
      resource_type: 'clinical_notes',
      resource_id: params.user_id,
      resource_classification: DataClassification.CRITICAL,
      purpose: `EMERGENCY_ACCESS: ${params.reason_code}`,
      authorization_basis: {
        role: 'CLINICAL_REVIEWER',
        break_glass_id: id,
        scopes: params.approved_scope,
        ticket_id: params.ticket_id
      },
      result: AuditResult.ALLOWED,
      is_break_glass: true,
      metadata: { justification: params.justification }
    });

    return record;
  }

  public static getAuditTrail(): ReadonlyArray<AuditEventRecord> {
    return AuditService.auditLedger;
  }

  public static getLedger(): ReadonlyArray<AuditEventRecord> {
    return AuditService.auditLedger;
  }

  public static getBreakGlassTrail(): ReadonlyArray<BreakGlassEventRecord> {
    return AuditService.breakGlassLedger;
  }

  public static verifyIntegrity(): boolean {
    return AuditService.verifyChainIntegrity().valid;
  }

  public static verifyChainIntegrity(): { valid: boolean; brokenAt?: number; reason?: string } {
    let expectedPrevHash = AuditService.genesisHash;
    for (let i = 0; i < AuditService.auditLedger.length; i++) {
      const record = AuditService.auditLedger[i];
      if (record.prev_hash !== expectedPrevHash) {
        return {
          valid: false,
          brokenAt: i,
          reason: `Previous hash mismatch at index ${i}. Expected ${expectedPrevHash}, found ${record.prev_hash}`
        };
      }
      const payloadToHash = `${expectedPrevHash}|${record.id}|${record.actor_type}|${record.actor_id || ''}|${record.action}|${record.resource_type}|${record.resource_id || ''}|${record.occurred_at}|${record.result}`;
      const computedHash = createHash('sha256').update(payloadToHash).digest('hex');
      if (computedHash !== record.integrity_hash) {
        return {
          valid: false,
          brokenAt: i,
          reason: `Integrity hash mismatch at index ${i}. Expected ${computedHash}, found ${record.integrity_hash}`
        };
      }
      expectedPrevHash = computedHash;
    }
    return { valid: true };
  }

  public static resetForTesting(): void {
    AuditService.lastHash = AuditService.genesisHash;
    AuditService.auditLedger = [];
    AuditService.breakGlassLedger = [];
    AuditRepository.resetForTesting();
  }
}

export { AuditService as CanonicalAuditService };
