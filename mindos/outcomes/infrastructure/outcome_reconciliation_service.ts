/**
 * MindOS Outcome Reconciliation & Observability Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 23 Bounded Context
 * 
 * Rules:
 * - Periodically reconciles measurements against sources, comparability, and timeline (Section 128).
 * - Implements canonical observability metrics (Section 175).
 */

import { IOutcomeRepository } from '../repositories/interfaces.js';
import { IClinicalRecordRepository } from '../../clinical_record/repositories/interfaces.js';
import { logger } from '../../platform/observability/logger.js';

export interface OutcomeMetrics {
  outcome_measurements_recorded_total: number;
  outcome_measurements_invalidated_total: number;
  outcome_trends_improving_total: number;
  outcome_trends_worsening_total: number;
  outcome_trends_incomparable_total: number;
  outcome_reviews_pending: number;
  outcome_reviews_completed_total: number;
  outcome_alerts_open: number;
  outcome_alerts_overdue: number;
  clinical_timeline_projection_lag_ms: number;
  outcome_projection_failures_total: number;
  outcome_reconciliation_failures_total: number;
}

export class OutcomeReconciliationService {
  private static outcomeRepo: IOutcomeRepository;
  private static clinicalRepo: IClinicalRecordRepository;

  private static metrics: OutcomeMetrics = {
    outcome_measurements_recorded_total: 0,
    outcome_measurements_invalidated_total: 0,
    outcome_trends_improving_total: 0,
    outcome_trends_worsening_total: 0,
    outcome_trends_incomparable_total: 0,
    outcome_reviews_pending: 0,
    outcome_reviews_completed_total: 0,
    outcome_alerts_open: 0,
    outcome_alerts_overdue: 0,
    clinical_timeline_projection_lag_ms: 0,
    outcome_projection_failures_total: 0,
    outcome_reconciliation_failures_total: 0
  };

  public static initialize(outcomeRepo: IOutcomeRepository, clinicalRepo: IClinicalRecordRepository): void {
    this.outcomeRepo = outcomeRepo;
    this.clinicalRepo = clinicalRepo;
  }

  public static getMetrics(): OutcomeMetrics {
    return { ...this.metrics };
  }

  public static incrementMetric(key: keyof OutcomeMetrics, amount = 1): void {
    this.metrics[key] += amount;
  }

  /**
   * Reconciles measurements vs timeline projections (Section 128).
   */
  public static async reconcileTimelineProjection(userId: string): Promise<{
    checkedCount: number;
    reconciledCount: number;
  }> {
    if (!this.outcomeRepo || !this.clinicalRepo) {
      return { checkedCount: 0, reconciledCount: 0 };
    }

    const measurements = await this.outcomeRepo.findMeasurementsByUser(userId, true);
    let reconciled = 0;

    for (const m of measurements) {
      const entry = await this.clinicalRepo.findTimelineEntryBySource('outcomes', 'OUTCOME_MEASUREMENT', m.id);
      if (!entry) {
        // Missing timeline entry; rebuild
        await this.clinicalRepo.saveTimelineEntry({
          id: `reconciled_${m.id}`,
          subject_user_id: m.subject_user_id,
          event_type: 'outcome.measurement_recorded',
          occurred_at: m.measured_at,
          recorded_at: m.recorded_at,
          source_domain: 'outcomes',
          source_type: 'OUTCOME_MEASUREMENT' as any,
          source_id: m.id,
          provenance: m.provenance,
          clinical_significance: 'ROUTINE',
          safety_significance: 'NONE',
          summary_reference: `outcome-measurement:${m.id}`,
          visibility_scope: 'USER' as any,
          created_at: m.created_at
        });
        reconciled++;
      }
    }

    logger.info(`[OutcomeReconciliation] Reconciled ${reconciled} of ${measurements.length} measurements for user.`);
    return { checkedCount: measurements.length, reconciledCount: reconciled };
  }
}
