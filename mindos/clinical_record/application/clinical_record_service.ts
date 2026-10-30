/**
 * MindOS Longitudinal Clinical Record Application Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 * Sprint 23 Bounded Context
 */

import { IClinicalRecordRepository } from '../repositories/interfaces.js';
import { ClinicalRecordProjectionService } from '../projections/clinical_record_projection_service.js';
import { ClinicalTimelineService } from '../timeline/clinical_timeline_service.js';
import { ClinicalObservationService } from '../observations/clinical_observation_service.js';
import { LongitudinalClinicalRecord } from '../domain/entities.js';

export class ClinicalRecordService {
  private static repository: IClinicalRecordRepository;

  public static setRepository(repo: IClinicalRecordRepository): void {
    ClinicalRecordService.repository = repo;
    ClinicalRecordProjectionService.setRepository(repo);
    ClinicalTimelineService.setRepository(repo);
    ClinicalObservationService.setRepository(repo);
  }

  public static async getRecord(userId: string): Promise<LongitudinalClinicalRecord> {
    return ClinicalRecordProjectionService.getOrCreateRecord(userId);
  }

  public static async invalidateSourceEvent(
    sourceDomain: string,
    sourceType: string,
    sourceId: string,
    reason: string,
    actorId = 'system'
  ): Promise<boolean> {
    return ClinicalTimelineService.invalidateBySource(sourceDomain, sourceType, sourceId, reason, actorId);
  }
}
