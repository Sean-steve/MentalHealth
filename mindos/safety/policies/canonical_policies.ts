/**
 * MindOS Canonical Clinical Safety Policies
 * Authority: Volumes I, V, XV & Clinical Safety Policy Catalogue
 * Governed Clinical Artifact: ART-SAFE-001 (Clinical Safety Risk Policy & Evaluation Protocols)
 */

import {
  RiskState,
  SignalSeverity,
  SignalFamily,
  SafetyActionType,
  SafetyActionPriority,
  SafetyEscalationType
} from '../domain/types.js';
import { NormalizedSignalResult } from '../signals/normalizer.js';

export interface EvaluatedRiskPolicyResult {
  riskLevel: RiskState;
  reasonCodes: string[];
  evidenceRefs: string[];
  requiredActions: Array<{
    actionType: SafetyActionType;
    priority: SafetyActionPriority;
  }>;
  requiresHumanReview: boolean;
  escalationType?: SafetyEscalationType;
  freshnessDurationMs: number;
  policyVersion: string;
  clinicalArtifactRef: string;
}

export class CanonicalRiskPolicy {
  public static readonly POLICY_ID = 'POL-SAFE-001';
  public static readonly POLICY_VERSION = '2.0.0-CLIN-SAFE';
  public static readonly CLINICAL_ARTIFACT_REF = 'ART-SAFE-001';

  /**
   * Deterministic clinical evaluation function.
   * R-SAFE-001: Evaluated via governed deterministic logic, NOT unconstrained LLM heuristics.
   */
  public static evaluate(params: {
    signals: NormalizedSignalResult[];
    activeRiskFactors?: string[];
    protectiveFactors?: string[];
    previousState?: RiskState;
  }): EvaluatedRiskPolicyResult {
    const signals = params.signals || [];
    const protective = new Set(params.protectiveFactors || []);
    const reasonCodes: string[] = [];
    const evidenceRefs: string[] = [];

    // 1. Check for Unknown state if no data available
    if (signals.length === 0 && (!params.previousState || params.previousState === RiskState.UNKNOWN)) {
      return {
        riskLevel: RiskState.UNKNOWN,
        reasonCodes: ['NO_EVALUATION_DATA_AVAILABLE'],
        evidenceRefs: [],
        requiredActions: [
          { actionType: SafetyActionType.REQUIRE_SAFETY_CHECK, priority: SafetyActionPriority.NORMAL }
        ],
        requiresHumanReview: false,
        freshnessDurationMs: 60 * 60 * 1000, // 1 hour
        policyVersion: CanonicalRiskPolicy.POLICY_VERSION,
        clinicalArtifactRef: CanonicalRiskPolicy.CLINICAL_ARTIFACT_REF
      };
    }

    // 2. Count signals by severity
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;

    for (const sig of signals) {
      if (sig.raw_evidence_reference) {
        evidenceRefs.push(sig.raw_evidence_reference);
      }

      switch (sig.severity) {
        case SignalSeverity.CRITICAL:
          criticalCount++;
          reasonCodes.push(`CRITICAL_SIGNAL:${sig.signal_code}`);
          break;
        case SignalSeverity.HIGH:
          highCount++;
          reasonCodes.push(`HIGH_SIGNAL:${sig.signal_code}`);
          break;
        case SignalSeverity.MEDIUM:
          mediumCount++;
          reasonCodes.push(`MODERATE_SIGNAL:${sig.signal_code}`);
          break;
        case SignalSeverity.LOW:
          lowCount++;
          break;
      }
    }

    // 3. Converging signal logic: 2 or more Medium signals escalate to HIGH
    if (mediumCount >= 2 && criticalCount === 0 && highCount === 0) {
      highCount++;
      reasonCodes.push('MULTIPLE_CONVERGING_MODERATE_SIGNALS');
    }

    // 4. Primary deterministic state classification
    let calculatedLevel: RiskState = RiskState.NO_CONCERN;

    if (criticalCount > 0) {
      calculatedLevel = RiskState.URGENT;
      reasonCodes.push('ACUTE_CRITICAL_DANGER_INDICATOR');
    } else if (highCount > 0) {
      calculatedLevel = RiskState.HIGH;
      reasonCodes.push('HIGH_RISK_INDICATOR_PRESENT');
    } else if (mediumCount > 0) {
      calculatedLevel = RiskState.ELEVATED;
      reasonCodes.push('ELEVATED_DISTRESS_INDICATOR');
    } else if (lowCount > 0) {
      calculatedLevel = RiskState.POTENTIAL_CONCERN;
      reasonCodes.push('HISTORICAL_OR_LOW_CONCERN_INDICATOR');
    }

    // 5. Protective factors evaluation
    // Strict Rule: Protective factors CANNOT cancel CRITICAL imminent danger
    if (calculatedLevel === RiskState.URGENT) {
      // Protective factors noted, but cannot downgrade urgent intent/plan
      if (protective.size > 0) {
        reasonCodes.push('PROTECTIVE_FACTORS_NOTED_BUT_INSUFFICIENT_FOR_CRITICAL_DOWNGRADE');
      }
    } else if (calculatedLevel === RiskState.ELEVATED) {
      // For moderate distress, presence of immediate support person can step down to POTENTIAL_CONCERN
      if (protective.has('IMMEDIATE_SUPPORT_PERSON_PRESENT') || protective.has('IN_ACTIVE_CLINICAL_CARE')) {
        calculatedLevel = RiskState.POTENTIAL_CONCERN;
        reasonCodes.push('MITIGATED_BY_PROTECTIVE_SUPPORT_PERSON');
      }
    }

    // 6. Action and Escalation assignment
    const requiredActions: Array<{ actionType: SafetyActionType; priority: SafetyActionPriority }> = [];
    let requiresHumanReview = false;
    let escalationType: SafetyEscalationType | undefined;
    let freshnessDurationMs = 24 * 60 * 60 * 1000; // 24 hours default for baseline

    switch (calculatedLevel) {
      case RiskState.URGENT:
        requiredActions.push(
          { actionType: SafetyActionType.DISPLAY_CRISIS_MODAL, priority: SafetyActionPriority.CRITICAL },
          { actionType: SafetyActionType.SUPPRESS_COMMERCIALS, priority: SafetyActionPriority.CRITICAL },
          { actionType: SafetyActionType.NOTIFY_CLINICAL_ONCALL, priority: SafetyActionPriority.CRITICAL },
          { actionType: SafetyActionType.SHOW_CRISIS_RESOURCES, priority: SafetyActionPriority.CRITICAL },
          { actionType: SafetyActionType.LIMIT_AI_MODE, priority: SafetyActionPriority.CRITICAL },
          { actionType: SafetyActionType.SUSPEND_NORMAL_AI_FLOW, priority: SafetyActionPriority.CRITICAL },
          { actionType: SafetyActionType.RECOMMEND_EMERGENCY_SERVICES, priority: SafetyActionPriority.CRITICAL },
          { actionType: SafetyActionType.ESCALATE_HUMAN_REVIEW, priority: SafetyActionPriority.CRITICAL },
          { actionType: SafetyActionType.REQUIRE_SAFETY_CHECK, priority: SafetyActionPriority.HIGH }
        );
        requiresHumanReview = true;
        escalationType = SafetyEscalationType.CLINICAL_REVIEW;
        freshnessDurationMs = 4 * 60 * 60 * 1000; // 4 hours
        break;

      case RiskState.HIGH:
        requiredActions.push(
          { actionType: SafetyActionType.SHOW_SAFETY_SUPPORT, priority: SafetyActionPriority.HIGH },
          { actionType: SafetyActionType.SHOW_CRISIS_RESOURCES, priority: SafetyActionPriority.HIGH },
          { actionType: SafetyActionType.LIMIT_AI_MODE, priority: SafetyActionPriority.HIGH },
          { actionType: SafetyActionType.REQUIRE_SAFETY_CHECK, priority: SafetyActionPriority.HIGH },
          { actionType: SafetyActionType.ESCALATE_HUMAN_REVIEW, priority: SafetyActionPriority.HIGH }
        );
        requiresHumanReview = true;
        escalationType = SafetyEscalationType.SAFETY_OPERATIONS;
        freshnessDurationMs = 8 * 60 * 60 * 1000; // 8 hours
        break;

      case RiskState.ELEVATED:
        requiredActions.push(
          { actionType: SafetyActionType.SHOW_SAFETY_SUPPORT, priority: SafetyActionPriority.NORMAL },
          { actionType: SafetyActionType.REQUIRE_SAFETY_CHECK, priority: SafetyActionPriority.NORMAL },
          { actionType: SafetyActionType.FOLLOW_UP_REQUIRED, priority: SafetyActionPriority.NORMAL }
        );
        freshnessDurationMs = 12 * 60 * 60 * 1000; // 12 hours
        break;

      case RiskState.POTENTIAL_CONCERN:
        requiredActions.push(
          { actionType: SafetyActionType.SHOW_SAFETY_SUPPORT, priority: SafetyActionPriority.NORMAL }
        );
        freshnessDurationMs = 24 * 60 * 60 * 1000;
        break;

      case RiskState.NO_CONCERN:
        freshnessDurationMs = 48 * 60 * 60 * 1000;
        break;
    }

    return {
      riskLevel: calculatedLevel,
      reasonCodes,
      evidenceRefs,
      requiredActions,
      requiresHumanReview,
      escalationType,
      freshnessDurationMs,
      policyVersion: CanonicalRiskPolicy.POLICY_VERSION,
      clinicalArtifactRef: CanonicalRiskPolicy.CLINICAL_ARTIFACT_REF
    };
  }
}
