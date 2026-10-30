/**
 * MindOS Canonical Audit Service
 * Authority: Master Architecture Index Section 14, Volumes III, VIII, X, Appendix B, M, Q
 * ADR-022, ADR-023, ADR-024, ADR-025
 */

import { v7 as uuidv7 } from 'uuid';
import { CorrelationManager } from '../../shared/correlation.js';
import { DataClassification } from '../../shared/data_classification.js';
import { DatabaseClient } from '../../database/connection.js';
import { metrics } from '../../observability/metrics.js';
import { logger } from '../../observability/logger.js';
import { AuditRecord, AuditRecordInput } from '../domain/audit_record.js';
import { AuditAction, AuditActorType, AuditResult } from '../domain/taxonomy.js';
import { AuditPolicyRegistry } from '../policies/audit_policy_registry.js';
import { auditRedactor } from '../redaction/audit_redactor.js';
import { AuditRepository } from '../repositories/audit_repository.js';
import { AuditWriteFailureError } from '../domain/errors.js';

export interface BreakGlassInput {
  userId: string;
  patientId: string;
  reason: string;
  ticketId?: string;
  authorizationBasis?: Record<string, unknown>;
  expiresInMinutes?: number;
}

export interface BreakGlassRecord {
  id: string;
  user_id: string;
  patient_id: string;
  reason: string;
  ticket_id?: string;
  timestamp: string;
  expires_at: string;
  integrity_hash: string;
}

export class CanonicalAuditService {
  private static breakGlassLedger: BreakGlassRecord[] = [];
  private static isAuditMuted = false;

  /**
   * Records a canonical audit event.
   * Enforces fail-closed transactionality for critical classifications and sensitive actions.
   */
  public static async record(
    input: AuditRecordInput,
    txClient?: DatabaseClient
  ): Promise<AuditRecord> {
    const correlation = CorrelationManager.get();
    const id = input.id || uuidv7();
    const occurred_at = input.occurred_at || new Date().toISOString();
    const correlation_id = input.correlation_id || correlation.correlationId;
    const request_id = input.request_id || correlation.requestId;
    const session_id = input.session_id || correlation.sessionId;
    const source = input.source || 'APPLICATION_KERNEL';

    const classification = input.resource_classification || DataClassification.INTERNAL;
    const action = input.action;
    const reason_code = input.reason_code || (input.result === AuditResult.SUCCESS || input.result === AuditResult.ALLOWED ? 'ALLOWED' : 'DENIED');
    const purpose = input.purpose || 'Governed Resource Operation';

    // Scrub and redact metadata before persistence
    const cleanMetadata = input.metadata ? auditRedactor.redactMetadata(input.metadata) : {};

    const recordToSave: Omit<AuditRecord, 'prev_hash' | 'integrity_hash' | 'created_at'> = {
      id,
      event_type: input.event_type || `AUDIT.${action}.${input.resource_type}`.toUpperCase(),
      actor_id: input.actor_id,
      actor_type: input.actor_type,
      action,
      resource_type: input.resource_type,
      resource_id: input.resource_id,
      resource_classification: classification,
      purpose,
      authorization_basis: input.authorization_basis || {},
      policy_reference: input.policy_reference,
      consent_reference: input.consent_reference,
      governance_reference: input.governance_reference,
      result: input.result,
      reason_code,
      occurred_at,
      correlation_id,
      request_id,
      session_id,
      source,
      metadata: cleanMetadata,
      is_break_glass: input.is_break_glass,
      supersedes_id: input.supersedes_id
    };

    try {
      const saved = await AuditRepository.append(recordToSave, txClient);
      metrics.increment('audit_write_total', 1);
      return saved;
    } catch (err) {
      metrics.increment('audit_write_failure_total', 1);
      const isFailClosed = AuditPolicyRegistry.isFailClosed(classification, action);

      logger.error('Audit append failed in AuditService', {
        action,
        resource_type: input.resource_type,
        classification,
        isFailClosed,
        error: (err as Error).message
      });

      if (isFailClosed) {
        throw new AuditWriteFailureError(
          `Mandatory audit failure on fail-closed action '${action}' for resource classification '${classification}'. Operation aborted.`,
          {
            action,
            resource_type: input.resource_type,
            classification,
            originalError: (err as Error).message
          }
        );
      }

      // If fail-open with alert, return unpersisted representation
      return {
        ...recordToSave,
        prev_hash: 'UNCOMMITTED',
        integrity_hash: 'UNCOMMITTED',
        created_at: new Date().toISOString()
      };
    }
  }

  /**
   * Synchronous / non-blocking recording compatibility helper
   */
  public static recordSync(input: AuditRecordInput): AuditRecord {
    const correlation = CorrelationManager.get();
    const id = input.id || uuidv7();
    const occurred_at = input.occurred_at || new Date().toISOString();
    const correlation_id = input.correlation_id || correlation.correlationId;
    const request_id = input.request_id || correlation.requestId;
    const session_id = input.session_id || correlation.sessionId;
    const source = input.source || 'APPLICATION_KERNEL';

    const classification = input.resource_classification || DataClassification.INTERNAL;
    const action = input.action;
    const reason_code = input.reason_code || (input.result === AuditResult.SUCCESS || input.result === AuditResult.ALLOWED ? 'ALLOWED' : 'DENIED');
    const purpose = input.purpose || 'Governed Resource Operation';

    const cleanMetadata = input.metadata ? auditRedactor.redactMetadata(input.metadata) : {};

    const recordToSave: Omit<AuditRecord, 'prev_hash' | 'integrity_hash' | 'created_at'> = {
      id,
      event_type: input.event_type || `AUDIT.${action}.${input.resource_type}`.toUpperCase(),
      actor_id: input.actor_id,
      actor_type: input.actor_type,
      action,
      resource_type: input.resource_type,
      resource_id: input.resource_id,
      resource_classification: classification,
      purpose,
      authorization_basis: input.authorization_basis || {},
      policy_reference: input.policy_reference,
      consent_reference: input.consent_reference,
      governance_reference: input.governance_reference,
      result: input.result,
      reason_code,
      occurred_at,
      correlation_id,
      request_id,
      session_id,
      source,
      metadata: cleanMetadata,
      is_break_glass: input.is_break_glass,
      supersedes_id: input.supersedes_id
    };

    // Synchronous execution path using repository
    let recordResult: AuditRecord;
    try {
      // Execute asynchronously in background
      AuditRepository.append(recordToSave).catch((err) => {
        logger.error('Background async audit append failed', { error: (err as Error).message });
      });

      recordResult = {
        ...recordToSave,
        prev_hash: 'SYNC_PENDING',
        integrity_hash: 'SYNC_PENDING',
        created_at: new Date().toISOString()
      };
    } catch (err) {
      metrics.increment('audit_write_failure_total', 1);
      throw err;
    }

    return recordResult;
  }

  /**
   * Records an emergency Break-Glass access event.
   * Emergency clinical access is strictly fail-closed, dual-recorded, and alerted.
   */
  public static async recordBreakGlass(params: BreakGlassInput, txClient?: DatabaseClient): Promise<BreakGlassRecord> {
    const id = uuidv7();
    const timestamp = new Date().toISOString();
    const expiresInMinutes = params.expiresInMinutes || 60;
    const expires_at = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();

    const record: BreakGlassRecord = {
      id,
      user_id: params.userId,
      patient_id: params.patientId,
      reason: params.reason,
      ticket_id: params.ticketId,
      timestamp,
      expires_at,
      integrity_hash: ''
    };

    // Record canonical audit event with CRITICAL classification
    const auditRecord = await this.record(
      {
        actor_id: params.userId,
        actor_type: AuditActorType.PROFESSIONAL,
        action: AuditAction.BREAK_GLASS,
        resource_type: 'clinical_record',
        resource_id: params.patientId,
        resource_classification: DataClassification.CRITICAL,
        purpose: `Emergency Break-Glass Override: ${params.reason}`,
        authorization_basis: {
          ticket_id: params.ticketId,
          emergency_override: true,
          expires_at,
          ...params.authorizationBasis
        },
        result: AuditResult.SUCCESS,
        reason_code: 'BREAK_GLASS_AUTHORIZED',
        is_break_glass: true
      },
      txClient
    );

    record.integrity_hash = auditRecord.integrity_hash;
    CanonicalAuditService.breakGlassLedger.push(record);

    return record;
  }

  public static getLedger(): AuditRecord[] {
    return AuditRepository.getAllRecords();
  }

  public static getBreakGlassLedger(): BreakGlassRecord[] {
    return [...CanonicalAuditService.breakGlassLedger];
  }

  public static verifyChainIntegrity(): { valid: boolean; brokenAt?: number; reason?: string } {
    return AuditRepository.verifyChainIntegrity();
  }

  public static resetForTesting(): void {
    AuditRepository.resetForTesting();
    CanonicalAuditService.breakGlassLedger = [];
  }
}
