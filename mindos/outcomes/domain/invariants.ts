/**
 * MindOS Outcomes Invariants & Clinical Governance Guards
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Clinical Safety Policy Catalogue (R-OUT-001..010, ADR-016, ADR-028)
 */

import {
  DomainInvariantError,
  OutcomeMeasurementInvalidError,
  OutcomeMeasurementNotComparableError,
  OutcomeInsufficientDataError
} from '../../platform/errors/index.js';
import { OutcomeMeasureDefinition, OutcomeMeasurement, OutcomeTrend } from './entities.js';
import { OutcomeValueType, ClinicalProvenance, OutcomeTrendState } from './types.js';

export class OutcomeInvariants {
  /**
   * R-OUT-001: Product metrics are strictly segregated from clinical outcomes.
   */
  public static assertNotProductMetric(measureCode: string): void {
    const prohibitedPrefixes = ['app_', 'session_', 'page_view', 'click_', 'message_count', 'telemetry_'];
    for (const prefix of prohibitedPrefixes) {
      if (measureCode.toLowerCase().startsWith(prefix)) {
        throw new DomainInvariantError(
          `Product telemetry metric "${measureCode}" cannot be registered or recorded as a clinical outcome measure.`
        );
      }
    }
  }

  /**
   * R-OUT-003: AI actor provenance integrity guard.
   */
  public static assertProvenanceIntegrity(provenance: ClinicalProvenance, actorRole: string): void {
    if (actorRole === 'AI' || actorRole === 'SYSTEM_AI') {
      if (
        provenance === ClinicalProvenance.CLINICALLY_ASSESSED ||
        provenance === ClinicalProvenance.PROFESSIONAL_RECORDED
      ) {
        throw new DomainInvariantError(
          `AI actor cannot assert ${provenance} provenance. AI measurements must retain AI_INFERRED provenance.`
        );
      }
    }
  }

  /**
   * R-OUT-008: Validates value against definition value_type and unit.
   */
  public static validateMeasurementValue(
    definition: OutcomeMeasureDefinition,
    value: number | string | boolean,
    unit: string
  ): void {
    if (definition.unit.toLowerCase() !== unit.toLowerCase()) {
      throw new OutcomeMeasurementInvalidError(
        `Unit mismatch for measure "${definition.measure_code}": expected "${definition.unit}", got "${unit}".`
      );
    }

    switch (definition.value_type) {
      case OutcomeValueType.INTEGER:
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          throw new OutcomeMeasurementInvalidError(
            `Measure "${definition.measure_code}" requires an integer value, got "${typeof value}": ${String(value)}.`
          );
        }
        if (definition.min_value !== undefined && value < definition.min_value) {
          throw new OutcomeMeasurementInvalidError(
            `Value ${value} is below minimum allowed ${definition.min_value} for ${definition.measure_code}.`
          );
        }
        if (definition.max_value !== undefined && value > definition.max_value) {
          throw new OutcomeMeasurementInvalidError(
            `Value ${value} exceeds maximum allowed ${definition.max_value} for ${definition.measure_code}.`
          );
        }
        break;

      case OutcomeValueType.DECIMAL:
      case OutcomeValueType.DURATION:
        if (typeof value !== 'number' || isNaN(value)) {
          throw new OutcomeMeasurementInvalidError(
            `Measure "${definition.measure_code}" requires a numeric value.`
          );
        }
        break;

      case OutcomeValueType.BOOLEAN:
        if (typeof value !== 'boolean') {
          throw new OutcomeMeasurementInvalidError(
            `Measure "${definition.measure_code}" requires a boolean value.`
          );
        }
        break;

      case OutcomeValueType.CATEGORICAL:
      case OutcomeValueType.ORDINAL:
        if (typeof value !== 'string' && typeof value !== 'number') {
          throw new OutcomeMeasurementInvalidError(
            `Measure "${definition.measure_code}" requires a categorical string or ordinal number.`
          );
        }
        break;
    }
  }

  /**
   * R-OUT-005: Sufficient data guard.
   */
  public static assertSufficientDataForTrend(measurements: OutcomeMeasurement[]): void {
    if (measurements.length < 2) {
      throw new OutcomeInsufficientDataError(
        `At least 2 valid measurements are required to calculate an outcome trend (found ${measurements.length}).`
      );
    }
  }
}
