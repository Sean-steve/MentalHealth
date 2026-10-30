/**
 * MindOS Professional Clinical Workspace Domain Types
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 21 Bounded Context
 */

import {
  ClinicalEncounterState,
  ClinicalNoteState
} from '../../platform/shared/state_machines.js';

export {
  ClinicalEncounterState,
  ClinicalNoteState
};

export enum EncounterType {
  INITIAL_EVALUATION = 'INITIAL_EVALUATION',
  FOLLOW_UP = 'FOLLOW_UP',
  CRISIS_INTERVENTION = 'CRISIS_INTERVENTION',
  REVIEW = 'REVIEW',
  CONSULTATION = 'CONSULTATION',
  CARE_COORDINATION = 'CARE_COORDINATION',
  DISCHARGE = 'DISCHARGE'
}

export enum EncounterModality {
  IN_PERSON = 'IN_PERSON',
  VIDEO_TELEHEALTH = 'VIDEO_TELEHEALTH',
  AUDIO_TELEHEALTH = 'AUDIO_TELEHEALTH',
  SECURE_MESSAGING = 'SECURE_MESSAGING',
  ASYNCHRONOUS = 'ASYNCHRONOUS'
}

export enum ClinicalNoteType {
  INTAKE_ASSESSMENT = 'INTAKE_ASSESSMENT',
  PROGRESS_NOTE = 'PROGRESS_NOTE',
  SOAP_NOTE = 'SOAP_NOTE',
  BIRP_NOTE = 'BIRP_NOTE',
  CRISIS_NOTE = 'CRISIS_NOTE',
  CONSULTATION_NOTE = 'CONSULTATION_NOTE',
  DISCHARGE_SUMMARY = 'DISCHARGE_SUMMARY',
  ADDENDUM = 'ADDENDUM'
}

export enum ClinicalTaskType {
  HOMEWORK = 'HOMEWORK',
  QUESTIONNAIRE = 'QUESTIONNAIRE',
  MEDICATION_REVIEW = 'MEDICATION_REVIEW',
  FOLLOW_UP_SCHEDULING = 'FOLLOW_UP_SCHEDULING',
  REFERRAL_CONSULTATION = 'REFERRAL_CONSULTATION'
}

export enum ClinicalTaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum CarePlanStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  REVISED = 'REVISED'
}

export enum ProfessionalSafetySeverity {
  LOW = 'LOW',
  MODERATE = 'MODERATE',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}
