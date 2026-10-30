/**
 * MindOS Longitudinal Clinical Record Repository Interfaces
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 * Sprint 23 Bounded Context
 */

import { LongitudinalClinicalRecord, ClinicalTimelineEntry, ClinicalObservation } from '../domain/entities.js';
import { TimelineFilterCriteria } from '../domain/types.js';

export interface IClinicalRecordRepository {
  saveRecord(record: LongitudinalClinicalRecord): Promise<void>;
  findRecordByUserId(userId: string): Promise<LongitudinalClinicalRecord | null>;
  findRecordById(id: string): Promise<LongitudinalClinicalRecord | null>;

  saveTimelineEntry(entry: ClinicalTimelineEntry): Promise<void>;
  findTimelineEntryById(id: string): Promise<ClinicalTimelineEntry | null>;
  findTimelineEntryBySource(sourceDomain: string, sourceType: string, sourceId: string): Promise<ClinicalTimelineEntry | null>;
  findTimelineEntries(criteria: TimelineFilterCriteria): Promise<ClinicalTimelineEntry[]>;
  invalidateTimelineEntry(sourceDomain: string, sourceType: string, sourceId: string, reason: string): Promise<boolean>;

  saveObservation(observation: ClinicalObservation): Promise<void>;
  findObservationsByUserId(userId: string): Promise<ClinicalObservation[]>;

  clear(): void;
}
