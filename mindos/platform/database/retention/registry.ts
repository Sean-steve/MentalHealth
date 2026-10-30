/**
 * MindOS Canonical Retention Policy Registry & Lifecycle State Evaluator
 * Authority: Master Architecture Index Section 8, Volume VIII & Appendix B / Q
 */

import { RetentionPolicy, DataLifecycleRecord } from './types.js';
import { DeletionStrategy, DataLifecycleState, UUID } from '../types.js';
import { DomainInvariantError, SecurityError } from '../../errors/index.js';

export class RetentionRegistry {
  private static policies: Map<string, RetentionPolicy> = new Map();

  static {
    // 1. Clinical Records: Minimum 10 Years under Kenya Health Act 2017
    RetentionRegistry.register({
      id: 'ret-pol-clinical-001',
      data_type: 'clinical_notes',
      domain: 'care',
      retention_period_days: 3650, // 10 years
      retention_action: DeletionStrategy.RETAIN_REQUIRED,
      legal_basis: 'Kenya Health Act 2017 Section 11 & Medical Practitioners and Dentists Act',
      jurisdiction: 'KE',
      version: 1,
      effective_at: '2026-01-01T00:00:00Z',
      description: 'Statutory medical retention requirement for licensed clinical consultation records'
    });

    // 2. Financial Ledgers: 7 Years under Kenya Tax Procedures Act
    RetentionRegistry.register({
      id: 'ret-pol-finance-001',
      data_type: 'ledger_entries',
      domain: 'billing',
      retention_period_days: 2555, // 7 years
      retention_action: DeletionStrategy.RETAIN_REQUIRED,
      legal_basis: 'Kenya Tax Procedures Act 2015 & Companies Act 2015',
      jurisdiction: 'KE',
      version: 1,
      effective_at: '2026-01-01T00:00:00Z',
      description: 'Statutory accounting records retention'
    });

    // 3. User Journal Entries: User Controlled Deletion / Hard delete on request
    RetentionRegistry.register({
      id: 'ret-pol-journal-001',
      data_type: 'journal_entries',
      domain: 'care',
      retention_period_days: 730, // 2 years default active unless deleted by user
      retention_action: DeletionStrategy.HARD_DELETE,
      legal_basis: 'Kenya Data Protection Act 2019 Section 40 (Right to Erasure)',
      jurisdiction: 'KE',
      version: 1,
      effective_at: '2026-01-01T00:00:00Z',
      description: 'User-authored private reflections subject to absolute right to erasure'
    });

    // 4. Audit Trail: Indefinite / Immutable append-only
    RetentionRegistry.register({
      id: 'ret-pol-audit-001',
      data_type: 'audit_events',
      domain: 'audit',
      retention_period_days: -1, // Permanent
      retention_action: DeletionStrategy.RETAIN_REQUIRED,
      legal_basis: 'Regulatory Security Auditability Standard',
      jurisdiction: 'GLOBAL',
      version: 1,
      effective_at: '2026-01-01T00:00:00Z',
      description: 'Immutable regulatory audit log for all sensitive security and health data accesses'
    });

    // 5. Ephemeral IP & Auth Session Logs: 30 Days
    RetentionRegistry.register({
      id: 'ret-pol-auth-session-001',
      data_type: 'auth_sessions',
      domain: 'identity',
      retention_period_days: 30,
      retention_action: DeletionStrategy.HARD_DELETE,
      legal_basis: 'Data Minimization Standard (KDPA 2019 Sec 25)',
      jurisdiction: 'GLOBAL',
      version: 1,
      effective_at: '2026-01-01T00:00:00Z',
      description: 'Security session markers purged 30 days after expiration or revocation'
    });
  }

  public static register(policy: RetentionPolicy): void {
    const key = `${policy.domain}:${policy.data_type}`.toLowerCase();
    RetentionRegistry.policies.set(key, policy);
  }

  public static getPolicy(domain: string, dataType: string): RetentionPolicy | undefined {
    return RetentionRegistry.policies.get(`${domain}:${dataType}`.toLowerCase());
  }

  public static getAllPolicies(): RetentionPolicy[] {
    return Array.from(RetentionRegistry.policies.values());
  }

  /**
   * Validates whether a proposed data lifecycle transition is legally allowed
   */
  public static validateLifecycleTransition(
    currentRecord: DataLifecycleRecord,
    targetState: DataLifecycleState,
    actorId?: UUID
  ): void {
    // Invariant: LEGAL_HOLD strictly forbids transition to DELETION_PENDING, DELETED, or ANONYMIZED
    if (currentRecord.current_state === DataLifecycleState.LEGAL_HOLD) {
      if (
        targetState === DataLifecycleState.DELETION_PENDING ||
        targetState === DataLifecycleState.DELETED ||
        targetState === DataLifecycleState.ANONYMIZED
      ) {
        throw new SecurityError(
          `LEGAL_HOLD_VIOLATION: Cannot transition record ${currentRecord.entity_id} to ${targetState} while active legal hold is placed (Reason: ${currentRecord.legal_hold_reason})`
        );
      }
    }

    // Invariant: Records with statutory retention cannot be hard-deleted before expiry
    if (currentRecord.retention_policy_id) {
      const policy = Array.from(RetentionRegistry.policies.values()).find(p => p.id === currentRecord.retention_policy_id);
      if (policy && policy.retention_action === DeletionStrategy.RETAIN_REQUIRED) {
        if (targetState === DataLifecycleState.DELETED) {
          throw new DomainInvariantError(
            `STATUTORY_RETENTION_VIOLATION: Cannot delete record of type "${policy.data_type}" subject to ${policy.legal_basis}`
          );
        }
      }
    }
  }
}
