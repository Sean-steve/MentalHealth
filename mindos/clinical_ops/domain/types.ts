import { EscalationState, RiskState } from '../../platform/shared/state_machines.js';

export type ClinicalOperationsStaffingState = 'UNSTAFFED' | 'STAFFED' | 'PAUSED';
export type ClinicalOperationsEscalationLevel = 'L0' | 'L1' | 'L2' | 'L3';
export type ClinicalOperationsFollowUpType = 'AUTOMATED_REMINDER' | 'HUMAN_FOLLOW_UP' | 'PROFESSIONAL_FOLLOW_UP';
export type ClinicalIncidentState = 'OPEN' | 'CONTAINED' | 'INVESTIGATING' | 'CORRECTIVE_ACTION' | 'VALIDATING' | 'CLOSED';

export interface ClinicalOperationsCapability {
  id: string;
  jurisdiction: string;
  queue_key: string;
  staffing_state: ClinicalOperationsStaffingState;
  qualified_role_codes: string[];
  coverage_started_at?: string;
  coverage_ends_at?: string;
  acknowledgement_sla_minutes?: number;
  resolution_sla_minutes?: number;
  configured_by: string;
  configured_at: string;
  policy_version: string;
}

export interface ClinicalOperationsEscalation {
  id: string;
  subject_user_id: string;
  risk_event_id: string;
  risk_state: RiskState;
  level: ClinicalOperationsEscalationLevel;
  jurisdiction: string;
  queue_key: string;
  state: EscalationState;
  reason_codes: string[];
  source_summary_reference?: string;
  assigned_reviewer_id?: string;
  assigned_reviewer_role?: string;
  triaged_at?: string;
  assigned_at?: string;
  review_started_at?: string;
  action_required_at?: string;
  follow_up_started_at?: string;
  resolved_at?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  resolution_summary_reference?: string;
  created_at: string;
  updated_at: string;
  policy_version: string;
}

export interface ClinicalOperationsFollowUp {
  id: string;
  escalation_id: string;
  subject_user_id: string;
  type: ClinicalOperationsFollowUpType;
  responsible_actor_id?: string;
  channel?: string;
  scheduled_for: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'MISSED' | 'CANCELLED';
  completed_at?: string;
  outcome_reference?: string;
  created_at: string;
  updated_at: string;
}

export interface ClinicalIncident {
  id: string;
  incident_type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  state: ClinicalIncidentState;
  affected_component: string;
  linked_escalation_id?: string;
  linked_risk_event_id?: string;
  evidence_references: string[];
  model_version?: string;
  safety_policy_version?: string;
  release_version?: string;
  corrective_action_references: string[];
  validation_evidence_references: string[];
  opened_at: string;
  contained_at?: string;
  closed_at?: string;
  created_by: string;
  updated_at: string;
}

export type SafetyPlanShareGranteeType = 'PROFESSIONAL' | 'TRUSTED_CONTACT';

export interface SafetyPlanShareGrant {
  id: string;
  safety_plan_reference: string;
  subject_user_id: string;
  grantee_type: SafetyPlanShareGranteeType;
  grantee_id: string;
  scopes: string[];
  status: 'ACTIVE' | 'REVOKED';
  granted_by: string;
  granted_at: string;
  revoked_at?: string;
  revocation_reason?: string;
}
