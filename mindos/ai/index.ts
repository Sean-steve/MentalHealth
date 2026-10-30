/**
 * MindOS AI & Intelligence Bounded Context
 * Authority: Master Architecture Index Section 7, Volumes I, IV, XV & Appendices B / C / G / H / P / Q
 * 
 * Invariants:
 * - All model-provider calls SHALL traverse the AI Gateway and approved AI system version (R-AI-001).
 * - AI SHALL NOT create clinical diagnosis or medication prescription records (R-AI-002).
 * - Deterministic Safety Kernel always outranks probabilistic generative AI behavior (ADR-010, R-SAFE-001).
 * - AI is not the system of record or clinical authority.
 */

export * from './domain/index.js';
export * from './repositories/index.js';
export * from './runtime/index.js';
export * from './context/index.js';
export * from './retrieval/index.js';
export * from './memory/index.js';
export * from './tools/index.js';
export * from './safety/index.js';
export * from './providers/index.js';
export * from './companion/index.js';
export * from './routes.js';

import { generateUUIDv7 } from '../platform/database/uuid.js';
import { DataClassification } from '../platform/shared/data_classification.js';
import { EventBus } from '../platform/events/index.js';
import { ConsentService } from '../consent/index.js';
import { ConsentRequiredError, DomainInvariantError } from '../platform/errors/index.js';
import { SafetyKernel } from '../safety/index.js';
import { AIContextFirewall } from './context/firewall.js';

export interface AIResponseContract {
  response_id: string;
  ai_system_version_id: string;
  intent: string;
  risk_context: string;
  answer: string;
  uncertainty?: string;
  recommended_actions?: string[];
  resource_refs?: string[];
  context_manifest_hash: string;
}

export { AIContextFirewall };

export class AIGateway {
  /**
   * Request pipeline:
   * AuthZ -> Consent -> Safety Precheck -> Context Firewall -> Approved Model -> Safety Postcheck -> Response Contract
   */
  public static async executePrompt(params: {
    userId: string;
    userMessage: string;
    aiSystemVersionId: string;
    purpose: string;
    context?: Record<string, unknown>;
  }): Promise<AIResponseContract> {
    // 1. Consent Check
    const hasConsent = ConsentService.hasActiveConsent(params.userId, 'AI_INTERACTION');
    if (!hasConsent) {
      throw new ConsentRequiredError('Active consent for AI interaction is required.', {
        errorCode: 'CONS_001',
        details: { required_consent_type: 'AI_INTERACTION' }
      });
    }

    // 2. Safety Precheck
    const isCrisisKeyword = /suicide|kill myself|end my life|die|self harm/i.test(params.userMessage);
    if (isCrisisKeyword) {
      // Direct to safety kernel immediately!
      const safetyResult = SafetyKernel.evaluateRiskSignal({
        userId: params.userId,
        sourceDomain: 'AI',
        riskCategory: 'SUICIDE_SELF_HARM',
        signals: { immediate_danger: true, trigger_text: 'keyword_detected' }
      });

      EventBus.enqueue(
        'ai.safety_intervention',
        'ai',
        safetyResult.event.id,
        DataClassification.HEALTH_SENSITIVE,
        {
          message_id: generateUUIDv7(),
          intervention_type: 'SAFETY_OVERRIDE',
          policy_version: '2.0.0'
        }
      );

      return {
        response_id: generateUUIDv7(),
        ai_system_version_id: params.aiSystemVersionId,
        intent: 'SAFETY_INTERVENTION',
        risk_context: 'URGENT',
        answer: 'I hear how difficult things are right now. Your safety is what matters most. Please connect immediately with verified crisis support.',
        uncertainty: 'Automated AI interaction suspended for urgent safety pathway.',
        recommended_actions: ['CONNECT_CRISIS_RESOURCE', 'CALL_HELPLINE'],
        resource_refs: safetyResult.urgentResources.map(r => r.id),
        context_manifest_hash: 'hash_urgent_override'
      };
    }

    // 3. Context Firewall
    const { allowedContext, manifestHash } = AIContextFirewall.filterContext({
      userId: params.userId,
      purpose: params.purpose,
      rawContext: params.context || {}
    });

    // 4. Model generation simulation with safety boundaries
    const responseId = generateUUIDv7();
    const answer = `Thank you for sharing your experience. MindOS is here to assist with reflection and supportive exploration. If you are experiencing symptoms or distress, we encourage consulting a verified professional for personalized guidance.`;

    // 5. Postcheck for non-diagnosis invariant (SP-002, R-AI-002)
    if (answer.toLowerCase().includes('i diagnose you with') || answer.toLowerCase().includes('you have bipolar')) {
      throw new DomainInvariantError('AI_SAFETY_VIOLATION: AI model attempted to output a diagnostic declaration.');
    }

    const contract: AIResponseContract = {
      response_id: responseId,
      ai_system_version_id: params.aiSystemVersionId,
      intent: 'SUPPORT_REFLECTION',
      risk_context: 'NO_CONCERN',
      answer,
      uncertainty: 'AI responses are reflective and educational only; not clinical diagnosis.',
      recommended_actions: ['DAILY_CHECKIN', 'BROWSE_RESOURCES'],
      context_manifest_hash: manifestHash
    };

    EventBus.enqueue(
      'ai.response_generated',
      'ai',
      responseId,
      DataClassification.SENSITIVE,
      {
        message_id: responseId,
        ai_system_version_id: params.aiSystemVersionId,
        latency_ms: 120,
        token_counts: 150,
        safety_outcome: 'CLEARED'
      }
    );

    return contract;
  }
}
