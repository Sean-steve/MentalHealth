/**
 * MindOS Governed AI Configuration Resolver
 * Authority: ADR-008, ADR-015, Volumes I, IV, XV & Appendices B / C / H / Q
 * 
 * Invariants:
 * - Fail closed: If AI system or configuration is unapproved, paused, suspended, or revoked,
 *   resolution MUST refuse execution and throw AISystemUnavailableError.
 * - Runtime state and policy versions must match approved configuration.
 */

import {
  AISystemRegistry,
  AIConfigurationEngine,
  AIModelRegistry,
  PromptRegistry,
  AIToolRegistry,
  AIPolicyManager
} from '../../ai_safety_governance/index.js';
import {
  AISystemEntity,
  AIConfigurationEntity,
  AIModelEntity,
  PromptVersionEntity,
  AIToolEntity,
  AISystemState,
  AIModelStatus
} from '../../ai_safety_governance/domain/types.js';
import { AISystemUnavailableError, AIConfigurationResolutionError } from '../domain/errors.js';

export interface ResolvedAIConfiguration {
  system: AISystemEntity;
  configuration: AIConfigurationEntity;
  model: AIModelEntity;
  prompts: Record<string, PromptVersionEntity>;
  tools: AIToolEntity[];
  dataAccessPolicyVersion: number;
  memoryPolicyVersion: number;
  safetyPolicyVersion: number;
  outputPolicyVersion: number;
  configurationHash: string;
}

export class AIConfigurationResolver {
  public static readonly DEFAULT_COMPANION_SYSTEM_CODE = 'ai-companion-ke';

  public static async resolve(params?: {
    systemCode?: string;
    systemId?: string;
    version?: string;
  }): Promise<ResolvedAIConfiguration> {
    const code = params?.systemCode || AIConfigurationResolver.DEFAULT_COMPANION_SYSTEM_CODE;

    // 1. Resolve AISystem
    let system: AISystemEntity;
    try {
      if (params?.systemId) {
        system = AISystemRegistry.getSystem(params.systemId);
      } else {
        system = AISystemRegistry.getSystemByCode(code);
      }
    } catch {
      throw new AISystemUnavailableError(`AI System with identifier "${params?.systemId || code}" is not registered.`);
    }

    // Fail-closed state check on AISystem (must be APPROVED or ACTIVE)
    if (system.state !== AISystemState.APPROVED && system.state !== AISystemState.ACTIVE) {
      throw new AISystemUnavailableError(
        `AI System "${system.code}" is in state "${system.state}". Execution is blocked under fail-closed governance policy.`
      );
    }

    // 2. Resolve AIConfiguration
    let config: AIConfigurationEntity | undefined;
    if (params?.version) {
      try {
        config = AIConfigurationEngine.getConfigurationByVersion(system.id, params.version);
      } catch {
        throw new AIConfigurationResolutionError(
          `AI Configuration for system "${system.code}" version "${params.version}" not found.`
        );
      }
    } else {
      const allConfigs = AIConfigurationEngine.listConfigurationsForSystem(system.id);
      config = allConfigs.find(c => c.status === 'ACTIVE') || allConfigs.find(c => c.status === 'APPROVED');
      if (!config && allConfigs.length > 0) {
        config = allConfigs[allConfigs.length - 1];
      }
    }

    if (!config) {
      throw new AISystemUnavailableError(`No approved AI configuration found for AI system "${system.code}".`);
    }

    // Fail-closed check on configuration status
    if (config.status !== 'APPROVED' && config.status !== 'ACTIVE') {
      throw new AISystemUnavailableError(
        `AI Configuration "${config.version}" for system "${system.code}" is in status "${config.status}". Fail-closed policy blocks unapproved configurations.`
      );
    }

    // 3. Resolve & validate Model
    let model: AIModelEntity;
    try {
      model = AIModelRegistry.getModel(config.model_id);
    } catch {
      throw new AIConfigurationResolutionError(`Referenced AI Model "${config.model_id}" not found.`);
    }

    if (model.status !== AIModelStatus.APPROVED) {
      throw new AISystemUnavailableError(
        `Referenced AI Model "${model.model_code}" is in status "${model.status}". Only APPROVED models may execute.`
      );
    }

    // 4. Resolve & validate Prompts
    const resolvedPrompts: Record<string, PromptVersionEntity> = {};
    for (const [promptCode, versionNum] of Object.entries(config.prompt_versions)) {
      try {
        const pVer = PromptRegistry.getVersion(promptCode, versionNum);
        if (pVer.status !== 'APPROVED') {
          throw new AISystemUnavailableError(
            `Prompt "${promptCode}" v${versionNum} is in status "${pVer.status}". Only APPROVED prompts may execute.`
          );
        }
        resolvedPrompts[promptCode] = pVer;
      } catch (err: any) {
        if (err instanceof AISystemUnavailableError) throw err;
        throw new AIConfigurationResolutionError(`Failed to resolve prompt "${promptCode}" v${versionNum}: ${err.message}`);
      }
    }

    // 5. Resolve & validate Tools
    const resolvedTools: AIToolEntity[] = [];
    for (const toolCode of config.toolset_codes) {
      try {
        const tool = AIToolRegistry.getTool(toolCode);
        if (tool.status !== 'ACTIVE') {
          throw new AISystemUnavailableError(`Tool "${toolCode}" is not in ACTIVE status (current: ${tool.status}).`);
        }
        resolvedTools.push(tool);
      } catch (err: any) {
        if (err instanceof AISystemUnavailableError) throw err;
        throw new AIConfigurationResolutionError(`Failed to resolve tool "${toolCode}": ${err.message}`);
      }
    }

    return {
      system,
      configuration: config,
      model,
      prompts: resolvedPrompts,
      tools: resolvedTools,
      dataAccessPolicyVersion: config.data_access_policy_version,
      memoryPolicyVersion: config.memory_policy_version,
      safetyPolicyVersion: config.safety_policy_version,
      outputPolicyVersion: config.output_policy_version,
      configurationHash: config.configuration_hash
    };
  }
}
