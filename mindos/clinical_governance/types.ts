/**
 * MindOS Clinical Governance Bounded Context Types
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 10: Clinical Governance Engine, Clinical Artifact Lifecycle, Evidence Management,
 *            Review Workflows & Clinical Release Authorization
 */

import { ClinicalArtifactState, GovernanceDecision } from '../platform/shared/state_machines.js';
import { DataClassification } from '../platform/shared/data_classification.js';
import { ClinicalRiskClass } from '../governance/types.js';

export { ClinicalArtifactState, GovernanceDecision };
export type { ClinicalRiskClass };

export enum ClinicalArtifactType {
  ASSESSMENT = 'ASSESSMENT',
  SCREENING_TOOL = 'SCREENING_TOOL',
  QUESTIONNAIRE = 'QUESTIONNAIRE',
  SCORING_ALGORITHM = 'SCORING_ALGORITHM',
  PSYCHOEDUCATIONAL_CONTENT = 'PSYCHOEDUCATIONAL_CONTENT',
  GUIDED_EXERCISE = 'GUIDED_EXERCISE',
  SELF_HELP_INTERVENTION = 'SELF_HELP_INTERVENTION',
  AI_CLINICAL_BEHAVIOR = 'AI_CLINICAL_BEHAVIOR',
  AI_SAFETY_BEHAVIOR = 'AI_SAFETY_BEHAVIOR',
  AI_RECOMMENDATION_POLICY = 'AI_RECOMMENDATION_POLICY',
  RISK_DETECTION_POLICY = 'RISK_DETECTION_POLICY',
  CRISIS_GUIDANCE = 'CRISIS_GUIDANCE',
  ESCALATION_POLICY = 'ESCALATION_POLICY',
  CARE_PATHWAY = 'CARE_PATHWAY',
  PROFESSIONAL_WORKFLOW = 'PROFESSIONAL_WORKFLOW',
  CLINICAL_DECISION_SUPPORT = 'CLINICAL_DECISION_SUPPORT',
  CLINICAL_COPY = 'CLINICAL_COPY',
  CLINICAL_NOTIFICATION = 'CLINICAL_NOTIFICATION',
  CRISIS_ESCALATION_PROTOCOL = 'CRISIS_ESCALATION_PROTOCOL',
  INTERVENTION_PROTOCOL = 'INTERVENTION_PROTOCOL',
  AI_CLINICAL_PROMPT = 'AI_CLINICAL_PROMPT'
}

export enum ClinicalRiskLevel {
  MINIMAL = 'MINIMAL',
  LOW = 'LOW',
  MODERATE = 'MODERATE',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum ClinicalClaimType {
  DESCRIPTIVE = 'DESCRIPTIVE',
  EDUCATIONAL = 'EDUCATIONAL',
  SCREENING = 'SCREENING',
  PREDICTIVE = 'PREDICTIVE',
  INTERVENTION = 'INTERVENTION',
  CLINICAL_EFFECTIVENESS = 'CLINICAL_EFFECTIVENESS',
  SAFETY = 'SAFETY',
  PERFORMANCE = 'PERFORMANCE',
  THERAPEUTIC_EFFICACY = 'THERAPEUTIC_EFFICACY',
  INFORMATIONAL_EDUCATIONAL = 'INFORMATIONAL_EDUCATIONAL',
  DIAGNOSTIC_ACCURACY = 'DIAGNOSTIC_ACCURACY',
  SYMPTOM_REDUCTION = 'SYMPTOM_REDUCTION'
}

export enum ClinicalClaimStrength {
  INFORMATIONAL = 'INFORMATIONAL',
  SUPPORTED = 'SUPPORTED',
  VALIDATED = 'VALIDATED',
  HIGH_CONFIDENCE = 'HIGH_CONFIDENCE',
  STRONG = 'STRONG',
  MODERATE = 'MODERATE'
}

export enum ClinicalEvidenceType {
  PEER_REVIEWED_STUDY = 'PEER_REVIEWED_STUDY',
  SYSTEMATIC_REVIEW = 'SYSTEMATIC_REVIEW',
  META_ANALYSIS = 'META_ANALYSIS',
  CLINICAL_GUIDELINE = 'CLINICAL_GUIDELINE',
  VALIDATION_STUDY = 'VALIDATION_STUDY',
  SAFETY_STUDY = 'SAFETY_STUDY',
  PROFESSIONAL_STANDARD = 'PROFESSIONAL_STANDARD',
  REGULATORY_GUIDANCE = 'REGULATORY_GUIDANCE',
  LOCAL_CLINICAL_GUIDANCE = 'LOCAL_CLINICAL_GUIDANCE',
  INTERNAL_VALIDATION = 'INTERNAL_VALIDATION',
  EXPERT_REVIEW = 'EXPERT_REVIEW',
  RANDOMIZED_CONTROLLED_TRIAL = 'RANDOMIZED_CONTROLLED_TRIAL',
  CLINICAL_PRACTICE_GUIDELINE = 'CLINICAL_PRACTICE_GUIDELINE',
  CASE_SERIES = 'CASE_SERIES',
  EXPERT_OPINION = 'EXPERT_OPINION'
}

export enum ClinicalEvidenceQuality {
  LOW = 'LOW',
  MODERATE = 'MODERATE',
  HIGH = 'HIGH',
  SYSTEMATIC_RIGOR = 'SYSTEMATIC_RIGOR',
  HIGH_QUALITY = 'HIGH_QUALITY',
  CRITICAL_RISK_OF_BIAS = 'CRITICAL_RISK_OF_BIAS'
}

export enum EvidenceRelationshipType {
  SUPPORTS = 'SUPPORTS',
  CONTRADICTS = 'CONTRADICTS',
  LIMITS = 'LIMITS'
}

export enum EvidenceSupportStrength {
  PRELIMINARY = 'PRELIMINARY',
  MODERATE = 'MODERATE',
  STRONG = 'STRONG',
  DEFINITIVE = 'DEFINITIVE'
}

export enum EvidenceAdequacyResult {
  ADEQUATE = 'ADEQUATE',
  PARTIALLY_ADEQUATE = 'PARTIALLY_ADEQUATE',
  INADEQUATE = 'INADEQUATE',
  UNKNOWN = 'UNKNOWN'
}

export enum ClinicalReviewLevel {
  STANDARD_CLINICAL_REVIEW = 'STANDARD_CLINICAL_REVIEW',
  ENHANCED_CLINICAL_REVIEW = 'ENHANCED_CLINICAL_REVIEW',
  MULTI_REVIEWER = 'MULTI_REVIEWER',
  SPECIALIST_REVIEW = 'SPECIALIST_REVIEW'
}

export enum ClinicalReviewerSpecialty {
  PSYCHIATRY = 'PSYCHIATRY',
  CLINICAL_PSYCHOLOGY = 'CLINICAL_PSYCHOLOGY',
  COUNSELLING_PSYCHOLOGY = 'COUNSELLING_PSYCHOLOGY',
  GENERAL_MENTAL_HEALTH = 'GENERAL_MENTAL_HEALTH',
  EMERGENCY_CRISIS_CARE = 'EMERGENCY_CRISIS_CARE',
  GENERAL_PRACTICE = 'GENERAL_PRACTICE'
}

export enum ClinicalReviewDecision {
  APPROVE = 'APPROVE',
  CONDITIONAL_APPROVE = 'CONDITIONAL_APPROVE',
  REJECT = 'REJECT',
  MORE_INFORMATION_REQUIRED = 'MORE_INFORMATION_REQUIRED'
}

export enum ClinicalConditionType {
  POPULATION_RESTRICTION = 'POPULATION_RESTRICTION',
  JURISDICTION_RESTRICTION = 'JURISDICTION_RESTRICTION',
  RISK_STATE_RESTRICTION = 'RISK_STATE_RESTRICTION',
  REQUIRED_DISCLAIMER = 'REQUIRED_DISCLAIMER',
  PROFESSIONAL_INVOLVEMENT = 'PROFESSIONAL_INVOLVEMENT',
  FEATURE_CONFIGURATION = 'FEATURE_CONFIGURATION'
}

export interface IntendedPopulationDefinition {
  minAge?: number;
  maxAge?: number;
  characteristics?: string[];
  geographicScope?: string[];
  eligibilityRestrictions?: string[];
}

export interface ExcludedPopulationDefinition {
  minorsExcluded?: boolean;
  activeSuicidalityExcluded?: boolean;
  acutePsychosisExcluded?: boolean;
  emergencyCrisisExcluded?: boolean;
  otherExclusions?: string[];
}

export interface ClinicalRiskClassificationFactors extends Array<string> {
  clinical_interpretation_involved?: boolean;
  symptom_screening?: boolean;
  diagnosis_like_output?: boolean;
  treatment_recommendation?: boolean;
  risk_of_harm_consequence?: 'NONE' | 'LOW' | 'MODERATE' | 'SEVERE' | 'CATASTROPHIC';
  crisis_involvement?: boolean;
  vulnerable_population?: boolean;
  professional_decision_influence?: 'INFORMATIONAL' | 'DECISION_SUPPORT' | 'CRITICAL_TRIAGE';
  automated_scoring?: boolean;
  ai_involvement?: boolean;
  user_reliance_risk?: 'LOW' | 'MEDIUM' | 'HIGH';
  care_delay_risk?: boolean;
  reasons?: string[];
  [key: string]: any;
}

export interface ClinicalArtifact {
  id: string; // UUIDv7
  artifact_code: string;
  artifact_type: ClinicalArtifactType;
  name: string;
  description: string;
  owner_domain: string;
  owner_id: string;
  version: number;
  status: ClinicalArtifactState;
  intended_use: string;
  intended_population: IntendedPopulationDefinition;
  excluded_population: ExcludedPopulationDefinition;
  clinical_risk_class: ClinicalRiskClass;
  risk_factors: ClinicalRiskClassificationFactors;
  jurisdiction_scope: string[];
  data_classification: DataClassification;
  clinical_claim_level: ClinicalClaimStrength;
  governed_resource_id?: string;
  supersedes_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ClinicalArtifactVersion {
  id: string;
  artifact_id: string;
  version: number;
  status: ClinicalArtifactState;
  content_hash: string;
  specification: Record<string, unknown>;
  intended_use: string;
  intended_population: IntendedPopulationDefinition;
  excluded_population: ExcludedPopulationDefinition;
  clinical_risk_class: ClinicalRiskClass;
  risk_factors: ClinicalRiskClassificationFactors;
  material_change_summary?: string;
  is_material_change: boolean;
  supersedes_version?: number;
  created_by: string;
  created_at: string;
}

export interface ClinicalClaim {
  id: string;
  artifact_id: string;
  artifact_version: number;
  claim_code: string;
  claim_text: string;
  claim_type: ClinicalClaimType;
  strength: ClinicalClaimStrength;
  intended_population?: string;
  context?: string;
  status: 'ACTIVE' | 'SUPERSEDED' | 'RETRACTED' | 'INVALIDATED';
  supersedes_id?: string;
  created_at: string;
}

export interface ClinicalEvidenceMetadata {
  id: string;
  evidence_record_id?: string; // Reference to Sprint 7 Evidence Vault
  evidence_type: ClinicalEvidenceType;
  title: string;
  source?: string;
  citation?: string;
  publication_date?: string;
  population?: string;
  methodology?: string;
  sample_size?: number;
  outcomes?: string;
  evidence_quality?: ClinicalEvidenceQuality;
  quality_rating?: ClinicalEvidenceQuality;
  oxford_level?: string;
  is_retracted?: boolean;
  doi?: string;
  peer_reviewed?: boolean;
  publication_status?: string;
  registered_by?: string;
  quality_factors?: {
    study_design?: string;
    sample_size_adequate?: boolean;
    population_relevance?: string;
    recency_years?: number;
    replicated?: boolean;
    peer_reviewed?: boolean;
    bias_risk?: 'LOW' | 'MODERATE' | 'HIGH';
    directness?: 'DIRECT' | 'INDIRECT';
    jurisdiction_applicability?: string[];
  };
  relevance?: 'DIRECT' | 'INDIRECT' | 'ANCILLARY';
  jurisdiction_applicability?: string[];
  status: 'ACTIVE' | 'SUPERSEDED' | 'RETRACTED' | 'INVALIDATED';
  reviewed_at?: string;
  next_review_at?: string;
  created_at: string;
}

export interface ClinicalClaimEvidenceLink {
  id: string;
  claim_id: string;
  evidence_id: string;
  relationship_type: EvidenceRelationshipType;
  support_strength: EvidenceSupportStrength;
  limitations?: string;
  created_at: string;
}

export interface ClinicalContraindication {
  id: string;
  artifact_id: string;
  artifact_version: number;
  condition_type: string;
  population: string;
  trigger: string;
  severity: 'MODERATE' | 'HIGH' | 'CRITICAL' | 'ABSOLUTE';
  required_behavior: 'BLOCK_AND_ESCALATE' | 'REDIRECT_TO_EMERGENCY' | 'DISPLAY_WARNING_AND_REQUIRE_OVERRIDE' | 'INHIBIT_AI_RECOMMENDATION';
  user_message_reference?: string;
  status: 'ACTIVE' | 'SUPERSEDED' | 'RETIRED';
  effective_at: string;
}

export interface ClinicalCondition {
  type: ClinicalConditionType;
  description: string;
  parameters: Record<string, unknown>;
  enforceable: boolean;
}

export interface ClinicalReviewChecklist {
  intended_use_appropriate: boolean;
  population_defined: boolean;
  claims_supported: boolean;
  evidence_adequate: boolean;
  limitations_disclosed: boolean;
  contraindications_defined: boolean;
  safety_implications_reviewed: boolean;
  language_clinically_appropriate: boolean;
  user_misinterpretation_risk_mitigated: boolean;
  risk_escalation_implications_reviewed: boolean;
  monitoring_requirements_established: boolean;
  comments?: Record<string, string>;
}

export interface ClinicalReview {
  id: string;
  artifact_id: string;
  artifact_version: number;
  governance_case_id?: string;
  governance_review_id?: string;
  reviewer_id: string;
  review_level: ClinicalReviewLevel;
  required_specialty?: ClinicalReviewerSpecialty;
  status: 'ASSIGNED' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'DECLINED';
  decision?: ClinicalReviewDecision;
  checklist: ClinicalReviewChecklist;
  evidence_assessment: {
    adequacy: EvidenceAdequacyResult;
    quality: ClinicalEvidenceQuality;
    contradictions_noted: boolean;
    notes?: string;
  };
  risk_assessment: {
    verified_class: ClinicalRiskClass;
    concurrence_with_classifier: boolean;
    mitigations_required?: string[];
  };
  claim_assessment: {
    supported_claims: string[];
    unsupported_claims: string[];
  };
  limitations_assessment: {
    adequate_disclosure: boolean;
    required_additions?: string[];
  };
  decision_reason?: string;
  conditions: ClinicalCondition[];
  policy_version: string;
  started_at: string;
  completed_at?: string;
}

export interface ClinicalApprovalRecord {
  id: string;
  artifact_id: string;
  artifact_code?: string;
  artifact_version?: number;
  version?: number;
  approval_code: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED' | 'SUPERSEDED';
  review_ids: string[];
  approver_ids: string[];
  approvers?: string[];
  risk_class?: string;
  evidence_ids?: string[];
  claim_ids?: string[];
  conditions?: ClinicalCondition[] | any[];
  policy_version?: string;
  approved_at: string;
  expires_at: string;
  evidence_hash?: string;
  decision?: ClinicalReviewDecision;
  suspended_at?: string;
  suspension_reason?: string;
  revoked_at?: string;
  revocation_reason?: string;
  governance_release_authorized?: boolean;
  created_at?: string;
}

export interface ClinicalReconciliationIssue {
  artifact_id: string;
  artifact_code: string;
  version: number;
  issue_type: 'EXPIRED_APPROVAL' | 'SUSPENDED_APPROVAL' | 'REVOKED_APPROVAL' | 'INVALIDATED_EVIDENCE' | 'UNSUPPORTED_CLAIMS' | 'VERSION_DRIFT' | 'MISSING_MANDATED_REVIEWS';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  details: string;
}

export interface ClinicalReconciliationReport {
  timestamp: string;
  total_artifacts: number;
  active_approved_artifacts: number;
  issues_found: number;
  issues: ClinicalReconciliationIssue[];
}

export interface ClinicalGovernanceMetrics {
  clinical_artifacts_total: number;
  clinical_artifacts_by_risk: Record<ClinicalRiskClass, number>;
  clinical_reviews_pending: number;
  clinical_reviews_overdue: number;
  clinical_approvals_total: number;
  clinical_rejections_total: number;
  clinical_approvals_expiring: number;
  clinical_suspensions_total: number;
  clinical_revocations_total: number;
  clinical_evidence_invalidations_total: number;
  unsupported_claims_total: number;
}
