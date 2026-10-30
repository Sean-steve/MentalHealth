/**
 * MindOS Care Navigation & Referral Domain Errors
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV
 */

import { DomainInvariantError, AuthorizationError, NotFoundError, ValidationError } from '../../platform/errors/index.js';

export class SafetyOverrideTriggeredError extends DomainInvariantError {
  constructor(message = 'Care navigation preempted by authoritative Safety Kernel crisis state.', details?: Record<string, unknown>) {
    super(message, {
      errorCode: 'NAV_SAFETY_OVERRIDE_TRIGGERED',
      safeUserMessage: 'Immediate support resources have been prioritized based on safety guidelines.',
      ...details
    });
  }
}

export class PathwayNotActiveError extends DomainInvariantError {
  constructor(pathwayCode: string, state: string) {
    super(`Pathway "${pathwayCode}" is not active (current state: ${state}). Only ACTIVE pathways may be recommended or selected.`, {
      errorCode: 'NAV_PATHWAY_NOT_ACTIVE',
      safeUserMessage: 'The selected care pathway is currently not available.'
    });
  }
}

export class ReferralConsentRequiredError extends AuthorizationError {
  constructor(message = 'Explicit patient consent is required to create or share a referral handoff package.') {
    super(message, {
      errorCode: 'AUTHZ_001',
      safeUserMessage: 'Consent is required before referral details can be prepared or shared.'
    });
  }
}

export class UnverifiedProviderReferralError extends DomainInvariantError {
  constructor(providerId: string, reason = 'Provider is not verified or license is invalid/expired.') {
    super(`Cannot route referral to provider "${providerId}": ${reason}`, {
      errorCode: 'NAV_UNVERIFIED_PROVIDER_PROHIBITED',
      safeUserMessage: 'Referrals can only be established with licensed, verified professionals.'
    });
  }
}

export class InvalidReferralTransitionError extends DomainInvariantError {
  constructor(referralId: string, fromState: string, toState: string) {
    super(`Invalid referral lifecycle transition from "${fromState}" to "${toState}" on referral ${referralId}.`, {
      errorCode: 'NAV_INVALID_REFERRAL_TRANSITION',
      safeUserMessage: `The requested referral status change from ${fromState} to ${toState} is invalid.`
    });
  }
}

export class HandoffPackageExpiredOrRevokedError extends AuthorizationError {
  constructor(packageId: string, state: string) {
    super(`Referral handoff package "${packageId}" is ${state} and cannot be accessed.`, {
      errorCode: 'AUTHZ_001',
      safeUserMessage: 'This referral handoff information has expired or access has been revoked.'
    });
  }
}
