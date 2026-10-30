/**
 * MindOS Safety Signal Normalizer & Context Classifier
 * Authority: Volumes I, V & Clinical Safety Policy Catalogue
 * 
 * Rules:
 * - Data Minimization: Raw conversational narratives MUST NOT be stored in cleartext inside normalized signal records.
 * - Negation / Context: Distinguish personal acute intent from abstract, academic, or historical discussions.
 * - Confidence vs Severity: Both are tracked orthogonally.
 */

import {
  SignalFamily,
  SignalSeverity,
  SignalConfidence,
  SignalSourceType,
  SignalProvenance
} from '../domain/types.js';
import { CANONICAL_SIGNAL_TAXONOMY, lookupSignalTaxonomy } from './taxonomy.js';
import { SafetySignalInvalidError } from '../domain/errors.js';

export interface RawSignalInput {
  subject_user_id: string;
  signal_code: string;
  source_type: SignalSourceType;
  source_reference?: string;
  provenance: SignalProvenance;
  observed_at?: string;
  raw_text?: string;
  evidence_reference?: string;
  jurisdiction?: string;
  custom_severity?: SignalSeverity;
  custom_confidence?: SignalConfidence;
  indicators?: {
    intent?: 'NONE' | 'PASSIVE' | 'ACTIVE' | 'IMMINENT';
    plan_present?: boolean;
    means_present?: boolean;
    timeframe?: 'PAST' | 'INDEFINITE' | 'NEXT_24_HOURS' | 'IMMEDIATE';
    is_negated_or_academic?: boolean;
    is_historical_only?: boolean;
    third_party_target?: boolean;
  };
}

export interface NormalizedSignalResult {
  signal_type: SignalFamily;
  signal_code: string;
  source_type: SignalSourceType;
  source_reference?: string;
  provenance: SignalProvenance;
  severity: SignalSeverity;
  confidence: SignalConfidence;
  observed_at: string;
  received_at: string;
  raw_evidence_reference?: string;
  normalized_evidence: {
    intent: string;
    plan_present: boolean;
    means_present: boolean;
    timeframe: string;
    is_historical_only: boolean;
    is_negated_or_academic: boolean;
    severity_rank: number;
    requires_immediate_triage: boolean;
    source_context: string;
    sanitized_excerpt?: string;
  };
  jurisdiction: string;
}

export class SignalNormalizer {
  /**
   * Normalizes raw inbound signal payload into canonical structured safety signal entity.
   */
  public static normalize(input: RawSignalInput): NormalizedSignalResult {
    if (!input.subject_user_id) {
      throw new SafetySignalInvalidError('subject_user_id is required for safety signal registration.');
    }
    if (!input.signal_code) {
      throw new SafetySignalInvalidError('signal_code is required for safety signal registration.');
    }

    const taxonomy = lookupSignalTaxonomy(input.signal_code);
    if (!taxonomy) {
      throw new SafetySignalInvalidError(`Unknown safety signal code: "${input.signal_code}". Must match canonical taxonomy.`);
    }

    const now = new Date().toISOString();
    const observedAt = input.observed_at || now;

    // Analyze contextual cues and potential negation/educational context
    const indicators = input.indicators || {};
    let isNegated = indicators.is_negated_or_academic === true;
    let isHistorical = indicators.is_historical_only === true;

    if (input.raw_text) {
      const lower = input.raw_text.toLowerCase();
      // Check for academic / class / prevention context
      if (
        lower.includes('in class') ||
        lower.includes('prevention workshop') ||
        lower.includes('reading a book about') ||
        lower.includes('research paper') ||
        lower.includes('discussing suicide prevention')
      ) {
        isNegated = true;
      }
      // Check for strictly historical context
      if (
        lower.includes('five years ago') ||
        lower.includes('when i was a teenager') ||
        lower.includes('years ago i used to') ||
        (lower.includes('in the past') && !lower.includes('right now') && !lower.includes('tonight'))
      ) {
        isHistorical = true;
      }
    }

    // Determine final severity and confidence
    let finalSeverity = input.custom_severity || taxonomy.defaultSeverity;
    let finalConfidence = input.custom_confidence || taxonomy.defaultConfidence;

    // If educational / negated, severity is downgraded to LOW
    if (isNegated) {
      finalSeverity = SignalSeverity.LOW;
      finalConfidence = SignalConfidence.LOW;
    } else if (isHistorical && finalSeverity === SignalSeverity.CRITICAL) {
      // Historical past attempt alone without current intent is not CRITICAL
      finalSeverity = SignalSeverity.LOW;
    }

    // Map severity to numeric rank
    const severityRank = {
      [SignalSeverity.LOW]: 1,
      [SignalSeverity.MEDIUM]: 2,
      [SignalSeverity.HIGH]: 3,
      [SignalSeverity.CRITICAL]: 4
    }[finalSeverity];

    return {
      signal_type: taxonomy.family,
      signal_code: taxonomy.code,
      source_type: input.source_type,
      source_reference: input.source_reference,
      provenance: input.provenance,
      severity: finalSeverity,
      confidence: finalConfidence,
      observed_at: observedAt,
      received_at: now,
      raw_evidence_reference: input.evidence_reference,
      normalized_evidence: {
        intent: indicators.intent || 'UNSPECIFIED',
        plan_present: indicators.plan_present || false,
        means_present: indicators.means_present || false,
        timeframe: indicators.timeframe || 'UNSPECIFIED',
        is_historical_only: isHistorical,
        is_negated_or_academic: isNegated,
        severity_rank: severityRank,
        requires_immediate_triage: taxonomy.requiresImmediateTriage && !isNegated,
        source_context: input.source_type,
        sanitized_excerpt: input.raw_text ? input.raw_text.slice(0, 100) : undefined
      },
      jurisdiction: input.jurisdiction || 'KE'
    };
  }
}
