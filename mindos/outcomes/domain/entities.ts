/**
 * MindOS Outcomes & Measurement-Based Care Domain Entities
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 23 Bounded Context
 */

import {
  OutcomeMeasureType,
  OutcomeValueType,
  OutcomeDirectionality,
  OutcomeMeasurementValidity,
  OutcomeTrendState,
  OutcomeReviewState,
  OutcomeReviewType,
  OutcomeReviewDecision,
  OutcomeAlertType,
  OutcomeAlertState,
  OutcomeBaselineType,
  ClinicalProvenance,
  DeteriorationSeverity,
  TrendConfidence
} from './types.js';

/**
 * Definition of what is measured (Section 16).
 * Invariant: Registered and versioned by clinical governance.
 */
export interface OutcomeMeasureDefinition {
  id: string; // UUIDv7
  measure_code: string;
  name: string;
  description: string;
  measure_type: OutcomeMeasureType;
  unit: string;
  value_type: OutcomeValueType;
  directionality: OutcomeDirectionality;
  population: string; // e.g. 'ADULT_18_PLUS'
  jurisdiction: string; // Default 'KE'
  source_domain: string;
  clinical_artifact_id?: string;
  clinical_artifact_version?: string;
  comparability_policy_id: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'RETIRED';
  min_value?: number;
  max_value?: number;
  created_at: string;
}

/**
 * Policy defining version, unit, and population comparability rules (Section 30).
 */
export interface MeasureComparabilityPolicy {
  id: string;
  measure_code: string;
  allowed_version_pairs: Array<[string | number, string | number]>;
  unit_requirements: string[];
  population_constraints?: string[];
  maximum_gap_days?: number;
  transformation_policy?: string;
  status: 'ACTIVE' | 'RETIRED';
}

/**
 * One observed value at one point in time (Section 22).
 * Invariant: Immutability preserved. Authoritative scores are not rescored.
 */
export interface OutcomeMeasurement {
  id: string; // UUIDv7
  subject_user_id: string;
  measure_definition_id: string;
  measure_code: string;
  value: number | string | boolean;
  unit: string;
  measured_at: string; // Clinical occurrence timestamp
  recorded_at: string; // Record ingestion timestamp
  source_type: string;
  source_reference: string;
  instrument_version?: string | number;
  provenance: ClinicalProvenance;
  validity_status: OutcomeMeasurementValidity;
  invalidation_reason?: string;
  invalidated_at?: string;
  care_relationship_id?: string;
  care_plan_id?: string;
  care_goal_id?: string;
  clinical_encounter_id?: string;
  recorded_by?: string;
  created_at: string;
}

/**
 * Explicit, deterministic clinical baseline (Sections 33, 34, 35).
 */
export interface OutcomeBaseline {
  id: string;
  subject_user_id: string;
  measure_code: string;
  baseline_measurement_id: string;
  baseline_value: number | string | boolean;
  baseline_type: OutcomeBaselineType;
  established_at: string;
  established_by: string;
  override_reason?: string;
  created_at: string;
}

/**
 * Ordered measurements of a comparable measure (Section 29).
 */
export interface OutcomeSeries {
  subject_user_id: string;
  measure_code: string;
  measure_definition: OutcomeMeasureDefinition;
  measurements: OutcomeMeasurement[];
  start_at?: string;
  end_at?: string;
  comparability_status: 'COMPARABLE' | 'INCOMPARABLE';
  incomparability_reason?: string;
  baseline_measurement_id?: string;
  latest_measurement_id?: string;
  series_version: number;
}

/**
 * Derived temporal clinical interpretation (Sections 37, 38).
 */
export interface OutcomeTrend {
  measure_code: string;
  trend_state: OutcomeTrendState;
  change_amount?: number;
  relative_change_percent?: number;
  confidence: TrendConfidence;
  reason_codes: string[];
  is_clinically_significant: boolean;
  baseline_value?: number | string | boolean;
  latest_value?: number | string | boolean;
  measurement_count: number;
  requires_review: boolean;
  deterioration_severity?: DeteriorationSeverity;
  evaluated_at: string;
  overridden_by?: string;
  override_decision?: OutcomeTrendState;
  override_reason?: string;
}

/**
 * Professional review of longitudinal evidence (Sections 48, 49, 50, 51).
 */
export interface OutcomeReview {
  id: string; // UUIDv7
  subject_user_id: string;
  care_relationship_id: string;
  care_plan_id?: string;
  review_type: OutcomeReviewType;
  status: OutcomeReviewState;
  reviewer_id?: string;
  measurement_refs: string[];
  trend_refs: Array<{ measure_code: string; trend_state: OutcomeTrendState; change_amount?: number }>;
  scheduled_for?: string;
  started_at?: string;
  completed_at?: string;
  decision?: OutcomeReviewDecision;
  reason_codes: string[];
  clinical_notes?: string;
  recommended_actions: Array<{
    action_type: string;
    description: string;
    target_task_id?: string;
    target_care_plan_version?: string;
  }>;
  snapshot_id?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Governed signal that clinical review or safety check may be required (Sections 86, 87, 88).
 */
export interface OutcomeAlert {
  id: string; // UUIDv7
  subject_user_id: string;
  care_relationship_id?: string;
  alert_type: OutcomeAlertType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  measure_definition_id?: string;
  measure_code?: string;
  measurement_id?: string;
  trend_id?: string;
  status: OutcomeAlertState;
  generated_at: string;
  review_due_at: string;
  assigned_to?: string;
  policy_version: string;
  resolution_notes?: string;
  resolved_at?: string;
  resolved_by?: string;
}

/**
 * Frozen immutable evidence snapshot preserved upon OutcomeReview completion (Sections 84, 85).
 */
export interface OutcomeSnapshot {
  id: string; // UUIDv7
  review_id: string;
  subject_user_id: string;
  measure_states: Array<{
    measure_code: string;
    measurements: OutcomeMeasurement[];
    baseline?: OutcomeBaseline;
  }>;
  trend_states: OutcomeTrend[];
  care_plan_version_id?: string;
  frozen_at: string;
  hash: string;
}

/**
 * Authorized outcome projection summary for dashboards and AI boundaries (Section 82).
 */
export interface OutcomeSummary {
  subject_user_id: string;
  time_window_days: number;
  measure_summaries: Array<{
    measure_code: string;
    name: string;
    latest_value?: number | string | boolean;
    unit: string;
    trend_state: OutcomeTrendState;
    change_amount?: number;
    is_clinically_significant: boolean;
    measurement_count: number;
    last_measured_at?: string;
  }>;
  care_goal_summary?: {
    total_goals: number;
    achieved_goals: number;
    on_track_goals: number;
    at_risk_goals: number;
  };
  active_alerts_count: number;
  pending_reviews_count: number;
  generated_at: string;
  policy_version: string;
}
