/**
 * MindOS Canonical Audit Policy Registry
 * Authority: Master Architecture Index Section 14, Volume III, VIII, X & Appendix B / M
 * ADR-024
 */

import { DataClassification } from '../../shared/data_classification.js';
import { AuditAction, AuditFailureMode } from '../domain/taxonomy.js';

export interface AuditPolicyRule {
  resource_classification: DataClassification | string;
  action: AuditAction | string;
  audit_required: boolean;
  audit_denial_required: boolean;
  failure_mode: AuditFailureMode;
  retention_policy: string;
}

export class AuditPolicyRegistry {
  private static rules: Map<string, AuditPolicyRule> = new Map();

  static {
    // Critical & Clinical operations: MUST FAIL CLOSED
    this.register({
      resource_classification: DataClassification.CLINICAL_RECORD,
      action: AuditAction.READ,
      audit_required: true,
      audit_denial_required: true,
      failure_mode: AuditFailureMode.FAIL_CLOSED,
      retention_policy: '10_YEARS_CLINICAL'
    });

    this.register({
      resource_classification: DataClassification.CLINICAL_RECORD,
      action: AuditAction.EXPORT,
      audit_required: true,
      audit_denial_required: true,
      failure_mode: AuditFailureMode.FAIL_CLOSED,
      retention_policy: '10_YEARS_CLINICAL'
    });

    this.register({
      resource_classification: DataClassification.HEALTH_SENSITIVE,
      action: AuditAction.READ,
      audit_required: true,
      audit_denial_required: true,
      failure_mode: AuditFailureMode.FAIL_CLOSED,
      retention_policy: '7_YEARS_HEALTH'
    });

    this.register({
      resource_classification: DataClassification.CRITICAL,
      action: AuditAction.BREAK_GLASS,
      audit_required: true,
      audit_denial_required: true,
      failure_mode: AuditFailureMode.FAIL_CLOSED,
      retention_policy: 'PERMANENT_GOVERNANCE'
    });

    this.register({
      resource_classification: DataClassification.INTERNAL,
      action: AuditAction.ASSIGN,
      audit_required: true,
      audit_denial_required: true,
      failure_mode: AuditFailureMode.FAIL_CLOSED,
      retention_policy: '7_YEARS_SECURITY'
    });

    this.register({
      resource_classification: DataClassification.SENSITIVE,
      action: AuditAction.CONSENT,
      audit_required: true,
      audit_denial_required: true,
      failure_mode: AuditFailureMode.FAIL_CLOSED,
      retention_policy: '7_YEARS_CONSENT'
    });

    this.register({
      resource_classification: DataClassification.SENSITIVE,
      action: AuditAction.REVOKE,
      audit_required: true,
      audit_denial_required: true,
      failure_mode: AuditFailureMode.FAIL_CLOSED,
      retention_policy: '7_YEARS_CONSENT'
    });

    this.register({
      resource_classification: DataClassification.CRITICAL,
      action: AuditAction.DELETE,
      audit_required: true,
      audit_denial_required: true,
      failure_mode: AuditFailureMode.FAIL_CLOSED,
      retention_policy: '7_YEARS_LEGAL'
    });
  }

  public static register(rule: AuditPolicyRule): void {
    const key = `${rule.resource_classification}::${rule.action}`;
    this.rules.set(key, rule);
  }

  public static getRule(classification: string, action: string): AuditPolicyRule {
    const key = `${classification}::${action}`;
    const specific = this.rules.get(key);
    if (specific) return specific;

    // Default policy based on classification sensitivity
    const isHighSensitivity =
      classification === DataClassification.CRITICAL ||
      classification === DataClassification.CLINICAL_RECORD ||
      classification === DataClassification.HEALTH_CRITICAL ||
      classification === DataClassification.HEALTH_SENSITIVE ||
      action === AuditAction.BREAK_GLASS ||
      action === AuditAction.EXPORT;

    return {
      resource_classification: classification,
      action,
      audit_required: true,
      audit_denial_required: true,
      failure_mode: isHighSensitivity ? AuditFailureMode.FAIL_CLOSED : AuditFailureMode.FAIL_OPEN_WITH_ALERT,
      retention_policy: isHighSensitivity ? '7_YEARS_LEGAL' : '90_DAYS_OPERATIONAL'
    };
  }

  public static isFailClosed(classification: string, action: string): boolean {
    const rule = this.getRule(classification, action);
    return rule.failure_mode === AuditFailureMode.FAIL_CLOSED;
  }
}
