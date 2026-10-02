/**
 * MindOS Care Plans Domain Entities
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 */

import {
  CarePlanType,
  CarePlanState,
  CarePlanVersionStatus,
  CareGoalType,
  CareGoalProvenance,
  GoalPriority,
  GoalTargetType,
  CareGoalStatus,
  CareInterventionType,
  CarePlanReviewType,
  CarePlanReviewOutcome
} from './types.js';

export interface CareGoal {
  id: string;
  care_plan_version_id: string;
  goal_code: string;
  goal_type: CareGoalType;
  title: string;
  description_reference: string;
  priority: GoalPriority;
  target_type: GoalTargetType;
  target_value?: string | number;
  baseline_reference?: string | number;
  current_value?: string | number;
  status: CareGoalStatus;
  provenance: CareGoalProvenance;
  started_at: string;
  target_date?: string;
  completed_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CareGoalReview {
  id: string;
  goal_id: string;
  reviewed_by: string;
  reviewed_at: string;
  status_before: CareGoalStatus;
  status_after: CareGoalStatus;
  evidence_refs: string[];
  reason_codes: string[];
  notes_reference?: string;
}

export interface CareIntervention {
  id: string;
  care_plan_version_id: string;
  intervention_type: CareInterventionType;
  reference_type: 'CONTENT_VERSION' | 'EXERCISE_DEFINITION' | 'ASSESSMENT_INSTRUMENT' | 'SERVICE_OFFERING' | 'SAFETY_PLAN' | 'CUSTOM';
  reference_id: string;
  title: string;
  frequency: string;
  duration?: string;
  schedule_reference?: string;
  responsible_actor_type: 'USER' | 'PROFESSIONAL' | 'CARE_TEAM_ROLE' | 'SYSTEM';
  responsible_actor_id?: string;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'SUSPENDED' | 'DISCONTINUED';
  clinical_artifact_reference?: string;
  created_at: string;
}

export interface CarePlanVersion {
  id: string;
  care_plan_id: string;
  version: number;
  status: CarePlanVersionStatus;
  summary: string;
  goals: CareGoal[];
  interventions: CareIntervention[];
  review_schedule: {
    frequency_days: number;
    next_review_due: string;
  };
  effective_from: string;
  effective_until?: string;
  authored_by: string;
  approved_by?: string;
  acknowledged_by_user?: boolean;
  acknowledged_at?: string;
  supersedes_id?: string;
  created_at: string;
}

export interface CarePlan {
  id: string;
  subject_user_id: string;
  care_relationship_id: string;
  primary_professional_id: string;
  care_team_id?: string;
  plan_type: CarePlanType;
  status: CarePlanState;
  current_version_id: string;
  started_at: string;
  target_end_at?: string;
  completed_at?: string;
  terminated_at?: string;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface CarePlanReview {
  id: string;
  care_plan_id: string;
  care_plan_version_id: string;
  review_type: CarePlanReviewType;
  scheduled_for: string;
  started_at?: string;
  completed_at?: string;
  reviewer_id: string;
  outcome: CarePlanReviewOutcome;
  goal_reviews: CareGoalReview[];
  recommended_changes?: string[];
  new_version_id?: string;
  created_at: string;
}

export interface ContentAssignment {
  id: string;
  care_plan_id: string;
  care_plan_version_id: string;
  intervention_id?: string;
  subject_user_id: string;
  assigned_by: string;
  content_id: string;
  content_version: number;
  status: 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'SUSPENDED' | 'CANCELLED';
  due_date?: string;
  completed_at?: string;
  created_at: string;
}

export interface AssessmentAssignment {
  id: string;
  care_plan_id: string;
  care_plan_version_id: string;
  intervention_id?: string;
  subject_user_id: string;
  assigned_by: string;
  instrument_type: string;
  instrument_version?: number;
  assignment_purpose: string;
  due_window: {
    start_date: string;
    end_date: string;
  };
  status: 'PENDING' | 'COMPLETED' | 'OVERDUE' | 'EXPIRED' | 'CANCELLED';
  completed_assessment_id?: string;
  completed_at?: string;
  created_at: string;
}

export interface CarePlanProgressProjection {
  care_plan_id: string;
  current_version: number;
  status: CarePlanState;
  goals_summary: {
    total: number;
    achieved: number;
    on_track: number;
    at_risk: number;
    in_progress: number;
    not_started: number;
  };
  tasks_summary: {
    total: number;
    completed: number;
    pending: number;
    overdue: number;
  };
  interventions_count: number;
  next_review_due?: string;
  last_review_at?: string;
  last_review_outcome?: CarePlanReviewOutcome;
  computed_at: string;
}
