export type ValidationRiskClass='A'|'B'|'C'|'D';
export type ValidationGate=
  'AUTOMATED_QA'|'SECURITY_RED_TEAM'|'CLINICAL'|'AI_SAFETY'|'PRIVACY_DPIA'|
  'KENYA_REGULATORY'|'ACCESSIBILITY'|'PERFORMANCE'|'RELIABILITY_DR'|'INCIDENT_READINESS';
export type ValidationEvidenceStatus='PASS'|'FAIL'|'NOT_RUN';
export type HumanDecision='APPROVED'|'APPROVED_WITH_CONDITIONS'|'BLOCKED';

export interface ReleaseRiskSignals{
  safety_critical?:boolean;
  authorization_or_consent?:boolean;
  clinical_governance?:boolean;
  ai_governance?:boolean;
  professional_verification?:boolean;
  assessment_or_ai_recommendation?:boolean;
  booking_or_moderation_or_payments?:boolean;
  ordinary_product_change?:boolean;
  cosmetic_only?:boolean;
}

export interface ReleaseValidationCandidate{
  id:string;
  release_id:string;
  version:string;
  build_sha:string;
  environment:'staging'|'production';
  risk_class:ValidationRiskClass;
  required_gates:ValidationGate[];
  initiator_id:string;
  feature_keys:string[];
  created_at:string;
  status:'OPEN'|'BLOCKED'|'READY_FOR_HUMAN_REVIEW'|'CERTIFIED'|'SUPERSEDED';
}

export interface ValidationEvidence{
  id:string;
  release_id:string;
  gate:ValidationGate;
  status:ValidationEvidenceStatus;
  evidence_type:string;
  evidence_hash:string;
  source:string;
  tool_version?:string;
  summary:Record<string,unknown>;
  critical_findings:number;
  high_findings:number;
  executed_at:string;
  expires_at?:string;
}

export interface ValidationAttestation{
  id:string;
  release_id:string;
  gate:ValidationGate;
  reviewer_id:string;
  reviewer_role:string;
  decision:HumanDecision;
  conditions:string[];
  evidence_refs:string[];
  attested_at:string;
  expires_at?:string;
}

export interface ReleaseReadinessCertification{
  id:string;
  release_id:string;
  build_sha:string;
  risk_class:ValidationRiskClass;
  decision:'CERTIFIED'|'BLOCKED';
  blocking_reasons:string[];
  gate_status:Record<ValidationGate,'GREEN'|'RED'|'PENDING'|'NOT_REQUIRED'>;
  evidence_refs:string[];
  attestation_ids:string[];
  certified_by?:string;
  certified_at:string;
  expires_at?:string;
}
