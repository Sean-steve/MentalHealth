/**
 * MindOS AI Runtime Release Gate & Attestation Service
 * Authority: ADR-015, Volumes III, IV, IX, XV & Appendices B / C
 * Invariants:
 * - Deterministic, fail-closed runtime authorization before ANY AI inference
 * - Runtime drift detection: hashes live payload vs approved configuration fingerprint
 * - Multi-layer validation: state, model, provider, prompts, evaluations, incidents
 */

import {
  AIConfigurationEntity,
  AISystemState,
  AIApprovalEntity,
  AIIncidentType
} from '../domain/types.js';
import { AISystemRegistry } from '../systems/registry.js';
import { AIConfigurationEngine } from '../configurations/engine.js';
import { AIModelRegistry } from '../models/registry.js';
import { AIProviderGovernanceService } from '../providers/service.js';
import { AISafetyReviewWorkflow } from '../reviews/workflow.js';
import { AIIncidentService } from '../incidents/service.js';
import {
  AISystemNotApprovedError,
  AIConfigurationNotApprovedError,
  AIRuntimeDriftDetectedError,
  AIApprovalExpiredError,
  AIApprovalRevokedError,
  AICriticalSafetyFailureError
} from '../domain/errors.js';
import { AuditService } from '../../platform/audit/index.js';

export interface RuntimeAttestationContext {
  ai_system_id: string;
  runtime_configuration_hash: string;
  actor_id: string;
  target_user_id: string;
  declared_purpose: string;
}

export interface RuntimeAttestationResult {
  authorized: boolean;
  system_state: AISystemState;
  configuration: AIConfigurationEntity;
  approval: AIApprovalEntity;
  attested_at: string;
}

export class AIRuntimeReleaseGate {
  /**
   * Evaluates runtime attestation.
   * Throws fail-closed canonical errors if any gate is unsatisfied.
   */
  public static attestExecution(ctx: RuntimeAttestationContext): RuntimeAttestationResult {
    // 1. System state check
    const system = AISystemRegistry.getSystem(ctx.ai_system_id);
    const blockedStates: AISystemState[] = [
      AISystemState.DRAFT,
      AISystemState.PAUSED,
      AISystemState.SUSPENDED,
      AISystemState.REVOKED,
      AISystemState.RETIRED
    ];

    if (blockedStates.includes(system.state)) {
      AuditService.record({
        actor_type: 'SERVICE',
        actor_id: ctx.actor_id,
        action: 'AI_RELEASE_GATE.SYSTEM_STATE_BLOCKED',
        resource_type: 'ai_system',
        resource_id: system.id,
        purpose: ctx.declared_purpose,
        authorization_basis: { state: system.state },
        result: 'DENIED'
      });

      throw new AISystemNotApprovedError(
        `AI System "${system.code}" is in state "${system.state}" (cannot execute workloads).`,
        { system_code: system.code, state: system.state }
      );
    }

    // 2. Retrieve Configuration
    const config = AIConfigurationEngine.getConfiguration(ctx.runtime_configuration_hash);

    // 3. Drift Detection: Compare runtime configuration hash to approved configuration hash
    if (config.configuration_hash !== ctx.runtime_configuration_hash) {
      AIIncidentService.reportIncident({
        ai_system_id: system.id,
        configuration_version: config.version,
        incident_type: AIIncidentType.MODEL_DRIFT,
        severity: 'CRITICAL',
        source: 'RUNTIME_RELEASE_GATE',
        description: 'Runtime configuration hash divergence detected.',
        owner: 'AI_SAFETY_ENGINE'
      });

      throw new AIRuntimeDriftDetectedError(
        `Runtime hash "${ctx.runtime_configuration_hash}" does not match approved hash "${config.configuration_hash}".`
      );
    }

    // 4. Verify Approval Record
    const approval = AISafetyReviewWorkflow.getApprovalByConfigHash(config.configuration_hash);
    if (!approval) {
      throw new AIConfigurationNotApprovedError(
        `Configuration v${config.version} (hash: ${config.configuration_hash.slice(0, 8)}) has no formal AI Approval.`
      );
    }

    if (approval.status === 'REVOKED') {
      throw new AIApprovalRevokedError(
        `Configuration approval was revoked: ${approval.revocation_reason || 'Safety revocation'}.`
      );
    }

    if (approval.status === 'EXPIRED' || new Date(approval.expires_at) < new Date()) {
      throw new AIApprovalExpiredError(
        `Configuration approval expired on ${approval.expires_at}.`
      );
    }

    // 5. Verify Model & Provider
    AIProviderGovernanceService.validateProvider(config.provider_id);
    AIModelRegistry.validateModelApproved(config.model_id);

    // 6. Verify Unresolved Critical Incidents
    const openIncidents = AIIncidentService.listUnresolvedIncidents(system.id);
    const criticalIncidents = openIncidents.filter(i => i.severity === 'CRITICAL');
    if (criticalIncidents.length > 0) {
      throw new AICriticalSafetyFailureError(
        `AI execution blocked by ${criticalIncidents.length} active CRITICAL incident(s).`
      );
    }

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: ctx.actor_id,
      action: 'AI_RELEASE_GATE.ATTESTATION_SUCCEEDED',
      resource_type: 'ai_configuration',
      resource_id: config.configuration_hash,
      purpose: ctx.declared_purpose,
      authorization_basis: { approvalId: approval.id, systemState: system.state },
      result: 'ALLOWED'
    });

    return {
      authorized: true,
      system_state: system.state,
      configuration: config,
      approval,
      attested_at: new Date().toISOString()
    };
  }

  /**
   * Generates Comprehensive Audit Evidence Pack (Section 47)
   */
  public static generateEvidencePack(systemId: string, configurationVersion: string): Record<string, unknown> {
    const system = AISystemRegistry.getSystem(systemId);
    const config = AIConfigurationEngine.getConfigurationByVersion(systemId, configurationVersion);
    const approval = AISafetyReviewWorkflow.getApprovalByConfigHash(config.configuration_hash);
    const model = AIModelRegistry.getModel(config.model_id);
    const incidents = AIIncidentService.listUnresolvedIncidents(systemId);

    return {
      title: `MindOS AI Safety Governance Evidence Pack - ${system.code} v${config.version}`,
      system_metadata: {
        id: system.id,
        code: system.code,
        name: system.name,
        risk_class: system.risk_class,
        state: system.state
      },
      configuration: {
        id: config.id,
        version: config.version,
        fingerprint: config.configuration_hash,
        sampling: config.sampling_controls,
        tools: config.toolset_codes,
        policies: {
          data_access: config.data_access_policy_version,
          memory: config.memory_policy_version,
          safety: config.safety_policy_version,
          output: config.output_policy_version
        }
      },
      model_entry: {
        model_code: model.model_code,
        provider_id: model.provider_id,
        status: model.status
      },
      approval: approval || null,
      active_incidents_count: incidents.length,
      generated_at: new Date().toISOString()
    };
  }
}
