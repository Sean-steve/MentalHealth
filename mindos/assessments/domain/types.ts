/**
 * MindOS Assessments Bounded Context - Domain Types & Enums
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 15: Assessment Registry, Instrument Versioning, Session Execution,
 *            Scoring, Interpretation, Clinical Governance & Safety Integration
 */

import {
  AssessmentSessionState,
  AssessmentResultState,
  AssessmentVersionState
} from '../../platform/shared/state_machines.js';

export {
  AssessmentSessionState,
  AssessmentResultState,
  AssessmentVersionState
};

export enum AssessmentType {
  SCREENING = 'SCREENING',
  SELF_ASSESSMENT = 'SELF_ASSESSMENT',
  SYMPTOM_TRACKING = 'SYMPTOM_TRACKING',
  WELLBEING_CHECK = 'WELLBEING_CHECK',
  RISK_SCREEN = 'RISK_SCREEN',
  OUTCOME_MEASURE = 'OUTCOME_MEASURE',
  PROFESSIONAL_ASSESSMENT = 'PROFESSIONAL_ASSESSMENT'
}

export enum QuestionType {
  SINGLE_CHOICE = 'SINGLE_CHOICE',
  MULTI_CHOICE = 'MULTI_CHOICE',
  LIKERT = 'LIKERT',
  BOOLEAN = 'BOOLEAN',
  INTEGER = 'INTEGER',
  DECIMAL = 'DECIMAL',
  TEXT_SHORT = 'TEXT_SHORT',
  TEXT_LONG = 'TEXT_LONG',
  DATE = 'DATE',
  SCALE = 'SCALE'
}

export enum ScoringType {
  SUM = 'SUM',
  WEIGHTED_SUM = 'WEIGHTED_SUM',
  SUBSCALES = 'SUBSCALES',
  RULE_BASED = 'RULE_BASED',
  THRESHOLD = 'THRESHOLD',
  COMPOSITE = 'COMPOSITE',
  NORMALIZED_PERCENTAGE = 'NORMALIZED_PERCENTAGE'
}

export enum EligibilityStatus {
  ELIGIBLE = 'ELIGIBLE',
  NOT_ELIGIBLE = 'NOT_ELIGIBLE',
  TEMPORARILY_INELIGIBLE = 'TEMPORARILY_INELIGIBLE',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED'
}

export enum InvalidationReason {
  SCORING_DEFECT = 'SCORING_DEFECT',
  INSTRUMENT_REVOKED = 'INSTRUMENT_REVOKED',
  DATA_INTEGRITY_FAILURE = 'DATA_INTEGRITY_FAILURE',
  CLINICAL_POLICY_CHANGE = 'CLINICAL_POLICY_CHANGE',
  MANUAL_CLINICAL_INVALIDATION = 'MANUAL_CLINICAL_INVALIDATION'
}

export interface BranchRuleCondition {
  question_code: string;
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'greater_than' | 'less_than' | 'greater_than_or_equal' | 'less_than_or_equal' | 'is_answered' | 'is_empty';
  value?: unknown;
}

export interface BranchingVisibilityRule {
  operator: 'AND' | 'OR';
  conditions: BranchRuleCondition[];
}

export interface AssessmentDefinition {
  id: string; // UUIDv7
  code: string; // e.g. 'PHQ-9', 'GAD-7', 'WHO-5', 'C-SSRS'
  name: string;
  description: string;
  assessment_type: AssessmentType;
  owner_domain: string;
  owner: string;
  clinical_artifact_id?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DEPRECATED';
  default_language: string;
  retake_policy_id?: string;
  eligibility_policy_id?: string;
  active_version_id?: string;
  created_at: string;
  updated_at: string;
}

export interface AssessmentVersion {
  id: string; // UUIDv7
  assessment_definition_id: string;
  version: number; // 1, 2, 3...
  status: AssessmentVersionState;
  clinical_artifact_version: number;
  title: string;
  instructions: string;
  population: {
    min_age: number;
    max_age: number;
    target_groups?: string[];
  };
  jurisdictions: string[]; // e.g. ['KE']
  estimated_duration_minutes: number;
  scoring_model_version: string;
  interpretation_model_version: string;
  effective_at: string;
  expires_at?: string;
  supersedes_id?: string;
  created_at: string;
}

export interface AssessmentSection {
  id: string;
  assessment_version_id: string;
  code: string;
  title: string;
  description?: string;
  position: number;
  created_at: string;
}

export interface AssessmentQuestion {
  id: string;
  assessment_version_id: string;
  section_id?: string;
  question_code: string;
  position: number;
  prompt: string;
  help_text?: string;
  question_type: QuestionType;
  required: boolean;
  response_schema: {
    min?: number;
    max?: number;
    min_length?: number;
    max_length?: number;
    allowed_values?: (string | number)[];
  };
  clinical_significance?: string;
  safety_significance?: string;
  scoring_key_reference?: string;
  visibility_rule?: BranchingVisibilityRule;
  options?: AssessmentOption[];
  created_at: string;
}

export interface AssessmentOption {
  id: string;
  question_id: string;
  option_code: string;
  label: string;
  position: number;
  score_value?: number; // Internal server-authoritative score
  safety_trigger_reference?: string;
  created_at: string;
}

export interface AssessmentEligibilityPolicy {
  id: string;
  assessment_definition_id: string;
  min_age: number;
  max_age: number;
  allowed_jurisdictions: string[];
  required_consents: string[];
  excluded_risk_states: string[]; // e.g. ['HIGH', 'URGENT'] for certain non-acute tests
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
}

export interface AssessmentRetakePolicy {
  id: string;
  assessment_definition_id: string;
  minimum_interval_days: number;
  recommended_interval_days: number;
  max_frequency_per_year?: number;
  allow_early_retake: boolean;
  early_retake_conditions?: string[];
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
}

export interface AssessmentSession {
  id: string;
  assessment_definition_id: string;
  assessment_version_id: string;
  subject_user_id: string;
  status: AssessmentSessionState;
  started_at: string;
  last_activity_at: string;
  submitted_at?: string;
  completed_at?: string;
  abandoned_at?: string;
  current_section?: string;
  current_question?: string;
  progress: number; // 0.0 to 100.0
  eligibility_snapshot: Record<string, unknown>;
  consent_snapshot_reference?: string;
  session_version: number; // Optimistic locking
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface AssessmentResponse {
  id: string;
  session_id: string;
  question_id: string;
  question_code?: string;
  response_value: unknown; // string | number | boolean | string[]
  answered_at: string;
  updated_at: string;
  source: 'USER_DIRECT' | 'CLINICIAN_ENTERED';
  validation_status: 'VALID' | 'FLAGGED' | 'REJECTED';
}

export interface AssessmentScoringModel {
  id: string;
  assessment_version_id: string;
  version: string;
  scoring_type: ScoringType;
  algorithm_reference: string;
  configuration: Record<string, unknown>;
  clinical_artifact_reference?: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
}

export interface AssessmentScore {
  id: string;
  session_id: string;
  scoring_model_version: string;
  raw_score: number;
  normalized_score?: number;
  subscores: Record<string, number>;
  calculated_at: string;
  calculation_hash: string;
  status: 'COMPUTED' | 'ERROR';
}

export interface AssessmentInterpretationModel {
  id: string;
  assessment_version_id: string;
  version: string;
  interpretation_rules?: Record<string, unknown>[];
  clinical_artifact_reference?: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
}

export interface AssessmentScoreBand {
  id: string;
  interpretation_model_id: string;
  code: string;
  minimum: number;
  maximum: number;
  label: string;
  user_message: string;
  professional_message?: string;
  clinical_significance: string;
  safety_behavior_reference?: string;
  position: number;
}

export interface AssessmentResult {
  id: string;
  session_id: string;
  assessment_definition_id: string;
  assessment_version_id: string;
  score_id: string;
  interpretation_model_version: string;
  result_code: string;
  result_band: string;
  summary_text: string;
  limitations: string;
  clinical_artifact_reference?: string;
  raw_score: number;
  normalized_score?: number;
  subscores: Record<string, number>;
  valid_from: string;
  valid_until?: string;
  status: AssessmentResultState;
  invalidation_reason?: InvalidationReason;
  invalidated_by?: string;
  invalidated_at?: string;
  generated_at: string;
}

export interface AssessmentSafetyRule {
  id: string;
  assessment_version_id: string;
  question_id: string;
  question_code: string;
  condition: {
    operator: 'equals' | 'greater_than_or_equal' | 'greater_than' | 'in';
    threshold_value: unknown;
  };
  signal_code: string;
  severity: 'ELEVATED' | 'HIGH' | 'CRITICAL';
  confidence: 'PROVISIONAL' | 'CORROBORATED' | 'CONFIRMED';
  clinical_policy_reference: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
}
