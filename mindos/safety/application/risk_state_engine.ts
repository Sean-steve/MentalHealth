/**
 * MindOS Authoritative Risk State Engine
 * Authority: Volumes I, V, XV & Clinical Safety Policy Catalogue Section 5
 * 
 * Rules:
 * - Computes single source of truth RiskState per user.
 * - Deterministic policy evaluation under ART-SAFE-001.
 * - Invariant: Exactly one active current RiskState per subject.
 * - Evaluates SafetyMode corresponding to canonical risk level.
 */

import { ISafetyRepository } from '../repositories/safety_repository.js';
import {
  RiskState,
  RiskStateEntity,
  SafetyMode,
  SignalSeverity
} from '../domain/types.js';
import { CanonicalRiskPolicy, EvaluatedRiskPolicyResult } from '../policies/canonical_policies.js';
import { RiskHysteresisManager } from '../risk/hysteresis.js';
import { RiskStateMachine } from '../risk/state_machine.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventPublisher } from '../../platform/events/index.js';
import { CanonicalEventTypes, EventPriority } from '../../platform/events/registry/event_registry.js';
import { SafetyMetrics } from '../infrastructure/metrics.js';
import { AuditService } from '../../platform/audit/index.js';

export interface EvaluateRiskStateResult {
  riskState: RiskStateEntity;
  safetyMode: SafetyMode;
  policyResult: EvaluatedRiskPolicyResult;
  isHeldByHysteresis: boolean;
  stateChanged: boolean;
}

export class RiskStateEngine {
  constructor(private repo: ISafetyRepository) {}

  /**
   * Evaluates or recalculates the canonical RiskState for a user.
   */
  public async evaluateUserState(userId: string): Promise<EvaluateRiskStateResult> {
    const now = new Date();
    const nowMs = now.getTime();
    const nowIso = now.toISOString();

    // 1. Fetch current risk state
    const currentEntity = await this.repo.getCurrentRiskState(userId);
    const currentState = currentEntity ? currentEntity.level : RiskState.UNKNOWN;

    // 2. Fetch active signals and factors
    const rawSignals = await this.repo.getSignalsByUser(userId);
    // Consider active signals within last 24 hours
    const activeSignals = rawSignals
      .filter(s => s.status === 'ACTIVE' && nowMs - new Date(s.observed_at).getTime() < 24 * 60 * 60 * 1000)
      .map(s => ({
        signal_type: s.signal_type as any,
        signal_code: s.signal_code,
        source_type: s.source_type,
        source_reference: s.source_reference,
        provenance: s.provenance,
        severity: s.severity,
        confidence: s.confidence,
        observed_at: s.observed_at,
        received_at: s.received_at,
        raw_evidence_reference: s.raw_evidence_reference,
        normalized_evidence: s.normalized_evidence as any,
        jurisdiction: s.jurisdiction
      }));

    const activeRiskFactors = await this.repo.getActiveRiskFactors(userId);
    const activeProtectiveFactors = await this.repo.getActiveProtectiveFactors(userId);

    // 3. Evaluate deterministic clinical policy
    const policyResult = CanonicalRiskPolicy.evaluate({
      signals: activeSignals,
      activeRiskFactors: activeRiskFactors.map(f => f.factor_type),
      protectiveFactors: activeProtectiveFactors.map(f => f.factor_type),
      previousState: currentState
    });

    // 4. Apply hysteresis & flapping prevention
    const { finalState, isHeldByHysteresis, holdReason } = RiskHysteresisManager.applyHysteresis(
      userId,
      policyResult.riskLevel,
      nowMs
    );

    const stateChanged = finalState !== currentState;

    // 5. Validate state machine transition if changed
    if (stateChanged) {
      RiskStateMachine.validateTransition(currentState, finalState, {
        userId,
        isClinicalReviewApproved: false // automated evaluation
      });
      SafetyMetrics.recordStateTransition(currentState, finalState);
    }

    // 6. Compute SafetyMode
    let safetyMode = SafetyMode.NORMAL;
    if (finalState === RiskState.URGENT) {
      safetyMode = SafetyMode.CRITICAL_SAFETY;
    } else if (finalState === RiskState.HIGH) {
      safetyMode = SafetyMode.HIGH_RISK;
    } else if (finalState === RiskState.ELEVATED) {
      safetyMode = SafetyMode.ELEVATED_SUPPORT;
    }

    // 7. Construct fresh RiskStateEntity
    const freshUntil = new Date(nowMs + policyResult.freshnessDurationMs).toISOString();
    const reasonCodes = [...policyResult.reasonCodes];
    if (isHeldByHysteresis && holdReason) {
      reasonCodes.push(holdReason);
    }

    const newRiskState: RiskStateEntity = {
      id: generateUUIDv7(),
      subject_user_id: userId,
      level: finalState,
      state_version: (currentEntity?.state_version || 0) + 1,
      effective_at: nowIso,
      previous_state: currentState,
      reason_codes: reasonCodes,
      evidence_refs: policyResult.evidenceRefs,
      policy_version: policyResult.policyVersion,
      clinical_artifact_ref: policyResult.clinicalArtifactRef,
      source_summary: {
        activeSignalCount: activeSignals.length,
        riskFactorCount: activeRiskFactors.length,
        protectiveFactorCount: activeProtectiveFactors.length,
        isHeldByHysteresis
      },
      fresh_until: freshUntil,
      status: 'CURRENT',
      created_at: nowIso,
      updated_at: nowIso
    };

    // 8. Persist authoritative risk state
    await this.repo.saveRiskState(newRiskState);

    // 9. Audit event
    AuditService.record({
      actor_type: 'SERVICE',
      action: 'SAFETY.RISK_STATE_EVALUATED',
      resource_type: 'risk_states',
      resource_id: newRiskState.id,
      purpose: 'SAFETY_RESPONSE',
      authorization_basis: { policy_version: newRiskState.policy_version },
      result: 'ALLOWED',
      metadata: {
        subject_user_id: userId,
        level: finalState,
        previous_state: currentState,
        stateChanged,
        safetyMode
      }
    });

    // 10. Publish domain event if state changed or urgent
    if (stateChanged || finalState === RiskState.URGENT) {
      try {
        await EventPublisher.publish({
          type: CanonicalEventTypes.SAFETY_STATE_CHANGED,
          subjectId: userId,
          payload: {
            riskStateId: newRiskState.id,
            previousState: currentState,
            newState: finalState,
            safetyMode,
            reasonCodes: newRiskState.reason_codes,
            policyVersion: newRiskState.policy_version
          },
          priority: finalState === RiskState.URGENT ? EventPriority.CRITICAL : EventPriority.HIGH
        });
      } catch (err) {
        // Non-blocking event publish
      }
    }

    return {
      riskState: newRiskState,
      safetyMode,
      policyResult,
      isHeldByHysteresis,
      stateChanged
    };
  }
}
