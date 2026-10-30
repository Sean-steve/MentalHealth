/**
 * MindOS AI Model Registry
 * Authority: ADR-009, Volumes IV, XV & Appendices B / C
 * Invariant: Every model MUST link to an approved processor in the Privacy Processor Registry.
 * Only APPROVED models can be included in an approved AI configuration.
 */

import { AIModelEntity, AIModelStatus } from '../domain/types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { ValidationError, NotFoundError } from '../../platform/errors/index.js';
import { AIModelNotApprovedError } from '../domain/errors.js';
import { AIProviderGovernanceService } from '../providers/service.js';

export class AIModelRegistry {
  private static models: Map<string, AIModelEntity> = new Map();
  private static modelsByCode: Map<string, string> = new Map();

  static {
    AIModelRegistry.seedDefaultModels();
  }

  public static seedDefaultModels(): void {
    // Seed standard approved models
    const gemini15ProId = '01918c00-0010-7000-8000-000000000001';
    AIModelRegistry.models.set(gemini15ProId, {
      id: gemini15ProId,
      provider_id: '01918c00-0002-7000-8000-000000000002', // PROC-AI-GEMINI-001
      model_code: 'MOD-GEMINI-15-PRO-002',
      provider_model_identifier: 'gemini-1.5-pro-002',
      version: '1.5.0-pro-002',
      model_family: 'GEMINI',
      capabilities: ['TEXT_GENERATION', 'REASONING', 'SAFETY_SYSTEM_INSTRUCTIONS', 'FUNCTION_CALLING', 'STRUCTURED_OUTPUT'],
      limitations: ['STATUTORY_NO_DIAGNOSIS', 'NO_DIRECT_PRESCRIPTION', 'INTERNET_CUTOFF_BOUND'],
      context_window: 1048576,
      tool_support: true,
      structured_output_support: true,
      deployment_region: 'europe-west1',
      status: AIModelStatus.APPROVED,
      first_approved_at: '2026-01-15T00:00:00Z',
      metadata: { zero_retention: true, compliance: ['KDPA-2019', 'HIPAA', 'GDPR'] }
    });
    AIModelRegistry.modelsByCode.set('MOD-GEMINI-15-PRO-002', gemini15ProId);

    const gemini15FlashId = '01918c00-0010-7000-8000-000000000002';
    AIModelRegistry.models.set(gemini15FlashId, {
      id: gemini15FlashId,
      provider_id: '01918c00-0002-7000-8000-000000000002',
      model_code: 'MOD-GEMINI-15-FLASH-002',
      provider_model_identifier: 'gemini-1.5-flash-002',
      version: '1.5.0-flash-002',
      model_family: 'GEMINI',
      capabilities: ['LOW_LATENCY_TRIAGE', 'SUMMARIZATION', 'TEXT_GENERATION', 'FUNCTION_CALLING'],
      limitations: ['LESS_DEEP_REASONING_THAN_PRO'],
      context_window: 1048576,
      tool_support: true,
      structured_output_support: true,
      deployment_region: 'europe-west1',
      status: AIModelStatus.APPROVED,
      first_approved_at: '2026-01-20T00:00:00Z',
      metadata: { zero_retention: true }
    });
    AIModelRegistry.modelsByCode.set('MOD-GEMINI-15-FLASH-002', gemini15FlashId);
  }

  public static async registerModel(params: {
    provider_id: string;
    model_code: string;
    provider_model_identifier: string;
    version: string;
    model_family: string;
    capabilities: string[];
    limitations: string[];
    context_window: number;
    tool_support?: boolean;
    structured_output_support?: boolean;
    deployment_region?: string;
    metadata?: Record<string, unknown>;
  }): Promise<AIModelEntity> {
    if (!params.provider_id || !params.model_code || !params.provider_model_identifier || !params.version) {
      throw new ValidationError('Missing required fields for model registration.');
    }

    if (AIModelRegistry.modelsByCode.has(params.model_code)) {
      throw new ValidationError(`Model with code "${params.model_code}" is already registered.`);
    }

    // Verify that the provider is registered and active
    AIProviderGovernanceService.validateProvider(params.provider_id);

    const id = generateUUIDv7();
    const model: AIModelEntity = {
      id,
      provider_id: params.provider_id,
      model_code: params.model_code,
      provider_model_identifier: params.provider_model_identifier,
      version: params.version,
      model_family: params.model_family,
      capabilities: params.capabilities,
      limitations: params.limitations,
      context_window: params.context_window,
      tool_support: params.tool_support !== false,
      structured_output_support: params.structured_output_support !== false,
      deployment_region: params.deployment_region || 'europe-west1',
      status: AIModelStatus.CANDIDATE,
      metadata: params.metadata || {}
    };

    AIModelRegistry.models.set(id, model);
    AIModelRegistry.modelsByCode.set(model.model_code, id);
    return model;
  }

  public static getModel(idOrCode: string): AIModelEntity {
    const id = AIModelRegistry.modelsByCode.get(idOrCode) || idOrCode;
    const model = AIModelRegistry.models.get(id);
    if (!model) {
      throw new NotFoundError(`AI Model "${idOrCode}" not found in AI Model Registry.`);
    }
    return model;
  }

  public static updateStatus(idOrCode: string, newStatus: AIModelStatus, actorId?: string): AIModelEntity {
    const model = AIModelRegistry.getModel(idOrCode);
    model.status = newStatus;
    if (newStatus === AIModelStatus.APPROVED && !model.first_approved_at) {
      model.first_approved_at = new Date().toISOString();
    }
    if (newStatus === AIModelStatus.RETIRED || newStatus === AIModelStatus.REVOKED) {
      model.retired_at = new Date().toISOString();
    }
    return model;
  }

  public static validateModelApproved(idOrCode: string): AIModelEntity {
    const model = AIModelRegistry.getModel(idOrCode);
    if (model.status !== AIModelStatus.APPROVED) {
      throw new AIModelNotApprovedError(
        `AI Model "${model.model_code}" cannot be used: status is "${model.status}" (requires APPROVED).`,
        { model_code: model.model_code, status: model.status }
      );
    }
    return model;
  }

  public static listModels(): AIModelEntity[] {
    return Array.from(AIModelRegistry.models.values());
  }

  public static resetForTesting(): void {
    AIModelRegistry.models.clear();
    AIModelRegistry.modelsByCode.clear();
    AIModelRegistry.seedDefaultModels();
  }
}
