import { ProfessionalThreadStatus, MessageDeliveryStatus } from '../../platform/shared/state_machines.js';

export { ProfessionalThreadStatus, MessageDeliveryStatus };

export enum ProfessionalThreadType {
  CARE_COMMUNICATION = 'CARE_COMMUNICATION',
  FOLLOW_UP = 'FOLLOW_UP',
  CARE_COORDINATION = 'CARE_COORDINATION',
  ASSESSMENT_FOLLOW_UP = 'ASSESSMENT_FOLLOW_UP',
  APPOINTMENT_FOLLOW_UP = 'APPOINTMENT_FOLLOW_UP'
}

export enum ThreadParticipantType {
  USER = 'USER',
  PROFESSIONAL = 'PROFESSIONAL',
  SYSTEM = 'SYSTEM'
}

export enum ThreadParticipantStatus {
  ACTIVE = 'ACTIVE',
  REMOVED = 'REMOVED',
  LEFT = 'LEFT'
}

export enum ProfessionalMessageType {
  TEXT = 'TEXT',
  SYSTEM = 'SYSTEM',
  ATTACHMENT = 'ATTACHMENT',
  CARE_PLAN_UPDATE = 'CARE_PLAN_UPDATE',
  TASK_UPDATE = 'TASK_UPDATE',
  APPOINTMENT_UPDATE = 'APPOINTMENT_UPDATE',
  ASSESSMENT_UPDATE = 'ASSESSMENT_UPDATE'
}

export type SafetyMonitoringStatus = 'NOT_CONFIGURED' | 'EVALUATED_NO_SIGNAL' | 'CANDIDATE_SIGNAL_FORWARDED';
export type MessagingAvailabilityState = 'AVAILABLE' | 'OUT_OF_HOURS' | 'UNKNOWN';