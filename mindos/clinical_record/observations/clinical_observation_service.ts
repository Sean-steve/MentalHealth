/**
 * MindOS Clinical Observation Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 23 Bounded Context
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { IClinicalRecordRepository } from '../repositories/interfaces.js';
import { ClinicalObservation } from '../domain/entities.js';
import { ClinicalProvenance, ClinicalTimelineSourceType, TimelineVisibilityScope } from '../domain/types.js';
import { ClinicalTimelineService } from '../timeline/clinical_timeline_service.js';
import { DomainInvariantError } from '../../platform/errors/index.js';

export interface RecordObservationParams {
  subject_user_id: string;
  care_relationship_id?: string;
  clinical_encounter_id?: string;
  observation_code: string;
  observation_name: string;
  value: string | number | boolean;
  unit?: string;
  observed_at: string;
  recorded_by: string;
  provenance: ClinicalProvenance;
  clinical_significance?: 'ROUTINE' | 'SIGNIFICANT' | 'CRITICAL' | 'MONITORED';
}

export class ClinicalObservationService {
  private static repository: IClinicalRecordRepository;

  public static setRepository(repo: IClinicalRecordRepository): void {
    ClinicalObservationService.repository = repo;
  }

  public static async recordObservation(params: RecordObservationParams): Promise<ClinicalObservation> {
    if (!ClinicalObservationService.repository) {
      throw new DomainInvariantError('ClinicalRecordRepository not initialized.');
    }

    const observationId = generateUUIDv7();
    const recorded_at = new Date().toISOString();

    const observation: ClinicalObservation = {
      id: observationId,
      subject_user_id: params.subject_user_id,
      care_relationship_id: params.care_relationship_id,
      clinical_encounter_id: params.clinical_encounter_id,
      observation_code: params.observation_code,
      observation_name: params.observation_name,
      value: params.value,
      unit: params.unit,
      observed_at: params.observed_at,
      recorded_at,
      recorded_by: params.recorded_by,
      provenance: params.provenance,
      clinical_significance: params.clinical_significance || 'ROUTINE',
      created_at: recorded_at
    };

    await ClinicalObservationService.repository.saveObservation(observation);

    // Project to timeline
    await ClinicalTimelineService.recordEvent({
      subject_user_id: params.subject_user_id,
      event_type: 'observation.recorded',
      occurred_at: params.observed_at,
      source_domain: 'clinical_record',
      source_type: ClinicalTimelineSourceType.CLINICAL_OBSERVATION,
      source_id: observationId,
      provenance: params.provenance,
      clinical_significance: params.clinical_significance,
      summary_reference: `${params.observation_name}: ${params.value}${params.unit ? ' ' + params.unit : ''}`,
      visibility_scope: TimelineVisibilityScope.PROFESSIONAL,
      care_relationship_id: params.care_relationship_id,
      actor_id: params.recorded_by
    });

    return observation;
  }

  public static async listObservations(userId: string): Promise<ClinicalObservation[]> {
    if (!ClinicalObservationService.repository) {
      throw new DomainInvariantError('ClinicalRecordRepository not initialized.');
    }
    return ClinicalObservationService.repository.findObservationsByUserId(userId);
  }
}
