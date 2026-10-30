/**
 * MindOS AI Safety Governance Bounded Context
 * Authority: Master Architecture Index Section 7, Volumes I, III, IV, XV & Appendices B / C / H / Q
 * Sprint 13: AI System Registry, Model/Prompt Governance, Safety Evaluations,
 *            Red-Team Controls, Human Oversight & AI Release Authorization
 *
 * Owns: AI systems, configurations, models, prompt versions, tools, policies, evaluations,
 *       red-team campaigns, safety reviews, approvals, runtime attestation, and incidents.
 *
 * Invariant: AI is replaceable; Safety Kernel, authorization, consent do not depend on a specific model provider.
 * Invariant: AI SHALL NOT create clinical diagnosis or medication prescription records (R-AI-002).
 * Invariant: AI cannot authorize itself (ADR-016).
 */

// Export Domain Types & Enums
export * from './domain/types.js';

// Export Canonical Errors
export * from './domain/errors.js';

// Export Fingerprint & Change Engines
export * from './domain/fingerprint.js';
export * from './domain/risk_classifier.js';
export * from './domain/material_change.js';

// Export Subsystem Services & Registries
export { AISystemRegistry } from './systems/registry.js';
export { AIProviderGovernanceService } from './providers/service.js';
export { AIModelRegistry } from './models/registry.js';
export { PromptRegistry } from './prompts/registry.js';
export { AIToolRegistry } from './tools/registry.js';
export { AIToolExecutionGate } from './tools/execution_gate.js';
export { AIPolicyManager } from './policies/manager.js';
export { AIConfigurationEngine } from './configurations/engine.js';
export { AIDatasetRegistry } from './datasets/registry.js';
export { AIEvaluationEngine } from './evaluations/engine.js';
export { CANONICAL_THRESHOLD_POLICY } from './evaluations/thresholds.js';
export type { ThresholdPolicyConfig } from './evaluations/thresholds.js';
export { AIRedTeamService } from './red_team/service.js';
export { AISafetyReviewWorkflow } from './reviews/workflow.js';
export { AIIncidentService } from './incidents/service.js';
export { AIRuntimeReleaseGate } from './releases/release_gate.js';

// Backward-compatible AISafetyGovernanceService facade
import { AISystemState, GovernanceDecision, validateStateTransition } from '../platform/shared/state_machines.js';
import { generateUUIDv7 } from '../platform/database/uuid.js';
import { AuditService } from '../platform/audit/index.js';
import { ValidationError, GovernanceBlockedError, AuthorizationError } from '../platform/errors/index.js';
import { EventBus } from '../platform/events/index.js';
import { DataClassification } from '../platform/shared/data_classification.js';
import { AISystemEntity, AIRiskClass, AISystemType } from './domain/types.js';
import { AISystemRegistry } from './systems/registry.js';
import { AIConfigurationEngine } from './configurations/engine.js';
import { AIEvaluationEngine } from './evaluations/engine.js';
import { AIRedTeamService } from './red_team/service.js';
import { AISafetyReviewWorkflow } from './reviews/workflow.js';
import { AIIncidentService } from './incidents/service.js';
import { AIPolicyManager } from './policies/manager.js';
import { PromptRegistry } from './prompts/registry.js';
import { AIToolRegistry } from './tools/registry.js';
import { AIModelRegistry } from './models/registry.js';

export interface AISystemVersionEntity {
  id: string;
  ai_system_id: string;
  version: number;
  model_id: string;
  prompt_bundle_id: string;
  safety_policy_id: string;
  tool_manifest: Record<string, unknown>;
  state: AISystemState;
  created_at: string;
}

export interface AILegacyEvaluationRunEntity {
  id: string;
  ai_system_version_id: string;
  suite_version: string;
  environment: string;
  metrics: Record<string, number>;
  critical_failures: string[];
  decision?: GovernanceDecision;
  started_at: string;
  completed_at?: string;
}

export class AISafetyGovernanceService {
  private static legacyVersions: Map<string, AISystemVersionEntity> = new Map();
  private static legacyEvaluations: Map<string, AILegacyEvaluationRunEntity> = new Map();

  public static async registerAISystem(params: {
    code: string;
    name: string;
    purpose: string;
    risk_class?: AIRiskClass;
    data_access_categories?: string[];
    owner: string;
    system_type?: AISystemType;
  }): Promise<AISystemEntity> {
    return await AISystemRegistry.registerSystem({
      code: params.code,
      name: params.name,
      description: params.purpose,
      system_type: params.system_type || AISystemType.CARE_NAVIGATION,
      owner_domain: 'clinical',
      owner: params.owner,
      purpose: params.purpose,
      data_categories: params.data_access_categories || []
    });
  }

  public static async recordEvaluationRun(params: {
    systemVersionId: string;
    suiteVersion: string;
    metrics: Record<string, number>;
    criticalFailures: string[];
  }): Promise<AILegacyEvaluationRunEntity> {
    const id = generateUUIDv7();
    const run: AILegacyEvaluationRunEntity = {
      id,
      ai_system_version_id: params.systemVersionId,
      suite_version: params.suiteVersion,
      environment: 'STAGING',
      metrics: params.metrics,
      critical_failures: params.criticalFailures,
      started_at: new Date().toISOString()
    };

    if (params.criticalFailures.length > 0) {
      run.decision = GovernanceDecision.BLOCKED;
    } else {
      run.decision = GovernanceDecision.APPROVED;
    }
    run.completed_at = new Date().toISOString();

    AISafetyGovernanceService.legacyEvaluations.set(id, run);
    return run;
  }

  public static async approveRelease(params: {
    systemId: string;
    reviewerId: string;
    evalRunId: string;
  }): Promise<AISystemEntity> {
    const system = AISystemRegistry.getSystem(params.systemId);
    const evalRun = AISafetyGovernanceService.legacyEvaluations.get(params.evalRunId);
    if (!evalRun) {
      throw new ValidationError('Evaluation run not found');
    }

    // Separation of duties check
    if (system.owner === params.reviewerId) {
      throw new AuthorizationError('AI system author cannot self-approve AI release.', {
        errorCode: 'AUTHZ_004'
      });
    }

    // Hard gate check (TC-GV-005)
    if (evalRun.critical_failures && evalRun.critical_failures.length > 0) {
      throw new GovernanceBlockedError(
        `AI_RELEASE_BLOCKED: Hard-gate evaluation failures: ${evalRun.critical_failures.join(', ')}`,
        {
          errorCode: 'GOV_001',
          safeUserMessage: 'AI system release blocked due to critical safety evaluation failures.'
        }
      );
    }

    AISystemRegistry.transitionState(system.id, AISystemState.APPROVED, params.reviewerId);

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.reviewerId,
      action: 'AI_SAFETY.RELEASE_APPROVED',
      resource_type: 'ai_system',
      resource_id: system.id,
      purpose: 'AI Safety Gate Sign-off',
      authorization_basis: { evalRunId: params.evalRunId },
      result: 'ALLOWED'
    });

    return system;
  }

  public static async pauseAISystem(systemId: string, reasonCode: string, actorId = 'SYSTEM'): Promise<void> {
    const system = AISystemRegistry.getSystem(systemId);
    AISystemRegistry.transitionState(system.id, AISystemState.PAUSED, actorId);

    EventBus.enqueue(
      'ai.system_paused',
      'ai_safety_governance',
      systemId,
      DataClassification.INTERNAL,
      {
        ai_system_id: systemId,
        reason_code: reasonCode,
        paused_at: new Date().toISOString()
      }
    );
  }

  public static resetForTesting(): void {
    AISystemRegistry.resetForTesting();
    AIConfigurationEngine.resetForTesting();
    AIEvaluationEngine.resetForTesting();
    AIRedTeamService.resetForTesting();
    AISafetyReviewWorkflow.resetForTesting();
    AIIncidentService.resetForTesting();
    AIPolicyManager.resetForTesting();
    PromptRegistry.resetForTesting();
    AIToolRegistry.resetForTesting();
    AIModelRegistry.resetForTesting();
    AISafetyGovernanceService.legacyVersions.clear();
    AISafetyGovernanceService.legacyEvaluations.clear();
  }
}
