/**
 * Deterministic outcome trend engine.
 * Clinical significance, target ranges and Safety thresholds require an approved
 * ClinicalChangeRule from Clinical Governance. No fallback threshold exists.
 */
import { OutcomeTrend, OutcomeSeries } from '../domain/entities.js';
import {
  OutcomeTrendState,
  OutcomeDirectionality,
  DeteriorationSeverity,
  TrendConfidence
} from '../domain/types.js';
import { ClinicalChangeRuleRegistry } from './clinical_change_rules.js';

function unknownTrend(series: OutcomeSeries, reason: string): OutcomeTrend {
  return {
    measure_code: series.measure_code,
    trend_state: OutcomeTrendState.UNKNOWN,
    confidence: 'INSUFFICIENT',
    reason_codes: [reason],
    is_clinically_significant: false,
    measurement_count: series.measurements.length,
    requires_review: true,
    evaluated_at: new Date().toISOString()
  };
}

export class OutcomeTrendEngine {
  public static evaluateSeries(series: OutcomeSeries): OutcomeTrend {
    const measureCode = series.measure_code;
    const measurements = series.measurements;

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
      measurements.find(m => m.id === series.baseline_measurement_id) || measurements[0];
    const latestMeasurement = measurements[measurements.length - 1];
    const baselineVal = baselineMeasurement.value;
    const latestVal = latestMeasurement.value;

    if (typeof baselineVal !== 'number' || typeof latestVal !== 'number') {
      const identical = baselineVal === latestVal;
      return {
        measure_code: measureCode,
        trend_state: identical ? OutcomeTrendState.STABLE : OutcomeTrendState.MIXED,
        confidence: 'MODERATE',
        reason_codes: [identical ? 'CATEGORICAL_VALUE_UNCHANGED' : 'CATEGORICAL_VALUE_CHANGED_REQUIRES_REVIEW'],
        is_clinically_significant: false,
        baseline_value: baselineVal,
        latest_value: latestVal,
        measurement_count: measurements.length,
        requires_review: !identical,
        evaluated_at: new Date().toISOString()
      };
    }

    const rule = ClinicalChangeRuleRegistry.getApprovedRule(measureCode);
    if (!rule) return unknownTrend(series, 'NO_APPROVED_CLINICAL_CHANGE_RULE');

    const directionality = series.measure_definition.directionality;
    const changeAmount = Number((latestVal - baselineVal).toFixed(2));
    let trendState = OutcomeTrendState.UNKNOWN;
    let deteriorationSeverity: DeteriorationSeverity = 'NONE';
    const reasonCodes: string[] = [];
    let isSignificant = false;

    if (directionality === OutcomeDirectionality.TARGET_RANGE) {
      if (rule.target_min === undefined || rule.target_max === undefined) {
        return unknownTrend(series, 'APPROVED_RULE_MISSING_TARGET_RANGE');
      }
      const wasInTarget = baselineVal >= rule.target_min && baselineVal <= rule.target_max;
      const isInTarget = latestVal >= rule.target_min && latestVal <= rule.target_max;
      if (!wasInTarget && isInTarget) {
        trendState = OutcomeTrendState.IMPROVING;
        reasonCodes.push('ENTERED_APPROVED_TARGET_RANGE');
      } else if (wasInTarget && !isInTarget) {
        trendState = OutcomeTrendState.WORSENING;
        reasonCodes.push('EXITED_APPROVED_TARGET_RANGE');
      } else {
        trendState = OutcomeTrendState.STABLE;
        reasonCodes.push(isInTarget ? 'MAINTAINED_IN_APPROVED_TARGET_RANGE' : 'REMAINS_OUTSIDE_APPROVED_TARGET_RANGE');
      }
      isSignificant = trendState !== OutcomeTrendState.STABLE;
    } else if (
      directionality === OutcomeDirectionality.LOWER_IS_BETTER ||
      directionality === OutcomeDirectionality.HIGHER_IS_BETTER
    ) {
      if (rule.mcid === undefined) return unknownTrend(series, 'APPROVED_RULE_MISSING_MCID');
      const mcid = rule.mcid;
      isSignificant = Math.abs(changeAmount) >= mcid;
      if (directionality === OutcomeDirectionality.LOWER_IS_BETTER) {
        if (changeAmount <= -mcid) {
          trendState = OutcomeTrendState.IMPROVING;
          reasonCodes.push('SCORE_DECREASED_BEYOND_APPROVED_MCID');
        } else if (changeAmount >= mcid) {
          trendState = OutcomeTrendState.WORSENING;
          reasonCodes.push('SCORE_INCREASED_BEYOND_APPROVED_MCID');
        } else {
          trendState = OutcomeTrendState.STABLE;
          reasonCodes.push('SCORE_WITHIN_APPROVED_MCID_STABILITY_BAND');
        }
      } else {
        if (changeAmount >= mcid) {
          trendState = OutcomeTrendState.IMPROVING;
          reasonCodes.push('SCORE_INCREASED_BEYOND_APPROVED_MCID');
        } else if (changeAmount <= -mcid) {
          trendState = OutcomeTrendState.WORSENING;
          reasonCodes.push('SCORE_DECREASED_BEYOND_APPROVED_MCID');
        } else {
          trendState = OutcomeTrendState.STABLE;
          reasonCodes.push('SCORE_WITHIN_APPROVED_MCID_STABILITY_BAND');
        }
      }
    } else {
      return unknownTrend(series, 'NON_DIRECTIONAL_MEASURE_REQUIRES_REVIEW');
    }

    if (trendState === OutcomeTrendState.WORSENING) {
      deteriorationSeverity = 'REVIEW_REQUIRED';
      if (
        rule.critical_worsening_threshold !== undefined &&
        Math.abs(changeAmount) >= rule.critical_worsening_threshold
      ) {
        deteriorationSeverity = 'URGENT_REVIEW';
        reasonCodes.push('APPROVED_CRITICAL_WORSENING_THRESHOLD_EXCEEDED');
      }
      if (rule.critical_safety_threshold !== undefined) {
        const safetyBreached =
          directionality === OutcomeDirectionality.LOWER_IS_BETTER
            ? latestVal >= rule.critical_safety_threshold
            : directionality === OutcomeDirectionality.HIGHER_IS_BETTER
              ? latestVal <= rule.critical_safety_threshold
              : false;
        if (safetyBreached) {
          deteriorationSeverity = 'SAFETY_SIGNAL';
          reasonCodes.push('APPROVED_CRITICAL_SAFETY_THRESHOLD_BREACHED');
        }
      }
    }

    const confidence: TrendConfidence = measurements.length >= 3 ? 'HIGH' : 'MODERATE';
    const relativeChange = baselineVal !== 0
      ? Number((((latestVal - baselineVal) / Math.abs(baselineVal)) * 100).toFixed(1))
      : undefined;

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
