/**
 * MindOS Clinical Reviewer Eligibility Engine
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendix B
 * Invariant: Ordinary administrators without verified clinical credentials SHALL NOT
 *            exercise clinical decision authority. Artifact authors cannot self-approve.
 */

import { ClinicalReviewerSpecialty, ClinicalRiskClass, ClinicalReviewLevel } from '../types.js';
import { AuthorizationError, ValidationError } from '../../platform/errors/index.js';

export interface ClinicalReviewerProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  has_verified_license: boolean;
  license_number?: string;
  licensing_board?: string; // e.g., 'KMPDC' (Kenya Medical Practitioners and Dentists Council)
  jurisdictions: string[];
  specialties: ClinicalReviewerSpecialty[];
  conflict_of_interest_cleared: boolean;
}

export class ClinicalReviewerEligibilityEngine {
  private static defaultReviewers: Map<string, ClinicalReviewerProfile> = new Map([
    [
      'rev-cmo-01',
      {
        id: 'rev-cmo-01',
        name: 'Dr. Sarah Wambui, MD, MMed Psych',
        email: 's.wambui@mindos.ke',
        role: 'CHIEF_MEDICAL_OFFICER',
        is_active: true,
        has_verified_license: true,
        license_number: 'KMPDC-A98211',
        licensing_board: 'KMPDC',
        jurisdictions: ['KE', 'GLOBAL'],
        specialties: [
          ClinicalReviewerSpecialty.PSYCHIATRY,
          ClinicalReviewerSpecialty.EMERGENCY_CRISIS_CARE,
          ClinicalReviewerSpecialty.GENERAL_MENTAL_HEALTH
        ],
        conflict_of_interest_cleared: true
      }
    ],
    [
      'rev-psych-02',
      {
        id: 'rev-psych-02',
        name: 'Dr. David Kiprop, PhD Clinical Psych',
        email: 'd.kiprop@mindos.ke',
        role: 'CLINICAL_REVIEWER',
        is_active: true,
        has_verified_license: true,
        license_number: 'KMPDC-CP4412',
        licensing_board: 'KMPDC',
        jurisdictions: ['KE'],
        specialties: [
          ClinicalReviewerSpecialty.CLINICAL_PSYCHOLOGY,
          ClinicalReviewerSpecialty.COUNSELLING_PSYCHOLOGY,
          ClinicalReviewerSpecialty.GENERAL_MENTAL_HEALTH
        ],
        conflict_of_interest_cleared: true
      }
    ],
    [
      'rev-gov-lead-03',
      {
        id: 'rev-gov-lead-03',
        name: 'Dr. Amina Hassan, MBChB, MSc',
        email: 'a.hassan@mindos.ke',
        role: 'CLINICAL_GOVERNANCE_LEAD',
        is_active: true,
        has_verified_license: true,
        license_number: 'KMPDC-A55102',
        licensing_board: 'KMPDC',
        jurisdictions: ['KE', 'GLOBAL'],
        specialties: [
          ClinicalReviewerSpecialty.GENERAL_MENTAL_HEALTH,
          ClinicalReviewerSpecialty.EMERGENCY_CRISIS_CARE
        ],
        conflict_of_interest_cleared: true
      }
    ],
    [
      'rev-junior-counsellor-04',
      {
        id: 'rev-junior-counsellor-04',
        name: 'Grace Mutua, MA Counselling',
        email: 'g.mutua@mindos.ke',
        role: 'CLINICAL_REVIEWER',
        is_active: true,
        has_verified_license: true,
        license_number: 'KCPA-8819',
        licensing_board: 'KCPA',
        jurisdictions: ['KE'],
        specialties: [
          ClinicalReviewerSpecialty.COUNSELLING_PSYCHOLOGY
        ],
        conflict_of_interest_cleared: true
      }
    ]
  ]);

  private static registeredReviewers: Map<string, ClinicalReviewerProfile> = new Map(
    ClinicalReviewerEligibilityEngine.defaultReviewers
  );

  public static registerReviewer(profile: Partial<ClinicalReviewerProfile> & { id?: string; reviewer_id?: string }): void {
    const id = profile.id || profile.reviewer_id || '';
    const fullProfile: ClinicalReviewerProfile = {
      id,
      name: profile.name || id,
      email: profile.email || `${id}@mindos.ke`,
      role: profile.role || 'CLINICAL_REVIEWER',
      is_active: profile.is_active !== undefined ? profile.is_active : true,
      has_verified_license: profile.has_verified_license !== undefined ? profile.has_verified_license : true,
      license_number: profile.license_number,
      licensing_board: profile.licensing_board || 'KMPDC',
      jurisdictions: profile.jurisdictions || ['KE', 'GLOBAL'],
      specialties: profile.specialties || [ClinicalReviewerSpecialty.GENERAL_MENTAL_HEALTH],
      conflict_of_interest_cleared: profile.conflict_of_interest_cleared !== undefined ? profile.conflict_of_interest_cleared : true
    };
    ClinicalReviewerEligibilityEngine.registeredReviewers.set(id, fullProfile);
  }

  public static resetForTesting(): void {
    ClinicalReviewerEligibilityEngine.registeredReviewers.clear();
    for (const [k, v] of ClinicalReviewerEligibilityEngine.defaultReviewers.entries()) {
      ClinicalReviewerEligibilityEngine.registeredReviewers.set(k, { ...v });
    }
  }

  public static getReviewer(id: string): ClinicalReviewerProfile | undefined {
    return ClinicalReviewerEligibilityEngine.registeredReviewers.get(id);
  }

  public static listReviewers(): ClinicalReviewerProfile[] {
    return Array.from(ClinicalReviewerEligibilityEngine.registeredReviewers.values());
  }

  /**
   * Evaluates if a reviewer is eligible to review and approve a given artifact.
   * Throws AuthorizationError or ValidationError if ineligible.
   */
  public static verifyEligibility(params: {
    reviewerId: string;
    artifactOwnerId: string;
    clinicalRiskClass: ClinicalRiskClass;
    reviewLevel: ClinicalReviewLevel;
    requiredSpecialty?: ClinicalReviewerSpecialty;
    jurisdictionScope?: string[];
  }): ClinicalReviewerProfile {
    // 1. Separation of Duties: Author cannot self-approve (R-GOV-002)
    if (params.reviewerId === params.artifactOwnerId) {
      throw new AuthorizationError(
        'CLINICAL_SELF_APPROVAL_PROHIBITED: Clinical author cannot review or approve their own clinical artifact.',
        { errorCode: 'AUTHZ_004', internalContext: { reviewerId: params.reviewerId } }
      );
    }

    const reviewer = ClinicalReviewerEligibilityEngine.registeredReviewers.get(params.reviewerId);

    // 2. Verified Clinical Reviewer Identity
    if (!reviewer) {
      throw new AuthorizationError(
        `CLINICAL_REVIEWER_NOT_ELIGIBLE: Reviewer "${params.reviewerId}" is not a registered clinical reviewer. Ordinary administrator accounts cannot exercise clinical authority.`,
        { errorCode: 'AUTHZ_003', internalContext: { reviewerId: params.reviewerId } }
      );
    }

    // 3. Account Active & Conflict Cleared
    if (!reviewer.is_active) {
      throw new AuthorizationError(
        `CLINICAL_REVIEWER_NOT_ELIGIBLE: Clinical reviewer "${reviewer.name}" account is inactive.`,
        { errorCode: 'AUTHZ_003', internalContext: { reviewerId: params.reviewerId } }
      );
    }

    if (!reviewer.conflict_of_interest_cleared) {
      throw new AuthorizationError(
        `CLINICAL_REVIEWER_NOT_ELIGIBLE: Reviewer "${reviewer.name}" has an active conflict of interest declaration.`,
        { errorCode: 'AUTHZ_003', internalContext: { reviewerId: params.reviewerId } }
      );
    }

    // 4. Professional Credentials & Licensing Verification
    if (!reviewer.has_verified_license) {
      throw new AuthorizationError(
        `CLINICAL_REVIEWER_NOT_ELIGIBLE: Reviewer "${reviewer.name}" lacks verified professional medical/psychological credentials.`,
        { errorCode: 'AUTHZ_003', internalContext: { reviewerId: params.reviewerId } }
      );
    }

    // 5. Specialty Enforcement for High-Risk (CR-3) or Specialist Reviews
    if (params.clinicalRiskClass === 'CR-3' || params.reviewLevel === ClinicalReviewLevel.SPECIALIST_REVIEW) {
      const allowedSpecialties = [
        ClinicalReviewerSpecialty.PSYCHIATRY,
        ClinicalReviewerSpecialty.CLINICAL_PSYCHOLOGY
      ];
      const hasSpecialist = reviewer.specialties.some(s => allowedSpecialties.includes(s));
      if (!hasSpecialist) {
        throw new AuthorizationError(
          `CLINICAL_REVIEWER_NOT_ELIGIBLE: CR-3 critical artifacts require specialist review (Psychiatry or Clinical Psychology). Reviewer "${reviewer.name}" is not licensed in these specialties.`,
          { errorCode: 'AUTHZ_003', internalContext: { reviewerSpecialties: reviewer.specialties } }
        );
      }
    }

    // 6. Mandatory required specialty if specified
    if (params.requiredSpecialty) {
      const satisfiesSpecialty = 
        reviewer.specialties.includes(params.requiredSpecialty) ||
        (params.requiredSpecialty === ClinicalReviewerSpecialty.GENERAL_MENTAL_HEALTH &&
          reviewer.specialties.some(s => [
            ClinicalReviewerSpecialty.PSYCHIATRY,
            ClinicalReviewerSpecialty.CLINICAL_PSYCHOLOGY,
            ClinicalReviewerSpecialty.COUNSELLING_PSYCHOLOGY,
            ClinicalReviewerSpecialty.GENERAL_MENTAL_HEALTH
          ].includes(s)));

      if (!satisfiesSpecialty) {
        throw new AuthorizationError(
          `CLINICAL_REVIEWER_NOT_ELIGIBLE: Review requires specialty ${params.requiredSpecialty}. Reviewer has [${reviewer.specialties.join(', ')}].`,
          { errorCode: 'AUTHZ_003', internalContext: { requiredSpecialty: params.requiredSpecialty } }
        );
      }
    }

    // 7. Jurisdiction Scope Check
    if (params.jurisdictionScope && params.jurisdictionScope.length > 0) {
      const hasJurisdiction = params.jurisdictionScope.some(
        j => reviewer.jurisdictions.includes(j) || reviewer.jurisdictions.includes('GLOBAL')
      );
      if (!hasJurisdiction) {
        throw new AuthorizationError(
          `CLINICAL_REVIEWER_NOT_ELIGIBLE: Reviewer "${reviewer.name}" is not authorized for jurisdiction scope [${params.jurisdictionScope.join(', ')}].`,
          { errorCode: 'AUTHZ_003', internalContext: { reviewerJurisdictions: reviewer.jurisdictions } }
        );
      }
    }

    return reviewer;
  }
}
