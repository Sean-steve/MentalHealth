/**
 * MindOS Assessment Eligibility Service
 * Authority: Master Architecture Index Section 7, Volumes I, XV
 * 
 * Verifies subject eligibility against:
 * 1. Age thresholds (e.g. min 18)
 * 2. Jurisdictional boundaries (e.g. KE)
 * 3. Informed screening consent
 * 4. Assessment availability and clinical governance active state
 * 5. Current safety risk state exclusions
 */

import {
  AssessmentDefinition,
  AssessmentVersion,
  AssessmentEligibilityPolicy,
  EligibilityStatus
} from '../domain/types.js';
import { AssessmentSafetyKernelAdapter } from '../safety/kernel_adapter.js';

export interface EligibilityEvaluationResult {
  status: EligibilityStatus;
  reasons: string[];
  eligible: boolean;
  minAge?: number;
  allowedJurisdictions?: string[];
  requiredConsents?: string[];
  currentRiskState?: string;
}

export class AssessmentEligibilityService {
  public static async evaluateEligibility(params: {
    userId: string;
    userAge?: number;
    userJurisdiction?: string;
    hasConsent?: boolean;
    definition: AssessmentDefinition;
    version: AssessmentVersion;
    policy?: AssessmentEligibilityPolicy;
  }): Promise<EligibilityEvaluationResult> {
    const {
      userId,
      userAge = 25, // Default test/adult age if not specified
      userJurisdiction = 'KE',
      hasConsent = true,
      definition,
      version,
      policy
    } = params;

    const reasons: string[] = [];

    // 1. Check instrument status
    if (definition.status !== 'ACTIVE' || version.status !== 'ACTIVE') {
      return {
        status: EligibilityStatus.NOT_ELIGIBLE,
        reasons: ['ASSESSMENT_NOT_ACTIVE'],
        eligible: false
      };
    }

    // 2. Check age restrictions
    const minAge = policy?.min_age ?? version.population.min_age ?? 18;
    const maxAge = policy?.max_age ?? version.population.max_age ?? 120;
    if (userAge < minAge) {
      reasons.push(`AGE_BELOW_MINIMUM_${minAge}`);
    }
    if (userAge > maxAge) {
      reasons.push(`AGE_ABOVE_MAXIMUM_${maxAge}`);
    }

    // 3. Check jurisdiction
    const allowedJurisdictions = policy?.allowed_jurisdictions ?? version.jurisdictions ?? ['KE'];
    if (!allowedJurisdictions.includes(userJurisdiction)) {
      reasons.push(`JURISDICTION_NOT_ALLOWED_${userJurisdiction}`);
    }

    // 4. Check consent
    if (!hasConsent) {
      reasons.push('CONSENT_REQUIRED');
    }

    // 5. Check risk state exclusions (e.g. if routine wellbeing checks exclude acute crisis users)
    const currentRisk = await AssessmentSafetyKernelAdapter.getUserRiskState(userId);
    if (policy?.excluded_risk_states && policy.excluded_risk_states.includes(currentRisk)) {
      reasons.push(`RISK_STATE_EXCLUDED_${currentRisk}`);
    }

    if (reasons.includes('CONSENT_REQUIRED')) {
      return {
        status: EligibilityStatus.REVIEW_REQUIRED,
        reasons,
        eligible: false,
        minAge,
        allowedJurisdictions,
        currentRiskState: currentRisk
      };
    }

    if (reasons.length > 0) {
      return {
        status: EligibilityStatus.NOT_ELIGIBLE,
        reasons,
        eligible: false,
        minAge,
        allowedJurisdictions,
        currentRiskState: currentRisk
      };
    }

    return {
      status: EligibilityStatus.ELIGIBLE,
      reasons: [],
      eligible: true,
      minAge,
      allowedJurisdictions,
      currentRiskState: currentRisk
    };
  }
}
