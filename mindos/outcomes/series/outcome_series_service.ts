/**
 * MindOS Outcome Series Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 23 Bounded Context
 */

import { IOutcomeRepository } from '../repositories/interfaces.js';
import { MeasureRegistry } from '../measures/measure_registry.js';
import { OutcomeSeries, OutcomeMeasurement, OutcomeBaseline } from '../domain/entities.js';
import { ComparabilityService } from './comparability_service.js';
import { OutcomeBaselineType, OutcomeMeasurementValidity } from '../domain/types.js';
import { DomainInvariantError } from '../../platform/errors/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';

export class OutcomeSeriesService {
  private static repository: IOutcomeRepository;

  public static setRepository(repo: IOutcomeRepository): void {
    OutcomeSeriesService.repository = repo;
  }

  /**
   * Builds an OutcomeSeries projection for a given user and measure.
   */
  public static async getSeries(userId: string, measureCode: string): Promise<OutcomeSeries> {
    if (!OutcomeSeriesService.repository) {
      throw new DomainInvariantError('OutcomeRepository not initialized.');
    }

    const definition = MeasureRegistry.getDefinition(measureCode);
    // Exclude invalidated measurements (Section 28)
    const measurements = await OutcomeSeriesService.repository.findMeasurementsByUserAndMeasure(
      userId,
      measureCode,
      false
    );

    const compCheck = ComparabilityService.checkSeries(measurements);

    let baseline = await OutcomeSeriesService.repository.findBaseline(userId, measureCode);
    if (!baseline && measurements.length > 0) {
      // Deterministic baseline selection: FIRST_VALID measurement (Sections 33, 34, 35)
      const firstValid = measurements[0];
      baseline = {
        id: generateUUIDv7(),
        subject_user_id: userId,
        measure_code: measureCode,
        baseline_measurement_id: firstValid.id,
        baseline_value: firstValid.value,
        baseline_type: OutcomeBaselineType.FIRST_VALID,
        established_at: firstValid.measured_at,
        established_by: 'system',
        created_at: new Date().toISOString()
      };
      await OutcomeSeriesService.repository.saveBaseline(baseline);
    }

    return {
      subject_user_id: userId,
      measure_code: measureCode,
      measure_definition: definition,
      measurements,
      start_at: measurements.length > 0 ? measurements[0].measured_at : undefined,
      end_at: measurements.length > 0 ? measurements[measurements.length - 1].measured_at : undefined,
      comparability_status: compCheck.isComparable ? 'COMPARABLE' : 'INCOMPARABLE',
      incomparability_reason: compCheck.reason,
      baseline_measurement_id: baseline?.baseline_measurement_id,
      latest_measurement_id: measurements.length > 0 ? measurements[measurements.length - 1].id : undefined,
      series_version: 1
    };
  }
}
