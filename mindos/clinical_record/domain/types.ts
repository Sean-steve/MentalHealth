/**
 * MindOS Canonical Longitudinal Clinical Record Domain Types
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 23 Bounded Context
 */

import {
  LongitudinalClinicalRecordState,
  ClinicalTimelineSourceType,
  ClinicalProvenance,
  TimelineVisibilityScope
} from '../../platform/shared/state_machines.js';

export {
  LongitudinalClinicalRecordState,
  ClinicalTimelineSourceType,
  ClinicalProvenance,
  TimelineVisibilityScope
};

export type ClinicalSignificanceLevel = 'ROUTINE' | 'SIGNIFICANT' | 'CRITICAL' | 'MONITORED';
export type SafetySignificanceLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface TimelineFilterCriteria {
  subject_user_id: string;
  source_types?: ClinicalTimelineSourceType[];
  source_domains?: string[];
  start_date?: string;
  end_date?: string;
  visibility_scope?: TimelineVisibilityScope;
  provenance?: ClinicalProvenance[];
  include_invalidated?: boolean;
  limit?: number;
  offset?: number;
  sort_direction?: 'ASC' | 'DESC';
}

export interface LongitudinalContextOptions {
  includeAssessments?: boolean;
  includeEncounters?: boolean;
  includeCarePlans?: boolean;
  includeGoals?: boolean;
  includeTasks?: boolean;
  includeSafety?: boolean;
  includeOutcomes?: boolean;
  timeWindowDays?: number;
}
