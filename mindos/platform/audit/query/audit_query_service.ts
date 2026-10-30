/**
 * MindOS Canonical Audit Query Engine & "Audit the Audit" Architecture
 * Authority: Master Architecture Index Section 14, Volumes III, VIII, X, Appendix M
 * ADR-022
 */

import { createHash } from 'node:crypto';
import { DataClassification } from '../../shared/data_classification.js';
import { metrics } from '../../observability/metrics.js';
import { AuditRecord } from '../domain/audit_record.js';
import { AuditAction, AuditActorType, AuditResult } from '../domain/taxonomy.js';
import { AuditAccessDeniedError } from '../domain/errors.js';
import { AuditQueryFilter, AuditRepository } from '../repositories/audit_repository.js';
import { CanonicalAuditService } from '../application/audit_service.js';

export interface AuditQueryRequest {
  actor: {
    actor_id: string;
    roles: string[];
  };
  purpose: string;
  filter: AuditQueryFilter;
  isMetaQuery?: boolean; // Set to true to prevent recursive meta-auditing
}

export interface AuditExportRequest {
  actor: {
    actor_id: string;
    roles: string[];
  };
  purpose: string;
  format: 'JSON' | 'CSV';
  filter: AuditQueryFilter;
}

export const AUTHORIZED_AUDIT_ROLES = new Set([
  'AUDITOR',
  'ADMINISTRATOR',
  'ADMIN',
  'PRIVACY_OFFICER',
  'SECURITY_REVIEWER',
  'CLINICAL_REVIEWER'
]);

export class AuditQueryService {
  /**
   * Performs an authorized audit record query.
   * Mandates:
   * 1. Authorization check: Actor must have an authorized audit review role.
   * 2. Purpose specification: Every audit inspection requires an explicit purpose.
   * 3. Meta-Audit ("Audit the Audit"): Reading audit logs generates an audit entry,
   *    safeguarded with recursion prevention.
   */
  public static async query(request: AuditQueryRequest): Promise<{ records: AuditRecord[]; total: number }> {
    // 1. Authorization check
    const hasRole = request.actor.roles.some((r) => AUTHORIZED_AUDIT_ROLES.has(r.toUpperCase()));
    if (!hasRole) {
      // Record failed access attempt in security log and audit trail
      await CanonicalAuditService.record({
        actor_id: request.actor.actor_id,
        actor_type: AuditActorType.USER,
        action: AuditAction.READ,
        resource_type: 'audit_records',
        resource_classification: DataClassification.CRITICAL,
        purpose: request.purpose || 'Unauthorized Audit Access Attempt',
        result: AuditResult.DENIED,
        reason_code: 'AUDIT_UNAUTHORIZED_ROLE'
      });

      throw new AuditAccessDeniedError(
        `Actor ${request.actor.actor_id} lacks required audit query role. Present: [${request.actor.roles.join(', ')}]`
      );
    }

    // 2. Purpose validation
    if (!request.purpose || request.purpose.trim().length < 5) {
      throw new AuditAccessDeniedError('A specific governance purpose (minimum 5 characters) is required to query audit logs.');
    }

    metrics.increment('audit_query_total', 1);

    // 3. Perform query
    const result = await AuditRepository.query(request.filter);

    // 4. "Audit the Audit" (Prevent infinite recursion)
    if (!request.isMetaQuery) {
      await CanonicalAuditService.record({
        actor_id: request.actor.actor_id,
        actor_type: AuditActorType.AUDITOR,
        action: AuditAction.READ,
        resource_type: 'audit_records',
        resource_classification: DataClassification.CRITICAL,
        purpose: request.purpose,
        authorization_basis: {
          roles: request.actor.roles,
          filter: request.filter
        },
        result: AuditResult.SUCCESS,
        reason_code: 'AUDIT_INSPECTION_AUTHORIZED',
        metadata: {
          records_returned: result.records.length,
          total_matched: result.total
        }
      });
    }

    return result;
  }

  /**
   * Exports audit logs with cryptographic hash integrity seal
   */
  public static async export(request: AuditExportRequest): Promise<{
    export_payload: string;
    checksum: string;
    format: string;
    record_count: number;
  }> {
    const queryResult = await this.query({
      actor: request.actor,
      purpose: request.purpose,
      filter: { ...request.filter, limit: 10000 },
      isMetaQuery: false
    });

    let payload = '';
    if (request.format === 'JSON') {
      payload = JSON.stringify(queryResult.records, null, 2);
    } else {
      // CSV format
      const headers = ['id', 'occurred_at', 'actor_id', 'actor_type', 'action', 'resource_type', 'resource_id', 'result', 'integrity_hash'];
      const rows = queryResult.records.map((r) => [
        r.id,
        r.occurred_at,
        r.actor_id,
        r.actor_type,
        r.action,
        r.resource_type,
        r.resource_id || '',
        r.result,
        r.integrity_hash
      ]);
      payload = [headers.join(','), ...rows.map((row) => row.map((val) => `"${val}"`).join(','))].join('\n');
    }

    const checksum = createHash('sha256').update(payload, 'utf8').digest('hex');

    // Audit the export action
    await CanonicalAuditService.record({
      actor_id: request.actor.actor_id,
      actor_type: AuditActorType.AUDITOR,
      action: AuditAction.EXPORT,
      resource_type: 'audit_records',
      resource_classification: DataClassification.CRITICAL,
      purpose: request.purpose,
      authorization_basis: {
        roles: request.actor.roles,
        format: request.format,
        checksum
      },
      result: AuditResult.SUCCESS,
      reason_code: 'AUDIT_EXPORT_COMPLETE',
      metadata: {
        record_count: queryResult.records.length,
        checksum
      }
    });

    return {
      export_payload: payload,
      checksum,
      format: request.format,
      record_count: queryResult.records.length
    };
  }
}
