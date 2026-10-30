/**
 * MindOS Assessment-to-Safety Kernel Integration Adapter
 * Authority: Master Architecture Index Section 7, Volumes I, V, XV
 * Clinical Safety Policy Catalogue (R-SAFE-001, POL-SAFE-001)
 * 
 * Invariants:
 * 1. Immediate Safety Signal Generation: When a safety-critical response is recorded,
 *    a SafetySignal is generated and ingested into the Safety Kernel IMMEDIATELY.
 * 2. Assessment does NOT wait for full assessment completion before dispatching.
 * 3. Assessment emits SafetySignal; Safety Kernel owns and updates RiskState.
 *    Assessment never directly mutates canonical RiskState.
 */

import { AssessmentQuestion, AssessmentResponse, AssessmentSafetyRule } from '../domain/types.js';
import { SafetyKernel, CrisisResponseOrchestrator, getSafetyRepository } from '../../safety/index.js';
import { logger } from '../../platform/observability/logger.js';
import { SignalSeverity, SignalConfidence, SignalSourceType, SignalProvenance } from '../../safety/domain/types.js';

export interface AssessmentSafetyEvaluationResult {
  triggered: boolean;
  signalCode?: string;
  severity?: 'ELEVATED' | 'HIGH' | 'CRITICAL';
  safetyMode?: string;
  crisisResources?: any[];
  supportMessage?: string;
}

export class AssessmentSafetyKernelAdapter {
  /**
   * Evaluates an individual question response against safety rules and dispatches to Safety Kernel immediately if triggered.
   */
  public static async evaluateAndDispatch(params: {
    userId: string;
    sessionId: string;
    instrumentCode: string;
    question: AssessmentQuestion;
    response: AssessmentResponse;
    safetyRules: AssessmentSafetyRule[];
    jurisdiction?: string;
  }): Promise<AssessmentSafetyEvaluationResult> {
    const { userId, sessionId, instrumentCode, question, response, safetyRules, jurisdiction = 'KE' } = params;

    // Find any matching rule for this question
    const matchedRule = safetyRules.find((rule) => {
      if (rule.question_id !== question.id && rule.question_code !== question.question_code) {
        return false;
      }
      if (rule.status !== 'ACTIVE') return false;

      const respVal = response.response_value;

      // Also check score_value if response matches option
      let numericScore: number | undefined;
      if (typeof respVal === 'number') {
        numericScore = respVal;
      } else if (question.options) {
        const opt = question.options.find((o) => o.option_code === respVal || o.label === respVal);
        if (opt && typeof opt.score_value === 'number') {
          numericScore = opt.score_value;
        }
      }

      switch (rule.condition.operator) {
        case 'greater_than_or_equal':
          if (numericScore !== undefined && typeof rule.condition.threshold_value === 'number') {
            return numericScore >= rule.condition.threshold_value;
          }
          return false;

        case 'greater_than':
          if (numericScore !== undefined && typeof rule.condition.threshold_value === 'number') {
            return numericScore > rule.condition.threshold_value;
          }
          return false;

        case 'equals':
          return respVal === rule.condition.threshold_value || numericScore === rule.condition.threshold_value;

        case 'in':
          if (Array.isArray(rule.condition.threshold_value)) {
            return rule.condition.threshold_value.includes(respVal) ||
              (numericScore !== undefined && rule.condition.threshold_value.includes(numericScore));
          }
          return false;

        default:
          return false;
      }
    });

    // Special hardcoded canonical rule for PHQ-9 Q9 if no DB rule registered:
    // Question 9 score > 0 -> Suicidal ideation
    const isPhq9Q9 = instrumentCode === 'PHQ-9' && (question.question_code === 'PHQ9_Q9' || question.position === 9);
    let effectiveRule = matchedRule;

    if (!effectiveRule && isPhq9Q9) {
      let q9Score = 0;
      if (typeof response.response_value === 'number') {
        q9Score = response.response_value;
      } else if (question.options) {
        const opt = question.options.find((o) => o.option_code === response.response_value || o.label === response.response_value);
        if (opt && typeof opt.score_value === 'number') q9Score = opt.score_value;
      }

      if (q9Score > 0) {
        effectiveRule = {
          id: `rule-phq9-q9-auto`,
          assessment_version_id: question.assessment_version_id,
          question_id: question.id,
          question_code: question.question_code,
          condition: { operator: 'greater_than_or_equal', threshold_value: 1 },
          signal_code: q9Score >= 2 ? 'SIG_SUICIDAL_INTENT_ACTIVE' : 'SIG_SUICIDAL_IDEATION_PASSIVE',
          severity: q9Score >= 2 ? 'CRITICAL' : 'HIGH',
          confidence: 'CONFIRMED',
          clinical_policy_reference: 'POL-SAFE-001',
          status: 'ACTIVE',
          created_at: new Date().toISOString()
        };
      }
    }

    if (!effectiveRule) {
      return { triggered: false };
    }

    logger.warn('[AssessmentSafety] Safety trigger matched on item response', {
      userId,
      sessionId,
      instrumentCode,
      questionCode: question.question_code,
      signalCode: effectiveRule.signal_code,
      severity: effectiveRule.severity
    });

    try {
      const orchestrator = new CrisisResponseOrchestrator(getSafetyRepository());
      const packet = await orchestrator.handleSafetySignal({
        subject_user_id: userId,
        signal_code: effectiveRule.signal_code,
        source_type: SignalSourceType.ASSESSMENT,
        source_reference: `${instrumentCode}:${sessionId}:${question.question_code}`,
        provenance: SignalProvenance.CLINICALLY_ASSESSED,
        jurisdiction,
        custom_severity: effectiveRule.severity === 'CRITICAL' ? SignalSeverity.CRITICAL : SignalSeverity.HIGH,
        custom_confidence: SignalConfidence.CONFIRMED
      });

      return {
        triggered: true,
        signalCode: effectiveRule.signal_code,
        severity: effectiveRule.severity,
        safetyMode: packet.safetyMode,
        crisisResources: packet.crisisResources,
        supportMessage: packet.deterministicSafetySupportMessage
      };
    } catch (err) {
      logger.error('[AssessmentSafety] Failed to dispatch safety signal to Safety Kernel', { error: err });
      return {
        triggered: true,
        signalCode: effectiveRule.signal_code,
        severity: effectiveRule.severity
      };
    }
  }

  /**
   * Queries user's current risk state from Safety Kernel for eligibility gating.
   */
  public static async getUserRiskState(userId: string): Promise<string> {
    try {
      const repo = getSafetyRepository();
      const current = await repo.getCurrentRiskState(userId);
      return current?.level || 'UNKNOWN';
    } catch {
      return 'UNKNOWN';
    }
  }
}
