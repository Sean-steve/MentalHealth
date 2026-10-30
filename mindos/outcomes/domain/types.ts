/**
 * MindOS Canonical Outcomes & Measurement-Based Care Domain Types
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
  ClinicalProvenance
} from '../../platform/shared/state_machines.js';

export {
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
  ClinicalProvenance
};

export type DeteriorationSeverity = 'NONE' | 'REVIEW_REQUIRED' | 'URGENT_REVIEW' | 'SAFETY_SIGNAL';
export type TrendConfidence = 'HIGH' | 'MODERATE' | 'LOW' | 'INSUFFICIENT';

export interface ComparabilityCheckResult {
  isComparable: boolean;
  reason?: string;
  allowedGapExceeded?: boolean;
}

export interface ClinicalChangeRule {
  id: string;
  measure_code: string;
  version: number;
  mcid?: number;
  reliable_change_threshold?: number;
  critical_worsening_threshold?: number;
  critical_safety_threshold?: number;
  target_min?: number;
  target_max?: number;
  clinical_artifact_id: string;
  clinical_artifact_version: string;
  approval_state: 'APPROVED' | 'REVOKED' | 'EXPIRED';
  approved_by: string;
  approved_at: string;
  effective_from: string;
  effective_until?: string;
}
