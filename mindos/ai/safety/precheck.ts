/**
 * MindOS Governed AI Safety Pre-Check Engine
 * Authority: Volumes I, IV, XV & Appendices B / C / G / H / P (ADR-010)
 * Clinical Safety Policy Catalogue: R-SAFE-001, R-AI-001
 * 
 * Performs deterministic safety evaluation on inbound user messages BEFORE LLM invocation.
 * When acute distress or crisis keywords are detected, directly delegates to the Clinical Safety Kernel.
 */

import { SafetyPrecheckResult } from '../domain/types.js';
import { ACUTE_DISTRESS_PATTERNS } from '../domain/invariants.js';
import { SafetyKernel } from '../../safety/index.js';

export class AISafetyPrecheck {
  public static evaluate(params: {
    userId: string;
    messageText: string;
    conversationId?: string;
  }): SafetyPrecheckResult {
    const text = params.messageText.trim();
    const crisisKeywordsFound: string[] = [];

    // Scan for acute distress keywords & patterns
    for (const pattern of ACUTE_DISTRESS_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        crisisKeywordsFound.push(match[0].toLowerCase());
      }
    }

    if (crisisKeywordsFound.length > 0) {
      // Direct delegation to authoritative Safety Kernel
      const triage = SafetyKernel.evaluateRiskSignal({
        userId: params.userId,
        sourceDomain: 'AI',
        riskCategory: 'SUICIDE_SELF_HARM',
        signals: {
          detected_phrases: crisisKeywordsFound,
          immediate_danger: true,
          intent: 'active',
          source: 'AI_COMPANION_INBOUND_PRECHECK',
          conversation_id: params.conversationId
        }
      });

      return {
        is_safe: false,
        acute_distress_detected: true,
        crisis_keywords_found: crisisKeywordsFound,
        recommended_action: 'ESCALATE_CRISIS',
        urgent_resources: triage.urgentResources,
        risk_event_id: triage.event.id
      };
    }

    // Check if user currently has an active urgent or high risk state in Safety Kernel
    const existingRiskState = SafetyKernel.getUserRiskState(params.userId);
    if (existingRiskState === 'URGENT' || existingRiskState === 'HIGH') {
      const verifiedResources = SafetyKernel.getVerifiedCrisisResources('KE');
      return {
        is_safe: false,
        acute_distress_detected: true,
        crisis_keywords_found: ['persistent_high_risk_state'],
        recommended_action: 'ESCALATE_CRISIS',
        urgent_resources: verifiedResources
      };
    }

    return {
      is_safe: true,
      acute_distress_detected: false,
      crisis_keywords_found: [],
      recommended_action: 'CONTINUE'
    };
  }
}
