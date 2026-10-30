/**
 * MindOS Crisis Response Orchestrator
 * Authority: Volumes I, V & Clinical Safety Policy Catalogue Section 5
 * 
 * Rules:
 * - Deterministic end-to-end orchestration of signals, risk states, actions, escalations, and resources.
 * - Enforces commercial suppression: suppresses ads, streaks, upsells, gamification during elevated risk.
 * - In CRITICAL_SAFETY mode, provides approved deterministic safety messaging.
 */

import { ISafetyRepository } from '../repositories/safety_repository.js';
import { SafetySignalService } from './signal_service.js';
import { RiskStateEngine, EvaluateRiskStateResult } from './risk_state_engine.js';
import { ActionOrchestrator } from './action_orchestrator.js';
import { SafetyEscalationService } from './escalation_service.js';
import { ResourceRegistryService } from './resource_registry_service.js';
import { RawSignalInput } from '../signals/normalizer.js';
import {
  SafetyActionEntity,
  SafetyEscalationEntity,
  SafetyResourceEntity,
  RiskState,
  SafetyMode
} from '../domain/types.js';

export interface CrisisResponsePacket {
  userId: string;
  riskLevel: RiskState;
  safetyMode: SafetyMode;
  actions: SafetyActionEntity[];
  escalation: SafetyEscalationEntity | null;
  crisisResources: SafetyResourceEntity[];
  commercialSuppressionActive: boolean;
  deterministicSafetySupportMessage?: string;
  stateChanged: boolean;
}

export class CrisisResponseOrchestrator {
  private signalService: SafetySignalService;
  private riskEngine: RiskStateEngine;
  private actionOrchestrator: ActionOrchestrator;
  private escalationService: SafetyEscalationService;
  private resourceService: ResourceRegistryService;

  constructor(private repo: ISafetyRepository) {
    this.signalService = new SafetySignalService(repo);
    this.riskEngine = new RiskStateEngine(repo);
    this.actionOrchestrator = new ActionOrchestrator(repo);
    this.escalationService = new SafetyEscalationService(repo);
    this.resourceService = new ResourceRegistryService(repo);
  }

  /**
   * Complete pipeline: Ingest Signal -> Evaluate Risk -> Orchestrate Actions & Escalations -> Assemble Crisis Response.
   */
  public async handleSafetySignal(input: RawSignalInput): Promise<CrisisResponsePacket> {
    // 1. Ingest signal
    await this.signalService.ingestSignal(input);

    // 2. Evaluate updated risk state
    const evalResult = await this.riskEngine.evaluateUserState(input.subject_user_id);

    // 3. Orchestrate actions
    const actions = await this.actionOrchestrator.orchestrateActions(
      evalResult.riskState,
      evalResult.policyResult
    );

    // 4. Handle escalation if required
    const escalation = await this.escalationService.handleEscalationIfNeeded(
      evalResult.riskState,
      evalResult.policyResult
    );

    // 5. Fetch verified crisis resources for jurisdiction
    const crisisResources = await this.resourceService.getVerifiedResources({
      jurisdiction: input.jurisdiction || 'KE',
      riskCategory: evalResult.riskState.level === RiskState.URGENT ? 'SUICIDE_SELF_HARM' : undefined
    });

    // 6. Commercial suppression rule: Active during ELEVATED_SUPPORT, HIGH_RISK, or CRITICAL_SAFETY
    const commercialSuppressionActive = evalResult.safetyMode !== SafetyMode.NORMAL;

    // 7. Deterministic safety support copy in critical/high mode
    let deterministicSafetySupportMessage: string | undefined;
    if (evalResult.safetyMode === SafetyMode.CRITICAL_SAFETY) {
      deterministicSafetySupportMessage =
        'If you are in immediate danger or distress, please reach out right now. Confidential, caring support is available free of charge 24/7.';
    } else if (evalResult.safetyMode === SafetyMode.HIGH_RISK) {
      deterministicSafetySupportMessage =
        'We want to make sure you have direct access to supportive resources and caring people whenever you need them.';
    }

    return {
      userId: input.subject_user_id,
      riskLevel: evalResult.riskState.level,
      safetyMode: evalResult.safetyMode,
      actions,
      escalation,
      crisisResources,
      commercialSuppressionActive,
      deterministicSafetySupportMessage,
      stateChanged: evalResult.stateChanged
    };
  }

  /**
   * Retrieves active safety posture for a user.
   */
  public async getUserSafetyPosture(userId: string, jurisdiction = 'KE'): Promise<{
    riskLevel: RiskState;
    safetyMode: SafetyMode;
    crisisResources: SafetyResourceEntity[];
    commercialSuppressionActive: boolean;
  }> {
    const current = await this.repo.getCurrentRiskState(userId);
    const riskLevel = current ? current.level : RiskState.UNKNOWN;

    let safetyMode = SafetyMode.NORMAL;
    if (riskLevel === RiskState.URGENT) safetyMode = SafetyMode.CRITICAL_SAFETY;
    else if (riskLevel === RiskState.HIGH) safetyMode = SafetyMode.HIGH_RISK;
    else if (riskLevel === RiskState.ELEVATED) safetyMode = SafetyMode.ELEVATED_SUPPORT;

    const crisisResources = await this.resourceService.getVerifiedResources({ jurisdiction });

    return {
      riskLevel,
      safetyMode,
      crisisResources,
      commercialSuppressionActive: safetyMode !== SafetyMode.NORMAL
    };
  }
}
