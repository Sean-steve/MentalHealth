/**
 * MindOS Canonical Clinical Change Rules & Cutoffs
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 23 Bounded Context
 * 
 * Rules:
 * - Minimal Clinically Important Difference (MCID) definitions.
 * - Invariant (Section 43): Use only canonical clinical cutoffs; do not invent arbitrary thresholds.
 */

import { ClinicalChangeRule } from '../domain/types.js';

export const CANONICAL_CLINICAL_CHANGE_RULES: Record<string, ClinicalChangeRule> = {
  PHQ9_TOTAL: {
    measure_code: 'PHQ9_TOTAL',
    mcid: 5, // Canonical MCID for PHQ-9 is 5 points
    reliable_change_threshold: 6,
    critical_worsening_threshold: 10,
    critical_safety_threshold: 20 // Severe depression threshold
  },
  GAD7_TOTAL: {
    measure_code: 'GAD7_TOTAL',
    mcid: 4, // Canonical MCID for GAD-7 is 4 points
    reliable_change_threshold: 5,
    critical_worsening_threshold: 8,
    critical_safety_threshold: 15 // Severe anxiety threshold
  },
  WHO5_TOTAL: {
    measure_code: 'WHO5_TOTAL',
    mcid: 10, // Canonical MCID for WHO-5 is 10 points
    reliable_change_threshold: 15,
    critical_worsening_threshold: 20,
    critical_safety_threshold: 28 // Significant depression indication <= 28
  },
  CSSRS_RISK_BAND: {
    measure_code: 'CSSRS_RISK_BAND',
    mcid: 1, // 1 band step
    critical_worsening_threshold: 1,
    critical_safety_threshold: 2 // Band 2 (Moderate) or 3 (High) triggers safety evaluation
  },
  SLEEP_HOURS_USER_REPORTED: {
    measure_code: 'SLEEP_HOURS_USER_REPORTED',
    mcid: 1.5,
    target_min: 7,
    target_max: 9,
    critical_worsening_threshold: 3
  },
  GOAL_CONFIDENCE_RATING: {
    measure_code: 'GOAL_CONFIDENCE_RATING',
    mcid: 2,
    target_min: 7,
    target_max: 10,
    critical_worsening_threshold: 3
  }
};
