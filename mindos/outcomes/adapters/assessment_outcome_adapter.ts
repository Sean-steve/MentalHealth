/**
 * MindOS Assessment Outcome Adapter
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 23 Bounded Context
 * 
 * Rules:
 * - Translates completed AssessmentResult into canonical OutcomeMeasurement without rescoring (Sections 23, 55, 129).
 * - Preserves authoritative CLINICALLY_ASSESSED provenance.
 */

import { OutcomeMeasurementService } from '../measurements/measurement_service.js';
import { ClinicalProvenance } from '../domain/types.js';
import { AssessmentPersistenceStore } from '../../assessments/infrastructure/persistence.js';
import { DomainInvariantError } from '../../platform/errors/index.js';

export class AssessmentOutcomeAdapter {
  /**
   * Translates a completed assessment session and result into an OutcomeMeasurement.
   */
  public static async processAssessmentResult(sessionId: string): Promise<any> {
    const session = AssessmentPersistenceStore.getSession(sessionId);
    if (!session) {
      throw new DomainInvariantError(`Assessment session ${sessionId} not found.`);
    }

    const result = AssessmentPersistenceStore.getResultForSession(sessionId);
    if (!result) {
      throw new DomainInvariantError(`Assessment result for session ${sessionId} not found.`);
    }

    const version = AssessmentPersistenceStore.getVersion(session.assessment_version_id);
    const def = AssessmentPersistenceStore.getDefinition(version?.assessment_definition_id || '');

    // Map assessment code to outcome measure code
    let measureCode = 'PHQ9_TOTAL';
    let unit = 'points';
    let val: number | string = result.raw_score;

    if (def?.code === 'GAD7' || def?.code === 'GAD-7') {
      measureCode = 'GAD7_TOTAL';
    } else if (def?.code === 'WHO5' || def?.code === 'WHO-5') {
      measureCode = 'WHO5_TOTAL';
    } else if (def?.code === 'CSSRS' || def?.code === 'C-SSRS') {
      measureCode = 'CSSRS_RISK_BAND';
      unit = 'band';
      val = result.result_band === 'HIGH' ? 3 : result.result_band === 'MODERATE' ? 2 : result.result_band === 'LOW' ? 1 : 0;
    }

    return OutcomeMeasurementService.recordMeasurement({
      subject_user_id: session.subject_user_id,
      measure_code: measureCode,
      value: val,
      unit,
      measured_at: result.generated_at || session.completed_at || new Date().toISOString(),
      source_type: 'ASSESSMENT_RESULT',
      source_reference: result.id,
      instrument_version: version?.version || 1,
      provenance: ClinicalProvenance.CLINICALLY_ASSESSED
    });
  }
}
