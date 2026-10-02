import {
  ProfessionalMessagingSafetyPort
} from '../application/ports.js';
import { ThreadParticipantType } from '../domain/types.js';

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
  }>;
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
  }): Promise<{ safety_reference: string }>;
}

/**
 * Privacy-preserving bridge between Professional Messaging and the authoritative
 * Safety Kernel. The messaging domain never reads raw protected message content.
 * A separately governed scanner classifies the protected content and only a
 * qualifying candidate is forwarded to the Safety domain.
 */
export class SafetyKernelMessagingAdapter implements ProfessionalMessagingSafetyPort {
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
  }): Promise<{ configured: boolean; candidate_signal: boolean; safety_reference?: string }> {
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
      return { configured: false, candidate_signal: false };
    }

    const forwarded = await this.forwarder.forwardCandidate({
      subject_user_id: params.subject_user_id,
      source_domain: 'PROFESSIONAL_MESSAGING',
      source_reference: `care-message:${params.message_id}`,
      signal_code: classification.signal_code,
      severity: classification.severity,
      confidence: classification.confidence,
      evidence_reference: classification.evidence_reference
    });

    return {
      configured: true,
      candidate_signal: true,
      safety_reference: forwarded.safety_reference
    };
  }
}
