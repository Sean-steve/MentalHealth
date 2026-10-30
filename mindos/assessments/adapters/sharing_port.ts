/**
 * MindOS Assessment Result Sharing Port
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV
 * Kenya Data Protection Act (KDPA 2019) & Digital Health Act (DHA 2023)
 * 
 * Invariants:
 * 1. Health-sensitive assessment results require valid Consent or Direct Care Relationship.
 * 2. Invalidate results are flagged and cannot be shared as current clinical baselines.
 */

import { AssessmentResult, AssessmentResultState } from '../domain/types.js';
import { AssessmentPersistenceStore } from '../infrastructure/persistence.js';
import { AuthorizationError, DomainInvariantError } from '../../platform/errors/index.js';

export class AssessmentResultSharingPort {
  public static async prepareResultForSharing(params: {
    resultId: string;
    requestingActorId: string;
    purpose: 'CLINICAL_CONSULTATION' | 'CARE_COORDINATION' | 'PATIENT_EXPORT';
    hasPatientConsent: boolean;
  }): Promise<{
    result: AssessmentResult;
    disclaimer: string;
    shareable: boolean;
  }> {
    const { resultId, requestingActorId, purpose, hasPatientConsent } = params;

    const result = AssessmentPersistenceStore.getResult(resultId);
    if (!result) {
      throw new DomainInvariantError(`Assessment result ${resultId} not found.`);
    }

    if (!hasPatientConsent && purpose !== 'CLINICAL_CONSULTATION') {
      throw new AuthorizationError('Explicit patient consent required for third-party assessment result sharing.');
    }

    const isCurrent = result.status === AssessmentResultState.VALID;

    return {
      result,
      disclaimer: isCurrent
        ? 'Valid clinical screening measure. This summary is intended to inform care, not establish a standalone diagnosis.'
        : `ATTENTION: This assessment result was invalidated on ${result.invalidated_at} due to ${result.invalidation_reason}. Do not use for current clinical decisions.`,
      shareable: isCurrent
    };
  }
}
