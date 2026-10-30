/**
 * MindOS Governed AI Runtime Drift Detector
 * Authority: Volumes IV, XV & Appendices B / C / H (ADR-015)
 * 
 * Verifies that active runtime components (models, prompt texts, tool definitions, policy versions)
 * strictly match the approved configuration fingerprint.
 * Blocks execution if any runtime drift or unauthorized tampering is detected.
 */

import { ResolvedAIConfiguration } from './config_resolver.js';
import { computeAIConfigurationHash, computePromptHash } from '../../ai_safety_governance/domain/fingerprint.js';
import { AIRuntimeDriftError } from '../domain/errors.js';

export class AIRuntimeDriftDetector {
  public static verifyRuntimeIntegrity(resolved: ResolvedAIConfiguration): void {
    // 1. Verify prompt content hashes
    const runtimePromptHashes: Record<string, string> = {};
    for (const [code, pVer] of Object.entries(resolved.prompts)) {
      const calculatedHash = computePromptHash(pVer.content_text);
      if (calculatedHash !== pVer.content_hash) {
        throw new AIRuntimeDriftError(
          `Prompt content drift detected for prompt "${code}". Expected ${pVer.content_hash}, calculated ${calculatedHash}.`
        );
      }
      runtimePromptHashes[code] = calculatedHash;
    }

    // 2. Recompute composite configuration hash
    const recomputedHash = computeAIConfigurationHash({
      system_code: resolved.system.code,
      version: resolved.configuration.version,
      provider_id: resolved.configuration.provider_id,
      model_id: resolved.model.id,
      model_version: resolved.configuration.model_version,
      prompt_hashes: runtimePromptHashes,
      toolset_codes: resolved.configuration.toolset_codes,
      toolset_version: resolved.configuration.toolset_version,
      data_access_policy_version: resolved.dataAccessPolicyVersion,
      memory_policy_version: resolved.memoryPolicyVersion,
      safety_policy_version: resolved.safetyPolicyVersion,
      output_policy_version: resolved.outputPolicyVersion,
      sampling_controls: resolved.configuration.sampling_controls,
      jurisdiction: resolved.configuration.jurisdiction,
      population: resolved.configuration.population
    });

    if (recomputedHash !== resolved.configurationHash) {
      throw new AIRuntimeDriftError(
        `AI Configuration runtime drift detected! Registered hash "${resolved.configurationHash}" differs from computed runtime hash "${recomputedHash}".`
      );
    }
  }
}
