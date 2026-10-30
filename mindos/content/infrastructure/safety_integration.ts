/**
 * MindOS Content & Psychoeducation Safety Kernel Adapter
 * Authority: Master Architecture Index Section 8, Volumes III, XV, XVI
 * Clinical Safety Policy Catalogue: R-SAFE-001, R-SAFE-002, POL-SAFE-001
 */

import { SafetyKernel, CrisisResourceEntity } from '../../safety/index.js';
import { RiskState } from '../../platform/shared/state_machines.js';
import { logger } from '../../platform/observability/logger.js';

export interface SafetySignalResult {
  requiresSafetyOverride: boolean;
  targetState: RiskState;
  urgentResources: CrisisResourceEntity[];
}

export class ContentSafetyAdapter {
  /**
   * Evaluates distress or crisis signals detected during exercise session.
   */
  public static handleAcuteDistressSignal(params: {
    userId: string;
    sessionId: string;
    detectedKeyword: string;
    rawText: string;
  }): SafetySignalResult {
    logger.warn('[ContentSafetyAdapter] Acute distress signal detected in exercise response', {
      userId: params.userId,
      sessionId: params.sessionId,
      keyword: params.detectedKeyword
    });

    const evaluation = SafetyKernel.evaluateRiskSignal({
      userId: params.userId,
      sourceDomain: 'content.exercises',
      riskCategory: 'SUICIDE_SELF_HARM',
      signals: {
        immediate_danger: true,
        keyword: params.detectedKeyword,
        session_id: params.sessionId
      }
    });

    return {
      requiresSafetyOverride: evaluation.requiresSafetyOverride,
      targetState: evaluation.event.current_state,
      urgentResources: evaluation.urgentResources
    };
  }

  /**
   * Retrieves verified crisis resources for Kenya (R-SAFE-002).
   */
  public static getCrisisResources(jurisdiction = 'KE'): CrisisResourceEntity[] {
    return SafetyKernel.getVerifiedCrisisResources(jurisdiction);
  }

  /**
   * Obtains the subject's active risk state from the clinical safety kernel.
   */
  public static getUserRiskState(userId: string): RiskState {
    return SafetyKernel.getUserRiskState(userId);
  }
}
