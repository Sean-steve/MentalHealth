/**
 * MindOS Outcome Measurement Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 23 Bounded Context
 * 
 * Rules:
 * - Source-bound: Assessment results are referenced, never rescored.
 * - Strict provenance enforcement: USER_REPORTED, PROFESSIONAL_RECORDED, CLINICALLY_ASSESSED.
 * - AI inferences cannot masquerade as clinician-rated.
 * - Idempotency: Duplicate source reference returns existing measurement.
 * - Auto-projects to ClinicalTimelineEntry.
 * - Auto-checks deterioration and raises OutcomeAlert / SafetySignal when warranted.
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { UnitOfWork } from '../../platform/database/index.js';
import { CorrelationManager } from '../../platform/shared/correlation.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { DomainInvariantError, NotFoundError } from '../../platform/errors/index.js';
import { IOutcomeRepository } from '../repositories/interfaces.js';
import { MeasureRegistry } from '../measures/measure_registry.js';
import { OutcomeMeasurement, OutcomeBaseline } from '../domain/entities.js';
import {
  OutcomeMeasurementValidity,
  ClinicalProvenance,
  OutcomeBaselineType,
  OutcomeTrendState,
  OutcomeAlertType
} from '../domain/types.js';
import { OutcomeInvariants } from '../domain/invariants.js';
import { ClinicalTimelineService } from '../../clinical_record/timeline/clinical_timeline_service.js';
import { ClinicalTimelineSourceType, TimelineVisibilityScope } from '../../platform/shared/state_machines.js';
import { OutcomeSeriesService } from '../series/outcome_series_service.js';
import { OutcomeTrendEngine } from '../trends/trend_engine.js';
import { OutcomeAlertService } from '../alerts/outcome_alert_service.js';
import { SafetyKernelOutcomeAdapter } from '../adapters/safety_kernel_outcome_adapter.js';
import { RelationshipAccessEvaluator, DataDomain, ActionPermission } from '../../care_relationships/index.js';

export interface RecordMeasurementParams {
  subject_user_id: string;
  measure_code: string;
  value: number | string | boolean;
  unit: string;
  measured_at: string;
  source_type: string;
  source_reference: string;
  instrument_version?: string | number;
  provenance: ClinicalProvenance;
  care_relationship_id?: string;
  care_plan_id?: string;
  care_goal_id?: string;
  clinical_encounter_id?: string;
  recorded_by?: string;
  actor_role?: string;
}

export class OutcomeMeasurementService {
  private static repository: IOutcomeRepository;

  public static setRepository(repo: IOutcomeRepository): void {
    OutcomeMeasurementService.repository = repo;
    OutcomeSeriesService.setRepository(repo);
  }

  /**
   * Records a canonical outcome measurement.
   */
  public static async recordMeasurement(params: RecordMeasurementParams): Promise<OutcomeMeasurement> {
    if (!OutcomeMeasurementService.repository) {
      throw new DomainInvariantError('OutcomeRepository not initialized.');
    }

    const definition = MeasureRegistry.getDefinition(params.measure_code);

    // AI & Provenance Guards (Sections 24, 25, 26, 131, 132, 133)
    if (params.actor_role) {
      OutcomeInvariants.assertProvenanceIntegrity(params.provenance, params.actor_role);
    }

    if (params.actor_role === 'PROFESSIONAL') {
      if (!params.recorded_by || !params.care_relationship_id) {
        throw new DomainInvariantError('Professional outcome recording requires recorded_by and care_relationship_id.');
      }
      await RelationshipAccessEvaluator.assertAccess({
        relationshipId: params.care_relationship_id,
        professionalId: params.recorded_by,
        dataDomain: DataDomain.CLINICAL_NOTES,
        action: ActionPermission.WRITE,
        purpose: 'CLINICAL_DOCUMENTATION'
      });
    }

    // Validate value & unit (Sections 19, 20, 134, 135)
    OutcomeInvariants.validateMeasurementValue(definition, params.value, params.unit);

    // Idempotent source binding (Section 123)
    const existing = await OutcomeMeasurementService.repository.findMeasurementBySource(
      params.source_type,
      params.source_reference
    );
    if (existing) {
      return existing;
    }

    const measurementId = generateUUIDv7();
    const recorded_at = new Date().toISOString();

    const measurement: OutcomeMeasurement = {
      id: measurementId,
      subject_user_id: params.subject_user_id,
      measure_definition_id: definition.id,
      measure_code: params.measure_code,
      value: params.value,
      unit: params.unit,
      measured_at: params.measured_at,
      recorded_at,
      source_type: params.source_type,
      source_reference: params.source_reference,
      instrument_version: params.instrument_version,
      provenance: params.provenance,
      validity_status: OutcomeMeasurementValidity.VALID,
      care_relationship_id: params.care_relationship_id,
      care_plan_id: params.care_plan_id,
      care_goal_id: params.care_goal_id,
      clinical_encounter_id: params.clinical_encounter_id,
      recorded_by: params.recorded_by,
      created_at: recorded_at
    };

    const measurementEventPayload = {
      measurement_id: measurementId,
      subject_user_id: params.subject_user_id,
      measure_code: params.measure_code,
      provenance: params.provenance,
      source_type: params.source_type
    };

    if (OutcomeMeasurementService.repository.requiresUnitOfWork()) {
      await UnitOfWork.run(async uow => {
        await OutcomeMeasurementService.repository.saveMeasurementTransactional(measurement, uow.getClient());
        uow.registerOutboxEvent(
          'outcome.measurement_recorded',
          'outcomes',
          measurementId,
          measurementEventPayload,
          {
            correlation_id: CorrelationManager.getCorrelationId(),
            data_classification: DataClassification.CLINICAL_RECORD,
            producer_domain: 'outcomes'
          }
        );
      }, 'SERIALIZABLE');
    } else {
      await OutcomeMeasurementService.repository.saveMeasurement(measurement);
      EventBus.enqueue(
        'outcome.measurement_recorded',
        'outcomes',
        measurementId,
        DataClassification.CLINICAL_RECORD,
        measurementEventPayload
      );
    }

    // Auto-project to Clinical Timeline (Sections 7, 8, 129)
    await ClinicalTimelineService.recordEvent({
      subject_user_id: params.subject_user_id,
      event_type: 'outcome.measurement_recorded',
      occurred_at: params.measured_at,
      source_domain: 'outcomes',
      source_type: ClinicalTimelineSourceType.OUTCOME_MEASUREMENT,
      source_id: measurementId,
      provenance: params.provenance,
      clinical_significance: 'ROUTINE',
      summary_reference: `outcome-measurement:${measurementId}`,
      visibility_scope: TimelineVisibilityScope.USER, // Visible to user and professional
      care_relationship_id: params.care_relationship_id,
      care_plan_id: params.care_plan_id,
      actor_id: params.recorded_by
    });

    // Audit recording (Section 108)
    AuditService.record({
      actor_type: params.recorded_by ? 'STAFF' : 'PATIENT',
      actor_id: params.recorded_by || params.subject_user_id,
      action: 'OUTCOME_MEASUREMENT.RECORDED',
      resource_type: 'outcome_measurement',
      resource_id: measurementId,
      purpose: 'Clinical Outcome Tracking',
      authorization_basis: { measureCode: params.measure_code, sourceType: params.source_type },
      result: 'ALLOWED',
      metadata: { measureCode: params.measure_code, provenance: params.provenance, sourceType: params.source_type }
    });

    // Recompute trend and evaluate deterioration alerts (Sections 44, 60, 61, 144, 145)
    try {
      const series = await OutcomeSeriesService.getSeries(params.subject_user_id, params.measure_code);
      if (series.measurements.length >= 2) {
        const trend = OutcomeTrendEngine.evaluateSeries(series);

        EventBus.enqueue(
          'outcome.trend_changed',
          'outcomes',
          measurementId,
          DataClassification.CLINICAL_RECORD,
          {
            subject_user_id: params.subject_user_id,
            measure_code: params.measure_code,
            trend_state: trend.trend_state,
            is_clinically_significant: trend.is_clinically_significant
          }
        );

        if (trend.trend_state === OutcomeTrendState.WORSENING) {
          // Safety has precedence over the internal OutcomeAlert path. A failure
          // to create an alert must never prevent an approved Safety signal.
          if (trend.deterioration_severity === 'SAFETY_SIGNAL') {
            try {
              await SafetyKernelOutcomeAdapter.emitSafetySignal({
                subject_user_id: params.subject_user_id,
                measure_code: params.measure_code,
                trend,
                measurement_id: measurementId
              });
            } catch {
              EventBus.enqueue(
                'outcome.review_required',
                'outcomes',
                measurementId,
                DataClassification.HEALTH_CRITICAL,
                {
                  subject_user_id: params.subject_user_id,
                  measurement_id: measurementId,
                  measure_code: params.measure_code,
                  reason_code: 'SAFETY_BRIDGE_DELIVERY_FAILED'
                }
              );
            }
          }

          try {
            await OutcomeAlertService.raiseAlert({
              subject_user_id: params.subject_user_id,
              care_relationship_id: params.care_relationship_id,
              alert_type: OutcomeAlertType.DETERIORATION,
              severity:
                trend.deterioration_severity === 'SAFETY_SIGNAL'
                  ? 'CRITICAL'
                  : trend.deterioration_severity === 'URGENT_REVIEW'
                    ? 'HIGH'
                    : 'MEDIUM',
              measure_code: params.measure_code,
              measurement_id: measurementId
            });
          } catch {
            EventBus.enqueue(
              'outcome.review_required',
              'outcomes',
              measurementId,
              DataClassification.CLINICAL_RECORD,
              {
                subject_user_id: params.subject_user_id,
                measurement_id: measurementId,
                measure_code: params.measure_code,
                reason_code: 'OUTCOME_ALERT_DELIVERY_FAILED'
              }
            );
          }
        }
      }
    } catch {
      // Do not block measurement ingestion if trend calculation faces non-fatal exception
    }

    return measurement;
  }

  /**
   * Invalidates a measurement and cascades to timeline (Sections 28, 140).
   */
  public static async invalidateMeasurement(
    measurementId: string,
    reason: string,
    actorId = 'system'
  ): Promise<boolean> {
    if (!OutcomeMeasurementService.repository) {
      throw new DomainInvariantError('OutcomeRepository not initialized.');
    }

    const success = await OutcomeMeasurementService.repository.invalidateMeasurement(measurementId, reason);
    if (success) {
      await ClinicalTimelineService.invalidateBySource('outcomes', 'OUTCOME_MEASUREMENT', measurementId, reason, actorId);

      EventBus.enqueue(
        'outcome.measurement_invalidated',
        'outcomes',
        measurementId,
        DataClassification.CLINICAL_RECORD,
        {
          measurement_id: measurementId,
          reason
        }
      );

      AuditService.record({
        actor_type: 'STAFF',
        actor_id: actorId,
        action: 'OUTCOME_MEASUREMENT.INVALIDATED',
        resource_type: 'outcome_measurement',
        resource_id: measurementId,
        purpose: 'Clinical Data Invalidation',
        authorization_basis: { reason },
        result: 'ALLOWED',
        metadata: { reason }
      });
    }

    return success;
  }
}
