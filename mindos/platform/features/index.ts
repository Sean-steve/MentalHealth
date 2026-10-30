/**
 * MindOS Feature Flag & Safety Kill-Switch Architecture
 * Authority: Master Architecture Index Section 6 & Volume V (ADR-003, ADR-010)
 * 
 * Provides typed, deterministic feature toggle evaluation with:
 * - Environment restrictions
 * - Jurisdiction gating (e.g. Kenya DHA-specific features)
 * - Emergency safety kill switches (instant deactivation of AI/companion pathways)
 * - Expiry and ownership tracking
 */

import { Environment, ConfigurationManager } from '../configuration/index.js';
import { AuditService } from '../audit/index.js';
import { logger } from '../observability/logger.js';

export interface FeatureFlagDefinition {
  key: string;
  description: string;
  owner: string; // e.g. 'team-safety@mindos.ke', 'team-clinical@mindos.ke'
  defaultValue: boolean;
  allowedEnvironments: Environment[];
  targetJurisdictions?: string[]; // e.g. ['KE']
  safetyCritical: boolean; // if true, acts as emergency kill switch
  governed?: boolean; // if true, requires active release authorization in staging/production
  requiredReleaseId?: string;
  createdAt: string;
  reviewDate: string; // Expiry / review date
}

export interface FlagEvaluationContext {
  userId?: string;
  environment?: Environment;
  jurisdiction?: string; // 'KE'
  organizationId?: string;
}

export class FeatureFlagService {
  private static registry: Map<string, FeatureFlagDefinition> = new Map();
  private static overrides: Map<string, boolean> = new Map();
  private static emergencyKilled: Map<string, { reason: string; timestamp: string; actor: string }> = new Map();
  private static governanceGateChecker: ((releaseId: string, env: Environment) => boolean) | null = null;

  static {
    FeatureFlagService.initializeCanonicalFlags();
  }

  /**
   * Register standard canonical feature flags
   */
  public static initializeCanonicalFlags(): void {
    FeatureFlagService.register({
      key: 'safety.deterministic_override',
      description: 'Forces deterministic crisis intervention when high risk is detected',
      owner: 'safety-kernel@mindos.ke',
      defaultValue: true,
      allowedEnvironments: ['local', 'development', 'test', 'staging', 'production'],
      targetJurisdictions: ['KE'],
      safetyCritical: true,
      createdAt: '2026-09-04',
      reviewDate: '2027-09-04'
    });

    FeatureFlagService.register({
      key: 'ai.companion_generative_responses',
      description: 'Enables real-time generative conversational companion responses',
      owner: 'ai-safety@mindos.ke',
      defaultValue: true,
      allowedEnvironments: ['local', 'development', 'test', 'staging', 'production'],
      targetJurisdictions: ['KE'],
      safetyCritical: true, // Emergency kill switch if AI exhibits hallucination
      createdAt: '2026-09-04',
      reviewDate: '2026-12-04'
    });

    FeatureFlagService.register({
      key: 'telehealth.kenya_e_prescriptions',
      description: 'Enables digital e-prescription module regulated by KMPDC/DHA',
      owner: 'clinical-governance@mindos.ke',
      defaultValue: false, // Disabled until clinical verification in later sprint
      allowedEnvironments: ['local', 'development', 'test', 'staging'],
      targetJurisdictions: ['KE'],
      safetyCritical: false,
      createdAt: '2026-09-04',
      reviewDate: '2026-11-01'
    });

    FeatureFlagService.register({
      key: 'observability.detailed_audit_ledger_ui',
      description: 'Enables developer ledger inspection tab in operational UI',
      owner: 'platform-core@mindos.ke',
      defaultValue: true,
      allowedEnvironments: ['local', 'development', 'test', 'staging'],
      safetyCritical: false,
      createdAt: '2026-09-04',
      reviewDate: '2027-01-01'
    });
  }

  public static register(def: FeatureFlagDefinition): void {
    FeatureFlagService.registry.set(def.key, def);
  }

  public static isEnabled(key: string, context?: FlagEvaluationContext): boolean {
    // 1. Check emergency kill switch first
    if (FeatureFlagService.emergencyKilled.has(key)) {
      return false;
    }

    const flag = FeatureFlagService.registry.get(key);
    if (!flag) {
      logger.warn(`Unknown feature flag evaluated: ${key}. Defaulting to false.`);
      return false;
    }

    // 2. Environment check (Must satisfy environment permissions even if overridden)
    const currentEnv = context?.environment || ConfigurationManager.get().env;
    if (!flag.allowedEnvironments.includes(currentEnv)) {
      return false;
    }

    // 3. Jurisdiction check (e.g. Kenya DHA)
    if (flag.targetJurisdictions && flag.targetJurisdictions.length > 0) {
      const userJurisdiction = context?.jurisdiction || 'KE';
      if (!flag.targetJurisdictions.includes(userJurisdiction)) {
        return false;
      }
    }

    // 4. Governance Gate Check (Sprint 9 Invariant: No governance approval = no governed production activation)
    if (flag.governed && (currentEnv === 'production' || currentEnv === 'staging')) {
      const releaseId = flag.requiredReleaseId || key;
      if (FeatureFlagService.governanceGateChecker) {
        const isAuthorized = FeatureFlagService.governanceGateChecker(releaseId, currentEnv);
        if (!isAuthorized) {
          return false;
        }
      } else {
        // Fail-Closed: Governed feature cannot activate without verified gate checker
        return false;
      }
    }

    // 5. Check runtime override
    if (FeatureFlagService.overrides.has(key)) {
      return FeatureFlagService.overrides.get(key)!;
    }

    return flag.defaultValue;
  }

  public static setGovernanceGateChecker(checker: ((releaseId: string, env: Environment) => boolean) | null): void {
    FeatureFlagService.governanceGateChecker = checker;
  }

  /**
   * Emergency Kill-Switch Activation
   * Instantly disables a flag across all environments and logs a cryptographic audit record.
   */
  public static triggerEmergencyKill(key: string, reason: string, actor: string): void {
    FeatureFlagService.emergencyKilled.set(key, {
      reason,
      timestamp: new Date().toISOString(),
      actor
    });

    AuditService.record({
      actor_type: 'SERVICE',
      actor_id: actor,
      action: 'FEATURE_FLAG.EMERGENCY_KILL',
      resource_type: 'feature_flags',
      resource_id: key,
      purpose: 'Safety Mitigation',
      authorization_basis: { reason },
      result: 'ALLOWED',
      metadata: { key, reason }
    });

    logger.warn(`EMERGENCY KILL SWITCH TRIGGERED: Flag "${key}" has been disabled immediately. Reason: ${reason}`);
  }

  /**
   * Restores a previously killed flag after incident remediation
   */
  public static restoreFlag(key: string, actor: string): void {
    FeatureFlagService.emergencyKilled.delete(key);
    FeatureFlagService.overrides.delete(key);

    AuditService.record({
      actor_type: 'SERVICE',
      actor_id: actor,
      action: 'FEATURE_FLAG.RESTORED',
      resource_type: 'feature_flags',
      resource_id: key,
      purpose: 'Incident Resolution',
      authorization_basis: { action: 'RESTORE' },
      result: 'ALLOWED',
      metadata: { key }
    });

    logger.info(`Feature flag "${key}" restored by ${actor}.`);
  }

  public static setOverride(key: string, value: boolean): void {
    FeatureFlagService.overrides.set(key, value);
  }

  public static clearOverrides(): void {
    FeatureFlagService.overrides.clear();
  }

  public static listAll(): Array<FeatureFlagDefinition & { enabled: boolean; isKilled: boolean }> {
    const list: Array<FeatureFlagDefinition & { enabled: boolean; isKilled: boolean }> = [];
    for (const [key, def] of FeatureFlagService.registry.entries()) {
      const isKilled = FeatureFlagService.emergencyKilled.has(key);
      const enabled = FeatureFlagService.isEnabled(key);
      list.push({ ...def, enabled, isKilled });
    }
    return list;
  }

  public static resetForTesting(): void {
    FeatureFlagService.overrides.clear();
    FeatureFlagService.emergencyKilled.clear();
    FeatureFlagService.registry.clear();
    FeatureFlagService.initializeCanonicalFlags();
  }
}
