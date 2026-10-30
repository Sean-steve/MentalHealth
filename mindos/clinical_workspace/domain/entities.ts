/**
 * MindOS Professional Clinical Workspace Domain Entities
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 */

import {
  EncounterType,
  EncounterModality,
  ClinicalEncounterState,
  ClinicalNoteType,
  ClinicalNoteState,
  ClinicalTaskType,
  ClinicalTaskStatus,
  CarePlanStatus,
  ProfessionalSafetySeverity
} from './types.js';

export interface StructuredNoteContent {
  // SOAP Note fields
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;

  // BIRP Note fields
  behavior?: string;
  intervention?: string;
  response?: string;

  // Narrative / General note content
  narrative?: string;
}

export interface ClinicalEncounter {
  id: string; // UUIDv7
  care_relationship_id: string;
  appointment_id?: string;
  subject_user_id: string;
  lead_professional_id: string;
  organization_id?: string;
  encounter_type: EncounterType;
  modality: EncounterModality;
  status: ClinicalEncounterState;
  started_at?: string;
  ended_at?: string;
  duration_minutes?: number;
  reason_for_visit: string;
  clinical_summary?: string;
  participants: Array<{ professional_id: string; role: string }>;
  jurisdiction: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface ClinicalNote {
  id: string; // UUIDv7
  encounter_id?: string;
  care_relationship_id: string;
  subject_user_id: string;
  author_professional_id: string;
  author_role: string;
  note_type: ClinicalNoteType;
  status: ClinicalNoteState;
  structured_content: StructuredNoteContent;
  ciphertext?: string;
  content_hash: string;
  is_signed: boolean;
  signed_at?: string;
  signed_by?: string;
  signature_hash?: string;
  amendment_of_id?: string;
  amendment_reason?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ClinicalTask {
  id: string; // UUIDv7
  care_relationship_id: string;
  subject_user_id: string;
  assigned_to_user_id?: string;
  assigned_to_professional_id?: string;
  task_type: ClinicalTaskType;
  title: string;
  description: string;
  status: ClinicalTaskStatus;
  due_date?: string;
  completed_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CarePlan {
  id: string; // UUIDv7
  care_relationship_id: string;
  subject_user_id: string;
  author_professional_id: string;
  title: string;
  goals: string[];
  interventions: string[];
  status: CarePlanStatus;
  review_date?: string;
  created_at: string;
  updated_at: string;
}

export interface ProfessionalSafetyConcern {
  id: string; // UUIDv7
  care_relationship_id: string;
  subject_user_id: string;
  reporting_professional_id: string;
  concern_type: string;
  severity: ProfessionalSafetySeverity;
  narrative: string;
  recommended_action: string;
  safety_incident_id?: string;
  created_at: string;
}
