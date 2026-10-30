/**
 * MindOS Care Relationship Eligibility Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Evaluates combined user, provider, credential, jurisdiction, consent and policy readiness.
 */

import { CareRelationshipEligibilityStatus } from '../domain/types.js';
import { ProfessionalService } from '../../professionals/index.js';
import { ConsentService } from '../../consent/index.js';

export interface EligibilityEvaluationParams {
  userId: string;
  professionalId: string;
  providerId?: string;
  serviceType?: string;
  jurisdiction?: string;
  referralId?: string;
  appointmentId?: string;
  requiredConsentType?: string;
}

export interface EligibilityEvaluationResult {
  status: CareRelationshipEligibilityStatus;
  isEligible: boolean;
  reasons: string[];
  blockers: string[];
  evaluatedAt: string;
  metadata?: Record<string, unknown>;
}

export class CareRelationshipEligibilityService {
  public static async evaluateEligibility(
    params: EligibilityEvaluationParams
  ): Promise<EligibilityEvaluationResult> {
    const blockers: string[] = [];
    const reasons: string[] = [];
    const jurisdiction = params.jurisdiction || 'KE';

    // 1. Professional Eligibility Check
    try {
      const profRepo = ProfessionalService.getRepository();
      const profile = await profRepo.findProfileById(params.professionalId);

      if (!profile) {
        blockers.push(`Professional with ID ${params.professionalId} not found.`);
      } else {
        if (profile.status === 'SUSPENDED') {
          blockers.push(`Professional is currently SUSPENDED.`);
        }
        if (profile.status !== 'ACTIVE' && profile.status !== 'VERIFIED') {
          blockers.push(`Professional status is ${profile.status}, requires ACTIVE or VERIFIED.`);
        }
        if (!ProfessionalService.isVerified(params.professionalId)) {
          blockers.push(`Professional is not verified by recognized regulatory authority.`);
        }

        // Check jurisdiction
        if (profile.jurisdictions && profile.jurisdictions.length > 0 && !profile.jurisdictions.includes(jurisdiction)) {
          blockers.push(`Professional jurisdiction [${profile.jurisdictions.join(', ')}] does not cover required ${jurisdiction}.`);
        }

        // Check credentials / license expiry
        const credentials = await profRepo.listCredentialsByProfessionalId(params.professionalId);
        const nowIso = new Date().toISOString();
        const hasExpiredLicense = credentials.some(c => c.expiry_date && c.expiry_date < nowIso);
        if (hasExpiredLicense) {
          blockers.push(`Professional has one or more expired licenses/credentials.`);
        }
      }
    } catch (err: unknown) {
      blockers.push(`Failed to verify professional credentials: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 2. Consent Verification
    const consentType = params.requiredConsentType || 'CLINICAL_CONSULTATION';
    const hasConsent = ConsentService.hasActiveConsent(params.userId, consentType);
    if (!hasConsent) {
      blockers.push(`User ${params.userId} has not granted active consent for ${consentType}.`);
    } else {
      reasons.push(`Active user consent verified for ${consentType}.`);
    }

    const isEligible = blockers.length === 0;
    const status = isEligible
      ? CareRelationshipEligibilityStatus.ELIGIBLE
      : blockers.length > 0 && blockers.every(b => b.includes('not found') || b.includes('status'))
      ? CareRelationshipEligibilityStatus.REQUIRES_REVIEW
      : CareRelationshipEligibilityStatus.NOT_ELIGIBLE;

    return {
      status,
      isEligible,
      reasons,
      blockers,
      evaluatedAt: new Date().toISOString(),
      metadata: {
        userId: params.userId,
        professionalId: params.professionalId,
        jurisdiction
      }
    };
  }
}
