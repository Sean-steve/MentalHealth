/**
 * MindOS AI Configuration Engine
 * Authority: ADR-015, Volumes IV, XV & Appendices B / C
 * Invariants:
 * - Immutable configuration fingerprints calculated via deterministic SHA-256
 * - Any component change generates a new configuration with a distinct hash
 * - Unapproved models or providers cannot be configured
 */

import { AIConfigurationEntity } from '../domain/types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { computeAIConfigurationHash } from '../domain/fingerprint.js';
import { AISystemRegistry } from '../systems/registry.js';
import { AIModelRegistry } from '../models/registry.js';
import { AIProviderGovernanceService } from '../providers/service.js';
import { PromptRegistry } from '../prompts/registry.js';
import { AIToolRegistry } from '../tools/registry.js';
import { ValidationError, NotFoundError } from '../../platform/errors/index.js';

export class AIConfigurationEngine {
  private static configurations: Map<string, AIConfigurationEntity> = new Map();
  // key: `${systemId}:${version}` -> configId
  private static configVersionIndex: Map<string, string> = new Map();
  // key: configHash -> configId
  private static configHashIndex: Map<string, string> = new Map();

  public static async createConfiguration(params: {
    ai_system_id: string;
    version: string;
    provider_id: string;
    model_id: string;
    model_version: string;
    prompt_versions: Record<string, number>; // { prompt_code: versionNumber }
    toolset_codes: string[];
    toolset_version?: string;
    data_access_policy_version?: number;
    memory_policy_version?: number;
    safety_policy_version?: number;
    output_policy_version?: number;
    sampling_controls?: {
      temperature?: number;
      top_p?: number;
      max_tokens?: number;
    };
    jurisdiction?: string;
    population?: string;
  }): Promise<AIConfigurationEntity> {
    const system = AISystemRegistry.getSystem(params.ai_system_id);

    // Verify Provider is registered & approved
    AIProviderGovernanceService.validateProvider(params.provider_id, {
      requiredJurisdiction: params.jurisdiction || system.jurisdictions[0]
    });

    // Verify Model is registered and approved
    const model = AIModelRegistry.validateModelApproved(params.model_id);

    // Verify all Prompts and retrieve their immutable hashes
    const prompt_hashes: Record<string, string> = {};
    for (const [prompt_code, vNum] of Object.entries(params.prompt_versions)) {
      const promptVersion = PromptRegistry.getVersion(prompt_code, vNum);
      prompt_hashes[prompt_code] = promptVersion.content_hash;
    }

    // Verify all Tools are registered
    for (const toolCode of params.toolset_codes) {
      AIToolRegistry.getTool(toolCode);
    }

    const jurisdiction = params.jurisdiction || system.jurisdictions[0] || 'KE';
    const population = params.population || system.user_population[0] || 'ADULTS_18_PLUS';
    const toolset_version = params.toolset_version || '1.0.0';
    const data_access_policy_version = params.data_access_policy_version || 1;
    const memory_policy_version = params.memory_policy_version || 1;
    const safety_policy_version = params.safety_policy_version || 1;
    const output_policy_version = params.output_policy_version || 1;

    // Calculate deterministic configuration hash
    const configuration_hash = computeAIConfigurationHash({
      system_code: system.code,
      version: params.version,
      provider_id: params.provider_id,
      model_id: model.id,
      model_version: params.model_version,
      prompt_hashes,
      toolset_codes: params.toolset_codes,
      toolset_version,
      data_access_policy_version,
      memory_policy_version,
      safety_policy_version,
      output_policy_version,
      sampling_controls: params.sampling_controls || { temperature: 0.2, top_p: 0.95, max_tokens: 2048 },
      jurisdiction,
      population
    });

    const id = generateUUIDv7();
    const existingConfigs = AIConfigurationEngine.listConfigurationsForSystem(system.id);
    const latestConfig = existingConfigs.find(c => c.status === 'ACTIVE' || c.status === 'APPROVED');

    const config: AIConfigurationEntity = {
      id,
      ai_system_id: system.id,
      version: params.version,
      provider_id: params.provider_id,
      model_id: model.id,
      model_version: params.model_version,
      prompt_versions: params.prompt_versions,
      prompt_hashes,
      toolset_codes: params.toolset_codes,
      toolset_version,
      data_access_policy_version,
      memory_policy_version,
      safety_policy_version,
      output_policy_version,
      sampling_controls: params.sampling_controls || { temperature: 0.2, top_p: 0.95, max_tokens: 2048 },
      jurisdiction,
      population,
      status: 'DRAFT',
      configuration_hash,
      created_at: new Date().toISOString(),
      supersedes_id: latestConfig ? latestConfig.id : undefined
    };

    AIConfigurationEngine.configurations.set(id, config);
    AIConfigurationEngine.configVersionIndex.set(`${system.id}:${params.version}`, id);
    AIConfigurationEngine.configHashIndex.set(configuration_hash, id);

    return config;
  }

  public static getConfiguration(idOrHash: string): AIConfigurationEntity {
    const id = AIConfigurationEngine.configHashIndex.get(idOrHash) || idOrHash;
    const config = AIConfigurationEngine.configurations.get(id);
    if (!config) {
      throw new NotFoundError(`AI Configuration "${idOrHash}" not found.`);
    }
    return config;
  }

  public static getConfigurationByVersion(systemId: string, version: string): AIConfigurationEntity {
    const id = AIConfigurationEngine.configVersionIndex.get(`${systemId}:${version}`);
    if (!id) {
      throw new NotFoundError(`AI Configuration for system "${systemId}" version "${version}" not found.`);
    }
    return AIConfigurationEngine.getConfiguration(id);
  }

  public static listConfigurationsForSystem(systemId: string): AIConfigurationEntity[] {
    return Array.from(AIConfigurationEngine.configurations.values()).filter(c => c.ai_system_id === systemId);
  }

  public static updateStatus(configId: string, newStatus: 'DRAFT' | 'EVALUATING' | 'APPROVED' | 'ACTIVE' | 'SUPERSEDED' | 'REVOKED'): void {
    const config = AIConfigurationEngine.getConfiguration(configId);
    config.status = newStatus;
  }

  public static resetForTesting(): void {
    AIConfigurationEngine.configurations.clear();
    AIConfigurationEngine.configVersionIndex.clear();
    AIConfigurationEngine.configHashIndex.clear();
  }
}
