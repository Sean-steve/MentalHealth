/**
 * MindOS Care Navigation Domain Invariants
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
 * Clinical Safety Policy Catalogue (R-SAFE-001, R-NAV-001..010)
 */

import {
  CareLevel,
  NeedAcuity,
  RiskState,
  CarePathwayEntity,
  CarePathwayState,
  ReferralEntity,
  ReferralState,
  ProviderMatchingProfileEntity,
  ProfessionalVerificationState
} from './types.js';
import {
  SafetyOverrideTriggeredError,
  PathwayNotActiveError,
  UnverifiedProviderReferralError,
  InvalidReferralTransitionError,
  ReferralConsentRequiredError
} from './errors.js';
import { DomainInvariantError } from '../../platform/errors/index.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';

export class CareNavigationInvariants {
  /**
   * R-NAV-001: Authoritative Safety Override
   * If user has active risk state URGENT or HIGH, care navigation must prioritize crisis intervention.
   */
  public static assertSafetyStateCompatibility(riskState: RiskState | string, requestedCareLevel?: CareLevel): void {
    if (riskState === RiskState.URGENT || riskState === 'URGENT') {
      if (requestedCareLevel && requestedCareLevel !== CareLevel.LEVEL_EMERGENCY && requestedCareLevel !== CareLevel.LEVEL_4) {
        throw new SafetyOverrideTriggeredError(
          `R-SAFE-001 / R-NAV-001: User is in active URGENT risk state. Ordinary stepped-care level "${requestedCareLevel}" cannot override immediate crisis response.`
        );
      }
    }
  }

  /**
   * Validates pathway definition structure and statutory notices
   */
  public static assertPathwayValid(pathway: Partial<CarePathwayEntity>): void {
    if (!pathway.statutory_disclaimer || pathway.statutory_disclaimer.trim().length === 0) {
      throw new DomainInvariantError(
        'R-NAV-001: Care pathways must declare statutory non-diagnostic disclaimer.'
      );
    }
    if (pathway.care_level === CareLevel.LEVEL_4 && (!pathway.emergency_escalation_targets || pathway.emergency_escalation_targets.length === 0)) {
      throw new DomainInvariantError(
        'R-NAV-001: LEVEL_4 acute care pathways must declare emergency escalation targets.'
      );
    }
  }

  /**
   * R-NAV-007: Only ACTIVE pathways may be recommended or selected
   */
  public static assertPathwayActive(pathway: CarePathwayEntity): void {
    if (pathway.state !== CarePathwayState.ACTIVE) {
      throw new PathwayNotActiveError(pathway.code, pathway.state);
    }
  }

  /**
   * R-NAV-004: Referrals may ONLY be directed to verified providers
   */
  public static assertProviderEligibleForReferral(provider: ProviderMatchingProfileEntity): void {
    if (provider.verification_state !== ProfessionalVerificationState.APPROVED) {
      throw new UnverifiedProviderReferralError(
        provider.professional_id,
        `Verification state is ${provider.verification_state}, must be APPROVED.`
      );
    }

    const now = Date.now();
    const expiry = new Date(provider.license_expires_at).getTime();
    if (expiry <= now) {
      throw new UnverifiedProviderReferralError(
        provider.professional_id,
        `License expired on ${provider.license_expires_at}.`
      );
    }
  }

  /**
   * R-NAV-003: Referral creation/handoff requires explicit consent
   */
  public static assertReferralConsent(hasConsent: boolean): void {
    if (!hasConsent) {
      throw new ReferralConsentRequiredError();
    }
  }

  /**
   * R-NAV-009: Referral lifecycle state transition enforcement
   */
  public static validateReferralTransition(
    referral: ReferralEntity,
    targetState: ReferralState,
    actorId?: string
  ): void {
    try {
      validateStateTransition('ReferralState', referral.state, targetState, referral.id, actorId);
    } catch (err: any) {
      throw new InvalidReferralTransitionError(referral.id, referral.state, targetState);
    }
  }

  /**
   * Statutory non-diagnostic screening disclaimer
   */
  public static readonly STATUTORY_DISCLAIMER =
    'Notice: MindOS care navigation provides stepped-care guidance and support matching. This service does not establish a medical diagnosis and does not constitute formal medical prescription or emergency treatment.';
}
