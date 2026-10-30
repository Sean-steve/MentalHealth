/**
 * MindOS Regulatory Governance Domain Types & Interfaces
 * Authority: Volumes III, XV & Appendices B / C / I (Kenya Regulatory Control Matrix)
 */

import {
  JurisdictionStatus,
  RegulatoryAuthorityType,
  RegulatorySourceType,
  RegulatorySourceStatus,
  RegulatorySourceClassification,
  RegulatoryRequirementType,
  RegulatoryObligationType,
  RegulatoryInterpretationStatus,
  RegulatoryControlDomain,
  RegulatoryControlType,
  RegulatoryControlStatus,
  ControlEvidenceStatus,
  RegulatoryClassificationType,
  RegulatoryAssessmentStatus,
  RegulatoryDecisionType,
  GovernanceConditionType,
  RegulatoryGapType,
  RegulatoryGapSeverity,
  RegulatoryGapStatus,
  CertificationStatus
} from './taxonomy.js';
import { RegulatoryReviewState } from '../../platform/shared/state_machines.js';

export interface Jurisdiction {
  id: string; // UUIDv7
  code: string; // e.g. 'KE'
  name: string; // e.g. 'Republic of Kenya'
  country_code: string; // ISO 3166-1 alpha-2 e.g. 'KE'
  region: string; // e.g. 'AFRICA'
  status: JurisdictionStatus;
  default_language: string; // 'en', 'sw'
  timezone_reference: string; // 'Africa/Nairobi'
  regulatory_profile_version: string;
  effective_at: string;
  retired_at?: string;
  metadata?: Record<string, unknown>;
}

export interface RegulatoryAuthority {
  id: string; // UUIDv7
  code: string; // e.g. 'ODPC', 'MOH', 'DHA', 'KMPDC', 'PPB', 'CAK'
  name: string; // e.g. 'Office of the Data Protection Commissioner'
  jurisdiction_code: string; // 'KE'
  authority_type: RegulatoryAuthorityType;
  scope: string;
  official_reference: string;
  website_url?: string;
  contact_details?: Record<string, unknown>;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface RegulatorySource {
  id: string; // UUIDv7
  source_code: string; // e.g. 'KE-SRC-DPA-2019'
  jurisdiction_code: string; // 'KE'
  authority_id: string;
  source_type: RegulatorySourceType;
  title: string;
  official_reference: string;
  version: string;
  publication_date: string;
  effective_date: string;
  status: RegulatorySourceStatus;
  supersedes_id?: string;
  retrieved_at: string;
  verified_at: string;
  source_hash: string; // SHA-256
  classification: RegulatorySourceClassification;
}

export interface RegulatorySourceVersion {
  id: string; // UUIDv7
  source_id: string;
  version: string;
  publication_date?: string;
  effective_date?: string;
  content_text: string;
  content_hash: string; // SHA-256
  source_url?: string;
  verified_by: string;
  verified_at: string;
  summary_notes?: string;
}

export interface RegulatoryRequirement {
  id: string; // UUIDv7
  requirement_code: string; // e.g. 'KE-REQ-PRIV-001'
  source_id: string;
  source_version: string;
  jurisdiction_code: string;
  title: string;
  description: string;
  requirement_type: RegulatoryRequirementType;
  obligation_type: RegulatoryObligationType;
  applies_to?: string[]; // e.g. ['feature', 'processing_activity', 'clinical_artifact', 'ai_system']
  trigger_conditions?: Record<string, unknown>;
  required_controls: string[]; // Control codes
  evidence_requirements: string[];
  effective_at: string;
  expires_at?: string;
  status: 'ACTIVE' | 'DEPRECATED' | 'REPLACED';
  interpretation_status: RegulatoryInterpretationStatus;
  legal_reference?: string;
  mandatory?: boolean;
  reviewed_by?: string;
  reviewed_at?: string;
  supersedes_id?: string;
}

export interface RegulatoryControl {
  id: string; // UUIDv7
  control_code: string; // e.g. 'CTL-PRIV-LAWFUL-BASIS'
  name: string;
  description: string;
  control_domain: RegulatoryControlDomain;
  jurisdiction_code: string;
  control_type: RegulatoryControlType;
  implementation_owner: string; // Subsystem / service owner
  status: RegulatoryControlStatus;
  technical_enforcement: string; // Implementation description
  evidence_requirement: string;
  evidence_status: ControlEvidenceStatus;
  verification_status?: ControlEvidenceStatus;
  requirement_id?: string;
  last_verified_at?: string;
  verified_by?: string;
  evidence_vault_ref?: string;
  policy_version: string;
  effective_at: string;
}

export interface RegulatoryRequirementControl {
  id: string;
  requirement_id: string;
  control_id: string;
  relationship: 'IMPLEMENTS' | 'SUPPORTS' | 'VERIFIES';
  mandatory: boolean;
  coverage: 'FULL' | 'PARTIAL';
  assessment?: string;
}

export interface RegulatoryClassification {
  id: string;
  resource_id: string;
  resource_version: string;
  jurisdiction_code: string;
  classification_type: RegulatoryClassificationType;
  classification: string;
  applicable_requirements: string[]; // Requirement codes
  confidence: number;
  review_required: boolean;
  human_review_required?: boolean;
  reason_codes: string[];
  policy_version: string;
  created_at: string;
}

export interface GovernanceCondition {
  type: GovernanceConditionType;
  code: string;
  description: string;
  parameters?: Record<string, unknown>;
  id?: string;
  assessment_id?: string;
  condition_type?: GovernanceConditionType;
  condition_code?: string;
  enforcement_mechanism?: string;
  status?: string;
}

export interface RegulatoryAssessment {
  id: string;
  resource_id: string;
  resource_version: string;
  jurisdiction_code: string;
  classification_id: string;
  status: RegulatoryAssessmentStatus | RegulatoryReviewState;
  applicable_requirements: string[];
  control_assessment: Record<string, ControlEvidenceStatus>;
  open_gaps_count: number;
  blocking_gaps_count?: number;
  reviewer_id?: string;
  decision?: RegulatoryDecisionType;
  decision_reason?: string;
  conditions: GovernanceCondition[];
  started_at: string;
  initiated_at?: string;
  updated_at?: string;
  completed_at?: string;
  next_review_at?: string;
  expires_at?: string;
}

export interface RegulatoryGap {
  id: string;
  assessment_id: string;
  requirement_id: string;
  control_id?: string;
  gap_type: RegulatoryGapType;
  severity: RegulatoryGapSeverity;
  description: string;
  remediation_required: string;
  owner: string;
  status: RegulatoryGapStatus;
  due_at?: string;
  verified_at?: string;
  verified_by?: string;
  evidence_vault_ref?: string;
  created_at: string;
}

export interface RegulatoryApproval {
  id: string;
  resource_id: string;
  resource_version: string;
  jurisdiction_code: string;
  assessment_id: string;
  classification_id: string;
  source_versions: Record<string, string>; // { source_code: version }
  requirement_set: string[];
  control_evidence: Record<string, string>; // { control_code: evidence_ref }
  reviewer_id: string;
  approved_by?: string;
  decision: 'APPROVED' | 'APPROVED_WITH_CONDITIONS' | RegulatoryDecisionType;
  conditions: GovernanceCondition[];
  policy_version: string;
  approved_at: string;
  expires_at: string;
  revoked_at?: string;
  revocation_reason?: string;
  revoked_by?: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'SUPERSEDED' | 'SUSPENDED';
  evidence_vault_ref?: string;
}

export interface RegulatoryImpactAssessment {
  id: string;
  source_change_id: string;
  source_code: string;
  old_version: string;
  new_version: string;
  jurisdiction_code: string;
  affected_requirements: string[];
  affected_controls: string[];
  affected_processing_activities: string[];
  affected_clinical_artifacts: string[];
  affected_ai_systems: string[];
  affected_features: string[];
  affected_releases: string[];
  risk_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  human_review_required: boolean;
  status: 'PENDING_REVIEW' | 'REVIEWED' | 'APPLIED';
  assessed_by?: string;
  assessed_at?: string;
  notes?: string;
  created_at: string;
}

export interface CertificationRequirement {
  id: string;
  authority_code: string;
  certification_name: string;
  jurisdiction_code: string;
  applicable_to_resources: string[];
  status: CertificationStatus;
  verification_doc_ref?: string;
  issued_at?: string;
  expires_at?: string;
  verified_by?: string;
}

export interface ExternalRegulatoryStatus {
  id: string;
  authority_code: string;
  jurisdiction_code: string;
  registration_type: string;
  registration_reference?: string;
  status: 'REGISTERED' | 'PENDING' | 'AUDITED' | 'EXEMPT' | 'SUSPENDED';
  effective_date?: string;
  renewal_due_date?: string;
  verified_at: string;
  verified_by: string;
}

export interface RegulatoryPolicyVersion {
  version: string;
  jurisdiction_code: string;
  effective_at: string;
  change_summary: string;
}
