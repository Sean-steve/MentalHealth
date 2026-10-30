/**
 * MindOS Professional Domain Invariants & Guardrails
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * ADR-026, ADR-027, ADR-028, ADR-029, ADR-030, ADR-031, ADR-032
 */

import {
  ProfessionalType,
  ProfessionalState,
  ProfessionalVerificationState,
  CredentialStatus,
  REGULATED_CLINICAL_TYPES,
  TargetPopulation,
  ServiceType,
  ScopeType
} from './types.js';
import {
  DomainInvariantError,
  SelfVerificationProhibitedError,
  SeparationOfDutiesViolationError,
  ProfessionalScopeDeniedError
} from '../../platform/errors/index.js';

export class ProfessionalInvariants {
  /**
   * ADR-026: Application role != Professional Verification
   */
  public static assertNotRoleBasedVerification(roleCode: string, isVerified: boolean): void {
    if (roleCode === 'PROFESSIONAL' && !isVerified) {
      throw new DomainInvariantError(
        'ROLE_SUBSTITUTION_PROHIBITED: An application role or self-declared profession never substitutes for governed professional verification.'
      );
    }
  }

  /**
   * Section 21 & ADR-016: Separation of duties in verification decisions
   */
  public static assertSeparationOfDuties(applicantUserId: string, reviewerUserId: string): void {
    if (applicantUserId === reviewerUserId) {
      throw new SelfVerificationProhibitedError(
        'SELF_VERIFICATION_PROHIBITED: Applicant cannot review or approve their own professional credentials.'
      );
    }
  }

  /**
   * Section 20: Verifier must hold governed verifier role
   */
  public static assertVerifierRole(reviewerRoles: string[]): void {
    const allowedVerifierRoles = [
      'PROVIDER_VERIFICATION_REVIEWER',
      'REGULATORY_REVIEWER',
      'PROFESSIONAL_NETWORK_ADMIN'
    ];
    const hasRole = reviewerRoles.some(r => allowedVerifierRoles.includes(r));
    if (!hasRole) {
      throw new SeparationOfDutiesViolationError(
        'VERIFIER_ROLE_REQUIRED: Verifier must hold PROVIDER_VERIFICATION_REVIEWER, REGULATORY_REVIEWER, or PROFESSIONAL_NETWORK_ADMIN role.'
      );
    }
  }

  /**
   * ADR-028: Scope derivation guardrails
   */
  public static assertClinicalScopeAuthorization(
    professionalType: ProfessionalType,
    serviceType: ServiceType,
    hasVerifiedClinicalLicense: boolean
  ): void {
    const requiresClinicalLicense = [
      ServiceType.COUNSELLING_SESSION,
      ServiceType.PSYCHOLOGY_SESSION,
      ServiceType.PSYCHIATRY_CONSULTATION
    ];

    if (requiresClinicalLicense.includes(serviceType)) {
      if (!REGULATED_CLINICAL_TYPES.has(professionalType)) {
        throw new ProfessionalScopeDeniedError(
          `SCOPE_TYPE_PROHIBITED: Professional type ${professionalType} cannot deliver clinical service ${serviceType}.`
        );
      }
      if (!hasVerifiedClinicalLicense) {
        throw new ProfessionalScopeDeniedError(
          `UNVERIFIED_CLINICAL_LICENSE: Regulated clinical service ${serviceType} requires a verified regulatory license.`
        );
      }
    }

    if (serviceType === ServiceType.PSYCHIATRY_CONSULTATION && professionalType !== ProfessionalType.PSYCHIATRIST) {
      throw new ProfessionalScopeDeniedError(
        'PSYCHIATRY_RESTRICTED: Only verified Psychiatrists can offer psychiatry consultations or medication evaluations.'
      );
    }
  }

  /**
   * Section 37: Population restrictions (minors)
   */
  public static assertPopulationEligibility(
    targetPopulation: TargetPopulation,
    allowedPopulations: TargetPopulation[],
    restrictions: string[]
  ): void {
    if (targetPopulation === TargetPopulation.CHILDREN || targetPopulation === TargetPopulation.ADOLESCENTS) {
      if (restrictions.includes('ADULTS_ONLY') || restrictions.includes('NO_MINORS')) {
        throw new ProfessionalScopeDeniedError(
          'MINORS_RESTRICTED: Provider practice scope is explicitly restricted to adult populations only.'
        );
      }
    }
    if (!allowedPopulations.includes(targetPopulation)) {
      throw new ProfessionalScopeDeniedError(
        `POPULATION_NOT_PERMITTED: Target population ${targetPopulation} is not permitted under provider verified scope.`
      );
    }
  }

  /**
   * Section 47 & 92: Content moderation for professional bio and service descriptions
   * Prohibits misleading diagnostic marketing claims, cure guarantees, or unverified promises
   */
  public static sanitizeAndValidateContent(text: string, fieldName = 'content'): string {
    if (!text) return '';
    const prohibitedPhrases = [
      'guaranteed cure',
      '100% cure',
      'cure depression instantly',
      'cure ptsd in 1 day',
      'prescribe anything you want',
      'guaranteed diagnosis'
    ];
    const lower = text.toLowerCase();
    for (const phrase of prohibitedPhrases) {
      if (lower.includes(phrase)) {
        throw new DomainInvariantError(
          `PROHIBITED_MARKETING_CLAIM: ${fieldName} contains unsubstantiated or prohibited clinical promise: "${phrase}".`
        );
      }
    }

    // Strip raw javascript: or unsafe script injections
    return text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').trim();
  }
}
