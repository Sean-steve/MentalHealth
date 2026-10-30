/**
 * MindOS Governed Content & Psychoeducation Domain Invariants
 * Authority: Master Architecture Index Section 8, Volumes I, III, XVI & Appendix B / Q
 * Clinical Safety Policy Catalogue: R-SAFE-001, R-SAFE-002, POL-SAFE-001
 */

import {
  ContentType,
  ContentRiskClassification,
  ContentVersion,
  ContentDefinition,
  GuidedExercise,
  ContentClaim
} from './types.js';
import {
  ContentClinicalApprovalRequiredError,
  ContentNotEligibleError,
  ContentClaimTamperingError,
  DomainInvariantError
} from '../../platform/errors/index.js';
import { RiskState } from '../../platform/shared/state_machines.js';

export const CANONICAL_NON_DIAGNOSTIC_DISCLAIMER =
  'MindOS psychoeducational resources and guided tools provide general mental health education and coping strategies. ' +
  'They do not constitute medical advice, clinical diagnosis, psychiatric assessment, or psychological treatment. ' +
  'If you are experiencing acute distress, thoughts of self-harm, or an emergency, please access immediate crisis support ' +
  'or contact emergency medical services.';

export const ACUTE_CRISIS_KEYWORDS = [
  'kill myself',
  'suicide',
  'end my life',
  'want to die',
  'hang myself',
  'overdose',
  'cutting myself',
  'no reason to live',
  'better off dead'
];

export class ContentInvariants {
  /**
   * Enforces that clinical or guided intervention content must possess an approved clinical artifact reference.
   */
  public static validateClinicalGovernancePrerequisite(
    definition: ContentDefinition,
    version: ContentVersion
  ): void {
    const isClinical =
      definition.content_type === ContentType.PSYCHOEDUCATION ||
      definition.content_type === ContentType.GUIDED_EXERCISE ||
      definition.content_type === ContentType.GROUNDING_EXERCISE ||
      definition.content_type === ContentType.BREATHING_EXERCISE ||
      definition.content_type === ContentType.COPING_TOOL ||
      definition.risk_classification === ContentRiskClassification.PSYCHOEDUCATIONAL ||
      definition.risk_classification === ContentRiskClassification.GUIDED_INTERVENTION;

    if (isClinical) {
      if (!version.clinical_artifact_id || !version.clinical_artifact_version) {
        throw new ContentClinicalApprovalRequiredError(
          `CLINICAL_GOVERNANCE_REQUIRED: Content '${definition.code}' (version ${version.version}) is classified as ${definition.risk_classification} / ${definition.content_type} and requires approved ClinicalArtifact linkage prior to publication.`
        );
      }
    }
  }

  /**
   * Enforces population eligibility for guided exercises (Age, Jurisdiction, Current Safety State).
   */
  public static validateExerciseEligibility(params: {
    exercise: GuidedExercise;
    userAge?: number;
    userJurisdiction?: string;
    currentRiskState?: RiskState;
  }): void {
    const policy = params.exercise.eligibility_policy;
    if (!policy) return;

    if (policy.min_age !== undefined && params.userAge !== undefined) {
      if (params.userAge < policy.min_age) {
        throw new ContentNotEligibleError(
          `User age ${params.userAge} does not meet minimum age ${policy.min_age} for exercise ${params.exercise.id}`
        );
      }
    }

    if (policy.max_age !== undefined && params.userAge !== undefined) {
      if (params.userAge > policy.max_age) {
        throw new ContentNotEligibleError(
          `User age ${params.userAge} exceeds maximum age ${policy.max_age} for exercise ${params.exercise.id}`
        );
      }
    }

    if (policy.allowed_jurisdictions && policy.allowed_jurisdictions.length > 0 && params.userJurisdiction) {
      if (!policy.allowed_jurisdictions.includes(params.userJurisdiction)) {
        throw new ContentNotEligibleError(
          `Jurisdiction '${params.userJurisdiction}' is not eligible for exercise ${params.exercise.id}`
        );
      }
    }

    // Safety check: users currently in URGENT or HIGH risk state must not be guided into unmonitored reflective exercises
    if (params.currentRiskState) {
      if (
        params.currentRiskState === RiskState.URGENT ||
        params.currentRiskState === RiskState.HIGH
      ) {
        const excluded = policy.excluded_risk_states || ['URGENT', 'HIGH'];
        if (excluded.includes(params.currentRiskState)) {
          throw new ContentNotEligibleError(
            `Subject in active risk state ${params.currentRiskState} is barred from non-emergency guided exercise. Immediate crisis override required.`
          );
        }
      }
    }
  }

  /**
   * Scans text for acute crisis keywords.
   */
  public static scanForAcuteCrisisSignals(text: string): boolean {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    return ACUTE_CRISIS_KEYWORDS.some(kw => lower.includes(kw));
  }

  /**
   * Validates integrity and tamper-evidence of clinical claims.
   */
  public static validateClaimIntegrity(claim: ContentClaim): void {
    if (!claim.claim_text || claim.claim_text.trim().length === 0) {
      throw new ContentClaimTamperingError('Clinical claim text cannot be empty');
    }
    if (!claim.non_diagnostic_limitation || claim.non_diagnostic_limitation.trim().length === 0) {
      throw new ContentClaimTamperingError('Clinical claim must state its non-diagnostic statutory limitation');
    }
    if (!claim.evidence_references || claim.evidence_references.length === 0) {
      throw new ContentClaimTamperingError('Clinical claim must reference at least one governed evidence source');
    }
  }
}
