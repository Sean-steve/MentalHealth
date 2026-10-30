/**
 * MindOS Outcomes Application Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 * Sprint 23 Bounded Context
 */

import { IOutcomeRepository } from '../repositories/interfaces.js';
import { OutcomeMeasurementService } from '../measurements/measurement_service.js';
import { OutcomeSeriesService } from '../series/outcome_series_service.js';
import { OutcomeReviewService } from '../reviews/outcome_review_service.js';
import { OutcomeAlertService } from '../alerts/outcome_alert_service.js';
import { ProgressViewService } from './progress_view_service.js';
import { OutcomeBaseline, OutcomeTrend } from '../domain/entities.js';
import { OutcomeBaselineType, OutcomeTrendState } from '../domain/types.js';
import { AuditService } from '../../platform/audit/index.js';
import { DomainInvariantError, NotFoundError, AuthorizationError } from '../../platform/errors/index.js';
import { RelationshipAccessEvaluator } from '../../care_relationships/access/relationship_access_evaluator.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';

export class OutcomeService {
  private static repository: IOutcomeRepository;

  public static setRepository(repo: IOutcomeRepository): void {
    OutcomeService.repository = repo;
    OutcomeMeasurementService.setRepository(repo);
    OutcomeSeriesService.setRepository(repo);
    OutcomeReviewService.setRepository(repo);
    OutcomeAlertService.setRepository(repo);
    ProgressViewService.setRepository(repo);
  }

  /**
   * Allows an authorized clinician to override an outcome baseline with auditable justification (Sections 35, 109, 142).
   */
  public static async overrideBaseline(params: {
    subject_user_id: string;
    measure_code: string;
    baseline_measurement_id: string;
    care_relationship_id: string;
    established_by: string;
    override_reason: string;
  }): Promise<OutcomeBaseline> {
    if (!OutcomeService.repository) {
      throw new DomainInvariantError('OutcomeRepository not initialized.');
    }

    const authDecision = await RelationshipAccessEvaluator.evaluateProfessionalAccess({
      subjectUserId: params.subject_user_id,
      professionalId: params.established_by,
      purpose: 'MEASUREMENT_BASED_CARE_BASELINE',
      action: 'WRITE',
      dataDomain: 'CLINICAL_RECORDS'
    });
    if (!authDecision.allowed) {
      throw new AuthorizationError(
        `Professional ${params.established_by} cannot override outcome baseline for ${params.subject_user_id}: ${authDecision.reason}`,
        { errorCode: authDecision.reasonCode || 'AUTHZ_003' }
      );
    }

    const measurement = await OutcomeService.repository.findMeasurementById(params.baseline_measurement_id);
    if (!measurement || measurement.subject_user_id !== params.subject_user_id || measurement.measure_code !== params.measure_code || measurement.validity_status === 'INVALIDATED') {
      throw new DomainInvariantError(
        `Measurement ${params.baseline_measurement_id} does not match subject and measure.`
      );
    }

    const baselineId = generateUUIDv7();
    const now = new Date().toISOString();

    const baseline: OutcomeBaseline = {
      id: baselineId,
      subject_user_id: params.subject_user_id,
      measure_code: params.measure_code,
      baseline_measurement_id: measurement.id,
      baseline_value: measurement.value,
      baseline_type: OutcomeBaselineType.PROFESSIONAL_SELECTED,
      established_at: now,
      established_by: params.established_by,
      override_reason: params.override_reason,
      created_at: now
    };

    await OutcomeService.repository.saveBaseline(baseline);

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.established_by,
      action: 'OUTCOME_BASELINE.OVERRIDDEN',
      resource_type: 'outcome_baseline',
      resource_id: baselineId,
      purpose: 'Clinical Baseline Adjustment',
      authorization_basis: { measureCode: params.measure_code },
      result: 'ALLOWED',
      metadata: { reason: params.override_reason, measurementId: measurement.id }
    });

    return baseline;
  }

  /**
   * Allows an authorized clinician to record a trend override while preserving computed trend (Sections 109, 157).
   */
  public static recordTrendOverride(
    trend: OutcomeTrend,
    overrideDecision: OutcomeTrendState,
    reason: string,
    clinicianId: string
  ): OutcomeTrend {
    AuditService.record({
      actor_type: 'STAFF',
      actor_id: clinicianId,
      action: 'OUTCOME_TREND.OVERRIDDEN',
      resource_type: 'outcome_trend',
      resource_id: trend.measure_code,
      purpose: 'Professional Clinical Trend Judgment',
      authorization_basis: { computedTrend: trend.trend_state, overrideDecision },
      result: 'ALLOWED',
      metadata: { reason, clinicianId }
    });

    return {
      ...trend,
      overridden_by: clinicianId,
      override_decision: overrideDecision,
      override_reason: reason
    };
  }
}
