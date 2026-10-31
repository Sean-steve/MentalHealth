/**
 * Governed clinical-change rule registry.
 * No threshold is considered authoritative unless it is explicitly approved,
 * versioned and linked to a Clinical Governance artifact.
 */
import { ClinicalChangeRule } from '../domain/types.js';
import { DomainInvariantError } from '../../platform/errors/index.js';

export class ClinicalChangeRuleRegistry {
  private static rules = new Map<string, ClinicalChangeRule>();

  private static key(measureCode: string, version: number): string {
    return `${measureCode}:${version}`;
  }

  public static registerApprovedRule(rule: ClinicalChangeRule): void {
    if (rule.approval_state !== 'APPROVED') {
      throw new DomainInvariantError('Only APPROVED clinical-change rules may be registered for execution.');
    }
    if (!rule.clinical_artifact_id || !rule.clinical_artifact_version || !rule.approved_by || !rule.approved_at) {
      throw new DomainInvariantError('Clinical-change rule requires governance artifact and approval provenance.');
    }
    if (!Number.isInteger(rule.version) || rule.version < 1) {
      throw new DomainInvariantError('Clinical-change rule version must be a positive integer.');
    }
    if (rule.mcid !== undefined && rule.mcid <= 0) {
      throw new DomainInvariantError('Clinical-change rule MCID must be positive when supplied.');
    }
    if (rule.target_min !== undefined && rule.target_max !== undefined && rule.target_min > rule.target_max) {
      throw new DomainInvariantError('Clinical-change target_min cannot exceed target_max.');
    }
    if (rule.critical_safety_threshold !== undefined && !rule.safety_signal_code) {
      throw new DomainInvariantError('Clinical-change rule with a Safety threshold must name a canonical safety_signal_code.');
    }
    this.rules.set(this.key(rule.measure_code, rule.version), { ...rule });
  }

  public static getApprovedRule(measureCode: string, at = new Date()): ClinicalChangeRule | undefined {
    const candidates = Array.from(this.rules.values())
      .filter(r => r.measure_code === measureCode && r.approval_state === 'APPROVED')
      .filter(r => Date.parse(r.effective_from) <= at.getTime())
      .filter(r => !r.effective_until || Date.parse(r.effective_until) > at.getTime())
      .sort((a,b) => b.version - a.version);
    const rule = candidates[0];
    return rule ? { ...rule } : undefined;
  }

  public static listApprovedRules(): ClinicalChangeRule[] {
    return Array.from(this.rules.values())
      .filter(r => r.approval_state === 'APPROVED')
      .map(r => ({ ...r }));
  }

  public static revoke(measureCode: string, version: number): void {
    const key = this.key(measureCode, version);
    const existing = this.rules.get(key);
    if (existing) this.rules.set(key, { ...existing, approval_state: 'REVOKED' });
  }

  public static resetForTesting(): void {
    this.rules.clear();
  }
}

// Deliberately empty. There are no hard-coded executable clinical thresholds.
// Runtime must hydrate the registry from approved Clinical Governance records.
export const CANONICAL_CLINICAL_CHANGE_RULES: Readonly<Record<string, never>> = Object.freeze({});
