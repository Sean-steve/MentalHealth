/**
 * MindOS Deterministic Configuration Fingerprint Engine
 * Authority: ADR-015, ADR-020 & Master Architecture Index Section 7
 * Invariant: Every component (model, prompts, tools, policies, sampling, scope)
 * must be deterministically serialized and hashed via SHA-256.
 */

import { createHash } from 'crypto';

export interface ConfigurationFingerprintInput {
  system_code: string;
  version: string;
  provider_id: string;
  model_id: string;
  model_version: string;
  prompt_hashes: Record<string, string>; // sorted keys
  toolset_codes: string[]; // sorted
  toolset_version: string;
  data_access_policy_version: number;
  memory_policy_version: number;
  safety_policy_version: number;
  output_policy_version: number;
  sampling_controls: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  };
  jurisdiction: string;
  population: string;
}

export function computePromptHash(content: string): string {
  // Normalize whitespace (trim, normalize CRLF to LF)
  const normalized = content.replace(/\r\n/g, '\n').trim();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function computeAIConfigurationHash(input: ConfigurationFingerprintInput): string {
  // Sort prompt hashes by key
  const sortedPromptKeys = Object.keys(input.prompt_hashes || {}).sort();
  const sortedPromptHashes: Record<string, string> = {};
  for (const k of sortedPromptKeys) {
    sortedPromptHashes[k] = input.prompt_hashes[k];
  }

  // Sort toolset codes
  const sortedTools = [...(input.toolset_codes || [])].sort();

  // Normalize sampling controls
  const normalizedSampling = {
    temperature: input.sampling_controls?.temperature !== undefined ? Number(input.sampling_controls.temperature.toFixed(4)) : 0.2,
    top_p: input.sampling_controls?.top_p !== undefined ? Number(input.sampling_controls.top_p.toFixed(4)) : 0.95,
    max_tokens: input.sampling_controls?.max_tokens || 2048
  };

  const canonicalPayload = {
    system_code: input.system_code,
    version: input.version,
    provider_id: input.provider_id,
    model_id: input.model_id,
    model_version: input.model_version,
    prompts: sortedPromptHashes,
    tools: sortedTools,
    toolset_version: input.toolset_version,
    policies: {
      data_access: input.data_access_policy_version,
      memory: input.memory_policy_version,
      safety: input.safety_policy_version,
      output: input.output_policy_version
    },
    sampling: normalizedSampling,
    jurisdiction: input.jurisdiction,
    population: input.population
  };

  const serialized = JSON.stringify(canonicalPayload, Object.keys(canonicalPayload).sort());
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
}
