/**
 * MindOS Longitudinal Clinical Record Domain Entities
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 23 Bounded Context
 */

import {
  LongitudinalClinicalRecordState,
  ClinicalTimelineSourceType,
  ClinicalProvenance,
  TimelineVisibilityScope,
  ClinicalSignificanceLevel,
  SafetySignificanceLevel
} from './types.js';

/**
 * Governed aggregate/projection over canonical source domains (Section 6).
 * Invariant: Must not copy entire source objects unnecessarily.
 */
export interface LongitudinalClinicalRecord {
  id: string; // UUIDv7
  subject_user_id: string;
  status: LongitudinalClinicalRecordState;
  jurisdiction: string; // Default 'KE'
  created_at: string;
  updated_at: string;
  record_version: number;
}

/**
 * Longitudinal reference to a canonical source event (Section 7).
 * Invariant: Projection reference only, not source of truth.
 * Invariant: Immutability preserved — historical entries are never silently rewritten.
 */
export interface ClinicalTimelineEntry {
  id: string; // UUIDv7
  subject_user_id: string;
  event_type: string;
  occurred_at: string; // Clinical occurrence timestamp (deterministic ordering)
  recorded_at: string; // Ingestion / documentation timestamp
  source_domain: string;
  source_type: ClinicalTimelineSourceType;
  source_id: string;
  provenance: ClinicalProvenance;
  clinical_significance: ClinicalSignificanceLevel;
  safety_significance: SafetySignificanceLevel;
  summary_reference?: string;
  visibility_scope: TimelineVisibilityScope;
  care_relationship_id?: string;
  care_plan_id?: string;
  is_invalidated?: boolean;
  invalidation_reason?: string;
  invalidated_at?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

/**
 * Clinical Observation entity (Section 15)
 */
export interface ClinicalObservation {
  id: string; // UUIDv7
  subject_user_id: string;
  care_relationship_id?: string;
  clinical_encounter_id?: string;
  observation_code: string;
  observation_name: string;
  value: string | number | boolean;
  unit?: string;
  observed_at: string;
  recorded_at: string;
  recorded_by: string;
  provenance: ClinicalProvenance;
  clinical_significance: ClinicalSignificanceLevel;
  is_invalidated?: boolean;
  created_at: string;
}
