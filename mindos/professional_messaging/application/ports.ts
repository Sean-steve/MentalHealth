import { MessagingAvailabilityState, ThreadParticipantType } from '../domain/types.js';

export interface ProfessionalMessagingSafetyPort {
  evaluateCandidate(params: {
    subject_user_id: string;
    thread_id: string;
    message_id: string;
    sender_type: ThreadParticipantType;
    content_reference: string;
  }): Promise<{ configured: boolean; candidate_signal: boolean; safety_reference?: string }>;
}

export interface ProfessionalMessagingNotificationRecipient {
  actor_type: ThreadParticipantType;
  actor_id: string;
}

export interface ProfessionalMessagingNotificationPort {
  notifyNewMessage(params: {
    thread_id: string;
    message_id: string;
    recipients: ProfessionalMessagingNotificationRecipient[];
  }): Promise<{ accepted: boolean }>;
}

export interface MessagingAvailabilityPolicyPort {
  getAvailability(params: { professional_id: string; at: string }): Promise<{
    state: MessagingAvailabilityState;
    response_expectation_reference: string;
  }>;
}

export class UnconfiguredMessagingSafetyAdapter implements ProfessionalMessagingSafetyPort {
  async evaluateCandidate(): Promise<{ configured: boolean; candidate_signal: boolean }> {
    return { configured: false, candidate_signal: false };
  }
}

export class NoopProfessionalMessagingNotificationAdapter implements ProfessionalMessagingNotificationPort {
  async notifyNewMessage(): Promise<{ accepted: boolean }> { return { accepted: false }; }
}

export class UnknownMessagingAvailabilityAdapter implements MessagingAvailabilityPolicyPort {
  async getAvailability(): Promise<{ state: MessagingAvailabilityState; response_expectation_reference: string }> {
    return { state: 'UNKNOWN', response_expectation_reference: 'MESSAGING_NOT_EMERGENCY_MONITORING' };
  }
}