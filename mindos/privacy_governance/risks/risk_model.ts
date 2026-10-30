/**
 * MindOS Canonical Privacy Risk & Residual Risk Scoring Model
 * Authority: Master Architecture Index Section 7, Volumes I, VIII & Appendix B / Q
 *            Kenya Data Protection Act 2019 Section 31
 */

import {
  RiskLikelihood,
  RiskImpact,
  RiskLevel,
  ControlEffectiveness
} from '../types.js';

export const LIKELIHOOD_SCORE: Record<RiskLikelihood, number> = {
  [RiskLikelihood.LOW]: 1,
  [RiskLikelihood.MEDIUM]: 2,
  [RiskLikelihood.HIGH]: 3,
  [RiskLikelihood.CRITICAL]: 4
};

export const IMPACT_SCORE: Record<RiskImpact, number> = {
  [RiskImpact.LOW]: 1,
  [RiskImpact.MEDIUM]: 2,
  [RiskImpact.HIGH]: 3,
  [RiskImpact.CRITICAL]: 4
};

export class PrivacyRiskModel {
  /**
   * Computes risk level from likelihood and impact
   */
  public static calculateRiskLevel(likelihood: RiskLikelihood, impact: RiskImpact): RiskLevel {
    const l = LIKELIHOOD_SCORE[likelihood] || 2;
    const i = IMPACT_SCORE[impact] || 2;
    const product = l * i;

    if (product >= 15 || l === 4 && i >= 3 || i === 4 && l >= 3) {
      return RiskLevel.CRITICAL;
    }
    if (product >= 9 || l >= 3 && i >= 3) {
      return RiskLevel.HIGH;
    }
    if (product >= 4) {
      return RiskLevel.MODERATE;
    }
    return RiskLevel.LOW;
  }

  /**
   * Computes residual likelihood and impact after applying mitigating controls
   */
  public static calculateResidualRisk(
    inherentLikelihood: RiskLikelihood,
    inherentImpact: RiskImpact,
    controls: Array<{ effectiveness: ControlEffectiveness }>
  ): {
    residual_likelihood: RiskLikelihood;
    residual_impact: RiskImpact;
    residual_risk: RiskLevel;
  } {
    let lScore = LIKELIHOOD_SCORE[inherentLikelihood];
    let iScore = IMPACT_SCORE[inherentImpact];

    // Mitigate scores based on control effectiveness
    for (const c of controls) {
      if (c.effectiveness === ControlEffectiveness.HIGHLY_EFFECTIVE) {
        lScore = Math.max(1, lScore - 2);
        iScore = Math.max(1, iScore - 1);
      } else if (c.effectiveness === ControlEffectiveness.EFFECTIVE) {
        lScore = Math.max(1, lScore - 1);
        iScore = Math.max(1, iScore - 1);
      } else if (c.effectiveness === ControlEffectiveness.PARTIALLY_EFFECTIVE) {
        lScore = Math.max(1, lScore - 0.5);
      }
    }

    const residualLikelihood = this.scoreToLikelihood(Math.round(lScore));
    const residualImpact = this.scoreToImpact(Math.round(iScore));
    const residualRisk = this.calculateRiskLevel(residualLikelihood, residualImpact);

    return {
      residual_likelihood: residualLikelihood,
      residual_impact: residualImpact,
      residual_risk: residualRisk
    };
  }

  private static scoreToLikelihood(score: number): RiskLikelihood {
    if (score >= 4) return RiskLikelihood.CRITICAL;
    if (score === 3) return RiskLikelihood.HIGH;
    if (score === 2) return RiskLikelihood.MEDIUM;
    return RiskLikelihood.LOW;
  }

  private static scoreToImpact(score: number): RiskImpact {
    if (score >= 4) return RiskImpact.CRITICAL;
    if (score === 3) return RiskImpact.HIGH;
    if (score === 2) return RiskImpact.MEDIUM;
    return RiskImpact.LOW;
  }
}
