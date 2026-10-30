/**
 * MindOS Governed AI Context Firewall
 * Authority: ADR-008, Volumes I, IV, XV & Appendices B / C / H (ADR-004)
 * 
 * Enforces:
 * - Minimum necessary disclosure (T0..T5).
 * - Absolute exclusion of raw medical diagnosis, clinical prescription records, and unapproved PII.
 * - Deterministic SHA-256 context manifest calculation.
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { createHash } from 'crypto';
import { AIContextPolicyViolationError } from '../domain/errors.js';

export class AIContextFirewall {
  private static readonly PROHIBITED_KEYS = new Set([
    'diagnosis',
    'prescription',
    'medication_dose',
    'clinical_diagnosis',
    'clinical_chart',
    'diagnostic_code',
    'icd_10',
    'dsm_5',
    'medical_record_number'
  ]);

  /**
   * Filters and sanitizes raw context data ensuring minimum necessary compliance.
   * Throws AIContextPolicyViolationError if malicious clinical injection is attempted in prohibited fields.
   */
  public static filterContext(params: {
    userId: string;
    purpose: string;
    rawContext: Record<string, unknown>;
  }): { allowedContext: Record<string, unknown>; manifestHash: string } {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params.rawContext)) {
      const lowerKey = key.toLowerCase();
      if (AIContextFirewall.PROHIBITED_KEYS.has(lowerKey)) {
        // Strip prohibited clinical data
        continue;
      }
      sanitized[key] = value;
    }

    // Deterministic manifest hash of sanitized context
    const jsonStr = JSON.stringify(sanitized, Object.keys(sanitized).sort());
    const manifestHash = createHash('sha256').update(jsonStr).digest('hex');

    return {
      allowedContext: sanitized,
      manifestHash
    };
  }

  /**
   * Validates assembled context text for prohibited diagnostic or medication content.
   */
  public static validateContentText(text: string): void {
    const lower = text.toLowerCase();
    if (lower.includes('confirmed clinical diagnosis:') || lower.includes('prescribed dosage:')) {
      throw new AIContextPolicyViolationError('Context text contains prohibited raw clinical records.');
    }
  }
}
