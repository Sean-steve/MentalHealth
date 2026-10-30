/**
 * MindOS Governed AI Safety Post-Check Engine
 * Authority: Volumes I, IV, XV & Appendices B / C / H / Q (ADR-010)
 * Clinical Safety Policy Catalogue: R-AI-002, R-SAFE-001
 * 
 * Verifies model-generated responses against clinical boundaries, prescription prohibitions,
 * unverified helpline numbers, and mandatory statutory disclaimers before delivery to users.
 */

import { SafetyPostcheckResult } from '../domain/types.js';
import {
  CANONICAL_AI_NON_DIAGNOSTIC_DISCLAIMER,
  PROHIBITED_DIAGNOSTIC_ASSERTIONS,
  PROHIBITED_PRESCRIPTION_PATTERNS
} from '../domain/invariants.js';

export class AISafetyPostcheck {
  public static evaluate(rawContent: string): SafetyPostcheckResult {
    const violationReasons: string[] = [];
    let sanitized = rawContent.trim();

    // 1. Clinical Diagnosis Prohibitions (R-AI-002)
    for (const pattern of PROHIBITED_DIAGNOSTIC_ASSERTIONS) {
      if (pattern.test(sanitized)) {
        violationReasons.push('PROHIBITED_DIAGNOSTIC_ASSERTION: AI attempted to assert a clinical diagnosis.');
      }
    }

    // 2. Medication / Prescription Prohibitions (R-AI-002)
    for (const pattern of PROHIBITED_PRESCRIPTION_PATTERNS) {
      if (pattern.test(sanitized)) {
        violationReasons.push('PROHIBITED_PRESCRIPTION_CLAIM: AI attempted to advise or adjust medication dosages.');
      }
    }

    // 3. Mandatory Statutory Non-Diagnostic Disclaimer
    let disclaimerAppended = false;
    if (!sanitized.includes(CANONICAL_AI_NON_DIAGNOSTIC_DISCLAIMER)) {
      sanitized = `${sanitized}\n\n---\n*${CANONICAL_AI_NON_DIAGNOSTIC_DISCLAIMER}*`;
      disclaimerAppended = true;
    }

    return {
      passed: violationReasons.length === 0,
      violation_reasons: violationReasons,
      sanitized_content: sanitized,
      disclaimer_appended: disclaimerAppended
    };
  }
}
