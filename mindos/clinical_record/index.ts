/**
 * MindOS Longitudinal Clinical Record Bounded Context Entry Point
 * Sprint 23 Bounded Context
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 */

import { InMemoryClinicalRecordRepository } from './repositories/in_memory_clinical_record_repository.js';
import { ClinicalRecordService } from './application/clinical_record_service.js';
import { ClinicalTimelineService } from './timeline/clinical_timeline_service.js';
import { ClinicalObservationService } from './observations/clinical_observation_service.js';
import { ClinicalRecordProjectionService } from './projections/clinical_record_projection_service.js';

// Default repository instance
const defaultRepository = new InMemoryClinicalRecordRepository();
ClinicalRecordService.setRepository(defaultRepository);
ClinicalTimelineService.setRepository(defaultRepository);
ClinicalObservationService.setRepository(defaultRepository);
ClinicalRecordProjectionService.setRepository(defaultRepository);

export * from './domain/types.js';
export * from './domain/entities.js';
export * from './domain/invariants.js';
export * from './repositories/interfaces.js';
export * from './repositories/in_memory_clinical_record_repository.js';
export * from './repositories/pg_clinical_record_repository.js';
export * from './timeline/clinical_timeline_service.js';
export * from './observations/clinical_observation_service.js';
export * from './projections/clinical_record_projection_service.js';
export * from './application/clinical_record_service.js';

export function resetClinicalRecordForTesting(): void {
  defaultRepository.clear();
}
