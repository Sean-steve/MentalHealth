/**
/**
 * MindOS Care Navigation & Referral Domain Types
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
 * Clinical Safety Policy Catalogue (R-SAFE-001, R-NAV-001..010, ADR-006, ADR-016)
 * Kenya Data Protection Act 2019, Digital Health Act 2023
 */

import {
  CarePathwayState,
  NavigationSessionState,
  ReferralState,
  HandoffPackageState,
  RiskState,
  ProfessionalVerificationState
} from '../../platform/shared/state_machines.js';

export {
  CarePathwayState,
  NavigationSessionState,
  ReferralState,
  HandoffPackageState,
  RiskState,
  ProfessionalVerificationState
};

/**
 * MindOS Canonical Stepped-Care Levels (WHO / Kenyan MoH Aligned)
 */
export enum CareLevel {
  LEVEL_0 = 'LEVEL_0', // Self-Service / Digital / Psychoeducation (Guided tools, breathing, journaling)
  LEVEL_1 = 'LEVEL_1', // Peer / Community Support (Community circles, peer support navigators)
  LEVEL_2 = 'LEVEL_2', // Low-Intensity Psychological Support (Wellness coaching, registered counselors, skills groups)
  LEVEL_3 = 'LEVEL_3', // High-Intensity Psychological Support (Licensed clinical psychologists, psychotherapists)
  LEVEL_4 = 'LEVEL_4', // Specialized Psychiatric / Medical Care (Consultant psychiatrists, medical clinics, multi-disciplinary teams)
  LEVEL_EMERGENCY = 'LEVEL_EMERGENCY' // Crisis / Immediate Emergency (24/7 crisis lines, emergency hospitals)
}

export enum SupportNeedDomain {
  DEPRESSION_MOOD = 'DEPRESSION_MOOD',
  DEPRESSION = 'DEPRESSION_MOOD',
  ANXIETY_STRESS = 'ANXIETY_STRESS',
  ANXIETY = 'ANXIETY_STRESS',
  SLEEP_HYGIENE = 'SLEEP_HYGIENE',
  TRAUMA_PTSD = 'TRAUMA_PTSD',
  SUBSTANCE_ADDICTION = 'SUBSTANCE_ADDICTION',
  GRIEF_LOSS = 'GRIEF_LOSS',
  RELATIONSHIP_FAMILY = 'RELATIONSHIP_FAMILY',
  WORKPLACE_BURNOUT = 'WORKPLACE_BURNOUT',
  STRESS_BURNOUT = 'WORKPLACE_BURNOUT',
  NEURODIVERSITY = 'NEURODIVERSITY',
  ACUTE_CRISIS = 'ACUTE_CRISIS',
  TRAUMA_CRISIS = 'ACUTE_CRISIS',
  GENERAL_WELLBEING = 'GENERAL_WELLBEING'
}

export enum NeedAcuity {
  MILD = 'MILD',
  MODERATE = 'MODERATE',
  SEVERE = 'SEVERE',
  CRITICAL = 'CRITICAL',
  ACUTE = 'CRITICAL'
}

export type PathwayAcuity = NeedAcuity;
export const PathwayAcuity = NeedAcuity;

export enum MatchingCapacityStatus {
  AVAILABLE = 'AVAILABLE',
  LIMITED = 'LIMITED',
  FULL = 'FULL',
  UNAVAILABLE = 'UNAVAILABLE'
}

export enum ReferralUrgency {
  ROUTINE = 'ROUTINE', // 5-10 business days
  PRIORITY = 'PRIORITY', // 24-48 hours
  URGENT = 'URGENT', // Immediate handoff within 4-12 hours
  EMERGENCY = 'EMERGENCY' // Immediate crisis response
}

export enum ServiceModality {
  TELEHEALTH = 'TELEHEALTH',
  IN_PERSON = 'IN_PERSON',
  HYBRID = 'HYBRID',
  DIGITAL_SELF_SERVE = 'DIGITAL_SELF_SERVE'
}

export interface AssessmentBaseline {
  instrument_code: string;
  score: number;
  band: string;
  result_id: string;
  taken_at?: string;
}

export interface SupportNeed {
  user_id: string;
  primary_domain: SupportNeedDomain;
  secondary_domains: SupportNeedDomain[];
  acuity: NeedAcuity;
  recommended_care_level: CareLevel;
  assessment_baselines: AssessmentBaseline[];
  risk_state: RiskState;
  user_preferences: {
    modality?: ServiceModality;
    language?: string;
    jurisdiction?: string;
    urgency_preference?: ReferralUrgency;
  };
  clinical_rationale: string;
  evaluated_at: string;
}

export interface PathwayIntervention {
  step_number: number;
  title: string;
  intervention_type: 'DIGITAL_CONTENT' | 'EXERCISE' | 'PEER_CIRCLE' | 'CONSULTATION' | 'ASSESSMENT';
  resource_ref?: string;
  description: string;
}

export interface CarePathwayEntity {
  id: string; // UUIDv7
  code: string;
  name: string;
  version: number | string;
  care_level: CareLevel;
  target_need_domains: SupportNeedDomain[];
  primary_domains?: SupportNeedDomain[];
  clinical_artifact_id?: string;
  description: string;
  eligibility_criteria: any;
  exclusion_criteria: any;
  interventions: any[];
  state: CarePathwayState;
  status?: string;
  review_due_at?: string;
  review_date?: string;
  statutory_disclaimer?: string;
  emergency_escalation_targets?: string[];
  acuity_levels?: any[];
  created_at: string;
  updated_at: string;
}

export interface PathwayRecommendation {
  pathway: CarePathwayEntity;
  match_score: number; // 0..100
  match_reasons: string[];
}

export interface NavigationSessionEntity {
  id: string; // UUIDv7
  user_id: string;
  status: NavigationSessionState;
  risk_state_snapshot: RiskState;
  declared_needs: Record<string, unknown>;
  assessment_result_ids: string[];
  classified_need?: SupportNeed;
  recommended_pathways: PathwayRecommendation[];
  selected_pathway_id?: string;
  safety_override: boolean;
  urgent_escalation_required?: boolean;
  emergency_escalated?: boolean;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface ReferralTransitionAudit {
  from_state: ReferralState;
  to_state: ReferralState;
  actor_id?: string;
  timestamp: string;
  reason?: string;
}

export interface ReferralEntity {
  id: string; // UUIDv7
  user_id: string;
  navigation_session_id?: string;
  pathway_id?: string;
  care_level: CareLevel;
  urgency: ReferralUrgency;
  state: ReferralState;
  status?: ReferralState | string;
  handoff_package_id?: string;
  transmitted_at?: string;
  completed_at?: string;
  receiving_provider_id?: string;
  receiving_organization_id?: string;
  receiving_service_type: string;
  reason_codes: string[];
  clinical_summary_hash?: string;
  consent_grant_id?: string;
  action_notes?: string;
  rejection_reason?: string;
  history: ReferralTransitionAudit[];
  expires_at: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
}

export interface ReferralHandoffPackagePayload {
  patient_pseudonym: string;
  care_level: CareLevel;
  primary_need: SupportNeedDomain;
  acuity: NeedAcuity;
  urgency: ReferralUrgency;
  screening_summaries: Array<{
    instrument: string;
    band: string;
    score: number;
    disclaimer: string;
  }>;
  non_diagnostic_disclaimer: string;
  referral_reason: string;
  demographic_snapshot?: {
    age_band?: string;
    language?: string;
    county?: string;
  };
}

export interface ReferralHandoffPackageEntity {
  id: string; // UUIDv7
  referral_id: string;
  user_id: string;
  state: HandoffPackageState;
  status?: HandoffPackageState | string;
  evidence_hash: string;
  evidence_sha256?: string;
  data_classification?: string;
  access_purpose?: string;
  payload: any;
  minimum_necessary_fields: string[];
  access_count: number;
  last_accessed_at?: string;
  expires_at: string;
  revoked_at?: string;
  created_at: string;
}

export interface ProviderMatchingProfileEntity {
  id?: string;
  professional_id: string;
  title: string;
  full_name: string;
  verification_state: ProfessionalVerificationState;
  regulatory_body: string; // e.g. KMPDC
  license_number: string;
  license_expires_at?: string;
  license_expiry?: string;
  specialties: string[];
  supported_care_levels?: CareLevel[];
  care_levels?: CareLevel[];
  modalities: any[];
  jurisdictions: string[];
  languages?: string[];
  capacity_status?: any;
  updated_at?: string;
}

export interface ProviderMatchCriteria {
  care_level: CareLevel;
  need_domain?: SupportNeedDomain;
  specialties?: string[];
  modality?: ServiceModality;
  jurisdiction?: string;
  language?: string;
  requires_available_capacity?: boolean;
}
