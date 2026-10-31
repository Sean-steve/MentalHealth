export type LaunchProgramState=
  'DRAFT'|'RELEASE_CANDIDATE_LOCKED'|'BETA_READY'|'BETA_ACTIVE'|'BETA_PAUSED'|
  'LIMITED_LAUNCH_REVIEW'|'LIMITED_LAUNCH_AUTHORIZED'|'LIMITED_LAUNCH_ACTIVE'|
  'LAUNCH_PAUSED'|'POST_LAUNCH_REVIEW'|'CLOSED'|'BLOCKED';

export type LaunchEvidenceCategory=
  'RELEASE_VALIDATION'|'SECURITY'|'CLINICAL'|'AI_SAFETY'|'PRIVACY_DPIA'|'KENYA_REGULATORY'|
  'ACCESSIBILITY'|'PERFORMANCE'|'RELIABILITY_DR'|'INCIDENT_RUNBOOK'|'ROLLBACK_KILL_SWITCH'|
  'PROFESSIONAL_OPERATIONS'|'COMMUNITY_OPERATIONS'|'PAYMENTS_OPERATIONS'|'SUPPORT_OPERATIONS';

export type LaunchDecisionType='CONTROLLED_BETA'|'LIMITED_KENYA_LAUNCH';
export type LaunchDecision='APPROVED'|'APPROVED_WITH_CONDITIONS'|'BLOCKED';
export type ParticipantType='USER'|'PROFESSIONAL';
export type ParticipantState='INVITED'|'ENROLLED'|'WITHDRAWN'|'SUSPENDED';
export type PostLaunchDecision='CONTINUE'|'HOLD'|'ROLLBACK'|'EXPAND_REQUIRES_NEW_AUTHORIZATION';

export interface LaunchScope{
  consumer:boolean;
  professional:boolean;
  community:boolean;
  payments:boolean;
  ai:boolean;
}

export interface LaunchProgram{
  id:string;
  code:string;
  release_id:string;
  version:string;
  build_sha:string;
  jurisdiction:'KE';
  state:LaunchProgramState;
  owner_id:string;
  feature_keys:string[];
  scope:LaunchScope;
  beta_max_participants:number;
  limited_launch_max_participants:number;
  required_external_authorities:string[];
  regulatory_scope_evidence_ref:string;
  beta_starts_at?:string;
  beta_ends_at?:string;
  limited_launch_starts_at?:string;
  created_at:string;
  updated_at:string;
  paused_reason?:string;
}

export interface LaunchParticipant{
  id:string;
  program_id:string;
  subject_ref_hash:string;
  participant_type:ParticipantType;
  jurisdiction:'KE';
  state:ParticipantState;
  invitation_ref:string;
  consent_receipt_ref:string;
  eligibility_evidence_refs:string[];
  enrolled_at?:string;
  withdrawn_at?:string;
  suspended_reason?:string;
  created_at:string;
  updated_at:string;
}

export interface LaunchEvidenceItem{
  category:LaunchEvidenceCategory;
  evidence_ref:string;
  evidence_hash?:string;
  status:'PASS'|'APPROVED'|'CURRENT';
  expires_at?:string;
}

export interface LaunchEvidencePackage{
  id:string;
  program_id:string;
  release_id:string;
  build_sha:string;
  items:LaunchEvidenceItem[];
  manifest_hash:string;
  generated_by:string;
  generated_at:string;
}

export interface LaunchMonitoringSnapshot{
  id:string;
  program_id:string;
  build_sha:string;
  environment:'production'|'staging';
  status:'GREEN'|'AMBER'|'RED';
  critical_launch_blockers:number;
  open_critical_incidents:number;
  safety_resources_valid:boolean;
  incident_response_ready:boolean;
  rollback_ready:boolean;
  database_healthy:boolean;
  dr_ready:boolean;
  privacy_lifecycle_clear:boolean;
  notes_codes:string[];
  captured_by:string;
  captured_at:string;
}

export interface LaunchAuthorizationDecision{
  id:string;
  program_id:string;
  build_sha:string;
  decision_type:LaunchDecisionType;
  decision:LaunchDecision;
  reviewer_id:string;
  reviewer_role:'RELEASE_AUTHORITY';
  evidence_package_id:string;
  conditions:string[];
  decided_at:string;
}

export interface PostLaunchReview{
  id:string;
  program_id:string;
  build_sha:string;
  window_started_at:string;
  window_ended_at:string;
  incident_refs:string[];
  monitoring_snapshot_refs:string[];
  evidence_refs:string[];
  reviewer_id:string;
  reviewer_role:'RELEASE_AUTHORITY';
  decision:PostLaunchDecision;
  findings:string[];
  corrective_actions:string[];
  reviewed_at:string;
}
