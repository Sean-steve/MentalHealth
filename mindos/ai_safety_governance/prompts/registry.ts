/**
 * MindOS Prompt Artifact & Version Registry
 * Authority: ADR-015, ADR-016 & Volumes IV, XV
 * Invariant: Approved prompt versions are strictly IMMUTABLE.
 * Any modification creates version N+1 with fresh SHA-256 hash.
 */

import { PromptArtifactEntity, PromptVersionEntity, PromptType } from '../domain/types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { ValidationError, NotFoundError, DomainInvariantError } from '../../platform/errors/index.js';
import { computePromptHash } from '../domain/fingerprint.js';

export class PromptRegistry {
  private static prompts: Map<string, PromptArtifactEntity> = new Map();
  private static promptsByCode: Map<string, string> = new Map();
  private static versions: Map<string, PromptVersionEntity> = new Map();
  // key: `${prompt_code}:${version}` -> version id
  private static versionIndex: Map<string, string> = new Map();

  public static async registerPrompt(params: {
    prompt_code: string;
    ai_system_id: string;
    name: string;
    description?: string;
    prompt_type: PromptType;
    clinical_classification?: string;
    safety_classification?: string;
    owner_id: string;
    initial_content: string;
  }): Promise<{ prompt: PromptArtifactEntity; initial_version: PromptVersionEntity }> {
    if (!params.prompt_code || !params.name || !params.initial_content) {
      throw new ValidationError('Missing required fields to register prompt artifact.');
    }

    if (PromptRegistry.promptsByCode.has(params.prompt_code)) {
      throw new ValidationError(`Prompt with code "${params.prompt_code}" already exists.`);
    }

    const promptId = generateUUIDv7();
    const now = new Date().toISOString();

    const prompt: PromptArtifactEntity = {
      id: promptId,
      prompt_code: params.prompt_code,
      ai_system_id: params.ai_system_id,
      name: params.name,
      description: params.description,
      prompt_type: params.prompt_type,
      clinical_classification: params.clinical_classification || 'NON_CLINICAL',
      safety_classification: params.safety_classification || 'STANDARD',
      owner_id: params.owner_id,
      status: 'ACTIVE',
      created_at: now,
      updated_at: now
    };

    const versionId = generateUUIDv7();
    const content_hash = computePromptHash(params.initial_content);

    const initialVersion: PromptVersionEntity = {
      id: versionId,
      prompt_id: promptId,
      prompt_code: params.prompt_code,
      version: 1,
      content_text: params.initial_content,
      content_hash,
      status: 'DRAFT',
      created_by: params.owner_id,
      created_at: now
    };

    PromptRegistry.prompts.set(promptId, prompt);
    PromptRegistry.promptsByCode.set(prompt.prompt_code, promptId);
    PromptRegistry.versions.set(versionId, initialVersion);
    PromptRegistry.versionIndex.set(`${prompt.prompt_code}:1`, versionId);

    return { prompt, initial_version: initialVersion };
  }

  public static async createNewVersion(params: {
    prompt_code: string;
    content: string;
    actor_id: string;
  }): Promise<PromptVersionEntity> {
    const prompt = PromptRegistry.getPrompt(params.prompt_code);
    const existingVersions = PromptRegistry.listVersionsForPrompt(params.prompt_code);
    const nextVersionNumber = existingVersions.length > 0
      ? Math.max(...existingVersions.map(v => v.version)) + 1
      : 1;

    const latest = existingVersions.find(v => v.version === nextVersionNumber - 1);
    const content_hash = computePromptHash(params.content);

    // Invariant: If hash is identical to latest version, prevent redundant versions
    if (latest && latest.content_hash === content_hash) {
      return latest;
    }

    const versionId = generateUUIDv7();
    const now = new Date().toISOString();

    const newVersion: PromptVersionEntity = {
      id: versionId,
      prompt_id: prompt.id,
      prompt_code: prompt.prompt_code,
      version: nextVersionNumber,
      content_text: params.content,
      content_hash,
      status: 'DRAFT',
      created_by: params.actor_id,
      created_at: now,
      supersedes_id: latest ? latest.id : undefined
    };

    PromptRegistry.versions.set(versionId, newVersion);
    PromptRegistry.versionIndex.set(`${prompt.prompt_code}:${nextVersionNumber}`, versionId);
    prompt.updated_at = now;

    return newVersion;
  }

  public static approveVersion(prompt_code: string, versionNumber: number, approvedBy?: string): PromptVersionEntity {
    const version = PromptRegistry.getVersion(prompt_code, versionNumber);
    version.status = 'APPROVED';
    version.approved_at = new Date().toISOString();
    if (approvedBy) {
      (version as any).approved_by = approvedBy;
    }
    return version;
  }

  public static getPrompt(idOrCode: string): PromptArtifactEntity {
    const id = PromptRegistry.promptsByCode.get(idOrCode) || idOrCode;
    const prompt = PromptRegistry.prompts.get(id);
    if (!prompt) {
      throw new NotFoundError(`Prompt "${idOrCode}" not found.`);
    }
    return prompt;
  }

  public static getVersion(prompt_code: string, versionNumber: number): PromptVersionEntity {
    const versionId = PromptRegistry.versionIndex.get(`${prompt_code}:${versionNumber}`);
    if (!versionId) {
      throw new NotFoundError(`Prompt "${prompt_code}" version ${versionNumber} not found.`);
    }
    const version = PromptRegistry.versions.get(versionId);
    if (!version) {
      throw new NotFoundError(`Prompt version "${versionId}" not found.`);
    }
    return version;
  }

  public static listVersionsForPrompt(prompt_code: string): PromptVersionEntity[] {
    return Array.from(PromptRegistry.versions.values()).filter(v => v.prompt_code === prompt_code);
  }

  public static listPromptsForSystem(aiSystemId: string): PromptArtifactEntity[] {
    return Array.from(PromptRegistry.prompts.values()).filter(p => p.ai_system_id === aiSystemId);
  }

  public static resetForTesting(): void {
    PromptRegistry.prompts.clear();
    PromptRegistry.promptsByCode.clear();
    PromptRegistry.versions.clear();
    PromptRegistry.versionIndex.clear();
  }
}
