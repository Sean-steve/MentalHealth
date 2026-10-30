/**
 * MindOS Provenance & Truth Layer Integrity Engine
 * Authority: ADR-005, ADR-013, Volume VIII Section 4 & Appendix B
 * 
 * Invariants:
 * 1. AI-generated inferences or user self-reports can never be persisted as DIAGNOSIS or CLINICAL_FINDING.
 * 2. Only licensed, verified healthcare professionals can author records classified as DIAGNOSIS or CLINICAL_FINDING.
 * 3. Machine-generated interpretations must always carry AI_INFERRED provenance and confidence metrics.
 */

import { ProvenanceSource, TruthCategory, UUID, UtcIsoTimestamp } from '../types.js';
import { DomainInvariantError, SecurityError } from '../../errors/index.js';

export interface ProvenanceRecord {
  source: ProvenanceSource;
  sourceRef?: UUID;
  truthCategory: TruthCategory;
  recordedBy: UUID;
  recordedAt: UtcIsoTimestamp;
  confidenceScore?: number; // 0.0 to 1.0 (mandatory for AI_INFERRED)
  methodologyOrModelRef?: string;
}

export class TruthLayerValidator {
  /**
   * Validates that an observation or medical record does not violate provenance truth boundaries
   */
  public static validate(
    provenance: ProvenanceRecord,
    actorRoles: string[] = []
  ): void {
    // Invariant 1: AI_INFERRED cannot be DIAGNOSIS or CLINICAL_FINDING
    if (provenance.source === ProvenanceSource.AI_INFERRED) {
      if (
        provenance.truthCategory === TruthCategory.DIAGNOSIS ||
        provenance.truthCategory === TruthCategory.CLINICAL_FINDING
      ) {
        throw new DomainInvariantError(
          `CLINICAL_PROVENANCE_VIOLATION: AI-generated outputs cannot be recorded as ${provenance.truthCategory}. AI outputs must be classified as INTERPRETATION or RECOMMENDATION.`
        );
      }

      if (provenance.confidenceScore === undefined || provenance.confidenceScore === null) {
        throw new DomainInvariantError(
          'AI_PROVENANCE_VIOLATION: Machine-generated inferences must declare a confidenceScore.'
        );
      }
    }

    // Invariant 2: USER_REPORTED cannot be DIAGNOSIS
    if (provenance.source === ProvenanceSource.USER_REPORTED) {
      if (provenance.truthCategory === TruthCategory.DIAGNOSIS) {
        throw new DomainInvariantError(
          'USER_DIAGNOSIS_VIOLATION: Self-reported experiences cannot be recorded as formal medical diagnoses.'
        );
      }
    }

    // Invariant 3: DIAGNOSIS or CLINICAL_FINDING requires verified clinical authority
    if (
      provenance.truthCategory === TruthCategory.DIAGNOSIS ||
      provenance.truthCategory === TruthCategory.CLINICAL_FINDING
    ) {
      if (
        provenance.source !== ProvenanceSource.CLINICALLY_ASSESSED &&
        provenance.source !== ProvenanceSource.PROFESSIONAL_RECORDED
      ) {
        throw new DomainInvariantError(
          `DIAGNOSIS_SOURCE_VIOLATION: Clinical diagnoses must have source CLINICALLY_ASSESSED or PROFESSIONAL_RECORDED, received: ${provenance.source}`
        );
      }

      const hasClinicalRole = actorRoles.some(r =>
        ['VERIFIED_PROFESSIONAL', 'LICENSED_CLINICIAN', 'PSYCHIATRIST', 'CLINICAL_SUPERVISOR'].includes(r)
      );

      if (actorRoles.length > 0 && !hasClinicalRole) {
        throw new SecurityError(
          'UNAUTHORIZED_CLINICAL_AUTHORSHIP: Only licensed healthcare professionals may author diagnoses or clinical findings.'
        );
      }
    }
  }
}
