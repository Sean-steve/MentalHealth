/**
 * MindOS Clinical Evidence Adequacy Engine
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendix B
 * Evaluates whether submitted evidence sufficiently supports declared clinical claims,
 * risk classification, and population boundaries.
 */

import {
  ClinicalArtifactType,
  ClinicalRiskClass,
  ClinicalClaim,
  ClinicalEvidenceMetadata,
  ClinicalClaimEvidenceLink,
  EvidenceAdequacyResult,
  ClinicalClaimStrength,
  ClinicalEvidenceQuality,
  EvidenceRelationshipType
} from '../types.js';
import { ClinicalGovernancePersistence } from '../infrastructure/persistence.js';
import { ValidationError } from '../../platform/errors/index.js';

export interface ClaimAdequacyDetail {
  claim_id: string;
  claim_code: string;
  claim_text: string;
  strength: ClinicalClaimStrength;
  status: EvidenceAdequacyResult;
  supporting_evidence_count: number;
  contradictory_evidence_count: number;
  quality_assessed: ClinicalEvidenceQuality;
  reasons: string[];
}

export interface ArtifactEvidenceAdequacyReport {
  overall_result: EvidenceAdequacyResult;
  is_approval_blocked: boolean;
  claims_evaluated: number;
  adequate_claims: number;
  inadequate_claims: number;
  contradictions_detected: boolean;
  retractions_detected: boolean;
  claim_details: ClaimAdequacyDetail[];
  summary: string;
}

export class ClinicalEvidenceAdequacyService {
  public static async evaluateArtifactEvidence(artifactId: string, version: number): Promise<{
    is_adequate: boolean;
    missing_requirements: string[];
    report: ArtifactEvidenceAdequacyReport;
  }> {
    const artifact = await ClinicalGovernancePersistence.getArtifact(artifactId);
    if (!artifact) {
      throw new ValidationError(`Artifact ${artifactId} not found`);
    }
    const claims = await ClinicalGovernancePersistence.getClaims(artifactId, version);
    const allEvidence = await ClinicalGovernancePersistence.listEvidenceMetadata();
    const allLinks = await ClinicalGovernancePersistence.getAllClaimEvidenceLinks();

    const claimIds = new Set(claims.map(c => c.id));
    const artifactLinks = allLinks.filter(l => claimIds.has(l.claim_id));

    const report = this.evaluate({
      artifactType: artifact.artifact_type,
      clinicalRiskClass: artifact.clinical_risk_class,
      claims,
      evidence: allEvidence,
      links: artifactLinks
    });

    const missing_requirements: string[] = [];
    if (report.overall_result !== EvidenceAdequacyResult.ADEQUATE || report.is_approval_blocked) {
      for (const cd of report.claim_details) {
        if (cd.status !== EvidenceAdequacyResult.ADEQUATE) {
          missing_requirements.push(...cd.reasons);
        }
      }
      if (report.retractions_detected) {
        missing_requirements.push('Retracted or invalidated clinical evidence detected');
      }
    }

    return {
      is_adequate: !report.is_approval_blocked && report.overall_result === EvidenceAdequacyResult.ADEQUATE,
      missing_requirements,
      report
    };
  }

  public static evaluate(params: {
    artifactType: ClinicalArtifactType;
    clinicalRiskClass: ClinicalRiskClass;
    claims: ClinicalClaim[];
    evidence: ClinicalEvidenceMetadata[];
    links: ClinicalClaimEvidenceLink[];
  }): ArtifactEvidenceAdequacyReport {
    const claim_details: ClaimAdequacyDetail[] = [];
    let contradictions_detected = false;
    let retractions_detected = false;

    // Check if any linked evidence for these claims has been retracted or invalidated
    const claimIds = new Set(params.claims.map(c => c.id));
    const claimRelevantLinks = params.links.filter(l => claimIds.has(l.claim_id));
    const linkedEvidenceIds = new Set(claimRelevantLinks.map(l => l.evidence_id));
    for (const ev of params.evidence) {
      if (linkedEvidenceIds.has(ev.id)) {
        if (ev.status === 'RETRACTED' || ev.status === 'INVALIDATED' || (ev as any).is_retracted) {
          retractions_detected = true;
        }
      }
    }

    for (const claim of params.claims) {
      const claimLinks = params.links.filter(l => l.claim_id === claim.id);
      const supportingLinks = claimLinks.filter(l => l.relationship_type === EvidenceRelationshipType.SUPPORTS);
      const contradictoryLinks = claimLinks.filter(l => l.relationship_type === EvidenceRelationshipType.CONTRADICTS);

      if (contradictoryLinks.length > 0) {
        contradictions_detected = true;
      }

      const supportingEvs = params.evidence.filter(ev => 
        supportingLinks.some(l => l.evidence_id === ev.id)
      );

      const reasons: string[] = [];
      let claimStatus: EvidenceAdequacyResult = EvidenceAdequacyResult.ADEQUATE;
      let highestQuality = ClinicalEvidenceQuality.LOW;

      // Check if any linked supporting evidence is retracted
      const hasRetractedSupporting = supportingEvs.some(
        ev => ev.status === 'RETRACTED' || ev.status === 'INVALIDATED' || (ev as any).is_retracted
      );
      if (hasRetractedSupporting) {
        claimStatus = EvidenceAdequacyResult.INADEQUATE;
        reasons.push('Linked supporting evidence has been retracted or invalidated by publisher.');
      }

      // Check evidence requirements based on claim strength
      const isStrongClaim = 
        claim.strength === ClinicalClaimStrength.HIGH_CONFIDENCE ||
        claim.strength === ClinicalClaimStrength.VALIDATED ||
        claim.strength === ClinicalClaimStrength.STRONG;

      if (isStrongClaim) {
        if (supportingEvs.length === 0) {
          claimStatus = EvidenceAdequacyResult.INADEQUATE;
          reasons.push(`Claim strength "${claim.strength}" requires empirical evidence, but none was linked.`);
        } else {
          // Check for Oxford Level or high quality
          const hasAdequateLevel = supportingEvs.some(ev => {
            if (ev.oxford_level) {
              const cleanLvl = ev.oxford_level.toUpperCase().replace(/LEVEL/g, '').trim();
              const hasLevel1or2 = 
                cleanLvl.includes('1') || cleanLvl.includes('2') ||
                cleanLvl === 'I' || cleanLvl.startsWith('I') && !cleanLvl.startsWith('IV') ||
                cleanLvl.includes('II');
              if (hasLevel1or2) return true;
            }
            const q = ev.quality_rating || ev.evidence_quality;
            return (
              q === ClinicalEvidenceQuality.HIGH ||
              q === ClinicalEvidenceQuality.SYSTEMATIC_RIGOR ||
              q === ClinicalEvidenceQuality.HIGH_QUALITY
            );
          });

          const hasOnlyLowOrAnecdotal = supportingEvs.every(ev => {
            const cleanLvl = (ev.oxford_level || '').toUpperCase().replace(/LEVEL/g, '').trim();
            const isLowLvl = cleanLvl.includes('4') || cleanLvl.includes('5') || cleanLvl.includes('IV') || cleanLvl.includes('V');
            const q = ev.quality_rating || ev.evidence_quality;
            const isLowQuality = 
              q === ClinicalEvidenceQuality.LOW ||
              q === ClinicalEvidenceQuality.CRITICAL_RISK_OF_BIAS;
            return isLowLvl || isLowQuality;
          });

          if (!hasAdequateLevel || hasOnlyLowOrAnecdotal) {
            claimStatus = EvidenceAdequacyResult.INADEQUATE;
            reasons.push(
              `Claim strength "${claim.strength}" requires at least Oxford Level II evidence (RCT or systematic review); only lower quality or anecdotal evidence provided.`
            );
          }
        }
      } else if (claim.strength === ClinicalClaimStrength.SUPPORTED || claim.strength === ClinicalClaimStrength.MODERATE) {
        if (supportingEvs.length === 0) {
          claimStatus = EvidenceAdequacyResult.INADEQUATE;
          reasons.push('Supported claim has no linked evidence citations.');
        }
      } else {
        // INFORMATIONAL
        if (supportingEvs.length === 0) {
          reasons.push('Informational claim with no formal evidence citation.');
        }
      }

      // If contradictory evidence exists and is not accounted for
      if (contradictoryLinks.length > 0) {
        if (isStrongClaim || params.clinicalRiskClass === 'CR-3') {
          claimStatus = EvidenceAdequacyResult.INADEQUATE;
          reasons.push('Material contradictory evidence detected for critical claim without documented clinical resolution.');
        } else {
          if (claimStatus === EvidenceAdequacyResult.ADEQUATE) {
            claimStatus = EvidenceAdequacyResult.PARTIALLY_ADEQUATE;
          }
          reasons.push('Contradictory evidence noted: reviewer must review clinical limitations.');
        }
      }

      // Determine highest quality assessed
      for (const ev of supportingEvs) {
        const q = ev.quality_rating || ev.evidence_quality;
        if (q === ClinicalEvidenceQuality.SYSTEMATIC_RIGOR) {
          highestQuality = ClinicalEvidenceQuality.SYSTEMATIC_RIGOR;
        } else if ((q === ClinicalEvidenceQuality.HIGH || q === ClinicalEvidenceQuality.HIGH_QUALITY) && highestQuality !== ClinicalEvidenceQuality.SYSTEMATIC_RIGOR) {
          highestQuality = ClinicalEvidenceQuality.HIGH;
        } else if (q === ClinicalEvidenceQuality.MODERATE && highestQuality === ClinicalEvidenceQuality.LOW) {
          highestQuality = ClinicalEvidenceQuality.MODERATE;
        }
      }

      claim_details.push({
        claim_id: claim.id,
        claim_code: claim.claim_code,
        claim_text: claim.claim_text,
        strength: claim.strength,
        status: claimStatus,
        supporting_evidence_count: supportingLinks.length,
        contradictory_evidence_count: contradictoryLinks.length,
        quality_assessed: highestQuality,
        reasons
      });
    }

    // Evaluate overall result
    let overall_result = EvidenceAdequacyResult.ADEQUATE;
    const inadequateCount = claim_details.filter(c => c.status === EvidenceAdequacyResult.INADEQUATE).length;
    const partialCount = claim_details.filter(c => c.status === EvidenceAdequacyResult.PARTIALLY_ADEQUATE).length;

    if (retractions_detected || inadequateCount > 0) {
      overall_result = EvidenceAdequacyResult.INADEQUATE;
    } else if (partialCount > 0) {
      overall_result = EvidenceAdequacyResult.PARTIALLY_ADEQUATE;
    }

    // If zero claims were provided for high-risk artifacts
    if (params.claims.length === 0 && (params.clinicalRiskClass === 'CR-2' || params.clinicalRiskClass === 'CR-3')) {
      overall_result = EvidenceAdequacyResult.INADEQUATE;
    }

    // High risk CR-2 or CR-3 artifacts strictly block approval if evidence is inadequate or partially adequate without specialist justification
    const is_approval_blocked = overall_result === EvidenceAdequacyResult.INADEQUATE || retractions_detected;

    let summary = `Evidence evaluation completed: ${claim_details.length - inadequateCount}/${claim_details.length} claims adequate.`;
    if (retractions_detected) {
      summary += ' CRITICAL: Retracted or invalidated evidence records detected.';
    }
    if (contradictions_detected) {
      summary += ' WARNING: Contradictory evidence identified in evidence graph.';
    }

    return {
      overall_result,
      is_approval_blocked,
      claims_evaluated: claim_details.length,
      adequate_claims: claim_details.filter(c => c.status === EvidenceAdequacyResult.ADEQUATE).length,
      inadequate_claims: inadequateCount,
      contradictions_detected,
      retractions_detected,
      claim_details,
      summary
    };
  }
}
