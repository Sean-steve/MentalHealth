/**
 * MindOS Governance Kernel Types & Canonical Interfaces
 * Authority: Master Architecture Index Section 7, Volumes III, XIV, XV & Appendices B / C / Q
 * Sprint 9: Governance Kernel, Review Orchestration, Approval Workflows, Feature Risk Classification & Production Release Gates
 */

import { GovernanceDecision } from '../platform/shared/state_machines.js';

export enum GovernedResourceType {
  FEATURE_FLAG = 'FEATURE_FLAG',
  AI_SYSTEM = 'AI_SYSTEM',
  CLINICAL_ARTIFACT = 'CLINICAL_ARTIFACT',
  DPIA_ACTIVITY = 'DPIA_ACTIVITY',
  REGULATORY_FILING = 'REGULATORY_FILING',
  RELEASE_PACKAGE = 'RELEASE_PACKAGE'
}

export enum GovernanceDomain {
  CLINICAL_GOVERNANCE = 'CLINICAL_GOVERNANCE',
  PRIVACY_GOVERNANCE = 'PRIVACY_GOVERNANCE',
  REGULATORY_GOVERNANCE = 'REGULATORY_GOVERNANCE',
  AI_SAFETY_GOVERNANCE = 'AI_SAFETY_GOVERNANCE',
  SECURITY_GOVERNANCE = 'SECURITY_GOVERNANCE',
  QA_GOVERNANCE = 'QA_GOVERNANCE'
}

export type ClinicalRiskClass = 'CR-0' | 'CR-1' | 'CR-2' | 'CR-3';
export type AIRiskClass = 'AI-R0' | 'AI-R1' | 'AI-R2' | 'AI-R3' | 'AI-R4';
export type PrivacyRiskClass = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RegulatoryRiskClass = 'EXEMPT' | 'NOTIFICATION_ONLY' | 'COMPLIANCE_MANDATED' | 'LICENSED_ONLY';

export enum GovernanceCaseState {
  OPEN = 'OPEN',
  IN_REVIEW = 'IN_REVIEW',
  REVISION_REQUIRED = 'REVISION_REQUIRED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  BLOCKED = 'BLOCKED',
  WAIVED_WITH_AUTHORITY = 'WAIVED_WITH_AUTHORITY'
}

export enum GovernanceReviewState {
  PENDING = 'PENDING',
  ASSIGNED = 'ASSIGNED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  APPROVED_WITH_CONTROLS = 'APPROVED_WITH_CONTROLS',
  REVISION_REQUIRED = 'REVISION_REQUIRED',
  BLOCKED = 'BLOCKED'
}

export enum ReleaseAuthorizationStatus {
  AUTHORIZED = 'AUTHORIZED',
  REVOKED = 'REVOKED',
  SUPERSEDED = 'SUPERSEDED'
}

export interface GovernedResourceEntity {
  id: string; // UUIDv7
  resource_key: string;
  resource_type: GovernedResourceType;
  name: string;
  description: string;
  owner_id: string;
  clinical_risk_class: ClinicalRiskClass;
  ai_risk_class: AIRiskClass;
  privacy_risk_class: PrivacyRiskClass;
  regulatory_risk_class: RegulatoryRiskClass;
  requires_clinical_review: boolean;
  requires_dpia: boolean;
  requires_regulatory_review: boolean;
  requires_ai_safety_review: boolean;
  requires_security_review: boolean;
  requires_qa_review: boolean;
  metadata: Record<string, unknown>;
  status: 'ACTIVE' | 'ARCHIVED' | 'DEPRECATED';
  created_at: string;
  updated_at: string;
}

export interface GovernanceCaseEntity {
  id: string; // UUIDv7
  case_number: string;
  resource_id: string;
  release_id?: string;
  state: GovernanceCaseState;
  initiator_id: string;
  mandated_domains: GovernanceDomain[];
  risk_assessment: RiskAssessmentResult;
  summary: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
}

export interface GovernanceReviewEntity {
  id: string; // UUIDv7
  case_id: string;
  domain: GovernanceDomain;
  state: GovernanceReviewState;
  assigned_role: string;
  reviewer_id?: string;
  decision?: GovernanceDecision;
  conditions: string[];
  evidence_hashes: string[];
  notes?: string;
  started_at: string;
  decided_at?: string;
}

export interface GovernanceEvidenceRef {
  id: string;
  hash: string;
  evidence_type: string;
  uri?: string;
  recorded_at: string;
}

export interface ReleaseAuthorizationEntity {
  id: string; // UUIDv7
  release_id: string;
  environment: string;
  approvers: string[];
  authorized_by?: string[];
  authorized_at?: string;
  feature_keys?: string[];
  clinical_status?: 'APPROVED' | 'NOT_REQUIRED' | 'PENDING' | 'BLOCKED';
  dpia_status?: 'APPROVED' | 'NOT_REQUIRED' | 'PENDING' | 'BLOCKED';
  regulatory_status?: 'APPROVED' | 'NOT_REQUIRED' | 'PENDING' | 'BLOCKED';
  ai_safety_status?: 'APPROVED' | 'NOT_REQUIRED' | 'PENDING' | 'BLOCKED';
  security_status?: 'APPROVED' | 'NOT_REQUIRED' | 'PENDING' | 'BLOCKED';
  qa_status?: 'APPROVED' | 'PENDING' | 'BLOCKED';
  evidence_refs?: string[];
  clinical_signoff_at?: string;
  privacy_signoff_at?: string;
  regulatory_signoff_at?: string;
  ai_safety_signoff_at?: string;
  security_signoff_at?: string;
  qa_signoff_at?: string;
  state: GovernanceDecision;
  status: ReleaseAuthorizationStatus;
  release_type?: string;
  checksum_sha256?: string;
  case_id?: string;
  risk_summary?: Record<string, unknown>;
  conditions?: string[];
  revoked_at?: string;
  revoked_by?: string;
  revocation_reason?: string;
  created_at: string;
}

export interface GovernanceWorkItemEntity {
  id: string;
  feature_key: string;
  domain?: GovernanceDomain;
  review_type?: 'CLINICAL' | 'DPIA' | 'REGULATORY' | 'AI_SAFETY' | 'SECURITY' | 'QA';
  required?: boolean;
  state?: 'OPEN' | 'ASSIGNED' | 'IN_REVIEW' | 'APPROVED' | 'BLOCKED' | 'WAIVED_WITH_AUTHORITY';
  status?: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
  owner_role?: string;
  reviewer_id?: string;
  required_evidence?: string[];
  created_at: string;
  completed_at?: string;
  resolved_at?: string;
  resolver_id?: string;
}

export interface RiskAssessmentResult {
  clinical_risk_class: ClinicalRiskClass;
  ai_risk_class: AIRiskClass;
  privacy_risk_class: PrivacyRiskClass;
  regulatory_risk_class: RegulatoryRiskClass;
  mandated_domains: GovernanceDomain[];
  required_roles: string[];
  reasons: string[];
  prohibited_flags: string[];
}

export interface GateDomainEvaluation {
  domain: GovernanceDomain;
  required: boolean;
  status: 'SATISFIED' | 'PENDING' | 'REVISION_REQUIRED' | 'BLOCKED';
  reviewer_id?: string;
  decision?: GovernanceDecision;
  conditions: string[];
  evidence_hashes: string[];
}

export interface ReleaseGateEvaluationResult {
  release_id: string;
  environment: string;
  verdict: 'ALLOWED' | 'DENIED';
  can_activate: boolean;
  blocking_reasons: string[];
  domain_evaluations: Record<GovernanceDomain, GateDomainEvaluation>;
  separation_of_duties_valid: boolean;
  unresolved_incidents_count: number;
  evaluated_at: string;
}
