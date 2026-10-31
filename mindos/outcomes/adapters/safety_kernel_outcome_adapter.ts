/**
 * Governed bridge from an approved outcome Safety threshold to the authoritative
 * SafetySignalService and RiskStateEngine. Outcomes never mutate RiskState.
 */
import { AuditService } from '../../platform/audit/index.js';
import { DomainInvariantError } from '../../platform/errors/index.js';
import {
  SafetySignalService,
  RiskStateEngine,
  getSafetyRepository,
  SignalSourceType,
  SignalProvenance
} from '../../safety/index.js';
import { OutcomeTrend } from '../domain/entities.js';
import { ClinicalChangeRuleRegistry } from '../trends/clinical_change_rules.js';

export class SafetyKernelOutcomeAdapter {
  public static async emitSafetySignal(params: {
    subject_user_id: string;
    measure_code: string;
    trend: OutcomeTrend;
    measurement_id: string;
  }): Promise<{ safety_signal_id: string; risk_state_id: string }> {
    const rule = ClinicalChangeRuleRegistry.getApprovedRule(params.measure_code);
    if (!rule || !rule.safety_signal_code) {
      throw new DomainInvariantError(
        'Outcome Safety escalation requires an approved clinical-change rule with safety_signal_code.'
      );
    }

    const repo = getSafetyRepository();
    const signalService = new SafetySignalService(repo);
    const ingested = await signalService.ingestSignal({
      subject_user_id: params.subject_user_id,
      signal_code: rule.safety_signal_code,
      source_type: SignalSourceType.SYSTEM_OBSERVATION,
      source_reference: 'outcome-measurement:' + params.measurement_id,
      provenance: SignalProvenance.SYSTEM_OBSERVED,
      evidence_reference: 'outcome-measurement:' + params.measurement_id,
      jurisdiction: 'KE'
    });

    const risk = await new RiskStateEngine(repo).evaluateUserState(params.subject_user_id);

    AuditService.record({
      actor_type: 'SYSTEM',
      actor_id: 'outcome_safety_bridge',
      action: 'SAFETY.OUTCOME_SIGNAL_FORWARDED',
      resource_type: 'safety_signal',
      resource_id: ingested.signal.id,
      purpose: 'SAFETY_MONITORING',
      authorization_basis: {
        clinicalArtifactId: rule.clinical_artifact_id,
        clinicalArtifactVersion: rule.clinical_artifact_version
      },
      result: 'ALLOWED',
      metadata: {
        subjectUserId: params.subject_user_id,
        measurementId: params.measurement_id,
        measureCode: params.measure_code,
        signalCode: rule.safety_signal_code,
        riskStateId: risk.riskState.id
      }
    });

    return {
      safety_signal_id: ingested.signal.id,
      risk_state_id: risk.riskState.id
    };
  }
}
