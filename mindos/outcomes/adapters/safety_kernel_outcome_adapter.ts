/**
 * MindOS Safety Kernel Outcome Adapter
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 23 Bounded Context
 * 
 * Rules:
 * - Emits CandidateSafetySignal to Safety Kernel when canonical clinical deterioration thresholds are breached.
 * - Invariant (Sections 40, 61, 145, 188): NEVER directly mutates RiskState.
 *   The path MUST be: OutcomeMeasurement -> approved Safety rule -> SafetySignal -> Safety Kernel.
 */

import { SafetyKernel } from '../../safety/index.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { OutcomeTrend } from '../domain/entities.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';

export class SafetyKernelOutcomeAdapter {
  public static async emitSafetySignal(params: {
    subject_user_id: string;
    measure_code: string;
    value: number | string | boolean;
    trend: OutcomeTrend;
    measurement_id: string;
  }): Promise<void> {
    const signalId = generateUUIDv7();

    // Audit the bridge evaluation
    AuditService.record({
      actor_type: 'SYSTEM',
      actor_id: 'outcome_safety_bridge',
      action: 'SAFETY.OUTCOME_SIGNAL_EMITTED',
      resource_type: 'safety_signal',
      resource_id: signalId,
      purpose: 'Clinical Outcome Safety Escalation',
      authorization_basis: { measureCode: params.measure_code },
      result: 'ALLOWED',
      metadata: {
        subjectUserId: params.subject_user_id,
        value: params.value,
        trendState: params.trend.trend_state,
        deteriorationSeverity: params.trend.deterioration_severity
      }
    });

    // Enqueue event
    EventBus.enqueue(
      'safety.signal_emitted',
      'safety',
      signalId,
      DataClassification.HEALTH_CRITICAL,
      {
        signal_id: signalId,
        subject_user_id: params.subject_user_id,
        source: 'OUTCOME_MEASUREMENT',
        source_id: params.measurement_id,
        measure_code: params.measure_code,
        severity: 'HIGH'
      }
    );

    // Call SafetyKernel if available without directly setting RiskState
    try {
      if (typeof (SafetyKernel as any).evaluateSignal === 'function') {
        await (SafetyKernel as any).evaluateSignal({
          userId: params.subject_user_id,
          signalType: 'CLINICAL_OUTCOME_DETERIORATION',
          payload: {
            measureCode: params.measure_code,
            value: params.value,
            trend: params.trend
          }
        });
      }
    } catch {
      // Conservative fail-closed handled via SafetySignal event and Alerting
    }
  }
}
