/**
 * MindOS AI Safety Governance Canonical Domain Types
 * Authority: Master Architecture Index Section 7, Volumes I, III, IV, XV & Appendices B / C / H / Q
 * Sprint 13: AI System Registry, Model/Prompt Governance, Safety Evaluations,
 *            Red-Team Controls, Human Oversight & AI Release Authorization
 */

import { AISystemState, GovernanceDecision } from '../../platform/shared/state_machines.js';

export { AISystemState, GovernanceDecision };

/**
 * Canonical AI Risk Classification (Appendix C & Vol IV Section 3)
 */
export type AIRiskClass = 'AI-R0' | 'AI-R1' | 'AI-R2' | 'AI-R3' | 'AI-R4';

export enum AISystemType {
  CONVERSATIONAL_SUPPORT = 'CONVERSATIONAL_SUPPORT',
  CONTENT_RECOMMENDATION = 'CONTENT_RECOMMENDATION',
  CARE_NAVIGATION = 'CARE_NAVIGATION',
  ASSESSMENT_ASSISTANCE = 'ASSESSMENT_ASSISTANCE',
  RISK_SIGNALING = 'RISK_SIGNALING',
  PROFESSIONAL_ASSISTANCE = 'PROFESSIONAL_ASSISTANCE',
  MODERATION_ASSISTANCE = 'MODERATION_ASSISTANCE',
  SUMMARIZATION = 'SUMMARIZATION',
  CLASSIFICATION = 'CLASSIFICATION',
  GOVERNANCE_ASSISTANCE = 'GOVERNANCE_ASSISTANCE',
  SEARCH_RETRIEVAL = 'SEARCH_RETRIEVAL'
}

export enum AIModelStatus {
  CANDIDATE = 'CANDIDATE',
  EVALUATING = 'EVALUATING',
  APPROVED = 'APPROVED',
  RESTRICTED = 'RESTRICTED',
  SUSPENDED = 'SUSPENDED',
  REVOKED = 'REVOKED',
  RETIRED = 'RETIRED'
}

export enum PromptType {
  SYSTEM = 'SYSTEM',
  POLICY = 'POLICY',
  SAFETY = 'SAFETY',
  CLINICAL_BOUNDARY = 'CLINICAL_BOUNDARY',
  TOOL_USE = 'TOOL_USE',
  RETRIEVAL = 'RETRIEVAL',
  CLASSIFICATION = 'CLASSIFICATION',
  OUTPUT_FORMAT = 'OUTPUT_FORMAT'
}

export enum AIToolCategory {
  READ_ONLY = 'READ_ONLY',
  INTERNAL_STATE_MUTATION = 'INTERNAL_STATE_MUTATION',
  EXTERNAL_SIDE_EFFECT = 'EXTERNAL_SIDE_EFFECT',
  HIGH_RISK_ACTION = 'HIGH_RISK_ACTION'
}

export enum EvaluationType {
  FUNCTIONAL = 'FUNCTIONAL',
  QUALITY = 'QUALITY',
  SAFETY = 'SAFETY',
  CLINICAL_BOUNDARY = 'CLINICAL_BOUNDARY',
  CRISIS = 'CRISIS',
  PRIVACY = 'PRIVACY',
  SECURITY = 'SECURITY',
  BIAS_FAIRNESS = 'BIAS_FAIRNESS',
  ROBUSTNESS = 'ROBUSTNESS',
  TOOL_USE = 'TOOL_USE',
  HALLUCINATION_GROUNDING = 'HALLUCINATION_GROUNDING',
  REFUSAL = 'REFUSAL',
  OVERRELIANCE = 'OVERRELIANCE',
  RED_TEAM = 'RED_TEAM',
  HUMAN_EVALUATION = 'HUMAN_EVALUATION',
  REGRESSION = 'REGRESSION'
}

export enum EvaluationDecision {
  PASS = 'PASS',
  CONDITIONAL_PASS = 'CONDITIONAL_PASS',
  FAIL = 'FAIL',
  INCONCLUSIVE = 'INCONCLUSIVE'
}

export enum AdversarialCategory {
  PROMPT_INJECTION = 'PROMPT_INJECTION',
  POLICY_OVERRIDE = 'POLICY_OVERRIDE',
  ROLEPLAY_BYPASS = 'ROLEPLAY_BYPASS',
  CLINICAL_BOUNDARY_BYPASS = 'CLINICAL_BOUNDARY_BYPASS',
  CRISIS_MANIPULATION = 'CRISIS_MANIPULATION',
  DEPENDENCY_ENCOURAGEMENT = 'DEPENDENCY_ENCOURAGEMENT',
  PRIVACY_EXTRACTION = 'PRIVACY_EXTRACTION',
  MEMORY_EXTRACTION = 'MEMORY_EXTRACTION',
  TOOL_ABUSE = 'TOOL_ABUSE',
  CROSS_USER_DATA_ACCESS = 'CROSS_USER_DATA_ACCESS',
  SYSTEM_PROMPT_EXTRACTION = 'SYSTEM_PROMPT_EXTRACTION',
  UNSAFE_PROFESSIONAL_IMPERSONATION = 'UNSAFE_PROFESSIONAL_IMPERSONATION',
  MODEL_HALLUCINATION_PRESSURE = 'MODEL_HALLUCINATION_PRESSURE',
  CONFLICTING_INSTRUCTION_HIERARCHY = 'CONFLICTING_INSTRUCTION_HIERARCHY'
}

export enum AIIncidentType {
  UNSAFE_OUTPUT = 'UNSAFE_OUTPUT',
  CLINICAL_BOUNDARY_VIOLATION = 'CLINICAL_BOUNDARY_VIOLATION',
  PRIVACY_DISCLOSURE = 'PRIVACY_DISCLOSURE',
  TOOL_MISUSE = 'TOOL_MISUSE',
  PROMPT_INJECTION = 'PROMPT_INJECTION',
  HALLUCINATION = 'HALLUCINATION',
  MODEL_DRIFT = 'MODEL_DRIFT',
  PROVIDER_DRIFT = 'PROVIDER_DRIFT',
  EVALUATION_REGRESSION = 'EVALUATION_REGRESSION',
  POLICY_BYPASS = 'POLICY_BYPASS'
}

export enum AIIncidentState {
  OPEN = 'OPEN',
  TRIAGED = 'TRIAGED',
  INVESTIGATING = 'INVESTIGATING',
  MITIGATING = 'MITIGATING',
  MONITORING = 'MONITORING',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED'
}

export enum AIReleaseAction {
  NONE = 'NONE',
  THROTTLE = 'THROTTLE',
  DISABLE_TOOLS = 'DISABLE_TOOLS',
  SUSPEND_SYSTEM = 'SUSPEND_SYSTEM',
  REVOKE_APPROVAL = 'REVOKE_APPROVAL'
}

export enum ReviewDecision {
  APPROVE = 'APPROVE',
  CONDITIONAL_APPROVE = 'CONDITIONAL_APPROVE',
  REJECT = 'REJECT',
  MORE_INFORMATION_REQUIRED = 'MORE_INFORMATION_REQUIRED'
}

export enum ReviewerRole {
  AI_SAFETY_REVIEWER = 'AI_SAFETY_REVIEWER',
  AI_GOVERNANCE_LEAD = 'AI_GOVERNANCE_LEAD',
  SECURITY_REVIEWER = 'SECURITY_REVIEWER',
  CLINICAL_REVIEWER = 'CLINICAL_REVIEWER',
  PRIVACY_OFFICER = 'PRIVACY_OFFICER'
}

export type MaterialityLevel = 'NON_MATERIAL' | 'MATERIAL' | 'CRITICAL';

export interface AISystemEntity {
  id: string; // UUIDv7
  code: string;
  name: string;
  description: string;
  system_type: AISystemType;
  owner_domain: string;
  owner: string;
  purpose: string;
  user_population: string[];
  jurisdictions: string[];
  risk_class: AIRiskClass;
  state: AISystemState;
  clinical_relevance: boolean;
  safety_relevance: boolean;
  data_categories: string[];
  current_configuration_version?: string;
  created_at: string;
  updated_at: string;
  supersedes_id?: string;
}

export interface AIModelEntity {
  id: string; // UUIDv7
  provider_id: string; // references privacy_processors(id)
  model_code: string;
  provider_model_identifier: string; // e.g., 'gemini-1.5-pro-002'
  version: string;
  model_family: string;
  capabilities: string[];
  limitations: string[];
  context_window: number;
  tool_support: boolean;
  structured_output_support: boolean;
  deployment_region: string;
  status: AIModelStatus;
  first_approved_at?: string;
  retired_at?: string;
  metadata: Record<string, unknown>;
}

export interface PromptArtifactEntity {
  id: string;
  prompt_code: string;
  ai_system_id: string;
  name: string;
  description?: string;
  prompt_type: PromptType;
  clinical_classification: string;
  safety_classification: string;
  owner_id: string;
  status: 'ACTIVE' | 'ARCHIVED';
  created_at: string;
  updated_at: string;
}

export interface PromptVersionEntity {
  id: string;
  prompt_id: string;
  prompt_code: string;
  version: number;
  content_text: string;
  content_hash: string; // SHA-256
  status: 'DRAFT' | 'APPROVED' | 'SUPERSEDED' | 'RETIRED';
  created_by: string;
  created_at: string;
  approved_at?: string;
  supersedes_id?: string;
}

export interface AIToolEntity {
  id: string;
  code: string;
  name: string;
  description: string;
  capability: string;
  risk_class: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: AIToolCategory;
  required_authorization: string[];
  required_purpose: string;
  required_consent: string[];
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  side_effect_type: string;
  status: 'ACTIVE' | 'RESTRICTED' | 'DEPRECATED';
  version: string;
  created_at: string;
  updated_at: string;
}

export interface AIDataAccessPolicyEntity {
  id: string;
  ai_system_id: string;
  version: number;
  allowed_data_categories: string[];
  prohibited_data_categories: string[];
  purpose: string;
  maximum_scope: string;
  consent_requirements: string[];
  relationship_requirements: string[];
  retention_behavior: string;
  provider_transfer_policy: string;
  status: 'ACTIVE' | 'SUPERSEDED';
  created_at: string;
}

export interface AIMemoryPolicyEntity {
  id: string;
  ai_system_id: string;
  version: number;
  memory_enabled: boolean;
  allowed_memory_categories: string[];
  prohibited_memory_categories: string[];
  write_conditions: string[];
  read_conditions: string[];
  consent_requirement: string; // 'AI_MEMORY'
  retention_policy: string;
  user_visibility: boolean;
  user_editability: boolean;
  user_deletion_behavior: string;
  status: 'ACTIVE' | 'SUPERSEDED';
  created_at: string;
}

export interface AIOutputPolicyEntity {
  id: string;
  ai_system_id: string;
  version: number;
  allowed_output_classes: string[];
  prohibited_output_classes: string[];
  required_disclaimers: string[];
  clinical_claim_boundaries: string[];
  safety_response_requirements: string[];
  professional_referral_rules: string[];
  status: 'ACTIVE' | 'SUPERSEDED';
  created_at: string;
}

export interface AISafetyPolicyRule {
  rule_id: string;
  condition: string;
  action: 'REFUSE' | 'REDIRECT' | 'ESCALATE' | 'DISCLAIM';
  template_reference?: string;
}

export interface AISafetyPolicyEntity {
  id: string;
  ai_system_id: string;
  version: number;
  policy_category: string;
  rule_set: AISafetyPolicyRule[];
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  required_behavior: string[];
  prohibited_behavior: string[];
  fallback_behavior: string;
  escalation_reference: string;
  status: 'ACTIVE' | 'SUPERSEDED';
  created_at: string;
}

export interface AIConfigurationEntity {
  id: string; // UUIDv7
  ai_system_id: string;
  version: string;
  provider_id: string;
  model_id: string;
  model_version: string;
  prompt_versions: Record<string, number>; // { prompt_code: version }
  prompt_hashes: Record<string, string>; // { prompt_code: sha256_hash }
  toolset_codes: string[];
  toolset_version: string;
  data_access_policy_version: number;
  memory_policy_version: number;
  safety_policy_version: number;
  output_policy_version: number;
  sampling_controls: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  };
  jurisdiction: string;
  population: string;
  status: 'DRAFT' | 'EVALUATING' | 'APPROVED' | 'ACTIVE' | 'SUPERSEDED' | 'REVOKED';
  configuration_hash: string; // deterministic SHA-256 fingerprint
  created_at: string;
  supersedes_id?: string;
}

export interface AIEvaluationDatasetEntity {
  id: string;
  code: string;
  name: string;
  version: string;
  purpose: string;
  scenario_categories: string[];
  data_source_type: 'SYNTHETIC' | 'REAL_DEIDENTIFIED';
  synthetic_or_real: 'SYNTHETIC' | 'REAL_DEIDENTIFIED';
  classification: string;
  population_coverage: string[];
  jurisdiction: string;
  consent_privacy_reference?: string;
  test_cases_count: number;
  status: 'ACTIVE' | 'ARCHIVED';
  created_at: string;
}

export interface AIEvaluationSuiteEntity {
  id: string;
  code: string;
  name: string;
  version: string;
  evaluation_type: EvaluationType;
  dataset_id: string;
  threshold_policy_id: string;
  critical_failure_tolerance: number; // default 0 for safety/clinical/crisis
  status: 'ACTIVE' | 'DEPRECATED';
  created_at: string;
}

export interface CriticalFailureItem {
  test_id: string;
  scenario: string;
  violation: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface AIEvaluationRunEntity {
  id: string;
  ai_system_id: string;
  configuration_version: string;
  configuration_hash: string;
  evaluation_type: EvaluationType;
  evaluation_suite_version: string;
  dataset_version: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  started_at: string;
  completed_at?: string;
  metrics: Record<string, number>;
  critical_failures: CriticalFailureItem[];
  threshold_policy_version: string;
  decision: EvaluationDecision;
  evidence_id?: string;
  evidence_hash?: string;
}

export interface AIRedTeamFindingEntity {
  id: string;
  campaign_id: string;
  category: AdversarialCategory | string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  scenario_description: string;
  reproduction_steps: string;
  affected_policy: string;
  status: 'OPEN' | 'IN_REMEDIATION' | 'VERIFIED_RESOLVED' | 'ACCEPTED_RISK';
  remediation_notes?: string;
  created_at: string;
  resolved_at?: string;
}

export interface AIRedTeamCampaignEntity {
  id: string;
  ai_system_id: string;
  configuration_version: string;
  configuration_hash: string;
  name: string;
  scope: string[];
  scenario_categories: string[];
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';
  owner: string;
  reviewers: string[];
  started_at: string;
  completed_at?: string;
  findings_summary: {
    total_findings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    open_findings: number;
  };
  decision: 'PASSED' | 'FAILED' | 'REMEDIATION_REQUIRED' | 'PENDING';
  evidence_id?: string;
  created_at: string;
}

export interface ReviewCondition {
  id: string;
  condition_code: string;
  description: string;
  machine_enforceable: boolean;
}

export interface AISafetyReviewEntity {
  id: string;
  ai_system_id: string;
  configuration_version: string;
  configuration_hash: string;
  governance_case_id?: string;
  reviewer_id: string;
  reviewer_role: ReviewerRole;
  risk_assessment: Record<string, unknown>;
  evaluation_assessment: Record<string, unknown>;
  red_team_assessment: Record<string, unknown>;
  clinical_boundary_assessment: Record<string, unknown>;
  privacy_assessment: Record<string, unknown>;
  tool_assessment: Record<string, unknown>;
  decision: ReviewDecision;
  decision_reason: string;
  conditions: ReviewCondition[];
  policy_version: string;
  started_at: string;
  completed_at?: string;
}

export interface AIApprovalEntity {
  id: string;
  ai_system_id: string;
  configuration_version: string;
  configuration_hash: string;
  provider_id: string;
  model_version: string;
  prompt_versions: Record<string, number>;
  toolset_version: string;
  data_access_policy_version: number;
  memory_policy_version: number;
  safety_policy_version: number;
  evaluation_suite_ids: string[];
  dataset_versions: Record<string, string>;
  red_team_campaign_ids: string[];
  jurisdiction: string;
  population: string;
  conditions: ReviewCondition[];
  reviewer_id: string;
  approved_at: string;
  expires_at: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'SUPERSEDED';
  revoked_at?: string;
  revocation_reason?: string;
  revoked_by?: string;
}

export interface AIIncidentEntity {
  id: string;
  ai_system_id: string;
  configuration_version: string;
  incident_type: AIIncidentType | string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  source: string;
  description_reference: string;
  detected_at: string;
  status: AIIncidentState;
  owner: string;
  safety_impact: string;
  clinical_impact: string;
  privacy_impact: string;
  security_impact: string;
  regulatory_impact: string;
  release_action: AIReleaseAction;
  resolved_at?: string;
}
