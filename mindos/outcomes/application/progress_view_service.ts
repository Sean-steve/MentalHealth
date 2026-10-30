/**
 * MindOS Progress & Longitudinal Dashboard Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 23 Bounded Context
 * 
 * Rules:
 * - User-facing progress views (Section 71) use governed, supportive language (Section 72).
 * - Professional outcome dashboard (Section 73) provides structured charts with comparability breaks (Section 76).
 * - AI Companion boundary projection (Section 78, 80, 82).
 */

import { IOutcomeRepository } from '../repositories/interfaces.js';
import { MeasureRegistry } from '../measures/measure_registry.js';
import { OutcomeSeriesService } from '../series/outcome_series_service.js';
import { OutcomeTrendEngine } from '../trends/trend_engine.js';
import { OutcomeAlertService } from '../alerts/outcome_alert_service.js';
import { OutcomeSummary, OutcomeTrend, OutcomeMeasurement } from '../domain/entities.js';
import { OutcomeTrendState } from '../domain/types.js';
import { RelationshipAccessEvaluator } from '../../care_relationships/access/relationship_access_evaluator.js';
import { AuthorizationError, DomainInvariantError } from '../../platform/errors/index.js';

export interface UserProgressView {
  userId: string;
  measures: Array<{
    measure_code: string;
    name: string;
    latest_score?: number | string | boolean;
    unit: string;
    user_status_label: string; // Governed, supportive user-facing label (Section 72)
    trajectory: 'POSITIVE' | 'STABLE' | 'NEEDS_SUPPORT' | 'INSUFFICIENT_DATA';
    points: Array<{
      date: string;
      value: number | string | boolean;
      comparability_break_after?: boolean;
    }>;
  }>;
  summary_message: string;
}

export interface ProfessionalOutcomeDashboard {
  subject_user_id: string;
  trends: OutcomeTrend[];
  measures: Array<{
    definition: any;
    series: any;
    trend: OutcomeTrend;
  }>;
  open_alerts: any[];
  review_history: any[];
}

export class ProgressViewService {
  private static repository: IOutcomeRepository;

  public static setRepository(repo: IOutcomeRepository): void {
    ProgressViewService.repository = repo;
    OutcomeSeriesService.setRepository(repo);
    OutcomeAlertService.setRepository(repo);
  }

  /**
   * Generates user-facing progress view with non-stigmatizing language (Sections 71, 72).
   */
  public static async getUserProgress(userId: string): Promise<UserProgressView> {
    if (!ProgressViewService.repository) {
      throw new DomainInvariantError('OutcomeRepository not initialized.');
    }

    const measurements = await ProgressViewService.repository.findMeasurementsByUser(userId, false);
    const measureCodes = Array.from(new Set(measurements.map((m) => m.measure_code)));

    const measures: UserProgressView['measures'] = [];

    for (const code of measureCodes) {
      const series = await OutcomeSeriesService.getSeries(userId, code);
      const trend = OutcomeTrendEngine.evaluateSeries(series);

      // Governed user-facing translation (Section 72)
      let label = 'Maintaining steady progress';
      let trajectory: UserProgressView['measures'][0]['trajectory'] = 'STABLE';

      if (trend.trend_state === OutcomeTrendState.IMPROVING) {
        label = 'Showing positive improvement';
        trajectory = 'POSITIVE';
      } else if (trend.trend_state === OutcomeTrendState.WORSENING) {
        label = 'May benefit from additional support';
        trajectory = 'NEEDS_SUPPORT';
      } else if (trend.trend_state === OutcomeTrendState.INSUFFICIENT_DATA) {
        label = 'Tracking your journey';
        trajectory = 'INSUFFICIENT_DATA';
      }

      const points = series.measurements.map((m, idx) => ({
        date: m.measured_at,
        value: m.value,
        comparability_break_after:
          idx < series.measurements.length - 1 &&
          series.comparability_status === 'INCOMPARABLE'
      }));

      measures.push({
        measure_code: code,
        name: series.measure_definition.name,
        latest_score: series.measurements.length > 0 ? series.measurements[series.measurements.length - 1].value : undefined,
        unit: series.measure_definition.unit,
        user_status_label: label,
        trajectory,
        points
      });
    }

    return {
      userId,
      measures,
      summary_message: 'Your progress is tracked across standardized wellness and mental health metrics.'
    };
  }

  /**
   * Generates clinician longitudinal dashboard under relationship authorization (Sections 73, 74, 76, 111, 113).
   */
  public static async getProfessionalDashboard(params: {
    subject_user_id: string;
    professional_id: string;
    purpose?: string;
  }): Promise<ProfessionalOutcomeDashboard> {
    if (!ProgressViewService.repository) {
      throw new DomainInvariantError('OutcomeRepository not initialized.');
    }

    // Relationship authorization check
    const authDecision = await RelationshipAccessEvaluator.evaluateProfessionalAccess({
      subjectUserId: params.subject_user_id,
      professionalId: params.professional_id,
      purpose: params.purpose || 'CLINICAL_WORKFLOW',
      action: 'READ',
      dataDomain: 'CLINICAL_RECORDS'
    });

    if (!authDecision.allowed) {
      throw new AuthorizationError(
        `Professional ${params.professional_id} cannot access outcome dashboard for user ${params.subject_user_id}: ${authDecision.reason}`,
        { errorCode: authDecision.reasonCode || 'AUTHZ_003' }
      );
    }

    const measurements = await ProgressViewService.repository.findMeasurementsByUser(params.subject_user_id, false);
    const measureCodes = Array.from(new Set(measurements.map((m) => m.measure_code)));

    const trends: OutcomeTrend[] = [];
    const measureList: ProfessionalOutcomeDashboard['measures'] = [];

    for (const code of measureCodes) {
      const series = await OutcomeSeriesService.getSeries(params.subject_user_id, code);
      const trend = OutcomeTrendEngine.evaluateSeries(series);
      trends.push(trend);
      measureList.push({
        definition: series.measure_definition,
        series,
        trend
      });
    }

    const openAlerts = await ProgressViewService.repository.findAlertsByUser(params.subject_user_id, 'OPEN');
    const reviews = await ProgressViewService.repository.findReviewsByUser(params.subject_user_id);

    return {
      subject_user_id: params.subject_user_id,
      trends,
      measures: measureList,
      open_alerts: openAlerts,
      review_history: reviews
    };
  }

  /**
   * Generates privacy-safe, non-diagnostic OutcomeSummary projection for AI Companion (Sections 78, 80, 82).
   */
  public static async getOutcomeSummaryForAI(userId: string, timeWindowDays = 90): Promise<OutcomeSummary> {
    if (!ProgressViewService.repository) {
      throw new DomainInvariantError('OutcomeRepository not initialized.');
    }

    const measurements = await ProgressViewService.repository.findMeasurementsByUser(userId, false);
    const measureCodes = Array.from(new Set(measurements.map((m) => m.measure_code)));

    const summaries: OutcomeSummary['measure_summaries'] = [];

    for (const code of measureCodes) {
      const series = await OutcomeSeriesService.getSeries(userId, code);
      const trend = OutcomeTrendEngine.evaluateSeries(series);
      const latest = series.measurements.length > 0 ? series.measurements[series.measurements.length - 1] : undefined;

      summaries.push({
        measure_code: code,
        name: series.measure_definition.name,
        latest_value: latest?.value,
        unit: series.measure_definition.unit,
        trend_state: trend.trend_state,
        change_amount: trend.change_amount,
        is_clinically_significant: trend.is_clinically_significant,
        measurement_count: series.measurements.length,
        last_measured_at: latest?.measured_at
      });
    }

    const openAlerts = await ProgressViewService.repository.findAlertsByUser(userId, 'OPEN');
    const reviews = await ProgressViewService.repository.findReviewsByUser(userId);
    const pendingReviews = reviews.filter((r) => r.status === 'PENDING' || r.status === 'READY');

    return {
      subject_user_id: userId,
      time_window_days: timeWindowDays,
      measure_summaries: summaries,
      active_alerts_count: openAlerts.length,
      pending_reviews_count: pendingReviews.length,
      generated_at: new Date().toISOString(),
      policy_version: '1.0.0'
    };
  }
}
