/**
 * MindOS Canonical Purposes & Purpose Validation
 * Authority: Master Architecture Index Section 14, Volume VIII, Sections 18-20
 * ADR-016
 */

import { DataClassification } from '../../shared/data_classification.js';

export const CanonicalPurposes = {
  SELF_SERVICE: 'SELF_SERVICE',
  CARE_DELIVERY: 'CARE_DELIVERY',
  CLINICAL_REVIEW: 'CLINICAL_REVIEW',
  SAFETY_RESPONSE: 'SAFETY_RESPONSE',
  PRIVACY_REQUEST: 'PRIVACY_REQUEST',
  REGULATORY_AUDIT: 'REGULATORY_AUDIT',
  MODERATION: 'MODERATION',
  SECURITY_INVESTIGATION: 'SECURITY_INVESTIGATION',
  SYSTEM_OPERATION: 'SYSTEM_OPERATION',
  PROVIDER_ONBOARDING: 'PROVIDER_ONBOARDING',
  PROVIDER_VERIFICATION: 'PROVIDER_VERIFICATION',
  REFERRAL: 'REFERRAL'
} as const;

export type CanonicalPurpose = typeof CanonicalPurposes[keyof typeof CanonicalPurposes];

export const VALID_PURPOSES = new Set<string>([
  ...Object.values(CanonicalPurposes),
  'DIRECT_CLINICAL_CARE',
  'CLINICAL_CARE',
  'TREATMENT',
  'EMERGENCY_CARE',
  'SYSTEM_ADMINISTRATION',
  'COMPLIANCE_AUDIT',
  'PROVIDER_ONBOARDING',
  'PROVIDER_VERIFICATION',
  'REFERRAL'
]);

/**
 * Normalizes and validates whether a given purpose string corresponds to a canonical purpose.
 */
export function isCanonicalPurpose(purpose: string): boolean {
  if (!purpose || typeof purpose !== 'string') return false;
  const normalized = purpose.trim().toUpperCase();
  if (VALID_PURPOSES.has(normalized)) return true;

  // Accept human-readable forms with spaces or mixed case if they match
  const standardized = normalized.replace(/[\s-]+/g, '_');
  return VALID_PURPOSES.has(standardized);
}

/**
 * Checks whether the data classification mandates an explicit, recognized canonical purpose.
 */
export function requiresExplicitPurpose(classification?: DataClassification): boolean {
  if (!classification) return false;
  return (
    classification === DataClassification.HEALTH_SENSITIVE ||
    classification === DataClassification.CLINICAL_RECORD ||
    classification === DataClassification.CRITICAL ||
    classification === DataClassification.RESTRICTED
  );
}
