/**
 * MindOS In-Memory Longitudinal Clinical Record Repository
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 * Sprint 23 Bounded Context
 */

import { IClinicalRecordRepository } from './interfaces.js';
import { LongitudinalClinicalRecord, ClinicalTimelineEntry, ClinicalObservation } from '../domain/entities.js';
import { TimelineFilterCriteria } from '../domain/types.js';

export class InMemoryClinicalRecordRepository implements IClinicalRecordRepository {
  private records: Map<string, LongitudinalClinicalRecord> = new Map(); // id -> record
  private recordsByUser: Map<string, string> = new Map(); // userId -> recordId
  private timelineEntries: Map<string, ClinicalTimelineEntry> = new Map(); // id -> entry
  private observations: Map<string, ClinicalObservation> = new Map(); // id -> observation

  public async saveRecord(record: LongitudinalClinicalRecord): Promise<void> {
    this.records.set(record.id, { ...record });
    this.recordsByUser.set(record.subject_user_id, record.id);
  }

  public async findRecordByUserId(userId: string): Promise<LongitudinalClinicalRecord | null> {
    const recordId = this.recordsByUser.get(userId);
    if (!recordId) return null;
    const record = this.records.get(recordId);
    return record ? { ...record } : null;
  }

  public async findRecordById(id: string): Promise<LongitudinalClinicalRecord | null> {
    const record = this.records.get(id);
    return record ? { ...record } : null;
  }

  public async saveTimelineEntry(entry: ClinicalTimelineEntry): Promise<void> {
    this.timelineEntries.set(entry.id, { ...entry });
  }

  public async findTimelineEntryById(id: string): Promise<ClinicalTimelineEntry | null> {
    const entry = this.timelineEntries.get(id);
    return entry ? { ...entry } : null;
  }

  public async findTimelineEntryBySource(
    sourceDomain: string,
    sourceType: string,
    sourceId: string
  ): Promise<ClinicalTimelineEntry | null> {
    for (const entry of this.timelineEntries.values()) {
      if (
        entry.source_domain === sourceDomain &&
        entry.source_type === sourceType &&
        entry.source_id === sourceId
      ) {
        return { ...entry };
      }
    }
    return null;
  }

  public async findTimelineEntries(criteria: TimelineFilterCriteria): Promise<ClinicalTimelineEntry[]> {
    let results: ClinicalTimelineEntry[] = [];

    for (const entry of this.timelineEntries.values()) {
      if (entry.subject_user_id !== criteria.subject_user_id) continue;

      if (!criteria.include_invalidated && entry.is_invalidated) continue;

      if (criteria.source_types && criteria.source_types.length > 0) {
        if (!criteria.source_types.includes(entry.source_type)) continue;
      }

      if (criteria.source_domains && criteria.source_domains.length > 0) {
        if (!criteria.source_domains.includes(entry.source_domain)) continue;
      }

      if (criteria.start_date && entry.occurred_at < criteria.start_date) continue;
      if (criteria.end_date && entry.occurred_at > criteria.end_date) continue;

      if (criteria.visibility_scope && entry.visibility_scope !== criteria.visibility_scope) {
        continue;
      }

      if (criteria.provenance && criteria.provenance.length > 0) {
        if (!criteria.provenance.includes(entry.provenance)) continue;
      }

      results.push({ ...entry });
    }

    // Deterministic tie-breaking ordering:
    // Primarily occurred_at (DESC by default), tie-break on recorded_at DESC, then id
    const isAsc = criteria.sort_direction === 'ASC';
    results.sort((a, b) => {
      const timeCompare = a.occurred_at.localeCompare(b.occurred_at);
      if (timeCompare !== 0) return isAsc ? timeCompare : -timeCompare;

      const recCompare = a.recorded_at.localeCompare(b.recorded_at);
      if (recCompare !== 0) return isAsc ? recCompare : -recCompare;

      return a.id.localeCompare(b.id);
    });

    if (criteria.offset && criteria.offset > 0) {
      results = results.slice(criteria.offset);
    }
    if (criteria.limit && criteria.limit > 0) {
      results = results.slice(0, criteria.limit);
    }

    return results;
  }

  public async invalidateTimelineEntry(
    sourceDomain: string,
    sourceType: string,
    sourceId: string,
    reason: string
  ): Promise<boolean> {
    let found = false;
    for (const [id, entry] of this.timelineEntries.entries()) {
      if (
        entry.source_domain === sourceDomain &&
        entry.source_type === sourceType &&
        entry.source_id === sourceId
      ) {
        entry.is_invalidated = true;
        entry.invalidation_reason = reason;
        entry.invalidated_at = new Date().toISOString();
        this.timelineEntries.set(id, entry);
        found = true;
      }
    }
    return found;
  }

  public async saveObservation(observation: ClinicalObservation): Promise<void> {
    this.observations.set(observation.id, { ...observation });
  }

  public async findObservationsByUserId(userId: string): Promise<ClinicalObservation[]> {
    const list: ClinicalObservation[] = [];
    for (const obs of this.observations.values()) {
      if (obs.subject_user_id === userId && !obs.is_invalidated) {
        list.push({ ...obs });
      }
    }
    list.sort((a, b) => b.observed_at.localeCompare(a.observed_at));
    return list;
  }

  public clear(): void {
    this.records.clear();
    this.recordsByUser.clear();
    this.timelineEntries.clear();
    this.observations.clear();
  }
}
