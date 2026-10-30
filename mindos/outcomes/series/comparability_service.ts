/**
 * MindOS Outcome Comparability Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 23 Bounded Context
 * 
 * Invariants:
 * - Version comparability is explicit.
 * - Incomparable instrument versions or unit mismatches return isComparable: false.
 * - Never silently normalize clinically different instruments.
 */

import { MeasureRegistry } from '../measures/measure_registry.js';
import { OutcomeMeasurement } from '../domain/entities.js';
import { ComparabilityCheckResult } from '../domain/types.js';

export class ComparabilityService {
  /**
   * Assesses whether two measurements are clinically comparable.
   */
  public static checkPair(m1: OutcomeMeasurement, m2: OutcomeMeasurement): ComparabilityCheckResult {
    if (m1.measure_code !== m2.measure_code) {
      return {
        isComparable: false,
        reason: `Measure code mismatch: "${m1.measure_code}" vs "${m2.measure_code}".`
      };
    }

    if (m1.unit.toLowerCase() !== m2.unit.toLowerCase()) {
      return {
        isComparable: false,
        reason: `Unit mismatch: "${m1.unit}" vs "${m2.unit}".`
      };
    }

    const policy = MeasureRegistry.getComparabilityPolicy(m1.measure_code);
    if (!policy) {
      // Default: if versions match, comparable; otherwise incomparable
      const v1 = m1.instrument_version || 1;
      const v2 = m2.instrument_version || 1;
      if (String(v1) !== String(v2)) {
        return {
          isComparable: false,
          reason: `Instrument versions "${v1}" and "${v2}" lack an explicit comparability policy.`
        };
      }
      return { isComparable: true };
    }

    // Check version pair against policy
    const v1 = m1.instrument_version !== undefined ? m1.instrument_version : 1;
    const v2 = m2.instrument_version !== undefined ? m2.instrument_version : 1;

    let versionPairAllowed = false;
    for (const [pairA, pairB] of policy.allowed_version_pairs) {
      if (
        (String(pairA) === String(v1) && String(pairB) === String(v2)) ||
        (String(pairA) === String(v2) && String(pairB) === String(v1))
      ) {
        versionPairAllowed = true;
        break;
      }
    }

    if (!versionPairAllowed) {
      return {
        isComparable: false,
        reason: `Instrument version pair (${v1}, ${v2}) is not declared comparable in policy ${policy.id}.`
      };
    }

    // Check gap days if applicable
    if (policy.maximum_gap_days) {
      const t1 = new Date(m1.measured_at).getTime();
      const t2 = new Date(m2.measured_at).getTime();
      const diffDays = Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);
      if (diffDays > policy.maximum_gap_days) {
        return {
          isComparable: true,
          allowedGapExceeded: true,
          reason: `Measurement gap of ${Math.round(diffDays)} days exceeds policy window of ${policy.maximum_gap_days} days.`
        };
      }
    }

    return { isComparable: true };
  }

  /**
   * Assesses whether an entire series is comparable across all points.
   */
  public static checkSeries(measurements: OutcomeMeasurement[]): ComparabilityCheckResult {
    if (measurements.length <= 1) {
      return { isComparable: true };
    }

    for (let i = 0; i < measurements.length - 1; i++) {
      const check = ComparabilityService.checkPair(measurements[i], measurements[i + 1]);
      if (!check.isComparable) {
        return check;
      }
    }

    return { isComparable: true };
  }
}
