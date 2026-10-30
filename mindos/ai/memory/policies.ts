/**
 * MindOS Governed AI Memory Policy Checker
 * Authority: Volumes IV, XV & Appendices B / C / H (Kenya Data Protection Act 2019)
 * 
 * Invariant: AI memory is strictly limited to non-clinical supportive reflections and user preferences.
 * Clinical diagnosis, prescription, suicidal crisis details, and unapproved sensitive attributes
 * SHALL NOT be recorded into long-term persistent AI memory.
 */

import { AIMemoryCategory } from '../domain/types.js';
import { AIMemoryViolationError } from '../domain/errors.js';
import {
  PROHIBITED_DIAGNOSTIC_ASSERTIONS,
  PROHIBITED_PRESCRIPTION_PATTERNS,
  ACUTE_DISTRESS_PATTERNS
} from '../domain/invariants.js';

export class AIMemoryPolicyChecker {
  public static readonly ALLOWED_CATEGORIES: AIMemoryCategory[] = [
    'PREFERENCE',
    'LIFE_EVENT',
    'WELLBEING_GOAL',
    'COPING_STRATEGY'
  ];

  public static validateMemoryEntry(params: {
    category: AIMemoryCategory;
    memoryText: string;
  }): void {
    if (!AIMemoryPolicyChecker.ALLOWED_CATEGORIES.includes(params.category)) {
      throw new AIMemoryViolationError(
        `Memory category "${params.category}" is not an approved AI memory category. Allowed: [${AIMemoryPolicyChecker.ALLOWED_CATEGORIES.join(', ')}]`
      );
    }

    const text = params.memoryText;

    // Check for acute crisis or self-harm content
    for (const pattern of ACUTE_DISTRESS_PATTERNS) {
      if (pattern.test(text)) {
        throw new AIMemoryViolationError(
          'Prohibited: Acute distress or crisis content cannot be stored in long-term AI memory.'
        );
      }
    }

    // Check for diagnostic statements
    for (const pattern of PROHIBITED_DIAGNOSTIC_ASSERTIONS) {
      if (pattern.test(text)) {
        throw new AIMemoryViolationError(
          'Prohibited: Clinical diagnosis assertions cannot be stored in long-term AI memory.'
        );
      }
    }

    // Check for prescription / medication dosage
    for (const pattern of PROHIBITED_PRESCRIPTION_PATTERNS) {
      if (pattern.test(text)) {
        throw new AIMemoryViolationError(
          'Prohibited: Clinical medication prescriptions or dosages cannot be stored in long-term AI memory.'
        );
      }
    }
  }
}
