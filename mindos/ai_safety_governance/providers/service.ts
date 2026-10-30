/**
 * MindOS AI Provider Governance Service
 * Authority: ADR-008, Volumes IV, VIII, XV & KDPA 2019 Sections 41/42
 * Integrates directly with Sprint 11 Privacy Processor Registry.
 * Invariant: AI provider governance MUST reference a valid, approved privacy processor.
 */

import { PrivacyProcessorRegistry } from '../../privacy_governance/transfers/processor_registry.js';
import { PrivacyProcessor, ProcessorType } from '../../privacy_governance/types.js';
import { AIProviderNotApprovedError } from '../domain/errors.js';
import { NotFoundError } from '../../platform/errors/index.js';

export class AIProviderGovernanceService {
  /**
   * Validates that an AI provider is a valid registered processor with approved
   * privacy and security status, valid contract, and appropriate jurisdictions.
   */
  public static validateProvider(providerIdOrCode: string, options: {
    requiredJurisdiction?: string;
    requiredDataCategory?: string;
  } = {}): PrivacyProcessor {
    const all = PrivacyProcessorRegistry.listAll();
    const processor = all.find(p => p.id === providerIdOrCode || p.processor_code === providerIdOrCode);

    if (!processor) {
      throw new NotFoundError(`AI Provider "${providerIdOrCode}" not found in Canonical Privacy Processor Registry.`);
    }

    if (processor.status !== 'ACTIVE') {
      throw new AIProviderNotApprovedError(
        `AI Provider "${processor.name}" is not ACTIVE (status: ${processor.status}).`,
        { providerIdOrCode, status: processor.status }
      );
    }

    if (processor.privacy_review_status !== 'APPROVED') {
      throw new AIProviderNotApprovedError(
        `AI Provider "${processor.name}" lacks approved Privacy Governance review (status: ${processor.privacy_review_status}).`,
        { providerIdOrCode, privacyStatus: processor.privacy_review_status }
      );
    }

    if (!processor.contract_reference || !processor.security_review_reference) {
      throw new AIProviderNotApprovedError(
        `AI Provider "${processor.name}" lacks required executed Data Processing Agreement (DPA) or security review.`,
        { providerIdOrCode, dpa: processor.contract_reference, secRev: processor.security_review_reference }
      );
    }

    if (options.requiredJurisdiction && !processor.jurisdictions.includes(options.requiredJurisdiction)) {
      throw new AIProviderNotApprovedError(
        `AI Provider "${processor.name}" is not authorized for operations in jurisdiction "${options.requiredJurisdiction}". Authorized: [${processor.jurisdictions.join(', ')}]`,
        { providerIdOrCode, requestedJurisdiction: options.requiredJurisdiction, authorized: processor.jurisdictions }
      );
    }

    return processor;
  }

  public static listApprovedAIProviders(): PrivacyProcessor[] {
    const allProcessors = PrivacyProcessorRegistry.listAll();
    return allProcessors.filter(p => p.processor_type === ProcessorType.AI_PROVIDER && p.status === 'ACTIVE');
  }
}
