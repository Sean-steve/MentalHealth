/**
 * MindOS Canonical Outcome Trend Engine
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 23 Bounded Context
 * 
 * Rules:
 * - Deterministic trend calculation based on comparable valid measurements.
 * - Invariant (Section 46): If count < 2 => INSUFFICIENT_DATA, never fabricated trend.
 * - Invariant (Section 32): Incomparable versions => INCOMPARABLE.
 * - Invariant (Section 39, 40): Trend does NOT equal diagnosis. Trend never mutates RiskState directly.
 * - Invariant (Section 109): Professional overrides store both computed and overridden classifications.
 */

import { OutcomeTrend, OutcomeSeries, OutcomeMeasurement } from '../domain/entities.js';
import {
  OutcomeTrendState,
  OutcomeDirectionality,
  DeteriorationSeverity,
  TrendConfidence
} from '../domain/types.js';
import { CANONICAL_CLINICAL_CHANGE_RULES } from './clinical_change_rules.js';

export class OutcomeTrendEngine {
  /**
   * Evaluates trend for an OutcomeSeries.
   */
  public static evaluateSeries(series: OutcomeSeries): OutcomeTrend {
    const measureCode = series.measure_code;
    const measurements = series.measurements;
    const rule = CANONICAL_CLINICAL_CHANGE_RULES[measureCode];
    const mcid = rule ? rule.mcid : 1;

    // 1. Data sufficiency check (Sections 38, 46, 138)
    if (measurements.length < 2) {
      return {
        measure_code: measureCode,
        trend_state: OutcomeTrendState.INSUFFICIENT_DATA,
        confidence: 'INSUFFICIENT',
        reason_codes: ['DATA_INSUFFICIENT_MINIMUM_2_REQUIRED'],
        is_clinically_significant: false,
        measurement_count: measurements.length,
        requires_review: false,
        evaluated_at: new Date().toISOString()
      };
    }

    // 2. Comparability check (Sections 31, 32, 139)
    if (series.comparability_status === 'INCOMPARABLE') {
      return {
        measure_code: measureCode,
        trend_state: OutcomeTrendState.INCOMPARABLE,
        confidence: 'INSUFFICIENT',
        reason_codes: ['INSTRUMENT_VERSION_OR_UNIT_INCOMPARABLE', series.incomparability_reason || 'INCOMPARABLE_SERIES'],
        is_clinically_significant: false,
        measurement_count: measurements.length,
        requires_review: true,
        evaluated_at: new Date().toISOString()
      };
    }

    const baselineMeasurement =
      measurements.find((m) => m.id === series.baseline_measurement_id) || measurements[0];
    const latestMeasurement = measurements[measurements.length - 1];

    const baselineVal = baselineMeasurement.value;
    const latestVal = latestMeasurement.value;

    // If values are not numbers (e.g. categorical), evaluate categorical stability
    if (typeof baselineVal !== 'number' || typeof latestVal !== 'number') {
      const isIdentical = baselineVal === latestVal;
      return {
        measure_code: measureCode,
        trend_state: isIdentical ? OutcomeTrendState.STABLE : OutcomeTrendState.MIXED,
        confidence: 'MODERATE',
        reason_codes: [isIdentical ? 'CATEGORICAL_VALUE_UNCHANGED' : 'CATEGORICAL_VALUE_CHANGED'],
        is_clinically_significant: !isIdentical,
        baseline_value: baselineVal,
        latest_value: latestVal,
        measurement_count: measurements.length,
        requires_review: !isIdentical,
        evaluated_at: new Date().toISOString()
      };
    }

    const directionality = series.measure_definition.directionality;
    const changeAmount = Number((latestVal - baselineVal).toFixed(2));
    const isSignificant = Math.abs(changeAmount) >= mcid;

    let trendState = OutcomeTrendState.STABLE;
    let deteriorationSeverity: DeteriorationSeverity = 'NONE';
    const reasonCodes: string[] = [];

    if (directionality === OutcomeDirectionality.LOWER_IS_BETTER) {
      if (changeAmount <= -mcid) {
        trendState = OutcomeTrendState.IMPROVING;
        reasonCodes.push('SCORE_DECREASED_BEYOND_MCID');
      } else if (changeAmount >= mcid) {
        trendState = OutcomeTrendState.WORSENING;
        reasonCodes.push('SCORE_INCREASED_BEYOND_MCID');
      } else {
        trendState = OutcomeTrendState.STABLE;
        reasonCodes.push('SCORE_WITHIN_MCID_STABILITY_BAND');
      }
    } else if (directionality === OutcomeDirectionality.HIGHER_IS_BETTER) {
      if (changeAmount >= mcid) {
        trendState = OutcomeTrendState.IMPROVING;
        reasonCodes.push('SCORE_INCREASED_BEYOND_MCID');
      } else if (changeAmount <= -mcid) {
        trendState = OutcomeTrendState.WORSENING;
        reasonCodes.push('SCORE_DECREASED_BEYOND_MCID');
      } else {
        trendState = OutcomeTrendState.STABLE;
        reasonCodes.push('SCORE_WITHIN_MCID_STABILITY_BAND');
      }
    } else if (directionality === OutcomeDirectionality.TARGET_RANGE) {
      const min = rule?.target_min ?? 7;
      const max = rule?.target_max ?? 9;
      const wasInTarget = baselineVal >= min && baselineVal <= max;
      const isInTarget = latestVal >= min && latestVal <= max;

      if (!wasInTarget && isInTarget) {
        trendState = OutcomeTrendState.IMPROVING;
        reasonCodes.push('ENTERED_CLINICAL_TARGET_RANGE');
      } else if (wasInTarget && !isInTarget) {
        trendState = OutcomeTrendState.WORSENING;
        reasonCodes.push('EXITED_CLINICAL_TARGET_RANGE');
      } else {
        trendState = OutcomeTrendState.STABLE;
        reasonCodes.push(isInTarget ? 'MAINTAINED_IN_TARGET_RANGE' : 'REMAINS_OUTSIDE_TARGET_RANGE');
      }
    }

    // Evaluate deterioration severity and safety thresholds (Sections 44, 60, 61, 144, 145)
    if (trendState === OutcomeTrendState.WORSENING) {
      deteriorationSeverity = 'REVIEW_REQUIRED';

      if (rule?.critical_worsening_threshold && Math.abs(changeAmount) >= rule.critical_worsening_threshold) {
        deteriorationSeverity = 'URGENT_REVIEW';
        reasonCodes.push('CRITICAL_WORSENING_THRESHOLD_EXCEEDED');
      }

      if (rule?.critical_safety_threshold) {
        if (directionality === OutcomeDirectionality.LOWER_IS_BETTER && latestVal >= rule.critical_safety_threshold) {
          deteriorationSeverity = 'SAFETY_SIGNAL';
          reasonCodes.push('CRITICAL_SAFETY_THRESHOLD_BREACHED');
        } else if (directionality === OutcomeDirectionality.HIGHER_IS_BETTER && latestVal <= rule.critical_safety_threshold) {
          deteriorationSeverity = 'SAFETY_SIGNAL';
          reasonCodes.push('CRITICAL_SAFETY_THRESHOLD_BREACHED');
        }
      }
    }

    const confidence: TrendConfidence = measurements.length >= 3 ? 'HIGH' : 'MODERATE';
    const relativeChange =
      baselineVal !== 0 ? Number((((latestVal - baselineVal) / Math.abs(baselineVal)) * 100).toFixed(1)) : undefined;

    return {
      measure_code: measureCode,
      trend_state: trendState,
      change_amount: changeAmount,
      relative_change_percent: relativeChange,
      confidence,
      reason_codes: reasonCodes,
      is_clinically_significant: isSignificant,
      baseline_value: baselineVal,
      latest_value: latestVal,
      measurement_count: measurements.length,
      requires_review: trendState === OutcomeTrendState.WORSENING,
      deterioration_severity: deteriorationSeverity,
      evaluated_at: new Date().toISOString()
    };
  }
}
