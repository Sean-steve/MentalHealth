/**
 * MindOS Governed AI Safety Arbiter
 * Authority: Master Architecture Index Section 7, Volumes I, IV, XV & Appendices B / C / G / H / P / Q
 * 
 * Invariant: Deterministic Safety Kernel always outranks probabilistic or generative AI behavior (ADR-010).
 * Safety overrides replace model output with verified crisis resources and safety-sanctioned templates.
 */

import { SafetyPrecheckResult, SafetyPostcheckResult, SafetyArbitrationResult } from '../domain/types.js';
import {
  CANONICAL_CRISIS_RESPONSE_TEMPLATE,
  CANONICAL_AI_NON_DIAGNOSTIC_DISCLAIMER
} from '../domain/invariants.js';
import { CrisisResourceEntity } from '../../safety/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';

export class AISafetyArbiter {
  public static arbitrate(params: {
    precheck: SafetyPrecheckResult;
    postcheck: SafetyPostcheckResult;
    conversationId?: string;
  }): SafetyArbitrationResult {
    const { precheck, postcheck, conversationId } = params;

    // 1. Acute Distress / Crisis Override (Safety Kernel > AI Companion)
    if (precheck.acute_distress_detected || precheck.recommended_action === 'ESCALATE_CRISIS') {
      const resources: CrisisResourceEntity[] = precheck.urgent_resources || [];
      const resourceLines = resources.map(
        r => `• **${r.name}**: Phone: ${r.contact_json.phone || 'N/A'}${r.contact_json.sms ? ` / SMS: ${r.contact_json.sms}` : ''} (${r.availability_json.hours}, ${r.availability_json.free_of_charge ? 'Free of charge' : 'Standard rates'})`
      );

      const finalContent = [
        CANONICAL_CRISIS_RESPONSE_TEMPLATE,
        '',
        '**Authoritative Verified Crisis Contacts:**',
        ...resourceLines,
        '',
        '---',
        `*${CANONICAL_AI_NON_DIAGNOSTIC_DISCLAIMER}*`
      ].join('\n');

      AuditService.record({
        actor_type: 'SERVICE',
        actor_id: 'AI_SAFETY_ARBITER',
        action: 'AI.SAFETY.ARBITRATION_OVERRIDE_CRISIS',
        resource_type: 'AI_CONVERSATION',
        resource_id: conversationId || generateUUIDv7(),
        purpose: 'Deterministic Safety Kernel Crisis Preemption',
        authorization_basis: { rule_id: 'R-SAFE-001' },
        result: 'ALLOWED',
        metadata: {
          crisis_keywords: precheck.crisis_keywords_found,
          resource_count: resources.length
        }
      });

      return {
        action: 'OVERRIDE_CRISIS',
        final_content: finalContent,
        rule_id: 'R-SAFE-001',
        override_applied: true,
        urgent_resources: resources
      };
    }

    // 2. Clinical Boundary Violation Override (No diagnosis, no prescriptions)
    if (!postcheck.passed) {
      const finalContent = [
        'I want to be completely honest with you: as an automated wellbeing companion, I am unable to diagnose conditions or advise on prescription medications.',
        '',
        'For diagnostic assessments, clinical evaluations, or medication changes, please consult with a qualified, licensed healthcare professional or psychiatrist.',
        '',
        '---',
        `*${CANONICAL_AI_NON_DIAGNOSTIC_DISCLAIMER}*`
      ].join('\n');

      AuditService.record({
        actor_type: 'SERVICE',
        actor_id: 'AI_SAFETY_ARBITER',
        action: 'AI.SAFETY.ARBITRATION_OVERRIDE_CLINICAL',
        resource_type: 'AI_CONVERSATION',
        resource_id: conversationId || generateUUIDv7(),
        purpose: 'Clinical Boundary Safety Enforcement',
        authorization_basis: { rule_id: 'R-AI-002' },
        result: 'ALLOWED',
        metadata: { violations: postcheck.violation_reasons }
      });

      return {
        action: 'OVERRIDE_CLINICAL_BOUNDARY',
        final_content: finalContent,
        rule_id: 'R-AI-002',
        override_applied: true
      };
    }

    // 3. Normal Path: Allow sanitized postchecked reply
    return {
      action: 'ALLOW',
      final_content: postcheck.sanitized_content,
      rule_id: 'R-AI-NORMAL',
      override_applied: false
    };
  }
}
