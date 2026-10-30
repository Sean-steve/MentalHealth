/**
 * MindOS Canonical Privacy Governance Domain Types
 * Authority: Master Architecture Index Section 7, Volumes I, III, VIII, XV & Appendices B / C / Q
 *            Kenya Data Protection Act 2019, Sections 31, 41, 44, 48, 49
 * Sprint 11: Privacy Governance Engine, Data Processing Registry, DPIA Workflow,
 *            Data-Flow Governance & Privacy Release Controls
 */

import { UUID, UtcIsoTimestamp } from '../platform/database/types.js';

export enum ProcessingActivityState {
  DRAFT = 'DRAFT',
  ASSESSMENT_REQUIRED = 'ASSESSMENT_REQUIRED',
  DPIA_REQUIRED = 'DPIA_REQUIRED',
  IN_REVIEW = 'IN_REVIEW',
  ACTION_REQUIRED = 'ACTION_REQUIRED',
  APPROVED = 'APPROVED',
  CONDITIONALLY_APPROVED = 'CONDITIONALLY_APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
  SUPERSEDED = 'SUPERSEDED'
}

export enum DPIAState {
  DRAFT = 'DRAFT',
  IN_ASSESSMENT = 'IN_ASSESSMENT',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  IN_REVIEW = 'IN_REVIEW',
  ACTION_REQUIRED = 'ACTION_REQUIRED',
  APPROVED = 'APPROVED',
  CONDITIONALLY_APPROVED = 'CONDITIONALLY_APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
  SUPERSEDED = 'SUPERSEDED'
}

export enum RiskLikelihood {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum RiskImpact {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum RiskLevel {
  LOW = 'LOW',
  MODERATE = 'MODERATE',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum DataCategory {
  IDENTITY = 'IDENTITY',
  CONTACT = 'CONTACT',
  ACCOUNT_SECURITY = 'ACCOUNT_SECURITY',
  CONSENT = 'CONSENT',
  ASSESSMENT = 'ASSESSMENT',
  JOURNAL = 'JOURNAL',
  AI_CONVERSATION = 'AI_CONVERSATION',
  AI_DERIVED_METADATA = 'AI_DERIVED_METADATA',
  CLINICAL_RECORDS = 'CLINICAL_RECORDS',
  PROFESSIONAL = 'PROFESSIONAL',
  CARE_RELATIONSHIP = 'CARE_RELATIONSHIP',
  COMMUNITY = 'COMMUNITY',
  BILLING = 'BILLING',
  DEVICE_SECURITY_METADATA = 'DEVICE_SECURITY_METADATA',
  ANALYTICS = 'ANALYTICS'
}

export enum DataSubjectCategory {
  USERS = 'USERS',
  PROFESSIONALS = 'PROFESSIONALS',
  TRUSTED_CONTACTS = 'TRUSTED_CONTACTS',
  ORGANIZATION_USERS = 'ORGANIZATION_USERS',
  REVIEWERS = 'REVIEWERS',
  STAFF = 'STAFF',
  MINORS = 'MINORS'
}

export enum ProcessingPurpose {
  PLATFORM_OPERATION = 'PLATFORM_OPERATION',
  AI_SUPPORT = 'AI_SUPPORT',
  AI_PERSONALIZATION = 'AI_PERSONALIZATION',
  CARE_DELIVERY = 'CARE_DELIVERY',
  SAFETY_RESPONSE = 'SAFETY_RESPONSE',
  COMMUNITY_PARTICIPATION = 'COMMUNITY_PARTICIPATION',
  PRODUCT_IMPROVEMENT = 'PRODUCT_IMPROVEMENT',
  SECURITY = 'SECURITY',
  RESEARCH = 'RESEARCH',
  MARKETING = 'MARKETING'
}

export enum LawfulBasis {
  CONSENT = 'CONSENT',
  CONTRACT = 'CONTRACT',
  LEGAL_OBLIGATION = 'LEGAL_OBLIGATION',
  VITAL_INTERESTS = 'VITAL_INTERESTS',
  PUBLIC_INTEREST = 'PUBLIC_INTEREST',
  LEGITIMATE_INTERESTS = 'LEGITIMATE_INTERESTS',
  EXPLICIT_CONSENT = 'EXPLICIT_CONSENT',
  HEALTHCARE_DIRECT = 'HEALTHCARE_DIRECT'
}

export enum ConsentDependency {
  REQUIRED = 'REQUIRED',
  NOT_REQUIRED = 'NOT_REQUIRED',
  CONTEXTUAL = 'CONTEXTUAL'
}

export enum ProcessorType {
  CLOUD_INFRASTRUCTURE = 'CLOUD_INFRASTRUCTURE',
  AI_PROVIDER = 'AI_PROVIDER',
  EMAIL_PROVIDER = 'EMAIL_PROVIDER',
  SMS_PROVIDER = 'SMS_PROVIDER',
  PAYMENT_PROVIDER = 'PAYMENT_PROVIDER',
  ANALYTICS_PROVIDER = 'ANALYTICS_PROVIDER',
  ERROR_MONITORING = 'ERROR_MONITORING',
  STORAGE_PROVIDER = 'STORAGE_PROVIDER',
  IDENTITY_PROVIDER = 'IDENTITY_PROVIDER',
  OTHER = 'OTHER'
}

export enum TransferBasis {
  ADEQUACY = 'ADEQUACY',
  STANDARD_CONTRACTUAL_CLAUSES = 'STANDARD_CONTRACTUAL_CLAUSES',
  EXPLICIT_CONSENT = 'EXPLICIT_CONSENT',
  BINDING_CORPORATE_RULES = 'BINDING_CORPORATE_RULES',
  STATUTORY_EXEMPTION = 'STATUTORY_EXEMPTION'
}

export enum ControlType {
  ORGANIZATIONAL = 'ORGANIZATIONAL',
  TECHNICAL = 'TECHNICAL',
  LEGAL = 'LEGAL',
  OPERATIONAL = 'OPERATIONAL'
}

export enum ControlEffectiveness {
  HIGHLY_EFFECTIVE = 'HIGHLY_EFFECTIVE',
  EFFECTIVE = 'EFFECTIVE',
  PARTIALLY_EFFECTIVE = 'PARTIALLY_EFFECTIVE',
  INEFFECTIVE = 'INEFFECTIVE'
}

export enum RemediationStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  READY_FOR_VERIFICATION = 'READY_FOR_VERIFICATION',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  WAIVED = 'WAIVED'
}

export enum PrivacyDecision {
  APPROVE = 'APPROVE',
  CONDITIONAL_APPROVE = 'CONDITIONAL_APPROVE',
  REJECT = 'REJECT',
  MORE_INFORMATION_REQUIRED = 'MORE_INFORMATION_REQUIRED'
}

export enum DPIATriggerResult {
  DPIA_NOT_REQUIRED = 'DPIA_NOT_REQUIRED',
  DPIA_REQUIRED = 'DPIA_REQUIRED',
  DPIA_REVIEW_REQUIRED = 'DPIA_REVIEW_REQUIRED',
  UNKNOWN = 'UNKNOWN'
}

export enum DeidentificationLevel {
  PSEUDONYMIZED = 'PSEUDONYMIZED',
  DE_IDENTIFIED = 'DE_IDENTIFIED',
  ANONYMIZED = 'ANONYMIZED'
}

export interface DPIATriggerFactors {
  has_health_or_sensitive_data: boolean;
  has_ai_or_automated_decisions: boolean;
  has_profiling: boolean;
  has_systematic_monitoring: boolean;
  is_large_scale: boolean;
  involves_vulnerable_subjects: boolean;
  has_risk_prediction_or_scoring: boolean;
  has_third_party_sharing: boolean;
  has_cross_border_transfer: boolean;
  is_novel_technology_or_processing: boolean;
  combines_disparate_datasets: boolean;
  reasons: string[];
}

export interface NecessityAssessment {
  necessity_rationale: string;
  data_minimization_evaluated: boolean;
  can_use_less_sensitive_data: boolean;
  can_process_locally_on_device: boolean;
  retention_minimized: boolean;
  alternatives_considered: string[];
}

export interface ProportionalityAssessment {
  proportionality_rationale: string;
  expected_user_benefit: string;
  intrusiveness_level: 'MINIMAL' | 'MODERATE' | 'SIGNIFICANT' | 'HIGH';
  safeguards_adequate: boolean;
  subject_expectations_met: boolean;
}

export interface ProcessingActivity {
  id: UUID;
  code: string;
  name: string;
  description: string;
  owner_domain: string;
  owner_id: string;
  version: number;
  status: ProcessingActivityState;
  data_subject_categories: DataSubjectCategory[];
  data_categories: DataCategory[];
  special_categories: string[];
  purposes: ProcessingPurpose[];
  lawful_basis: LawfulBasis[];
  consent_dependencies: Record<string, ConsentDependency>;
  sources: string[];
  recipients: string[];
  processors: string[];
  storage_locations: string[];
  processing_locations: string[];
  transfer_locations: string[];
  retention_policy_refs: string[];
  automated_processing: boolean;
  profiling: boolean;
  ai_involvement: boolean;
  clinical_relevance: boolean;
  security_classification: string;
  jurisdictions: string[];
  fingerprint: string;
  governed_resource_id?: UUID;
  supersedes_id?: UUID;
  created_at: UtcIsoTimestamp;
  updated_at: UtcIsoTimestamp;
}

export interface ProcessingActivityVersion {
  id: UUID;
  processing_activity_id: UUID;
  version: number;
  status: ProcessingActivityState;
  fingerprint: string;
  specification: Partial<ProcessingActivity>;
  is_material_change: boolean;
  material_change_summary?: string;
  supersedes_version?: number;
  created_by: string;
  created_at: UtcIsoTimestamp;
}

export interface PrivacyDataFlow {
  id: UUID;
  processing_activity_id: UUID;
  flow_code: string;
  source_system: string;
  source_domain: string;
  data_categories: DataCategory[];
  destination_system: string;
  destination_domain: string;
  recipient_type: 'INTERNAL_SERVICE' | 'SUBPROCESSOR' | 'THIRD_PARTY' | 'CLINICIAN' | 'USER';
  processor_id?: UUID;
  purpose: ProcessingPurpose;
  jurisdiction: string;
  transfer_type: 'INTERNAL' | 'DOMESTIC_THIRD_PARTY' | 'CROSS_BORDER';
  encryption_requirement: string;
  retention_policy_ref?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  created_at: UtcIsoTimestamp;
}

export interface PrivacyProcessor {
  id: UUID;
  name: string;
  processor_code: string;
  processor_type: ProcessorType;
  service: string;
  jurisdictions: string[];
  processing_locations: string[];
  data_categories: DataCategory[];
  approved_purposes: ProcessingPurpose[];
  contract_reference?: string;
  security_review_reference?: string;
  privacy_review_status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  status: 'ACTIVE' | 'DEPRECATED' | 'REVOKED';
  effective_at: UtcIsoTimestamp;
  created_at: UtcIsoTimestamp;
}

export interface ProcessorRelationship {
  id: UUID;
  parent_processor_id: UUID;
  subprocessor_id: UUID;
  role_description: string;
  approved_purposes: ProcessingPurpose[];
  status: 'ACTIVE' | 'TERMINATED';
  created_at: UtcIsoTimestamp;
}

export interface DataTransferAssessment {
  id: UUID;
  processing_activity_id: UUID;
  data_flow_id?: UUID;
  origin_jurisdiction: string;
  destination_jurisdiction: string;
  data_categories: DataCategory[];
  recipient: string;
  processor_id?: UUID;
  transfer_basis: TransferBasis;
  safeguards: string[];
  risk_status: 'LOW' | 'MODERATE' | 'HIGH' | 'PROHIBITED';
  review_status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  reviewed_by?: string;
  reviewed_at?: UtcIsoTimestamp;
  expires_at?: UtcIsoTimestamp;
  created_at: UtcIsoTimestamp;
}

export interface DPIAAssessment {
  id: UUID;
  dpia_code: string;
  processing_activity_id: UUID;
  processing_activity_version: number;
  status: DPIAState;
  trigger_factors: DPIATriggerFactors;
  scope: string;
  purpose: string;
  necessity_assessment: NecessityAssessment;
  proportionality_assessment: ProportionalityAssessment;
  risk_summary: {
    total_risks: number;
    inherent_critical: number;
    inherent_high: number;
    residual_critical: number;
    residual_high: number;
    residual_moderate: number;
    residual_low: number;
  };
  residual_risk: RiskLevel;
  requested_by: string;
  reviewer_id?: string;
  decision?: PrivacyDecision;
  decision_reason?: string;
  conditions: string[];
  submitted_at?: UtcIsoTimestamp;
  completed_at?: UtcIsoTimestamp;
  next_review_at?: UtcIsoTimestamp;
  expires_at?: UtcIsoTimestamp;
  created_at: UtcIsoTimestamp;
  updated_at: UtcIsoTimestamp;
}

export interface PrivacyRisk {
  id: UUID;
  dpia_id: UUID;
  risk_code: string;
  threat_event: string;
  risk_dimension: string;
  affected_data: DataCategory[];
  affected_subjects: DataSubjectCategory[];
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  inherent_risk: RiskLevel;
  residual_likelihood: RiskLikelihood;
  residual_impact: RiskImpact;
  residual_risk: RiskLevel;
  status: 'IDENTIFIED' | 'TREATED' | 'ACCEPTED' | 'ESCALATED';
  owner: string;
  created_at: UtcIsoTimestamp;
}

export interface PrivacyControl {
  id: UUID;
  code: string;
  name: string;
  description: string;
  control_type: ControlType;
  owner_domain: string;
  implementation_reference?: string;
  status: 'IMPLEMENTED' | 'PLANNED' | 'DEPRECATED';
  evidence_requirement?: string;
  created_at: UtcIsoTimestamp;
}

export interface PrivacyRiskControl {
  id: UUID;
  risk_id: UUID;
  control_id: UUID;
  effectiveness: ControlEffectiveness;
  evidence_id?: string;
  assessment?: string;
  created_at: UtcIsoTimestamp;
}

export interface PrivacyRemediation {
  id: UUID;
  dpia_id: UUID;
  risk_id?: UUID;
  action: string;
  owner: string;
  status: RemediationStatus;
  due_at: UtcIsoTimestamp;
  evidence_required: boolean;
  evidence_id?: string;
  completed_at?: UtcIsoTimestamp;
  verified_by?: string;
  created_at: UtcIsoTimestamp;
}

export interface PrivacyApproval {
  id: UUID;
  processing_activity_id: UUID;
  processing_activity_version: number;
  dpia_id: UUID;
  dpia_version: number;
  fingerprint: string;
  reviewer_id: string;
  reviewer_role: string;
  decision: PrivacyDecision;
  conditions: string[];
  policy_version: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'SUPERSEDED';
  approved_at: UtcIsoTimestamp;
  expires_at: UtcIsoTimestamp;
  revoked_at?: UtcIsoTimestamp;
  revoked_by?: string;
  revocation_reason?: string;
  evidence_vault_id?: string;
  created_at: UtcIsoTimestamp;
}

export interface PrivacyRetentionLink {
  id: UUID;
  processing_activity_id: UUID;
  data_category: DataCategory;
  purpose: ProcessingPurpose;
  retention_policy_code: string;
  action: 'ANONYMIZE' | 'DELETE' | 'ARCHIVE' | 'RETAIN_REQUIRED';
  retention_period_days: number;
  conflict_resolution_rule?: string;
  created_at: UtcIsoTimestamp;
}

export interface RegisterProcessingActivityInput {
  code: string;
  name: string;
  description: string;
  owner_domain: string;
  owner_id: string;
  data_subject_categories: DataSubjectCategory[];
  data_categories: DataCategory[];
  special_categories?: string[];
  purposes: ProcessingPurpose[];
  lawful_basis: LawfulBasis[];
  consent_dependencies?: Record<string, ConsentDependency>;
  sources?: string[];
  recipients?: string[];
  processors?: string[];
  storage_locations?: string[];
  processing_locations?: string[];
  transfer_locations?: string[];
  retention_policy_refs?: string[];
  automated_processing?: boolean;
  profiling?: boolean;
  ai_involvement?: boolean;
  clinical_relevance?: boolean;
  security_classification?: string;
  jurisdictions?: string[];
  governed_resource_id?: UUID;
}

export interface SubmitDPIAInput {
  scope: string;
  purpose: string;
  necessity_assessment: NecessityAssessment;
  proportionality_assessment: ProportionalityAssessment;
  risks: Array<{
    risk_code: string;
    threat_event: string;
    risk_dimension: string;
    affected_data: DataCategory[];
    affected_subjects: DataSubjectCategory[];
    likelihood: RiskLikelihood;
    impact: RiskImpact;
    controls: Array<{
      control_code: string;
      effectiveness: ControlEffectiveness;
      evidence_id?: string;
      assessment?: string;
    }>;
    residual_likelihood?: RiskLikelihood;
    residual_impact?: RiskImpact;
    owner: string;
  }>;
  remediations?: Array<{
    action: string;
    owner: string;
    due_at: UtcIsoTimestamp;
    evidence_required?: boolean;
    risk_code?: string;
  }>;
  requested_by: string;
}

export interface EvaluateReleaseGateInput {
  processing_activity_code: string;
  version?: number;
  data_categories: DataCategory[];
  purpose: ProcessingPurpose;
  processor_codes?: string[];
  jurisdiction?: string;
  actor_id?: string;
}

export interface PrivacyAuditReport {
  activity_code: string;
  activity_name: string;
  query_date: UtcIsoTimestamp;
  is_permitted: boolean;
  status: ProcessingActivityState;
  version: number;
  approval_details?: {
    approved_at: UtcIsoTimestamp;
    expires_at: UtcIsoTimestamp;
    reviewer_id: string;
    reviewer_role: string;
    decision: PrivacyDecision;
    conditions: string[];
    evidence_vault_id?: string;
  };
  dpia_details?: {
    dpia_code: string;
    status: DPIAState;
    residual_risk: RiskLevel;
    trigger_factors: DPIATriggerFactors;
  };
  lawful_basis: LawfulBasis[];
  purposes: ProcessingPurpose[];
  data_categories: DataCategory[];
  reasons: string[];
}
