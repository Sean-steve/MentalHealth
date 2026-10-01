import {
  ProfessionalThreadStatus,
  MessageDeliveryStatus,
  ProfessionalThreadType,
  ThreadParticipantType,
  ThreadParticipantStatus,
  ProfessionalMessageType,
  SafetyMonitoringStatus
} from './types.js';

export interface ProfessionalMessageThread {
  id: string;
  subject_user_id: string;
  care_relationship_id: string;
  thread_type: ProfessionalThreadType;
  purpose: string;
  status: ProfessionalThreadStatus;
  created_by: string;
  created_at: string;
  closed_at?: string;
  response_expectation_reference: string;
  version: number;
}

export interface ProfessionalThreadParticipant {
  id: string;
  thread_id: string;
  actor_type: ThreadParticipantType;
  actor_id: string;
  participant_role: string;
  status: ThreadParticipantStatus;
  joined_at: string;
  left_at?: string;
  access_scope: string[];
}

export interface ProfessionalMessage {
  id: string;
  thread_id: string;
  sender_type: ThreadParticipantType;
  sender_id: string;
  message_type: ProfessionalMessageType;
  content_reference: string;
  status: MessageDeliveryStatus;
  sent_at: string;
  delivered_at?: string;
  read_at?: string;
  reply_to_message_id?: string;
  clinical_significance: 'ROUTINE' | 'REVIEW_REQUIRED';
  safety_monitoring_status: SafetyMonitoringStatus;
  safety_reference?: string;
  idempotency_key: string;
}

export interface ProfessionalMessageAttachment {
  id: string;
  thread_id: string;
  message_id: string;
  evidence_reference: string;
  mime_type: string;
  size_bytes: number;
  scan_status: 'PENDING' | 'CLEAN' | 'QUARANTINED' | 'REJECTED';
  data_classification: string;
  created_at: string;
}