import {
  ProfessionalMessagingSafetyPort
} from '../application/ports.js';
import { ThreadParticipantType } from '../domain/types.js';
import { IProfessionalMessagingRepository } from '../repositories/interfaces.js';
import { FieldEncryptor } from '../../platform/database/encryption/field_encryptor.js';
import { ACUTE_DISTRESS_PATTERNS } from '../../ai/domain/invariants.js';
import { SignalNormalizer } from '../../safety/signals/normalizer.js';
import {
  CrisisResponseOrchestrator,
  SignalSourceType,
  SignalProvenance,
  SignalSeverity,
  SignalConfidence,
  getSafetyRepository
} from '../../safety/index.js';
import { DomainInvariantError } from '../../platform/errors/index.js';

export interface ProtectedMessageContentResolverPort {
  resolveContent(contentReference: string): Promise<string | null>;
}

export class RepositoryProtectedMessageContentResolver
implements ProtectedMessageContentResolverPort {
  constructor(private readonly repository: IProfessionalMessagingRepository) {}

  async resolveContent(contentReference: string): Promise<string | null> {
    const record =
      await this.repository.findProtectedContentByReference(contentReference);
    if (!record) return null;
    return FieldEncryptor.decryptField<string>(record.encrypted_content);
  }
}

export interface ProtectedMessageSafetyScannerPort {
  classify(params: {
    subject_user_id: string;
    content_reference: string;
    sender_type: ThreadParticipantType;
  }): Promise<{
    configured: boolean;
    candidate_signal: boolean;
    signal_code?: string;
    severity?: string;
    confidence?: string;
    evidence_reference?: string;
    source_type?: string;
    provenance?: string;
  }>;
}

function sourceTypeForSender(sender: ThreadParticipantType): SignalSourceType {
  return sender === ThreadParticipantType.PROFESSIONAL
    ? SignalSourceType.PROFESSIONAL_REPORT
    : SignalSourceType.USER_SELF_REPORT;
}

function provenanceForSender(sender: ThreadParticipantType): SignalProvenance {
  return sender === ThreadParticipantType.PROFESSIONAL
    ? SignalProvenance.PROFESSIONAL_RECORDED
    : SignalProvenance.USER_REPORTED;
}

function canonicalSignalCode(match: string, patternIndex: number): string {
  const value = match.toLowerCase();
  if (
    patternIndex === 3 ||
    /kill someone|murder someone|hurt others|stab someone/i.test(value)
  ) {
    return 'SIG_VIOLENCE_THREAT_IDENTIFIED';
  }
  if (
    patternIndex === 2 ||
    /hang myself|slit my wrists|overdose|jump off|shoot myself|swallow pills|strangle myself/i.test(value)
  ) {
    return 'SIG_SUICIDAL_PLAN_EXPLICIT';
  }
  if (/self[ -]?harm|cutting myself/i.test(value)) {
    return 'SIG_SELF_HARM_ACTIVE_URGE';
  }
  return 'SIG_SUICIDAL_INTENT_ACTIVE';
}

/**
 * Deterministic protected-message scanner using the already-governed acute
 * distress rules from the AI/Safety foundation. It only creates a candidate
 * signal. Canonical RiskState remains owned by the Safety Kernel.
 */
export class CanonicalAcuteDistressProtectedMessageScanner
implements ProtectedMessageSafetyScannerPort {
  constructor(
    private readonly resolver: ProtectedMessageContentResolverPort
  ) {}

  async classify(params: {
    subject_user_id: string;
    content_reference: string;
    sender_type: ThreadParticipantType;
  }): Promise<{
    configured: boolean;
    candidate_signal: boolean;
    signal_code?: string;
    severity?: string;
    confidence?: string;
    evidence_reference?: string;
    source_type?: string;
    provenance?: string;
  }> {
    const text = await this.resolver.resolveContent(params.content_reference);
    if (text === null) {
      throw new DomainInvariantError(
        'Protected care-message content could not be resolved for Safety evaluation.'
      );
    }

    const sourceType = sourceTypeForSender(params.sender_type);
    const provenance = provenanceForSender(params.sender_type);
    let selected:
      | {
          signal_code: string;
          severity: SignalSeverity;
          confidence: SignalConfidence;
          severity_rank: number;
        }
      | undefined;

    for (let index = 0; index < ACUTE_DISTRESS_PATTERNS.length; index += 1) {
      const match = text.match(ACUTE_DISTRESS_PATTERNS[index]);
      if (!match) continue;

      const normalized = SignalNormalizer.normalize({
        subject_user_id: params.subject_user_id,
        signal_code: canonicalSignalCode(match[0], index),
        source_type: sourceType,
        provenance,
        raw_text: text,
        evidence_reference: params.content_reference
      });

      if (
        !selected ||
        normalized.normalized_evidence.severity_rank > selected.severity_rank
      ) {
        selected = {
          signal_code: normalized.signal_code,
          severity: normalized.severity,
          confidence: normalized.confidence,
          severity_rank: normalized.normalized_evidence.severity_rank
        };
      }
    }

    if (!selected) {
      return {
        configured: true,
        candidate_signal: false,
        source_type: sourceType,
        provenance
      };
    }

    return {
      configured: true,
      candidate_signal: true,
      signal_code: selected.signal_code,
      severity: selected.severity,
      confidence: selected.confidence,
      evidence_reference: params.content_reference,
      source_type: sourceType,
      provenance
    };
  }
}

export interface SafetySignalForwarderPort {
  forwardCandidate(params: {
    subject_user_id: string;
    source_domain: 'PROFESSIONAL_MESSAGING';
    source_reference: string;
    signal_code: string;
    severity?: string;
    confidence?: string;
    evidence_reference?: string;
    source_type?: string;
    provenance?: string;
  }): Promise<{ safety_reference: string }>;
}

/**
 * Privacy-preserving bridge between Professional Messaging and the authoritative
 * Safety Kernel. The messaging metadata service never stores raw message text.
 */
export class SafetyKernelMessagingAdapter
implements ProfessionalMessagingSafetyPort {
  constructor(
    private readonly scanner: ProtectedMessageSafetyScannerPort,
    private readonly forwarder: SafetySignalForwarderPort
  ) {}

  async evaluateCandidate(params: {
    subject_user_id: string;
    thread_id: string;
    message_id: string;
    sender_type: ThreadParticipantType;
    content_reference: string;
  }): Promise<{
    configured: boolean;
    candidate_signal: boolean;
    safety_reference?: string;
  }> {
    const classification = await this.scanner.classify({
      subject_user_id: params.subject_user_id,
      content_reference: params.content_reference,
      sender_type: params.sender_type
    });

    if (!classification.configured) {
      return { configured: false, candidate_signal: false };
    }
    if (!classification.candidate_signal) {
      return { configured: true, candidate_signal: false };
    }
    if (!classification.signal_code) {
      throw new DomainInvariantError(
        'Configured Professional Messaging Safety scanner returned a candidate without a signal code.'
      );
    }

    const forwarded = await this.forwarder.forwardCandidate({
      subject_user_id: params.subject_user_id,
      source_domain: 'PROFESSIONAL_MESSAGING',
      source_reference: params.content_reference,
      signal_code: classification.signal_code,
      severity: classification.severity,
      confidence: classification.confidence,
      evidence_reference: classification.evidence_reference,
      source_type: classification.source_type,
      provenance: classification.provenance
    });

    return {
      configured: true,
      candidate_signal: true,
      safety_reference: forwarded.safety_reference
    };
  }
}

function optionalEnumValue<T extends Record<string, string>>(
  enumeration: T,
  value: string | undefined,
  field: string
): T[keyof T] | undefined {
  if (value === undefined) return undefined;
  if (!Object.values(enumeration).includes(value as T[keyof T])) {
    throw new DomainInvariantError(
      `Messaging Safety candidate has invalid ${field}.`
    );
  }
  return value as T[keyof T];
}

/**
 * Concrete bridge into the existing authoritative Safety Kernel.
 * Candidate classification may inform the signal; it never directly sets
 * RiskState, SafetyAction, or escalation state.
 */
export class CrisisResponseSafetySignalForwarder
implements SafetySignalForwarderPort {
  constructor(
    private readonly orchestrator = new CrisisResponseOrchestrator(
      getSafetyRepository()
    )
  ) {}

  async forwardCandidate(params: {
    subject_user_id: string;
    source_domain: 'PROFESSIONAL_MESSAGING';
    source_reference: string;
    signal_code: string;
    severity?: string;
    confidence?: string;
    evidence_reference?: string;
    source_type?: string;
    provenance?: string;
  }): Promise<{ safety_reference: string }> {
    const severity = optionalEnumValue(
      SignalSeverity,
      params.severity,
      'severity'
    );
    const confidence = optionalEnumValue(
      SignalConfidence,
      params.confidence,
      'confidence'
    );
    const sourceType =
      optionalEnumValue(SignalSourceType, params.source_type, 'source_type') ||
      SignalSourceType.SYSTEM_OBSERVATION;
    const provenance =
      optionalEnumValue(SignalProvenance, params.provenance, 'provenance') ||
      SignalProvenance.SYSTEM_OBSERVED;

    await this.orchestrator.handleSafetySignal({
      subject_user_id: params.subject_user_id,
      signal_code: params.signal_code,
      source_type: sourceType,
      source_reference: params.source_reference,
      provenance,
      evidence_reference: params.evidence_reference,
      custom_severity: severity,
      custom_confidence: confidence
    });

    return {
      safety_reference: `SAFETY_PIPELINE:${params.source_reference}`
    };
  }
}
