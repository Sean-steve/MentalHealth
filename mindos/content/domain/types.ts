/**
 * MindOS Governed Content & Psychoeducation Domain Types
 * Authority: Master Architecture Index Section 8, Volumes I, III, XVI & Appendices B / C / Q
 * 
 * Defines the canonical entities, value objects, enums, blocks, claims, taxonomy,
 * exercises, collections, and retrieval boundary contracts.
 */

import {
  ContentVersionState,
  ContentState,
  ExerciseSessionState,
  ContentProgressState,
  ContentIssueState
} from '../../platform/shared/state_machines.js';

export {
  ContentVersionState,
  ContentState,
  ExerciseSessionState,
  ContentProgressState,
  ContentIssueState
};

export enum ContentType {
  ARTICLE = 'ARTICLE',
  PSYCHOEDUCATION = 'PSYCHOEDUCATION',
  GUIDE = 'GUIDE',
  FAQ = 'FAQ',
  CHECKLIST = 'CHECKLIST',
  GUIDED_EXERCISE = 'GUIDED_EXERCISE',
  COPING_TOOL = 'COPING_TOOL',
  REFLECTION = 'REFLECTION',
  GROUNDING_EXERCISE = 'GROUNDING_EXERCISE',
  BREATHING_EXERCISE = 'BREATHING_EXERCISE',
  SELF_CARE_PLAN = 'SELF_CARE_PLAN',
  CARE_PREPARATION = 'CARE_PREPARATION',
  SAFETY_RESOURCE = 'SAFETY_RESOURCE',
  PROFESSIONAL_EDUCATION = 'PROFESSIONAL_EDUCATION'
}

export enum ContentBlockType {
  HEADING = 'HEADING',
  PARAGRAPH = 'PARAGRAPH',
  LIST = 'LIST',
  CALLOUT = 'CALLOUT',
  QUOTE = 'QUOTE',
  IMAGE = 'IMAGE',
  VIDEO_REFERENCE = 'VIDEO_REFERENCE',
  AUDIO_REFERENCE = 'AUDIO_REFERENCE',
  ACTION_CARD = 'ACTION_CARD',
  RESOURCE_CARD = 'RESOURCE_CARD',
  WARNING = 'WARNING',
  SAFETY_CARD = 'SAFETY_CARD',
  EXERCISE_STEP = 'EXERCISE_STEP',
  REFERENCE_LIST = 'REFERENCE_LIST'
}

export enum ContentRiskClassification {
  INFORMATIONAL = 'INFORMATIONAL',
  PSYCHOEDUCATIONAL = 'PSYCHOEDUCATIONAL',
  GUIDED_INTERVENTION = 'GUIDED_INTERVENTION',
  CRISIS_SAFETY = 'CRISIS_SAFETY'
}

export enum ContentClinicalRelevance {
  INFORMATIONAL = 'INFORMATIONAL',
  SYMPTOM_MANAGEMENT = 'SYMPTOM_MANAGEMENT',
  PSYCHOEDUCATIONAL = 'PSYCHOEDUCATIONAL',
  CLINICAL_SUPPORT = 'CLINICAL_SUPPORT'
}

export enum ContentTargetAudience {
  GENERAL_ADULT = 'GENERAL_ADULT',
  ADOLESCENT = 'ADOLESCENT',
  CAREGIVER = 'CAREGIVER',
  PERINATAL = 'PERINATAL',
  TRAUMA_SURVIVOR = 'TRAUMA_SURVIVOR',
  CLINICAL_PATIENT = 'CLINICAL_PATIENT'
}

export enum GuidedExerciseType {
  GROUNDING_54321 = 'GROUNDING_54321',
  BOX_BREATHING = 'BOX_BREATHING',
  PROGRESSIVE_MUSCLE_RELAXATION = 'PROGRESSIVE_MUSCLE_RELAXATION',
  COGNITIVE_REFRAME = 'COGNITIVE_REFRAME',
  BODY_SCAN = 'BODY_SCAN',
  SAFETY_PLAN_CREATION = 'SAFETY_PLAN_CREATION'
}

export enum ExerciseStepType {
  INSTRUCTION = 'INSTRUCTION',
  TIMED_INTERVAL = 'TIMED_INTERVAL',
  USER_INPUT = 'USER_INPUT',
  REFLECTION_PROMPT = 'REFLECTION_PROMPT',
  BREATH_PACER = 'BREATH_PACER',
  SAFETY_CHECK = 'SAFETY_CHECK'
}

export enum CollectionType {
  CURATED = 'CURATED',
  LEARNING_PATHWAY = 'LEARNING_PATHWAY',
  CRISIS_DEESCALATION = 'CRISIS_DEESCALATION',
  TOPIC_SERIES = 'TOPIC_SERIES'
}

export enum CollectionOrderingMode {
  FREE_ORDER = 'FREE_ORDER',
  ORDERED = 'ORDERED',
  PREREQUISITE_GATED = 'PREREQUISITE_GATED'
}

export enum TranslationMethod {
  HUMAN = 'HUMAN',
  AI_ASSISTED_REVIEWED = 'AI_ASSISTED_REVIEWED',
  CANONICAL_SOURCE = 'CANONICAL_SOURCE'
}

export enum LocalizationReviewStatus {
  DRAFT = 'DRAFT',
  PENDING_CLINICAL_REVIEW = 'PENDING_CLINICAL_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export interface ContentBlock {
  id: string;
  block_type: ContentBlockType;
  position: number;
  structured_content: {
    text?: string;
    level?: number;
    items?: string[];
    callout_type?: 'INFO' | 'TIP' | 'WARNING' | 'CRISIS';
    url?: string;
    alt_text?: string;
    action_label?: string;
    action_url?: string;
    phone_number?: string;
    operating_hours?: string;
    references?: string[];
    [key: string]: unknown;
  };
  accessibility_metadata?: {
    aria_label?: string;
    screen_reader_note?: string;
    contrast_ratio_verified?: boolean;
  };
  clinical_significance?: string;
  safety_significance?: string;
}

export interface ContentClaim {
  id: string;
  content_version_id: string;
  claim_text: string;
  claim_type: 'THERAPEUTIC_EFFICACY' | 'MECHANISM_OF_ACTION' | 'SAFETY_WARNING' | 'STATISTICAL_PREVALENCE';
  strength_of_evidence: 'SYSTEMATIC_REVIEW' | 'RCT' | 'CLINICAL_CONSENSUS' | 'GUIDELINE';
  clinical_artifact_id?: string;
  evidence_references: string[];
  non_diagnostic_limitation: string;
  created_at: string;
}

export interface ContentDefinition {
  id: string;
  code: string;
  content_type: ContentType;
  canonical_title: string;
  description?: string;
  owner_domain: string;
  owner_id: string;
  primary_topic: string;
  audience: ContentTargetAudience;
  clinical_relevance: ContentClinicalRelevance;
  risk_classification: ContentRiskClassification;
  status: 'ACTIVE' | 'ARCHIVED' | 'SUSPENDED';
  active_version_id?: string;
  default_locale: string;
  created_at: string;
  updated_at: string;
}

export interface ContentVersion {
  id: string;
  content_definition_id: string;
  version: number;
  status: ContentVersionState;
  title: string;
  summary: string;
  language: string;
  locale: string;
  jurisdiction: string;
  audience: ContentTargetAudience;
  body_structure: {
    blocks: ContentBlock[];
  };
  estimated_reading_time_minutes: number;
  estimated_completion_time_minutes?: number;
  clinical_artifact_id?: string;
  clinical_artifact_version?: number;
  privacy_processing_reference?: string;
  regulatory_reference?: string;
  effective_at: string;
  expires_at?: string;
  created_by: string;
  supersedes_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ContentTaxonomy {
  id: string;
  code: string;
  name: string;
  taxonomy_type: 'TOPIC' | 'SYMPTOM' | 'AUDIENCE' | 'GOAL' | 'CARE_STAGE' | 'SUPPORT_TYPE';
  description?: string;
  created_at: string;
}

export interface ContentTaxonomyTerm {
  id: string;
  taxonomy_id: string;
  code: string;
  name: string;
  parent_term_id?: string;
  description?: string;
  created_at: string;
}

export interface ContentTermAssignment {
  id: string;
  content_definition_id: string;
  term_id: string;
  is_primary: boolean;
  created_at: string;
}

export interface ContentLocalization {
  id: string;
  content_definition_id: string;
  source_version_id: string;
  locale: string;
  language: string;
  jurisdiction: string;
  localized_version: number;
  title: string;
  summary: string;
  body_structure: {
    blocks: ContentBlock[];
  };
  translation_method: TranslationMethod;
  review_status: LocalizationReviewStatus;
  translator_reference?: string;
  reviewer_reference?: string;
  created_at: string;
  updated_at: string;
}

export interface ExerciseStep {
  id: string;
  position: number;
  step_type: ExerciseStepType;
  title: string;
  instruction: string;
  duration_seconds?: number;
  pacer_pattern?: {
    inhale_seconds: number;
    hold_after_inhale_seconds: number;
    exhale_seconds: number;
    hold_after_exhale_seconds: number;
    cycles: number;
  };
  input_prompt?: string;
  input_placeholder?: string;
  input_required?: boolean;
  options?: string[];
  safety_behavior?: {
    scan_for_crisis_keywords?: boolean;
    halt_on_negative_affect_spike?: boolean;
  };
}

export interface GuidedExercise {
  id: string;
  content_definition_id: string;
  content_version_id: string;
  exercise_type: GuidedExerciseType;
  goal: string;
  estimated_duration_seconds: number;
  steps: ExerciseStep[];
  eligibility_policy?: {
    min_age?: number;
    max_age?: number;
    allowed_jurisdictions?: string[];
    excluded_risk_states?: string[];
    requires_clinical_consent?: boolean;
  };
  safety_policy?: {
    halt_on_crisis_signal?: boolean;
    provide_crisis_hotline_on_interrupt?: boolean;
  };
  completion_policy?: {
    min_steps_required?: number;
  };
  clinical_artifact_reference?: string;
  created_at: string;
}

export interface ExerciseResponse {
  step_id: string;
  position: number;
  input_value?: string;
  duration_spent_seconds?: number;
  timestamp: string;
  safety_signal_flag?: boolean;
}

export interface ExerciseSession {
  id: string;
  subject_user_id: string;
  exercise_id: string;
  content_version_id: string;
  status: ExerciseSessionState;
  current_step: number;
  progress_percentage: number;
  responses: ExerciseResponse[];
  started_at: string;
  last_activity_at: string;
  completed_at?: string;
  abandoned_at?: string;
  context_reference?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ContentCollection {
  id: string;
  code: string;
  name: string;
  description?: string;
  collection_type: CollectionType;
  ordering_mode: CollectionOrderingMode;
  audience: ContentTargetAudience;
  jurisdiction: string;
  status: 'ACTIVE' | 'ARCHIVED';
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ContentCollectionItem {
  id: string;
  collection_id: string;
  content_definition_id: string;
  position: number;
  required: boolean;
  prerequisite_rule?: {
    prerequisite_content_definition_ids?: string[];
  };
  availability_rule?: Record<string, unknown>;
  created_at: string;
}

export interface ContentProgress {
  id: string;
  subject_user_id: string;
  content_definition_id: string;
  content_version_id: string;
  status: ContentProgressState;
  progress_percentage: number;
  last_position: number;
  started_at?: string;
  last_viewed_at: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ContentBookmark {
  id: string;
  subject_user_id: string;
  content_definition_id: string;
  saved_at: string;
}

export interface ContentIssue {
  id: string;
  content_version_id: string;
  issue_type: 'CLINICAL_ACCURACY' | 'SAFETY_CONCERN' | 'TYPO_ERROR' | 'OUTDATED_RESOURCE' | 'INACCESSIBLE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reported_by: string;
  source: 'USER_FEEDBACK' | 'CLINICAL_AUDIT' | 'AUTOMATED_SCAN';
  description: string;
  status: ContentIssueState;
  created_at: string;
  resolved_at?: string;
}

export interface ContentSearchResult {
  definition_id: string;
  code: string;
  content_type: ContentType;
  title: string;
  summary: string;
  primary_topic: string;
  audience: ContentTargetAudience;
  version: number;
  estimated_reading_time_minutes: number;
  risk_classification: ContentRiskClassification;
  language: string;
  tags: string[];
  disclaimer: string;
}

export interface ContentRetrievalChunk {
  chunk_id: string;
  content_definition_id: string;
  content_version_id: string;
  version_number: number;
  title: string;
  section_title?: string;
  content_text: string;
  claims: string[];
  non_diagnostic_disclaimer: string;
  approved_clinical_artifact_id?: string;
  locale: string;
  jurisdiction: string;
  status: ContentVersionState;
}
