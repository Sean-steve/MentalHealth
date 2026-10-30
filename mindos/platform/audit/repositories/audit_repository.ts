/**
 * MindOS Canonical Audit Repository
 * Authority: Master Architecture Index Section 14, Volumes III, VIII, X, Appendix B & M
 * ADR-023 (Append-Oriented Immutability)
 */

import { DatabaseManager, DatabaseClient } from '../../database/connection.js';
import { AuditRecord, GENESIS_HASH, computeAuditRecordHash } from '../domain/audit_record.js';
import { AuditTamperDetectedError } from '../domain/errors.js';

export interface AuditQueryFilter {
  actor_id?: string;
  actor_type?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  resource_classification?: string;
  result?: string;
  correlation_id?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

export class AuditRepository {
  private static inMemoryChain: AuditRecord[] = [];
  private static lastHash = GENESIS_HASH;

  /**
   * Appends an audit record to the ledger.
   * Atomically computes tamper-evident hash chain linked to the previous record.
   */
  public static async append(
    record: Omit<AuditRecord, 'prev_hash' | 'integrity_hash' | 'created_at'>,
    txClient?: DatabaseClient
  ): Promise<AuditRecord> {
    const prevHash = AuditRepository.lastHash;
    const integrityHash = computeAuditRecordHash(prevHash, {
      id: record.id,
      actor_type: record.actor_type,
      actor_id: record.actor_id,
      action: record.action,
      resource_type: record.resource_type,
      resource_id: record.resource_id,
      occurred_at: record.occurred_at,
      result: record.result,
      reason_code: record.reason_code,
      purpose: record.purpose
    });

    const fullRecord: AuditRecord = {
      ...record,
      prev_hash: prevHash,
      integrity_hash: integrityHash,
      created_at: new Date().toISOString()
    };

    const client = txClient || DatabaseManager.getClient();

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
        fullRecord.id,
        fullRecord.event_type,
        fullRecord.actor_id,
        fullRecord.actor_type,
        fullRecord.action,
        fullRecord.resource_type,
        fullRecord.resource_id || null,
        fullRecord.resource_classification,
        fullRecord.purpose,
        JSON.stringify(fullRecord.authorization_basis || {}),
        fullRecord.policy_reference || null,
        fullRecord.consent_reference || null,
        fullRecord.governance_reference || null,
        fullRecord.result,
        fullRecord.reason_code,
        fullRecord.occurred_at,
        fullRecord.correlation_id,
        fullRecord.request_id,
        fullRecord.session_id || null,
        fullRecord.source,
        JSON.stringify(fullRecord.metadata || {}),
        fullRecord.prev_hash,
        fullRecord.integrity_hash,
        !!fullRecord.is_break_glass,
        fullRecord.supersedes_id || null,
        fullRecord.created_at
      ]
    );

    // Update in-memory chain state
    AuditRepository.lastHash = integrityHash;
    AuditRepository.inMemoryChain.push(fullRecord);

    return fullRecord;
  }

  public static async findById(id: string): Promise<AuditRecord | null> {
    const memory = AuditRepository.inMemoryChain.find((r) => r.id === id);
    if (memory) return memory;

    const client = DatabaseManager.getClient();
    const rows = await client.query<Record<string, unknown>>(
      'SELECT * FROM audit_records WHERE id = $1',
      [id]
    );
    if (!rows || rows.length === 0) return null;
    return AuditRepository.mapRowToRecord(rows[0]);
  }

  public static async query(filter: AuditQueryFilter): Promise<{ records: AuditRecord[]; total: number }> {
    let list = [...AuditRepository.inMemoryChain];

    if (filter.actor_id) {
      list = list.filter((r) => r.actor_id === filter.actor_id);
    }
    if (filter.actor_type) {
      list = list.filter((r) => r.actor_type === filter.actor_type);
    }
    if (filter.action) {
      list = list.filter((r) => r.action === filter.action);
    }
    if (filter.resource_type) {
      list = list.filter((r) => r.resource_type === filter.resource_type);
    }
    if (filter.resource_id) {
      list = list.filter((r) => r.resource_id === filter.resource_id);
    }
    if (filter.resource_classification) {
      list = list.filter((r) => r.resource_classification === filter.resource_classification);
    }
    if (filter.result) {
      list = list.filter((r) => r.result === filter.result);
    }
    if (filter.correlation_id) {
      list = list.filter((r) => r.correlation_id === filter.correlation_id);
    }
    if (filter.from_date) {
      const from = new Date(filter.from_date).getTime();
      list = list.filter((r) => new Date(r.occurred_at).getTime() >= from);
    }
    if (filter.to_date) {
      const to = new Date(filter.to_date).getTime();
      list = list.filter((r) => new Date(r.occurred_at).getTime() <= to);
    }

    const total = list.length;
    const offset = filter.offset || 0;
    const limit = filter.limit !== undefined ? filter.limit : 50;
    const paginated = list.slice(offset, offset + limit);

    return { records: paginated, total };
  }

  public static getAllRecords(): AuditRecord[] {
    return [...AuditRepository.inMemoryChain];
  }

  public static verifyChainIntegrity(): { valid: boolean; brokenAt?: number; reason?: string } {
    let expectedPrevHash = GENESIS_HASH;

    for (let i = 0; i < AuditRepository.inMemoryChain.length; i++) {
      const record = AuditRepository.inMemoryChain[i];

      if (record.prev_hash !== expectedPrevHash) {
        return {
          valid: false,
          brokenAt: i,
          reason: `Previous hash mismatch at index ${i}. Expected ${expectedPrevHash}, found ${record.prev_hash}`
        };
      }

      const calculated = computeAuditRecordHash(expectedPrevHash, {
        id: record.id,
        actor_type: record.actor_type,
        actor_id: record.actor_id,
        action: record.action,
        resource_type: record.resource_type,
        resource_id: record.resource_id,
        occurred_at: record.occurred_at,
        result: record.result,
        reason_code: record.reason_code,
        purpose: record.purpose
      });

      if (record.integrity_hash !== calculated) {
        return {
          valid: false,
          brokenAt: i,
          reason: `Integrity hash mismatch at index ${i}. Expected ${calculated}, found ${record.integrity_hash}`
        };
      }

      expectedPrevHash = record.integrity_hash;
    }

    return { valid: true };
  }

  public static resetForTesting(): void {
    AuditRepository.inMemoryChain = [];
    AuditRepository.lastHash = GENESIS_HASH;
  }

  private static mapRowToRecord(row: Record<string, unknown>): AuditRecord {
    return {
      id: String(row.id),
      event_type: String(row.event_type || ''),
      actor_id: String(row.actor_id),
      actor_type: String(row.actor_type),
      action: String(row.action),
      resource_type: String(row.resource_type),
      resource_id: row.resource_id ? String(row.resource_id) : undefined,
      resource_classification: String(row.resource_classification || 'INTERNAL'),
      purpose: String(row.purpose || ''),
      authorization_basis: typeof row.authorization_basis_json === 'string' ? JSON.parse(row.authorization_basis_json) : (row.authorization_basis_json as Record<string, unknown>) || {},
      policy_reference: row.policy_reference ? String(row.policy_reference) : undefined,
      consent_reference: row.consent_reference ? String(row.consent_reference) : undefined,
      governance_reference: row.governance_reference ? String(row.governance_reference) : undefined,
      result: String(row.result),
      reason_code: String(row.reason_code || ''),
      occurred_at: String(row.occurred_at),
      correlation_id: String(row.correlation_id),
      request_id: String(row.request_id),
      session_id: row.session_id ? String(row.session_id) : undefined,
      source: String(row.source || 'SYSTEM'),
      metadata: typeof row.metadata_json === 'string' ? JSON.parse(row.metadata_json) : (row.metadata_json as Record<string, unknown>) || {},
      prev_hash: String(row.prev_hash),
      integrity_hash: String(row.integrity_hash),
      is_break_glass: Boolean(row.is_break_glass),
      supersedes_id: row.supersedes_id ? String(row.supersedes_id) : undefined,
      created_at: String(row.created_at)
    };
  }
}
