/**
/**
 * MindOS Clinical Safety Kernel Domain Types & Contracts
 * Authority: Volumes I, V, IX, XV & Appendices B / C / G / J / P / Q
 * Clinical Safety Policy Catalogue: POL-SAFE-001, ART-SAFE-001
 * 
 * Core Invariants:
 * - One canonical RiskState per user. AI, assessments, and community are signal sources, not independent authorities (R-SAFE-001).
 * - Safety signals represent risk observations/inferences and SHALL NOT be presented as clinical diagnoses (R-SAFE-002).
 * - Only verified, unexpired safety resources SHALL be presented to users (R-SAFE-003).
 * - High-priority safety actions and events take execution precedence over marketing/analytics (R-SAFE-004).
 * - The platform SHALL NOT claim active human monitoring until a qualified reviewer has acknowledged the escalation (R-SAFE-005).
 * - General administrators SHALL NOT override clinical safety risk states (R-SAFE-006).
 */

import { RiskState, EscalationState } from '../../platform/shared/state_machines.js';
export { RiskState, EscalationState };

export enum SignalSourceType {
  USER_SELF_REPORT = 'USER_SELF_REPORT',
  ASSESSMENT = 'ASSESSMENT',
  AI_INTERACTION = 'AI_INTERACTION',
  COMMUNITY_CONTENT = 'COMMUNITY_CONTENT',
  PROFESSIONAL_REPORT = 'PROFESSIONAL_REPORT',
  TRUSTED_CONTACT = 'TRUSTED_CONTACT',
  SYSTEM_OBSERVATION = 'SYSTEM_OBSERVATION',
  MODERATION = 'MODERATION',
  IMPORT = 'IMPORT'
}

export enum SignalProvenance {
  USER_REPORTED = 'USER_REPORTED',
  SYSTEM_OBSERVED = 'SYSTEM_OBSERVED',
  AI_INFERRED = 'AI_INFERRED',
  PROFESSIONAL_RECORDED = 'PROFESSIONAL_RECORDED',
  CLINICALLY_ASSESSED = 'CLINICALLY_ASSESSED',
  IMPORTED = 'IMPORTED'
}

export enum SignalSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum SignalConfidence {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CONFIRMED = 'CONFIRMED'
}

export enum SignalStatus {
  DETECTED = 'DETECTED',
  VALIDATED = 'VALIDATED',
  ACTIVE = 'ACTIVE',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
  SUPERSEDED = 'SUPERSEDED'
}

export enum SignalFamily {
  SELF_HARM_IDEATION = 'SELF_HARM_IDEATION',
  SELF_HARM_ACTIVE = 'SELF_HARM_ACTIVE',
  SUICIDAL_IDEATION = 'SUICIDAL_IDEATION',
  SUICIDAL_INTENT = 'SUICIDAL_INTENT',
  SUICIDAL_PLAN = 'SUICIDAL_PLAN',
  RECENT_ATTEMPT = 'RECENT_ATTEMPT',
  VIOLENCE_RISK = 'VIOLENCE_RISK',
  VIOLENCE_TO_OTHERS = 'VIOLENCE_TO_OTHERS',
  ABUSE_OR_EXPLOITATION = 'ABUSE_OR_EXPLOITATION',
  CHILD_ABUSE_EXPLOITATION = 'CHILD_ABUSE_EXPLOITATION',
  DOMESTIC_VIOLENCE = 'DOMESTIC_VIOLENCE',
  SEVERE_DISTRESS = 'SEVERE_DISTRESS',
  PSYCHOSIS_OR_DISORGANIZATION = 'PSYCHOSIS_OR_DISORGANIZATION',
  PSYCHOSIS_SEVERE_DISORGANIZATION = 'PSYCHOSIS_SEVERE_DISORGANIZATION',
  MEDICAL_EMERGENCY = 'MEDICAL_EMERGENCY',
  INABILITY_TO_MAINTAIN_IMMEDIATE_SAFETY = 'INABILITY_TO_MAINTAIN_IMMEDIATE_SAFETY'
}

export enum SafetyMode {
  NORMAL = 'NORMAL',
  ELEVATED_SUPPORT = 'ELEVATED_SUPPORT',
  HIGH_RISK = 'HIGH_RISK',
  CRITICAL_SAFETY = 'CRITICAL_SAFETY'
}

export enum SafetyActionType {
  SHOW_SAFETY_SUPPORT = 'SHOW_SAFETY_SUPPORT',
  SHOW_CRISIS_RESOURCES = 'SHOW_CRISIS_RESOURCES',
  DISPLAY_CRISIS_MODAL = 'DISPLAY_CRISIS_MODAL',
  SUPPRESS_COMMERCIALS = 'SUPPRESS_COMMERCIALS',
  NOTIFY_CLINICAL_ONCALL = 'NOTIFY_CLINICAL_ONCALL',
  REQUIRE_SAFETY_CHECK = 'REQUIRE_SAFETY_CHECK',
  LIMIT_AI_MODE = 'LIMIT_AI_MODE',
  SUSPEND_NORMAL_AI_FLOW = 'SUSPEND_NORMAL_AI_FLOW',
  ESCALATE_HUMAN_REVIEW = 'ESCALATE_HUMAN_REVIEW',
  CONTACT_TRUSTED_PERSON = 'CONTACT_TRUSTED_PERSON',
  CONTACT_PROFESSIONAL = 'CONTACT_PROFESSIONAL',
  RECOMMEND_EMERGENCY_SERVICES = 'RECOMMEND_EMERGENCY_SERVICES',
  INITIATE_EMERGENCY_WORKFLOW = 'INITIATE_EMERGENCY_WORKFLOW',
  FOLLOW_UP_REQUIRED = 'FOLLOW_UP_REQUIRED'
}

export enum SafetyActionPriority {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  NORMAL = 'NORMAL'
}

export enum SafetyActionStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  SUPERSEDED = 'SUPERSEDED'
}

export enum SafetyEscalationType {
  CLINICAL_REVIEW = 'CLINICAL_REVIEW',
  SAFETY_OPERATIONS = 'SAFETY_OPERATIONS',
  PROFESSIONAL_CARE = 'PROFESSIONAL_CARE',
  TRUSTED_CONTACT = 'TRUSTED_CONTACT',
  EMERGENCY_SERVICES = 'EMERGENCY_SERVICES',
  MODERATION_SAFETY = 'MODERATION_SAFETY'
}

export enum SafetyResourceType {
  EMERGENCY_SERVICE = 'EMERGENCY_SERVICE',
  CRISIS_LINE = 'CRISIS_LINE',
  MENTAL_HEALTH_HELPLINE = 'MENTAL_HEALTH_HELPLINE',
  HOSPITAL = 'HOSPITAL',
  CLINIC = 'CLINIC',
  PROFESSIONAL_SERVICE = 'PROFESSIONAL_SERVICE',
  DOMESTIC_VIOLENCE_SUPPORT = 'DOMESTIC_VIOLENCE_SUPPORT',
  CHILD_PROTECTION = 'CHILD_PROTECTION',
  GENERAL_SAFETY_RESOURCE = 'GENERAL_SAFETY_RESOURCE'
}

export enum ResourceVerificationStatus {
  VERIFIED = 'VERIFIED',
  EXPIRED = 'EXPIRED',
  UNVERIFIED = 'UNVERIFIED',
  DISABLED = 'DISABLED'
}

export enum SafetyReviewDecision {
  CONFIRM_RISK_STATE = 'CONFIRM_RISK_STATE',
  INCREASE_RISK_STATE = 'INCREASE_RISK_STATE',
  DECREASE_RISK_STATE = 'DECREASE_RISK_STATE',
  REQUEST_MORE_INFORMATION = 'REQUEST_MORE_INFORMATION',
  CLOSE_ESCALATION = 'CLOSE_ESCALATION',
  INITIATE_ADDITIONAL_ACTION = 'INITIATE_ADDITIONAL_ACTION'
}

export enum SafetyIncidentType {
  MISSED_SIGNAL = 'MISSED_SIGNAL',
  WRONG_RESOURCE = 'WRONG_RESOURCE',
  RESOURCE_EXPIRED_PRESENTED = 'RESOURCE_EXPIRED_PRESENTED',
  ESCALATION_DELIVERY_FAILURE = 'ESCALATION_DELIVERY_FAILURE',
  INCORRECT_STATE_DOWNGRADE = 'INCORRECT_STATE_DOWNGRADE',
  WORKER_FAILURE = 'WORKER_FAILURE',
  POLICY_DRIFT = 'POLICY_DRIFT',
  UNAUTHORIZED_OVERRIDE = 'UNAUTHORIZED_OVERRIDE'
}

export enum SafetyIncidentSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

// Entity Interfaces

export interface SafetySignalEntity {
  id: string; // UUIDv7
  subject_user_id: string;
  signal_type: SignalFamily | string;
  signal_code: string;
  source_type: SignalSourceType;
  source_reference?: string;
  provenance: SignalProvenance;
  severity: SignalSeverity;
  confidence: SignalConfidence;
  observed_at: string;
  received_at: string;
  raw_evidence_reference?: string;
  normalized_evidence: Record<string, unknown>;
  jurisdiction: string;
  status: SignalStatus;
  dismissal_reason?: string;
  dismissed_by?: string;
  dismissed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface RiskFactorEntity {
  id: string;
  subject_user_id: string;
  factor_type: string;
  source_signal_id?: string;
  severity: SignalSeverity;
  confidence: SignalConfidence;
  effective_at: string;
  expires_at?: string;
  status: 'ACTIVE' | 'EXPIRED' | 'MITIGATED';
  provenance: SignalProvenance;
  created_at: string;
}

export interface ProtectiveFactorEntity {
  id: string;
  subject_user_id: string;
  factor_type: string;
  source_reference?: string;
  confidence: SignalConfidence;
  effective_at: string;
  expires_at?: string;
  status: 'ACTIVE' | 'EXPIRED';
  provenance: SignalProvenance;
  details: Record<string, unknown>;
  created_at: string;
}

export interface RiskStateEntity {
  id: string;
  subject_user_id: string;
  level: RiskState;
  state_version: number;
  effective_at: string;
  previous_state?: RiskState;
  reason_codes: string[];
  evidence_refs: string[];
  policy_version: string;
  clinical_artifact_ref: string;
  source_summary: Record<string, unknown>;
  last_reviewed_at?: string;
  next_review_at?: string;
  fresh_until: string;
  status: 'CURRENT' | 'SUPERSEDED' | 'ARCHIVED';
  created_at: string;
  updated_at: string;
}

export interface SafetyActionEntity {
  id: string;
  subject_user_id: string;
  risk_state_id?: string;
  action_type: SafetyActionType;
  priority: SafetyActionPriority;
  status: SafetyActionStatus;
  required_by_policy: boolean;
  generated_at: string;
  due_at: string;
  started_at?: string;
  completed_at?: string;
  assigned_actor_id?: string;
  resource_reference?: string;
  policy_version: string;
  outcome?: string;
  failure_reason?: string;
}

export interface SafetyEscalationEntity {
  id: string;
  subject_user_id: string;
  risk_state_id?: string;
  escalation_type: SafetyEscalationType;
  priority: SafetyActionPriority;
  status: EscalationState;
  reason_codes: string[];
  created_at: string;
  assigned_at?: string;
  acknowledged_at?: string;
  resolved_at?: string;
  assigned_team: string;
  assigned_actor_id?: string;
  escalation_target?: string;
  outcome?: string;
  policy_version: string;
  sla_acknowledgement_due_at: string;
  sla_resolution_due_at: string;
}

export interface SafetyReviewEntity {
  id: string;
  subject_user_id: string;
  escalation_id?: string;
  risk_state_id?: string;
  reviewer_id: string;
  reviewer_role: string;
  qualification_reference?: string;
  decision: SafetyReviewDecision;
  proposed_risk_level?: RiskState;
  rationale: string;
  evidence_refs: string[];
  clinical_artifact_ref: string;
  policy_version: string;
  created_at: string;
}

export interface SafetyResourceEntity {
  id: string;
  resource_code: string;
  resource_type: SafetyResourceType;
  name: string;
  description?: string;
  jurisdiction: string;
  region?: string;
  contact_method: 'PHONE' | 'SMS' | 'WHATSAPP' | 'WEB' | 'PHYSICAL';
  phone?: string;
  sms?: string;
  web?: string;
  physical_reference?: string;
  availability_json: {
    hours: string;
    free_of_charge: boolean;
    emergency_service?: boolean;
  };
  languages: string[];
  population: string[];
  risk_applicability: string[];
  verification_status: ResourceVerificationStatus;
  verified_at: string;
  expires_at: string;
  status: 'ACTIVE' | 'INACTIVE';
  source_reference: string;
  created_at: string;
  updated_at: string;
}

export interface SafetyResourceVersionEntity {
  id: string;
  resource_id: string;
  version: number;
  snapshot_json: Record<string, unknown>;
  verified_by: string;
  verified_at: string;
  created_at: string;
}

export interface SafetyIncidentEntity {
  id: string;
  incident_type: SafetyIncidentType | string;
  severity: SafetyIncidentSeverity;
  affected_component: string;
  detected_at: string;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';
  description_reference: string;
  governance_impact?: string;
  release_action?: string;
  resolved_at?: string;
  resolution_notes?: string;
  created_at: string;
}

export interface SafetyBreakGlassSessionEntity {
  id: string;
  subject_user_id: string;
  actor_id: string;
  actor_role: string;
  justification: string;
  purpose: string;
  started_at: string;
  expires_at: string;
  terminated_at?: string;
  post_review_required: boolean;
  post_review_id?: string;
  created_at: string;
}
