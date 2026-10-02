/**
 * MindOS Care Plan Eligibility Service
 */
import { CarePlanEligibilityStatus } from '../domain/types.js';
import { CareRelationshipService, CareRelationshipState } from '../../care_relationships/index.js';
import { ProfessionalService } from '../../professionals/index.js';
import { ConsentService } from '../../consent/index.js';

export interface EvaluateCarePlanEligibilityParams {
  relationshipId: string;
  professionalId: string;
  planType: string;
  jurisdiction?: string;
}

export interface CarePlanEligibilityResult {
  status: CarePlanEligibilityStatus;
  isEligible: boolean;
  blockers: string[];
  reasons: string[];
  evaluatedAt: string;
}

export class CarePlanEligibilityService {
  public static async evaluate(params: EvaluateCarePlanEligibilityParams): Promise<CarePlanEligibilityResult> {
    const blockers: string[] = [];
    const reasons: string[] = [];

    const rel = await CareRelationshipService.getRelationship(params.relationshipId);
    if (!rel) {
      blockers.push(`CareRelationship ${params.relationshipId} does not exist.`);
    } else if (rel.status !== CareRelationshipState.ACTIVE) {
      blockers.push(`CareRelationship status is ${rel.status}; ACTIVE required for care plan formulation.`);
    } else {
      reasons.push(`Active care relationship verified (ID: ${rel.id}).`);
    }

    const isVerified = ProfessionalService.isVerified(params.professionalId);
    if (!isVerified) blockers.push(`Professional ${params.professionalId} lacks verified clinical credentials.`);
    else reasons.push('Professional verification confirmed.');

    if (rel) {
      const hasConsent = ConsentService.hasActiveConsent(rel.subject_user_id, 'CLINICAL_CONSULTATION');
      if (!hasConsent) blockers.push('Patient has not granted active consent for clinical consultation.');
      else reasons.push('Patient active consent verified.');
    }

    const isEligible = blockers.length === 0;
    const status = isEligible
      ? CarePlanEligibilityStatus.ELIGIBLE
      : blockers.some(b => b.includes('does not exist') || b.includes('verified'))
      ? CarePlanEligibilityStatus.NOT_ELIGIBLE
      : CarePlanEligibilityStatus.REQUIRES_REVIEW;

    return { status, isEligible, blockers, reasons, evaluatedAt: new Date().toISOString() };
  }
}
