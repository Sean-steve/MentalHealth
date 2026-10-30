/**
 * MindOS Assessment Retake Policy Service
 * Authority: Master Architecture Index Section 7, Volumes I, XV
 * 
 * Invariants:
 * 1. Enforces minimum clinical intervals between screenings (e.g. 14 days for PHQ-9).
 * 2. Overrides permitted ONLY under explicit clinical governance conditions.
 */

import { AssessmentRetakePolicy } from '../domain/types.js';

export interface RetakeEvaluationResult {
  allowed: boolean;
  cooldownRemainingDays?: number;
  nextEligibleDate?: string;
  reason?: string;
}

export class AssessmentRetakeService {
  public static evaluateRetake(params: {
    policy?: AssessmentRetakePolicy;
    lastResultTimestamp?: string;
    overrideRequested?: boolean;
    overrideReason?: string;
  }): RetakeEvaluationResult {
    const { policy, lastResultTimestamp, overrideRequested, overrideReason } = params;

    if (!policy || policy.status !== 'ACTIVE' || !lastResultTimestamp) {
      return { allowed: true };
    }

    const lastResultDate = new Date(lastResultTimestamp).getTime();
    const now = Date.now();
    const daysSinceLast = (now - lastResultDate) / (1000 * 60 * 60 * 24);

    if (daysSinceLast >= policy.minimum_interval_days) {
      return { allowed: true };
    }

    // Interval has not yet elapsed
    const remainingDays = Math.ceil(policy.minimum_interval_days - daysSinceLast);
    const nextEligibleTime = new Date(lastResultDate + policy.minimum_interval_days * 24 * 60 * 60 * 1000).toISOString();

    if (overrideRequested && policy.allow_early_retake) {
      return {
        allowed: true,
        cooldownRemainingDays: 0,
        nextEligibleDate: new Date().toISOString(),
        reason: `EARLY_RETAKE_GRANTED: ${overrideReason || 'Clinical Request'}`
      };
    }

    return {
      allowed: false,
      cooldownRemainingDays: remainingDays,
      nextEligibleDate: nextEligibleTime,
      reason: `MINIMUM_INTERVAL_NOT_ELAPSED_${remainingDays}_DAYS_REMAINING`
    };
  }
}
