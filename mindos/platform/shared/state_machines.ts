/**
 * MindOS Canonical State Machine Registry & Transition Enforcers
 * Authority: Master Architecture Index, Volume III & Appendix C / Q
 */

import { DomainInvariantError } from '../errors/index.js';
import { AuditService } from '../audit/index.js';

// Enums
export enum AccountState {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
  SUSPENDED = 'SUSPENDED',
  DISABLED = 'DISABLED',
  DELETION_PENDING = 'DELETION_PENDING',
  DELETED = 'DELETED',
  CLOSED = 'CLOSED'
}

export enum ConsentState {
  NOT_REQUESTED = 'NOT_REQUESTED',
  NOT_GRANTED = 'NOT_GRANTED', // Canonical backwards-compatible alias
  REQUESTED = 'REQUESTED',
  GRANTED = 'GRANTED',
  DECLINED = 'DECLINED',
  WITHDRAWN = 'WITHDRAWN',
  EXPIRED = 'EXPIRED',
  SUPERSEDED = 'SUPERSEDED'
}

export enum AssessmentSessionState {
  CREATED = 'CREATED',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  SUBMITTED = 'SUBMITTED',
  SCORING = 'SCORING',
  COMPLETED = 'COMPLETED',
  INVALIDATED = 'INVALIDATED',
  ABANDONED = 'ABANDONED',
  EXPIRED = 'EXPIRED'
}

export enum AssessmentResultState {
  VALID = 'VALID',
  INVALIDATED = 'INVALIDATED',
  EXPIRED = 'EXPIRED',
  SUPERSEDED = 'SUPERSEDED'
}

export enum AssessmentVersionState {
  DRAFT = 'DRAFT',
  GOVERNANCE_REQUIRED = 'GOVERNANCE_REQUIRED',
  APPROVED = 'APPROVED',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  RETIRED = 'RETIRED',
  SUPERSEDED = 'SUPERSEDED'
}

export enum ContentVersionState {
  DRAFT = 'DRAFT',
  EDITORIAL_REVIEW = 'EDITORIAL_REVIEW',
  CLINICAL_REVIEW_REQUIRED = 'CLINICAL_REVIEW_REQUIRED',
  GOVERNANCE_REVIEW = 'GOVERNANCE_REVIEW',
  APPROVED = 'APPROVED',
  SCHEDULED = 'SCHEDULED',
  PUBLISHED = 'PUBLISHED',
  SUSPENDED = 'SUSPENDED',
  EXPIRED = 'EXPIRED',
  RETIRED = 'RETIRED',
  SUPERSEDED = 'SUPERSEDED'
}

export { ContentVersionState as ContentState };

export enum ExerciseSessionState {
  CREATED = 'CREATED',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
  EXPIRED = 'EXPIRED'
}

export enum ContentProgressState {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED'
}

export enum ContentIssueState {
  REPORTED = 'REPORTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  INVESTIGATING = 'INVESTIGATING',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED'
}

export enum RiskState {
  UNKNOWN = 'UNKNOWN',
  NO_CONCERN = 'NO_CONCERN',
  POTENTIAL_CONCERN = 'POTENTIAL_CONCERN',
  ELEVATED = 'ELEVATED',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

export enum SafetyEventState {
  DETECTED = 'DETECTED',
  CLASSIFIED = 'CLASSIFIED',
  ACTIONED = 'ACTIONED',
  ESCALATED = 'ESCALATED',
  FOLLOW_UP = 'FOLLOW_UP',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED'
}

export enum EscalationState {
  NEW = 'NEW',
  PENDING_REVIEW = 'PENDING_REVIEW',
  TRIAGED = 'TRIAGED',
  ASSIGNED = 'ASSIGNED',
  IN_REVIEW = 'IN_REVIEW',
  ACTION_REQUIRED = 'ACTION_REQUIRED',
  FOLLOW_UP = 'FOLLOW_UP',
  RESOLVED = 'RESOLVED',
  CANCELLED = 'CANCELLED'
}

export enum CommunityMembershipState {
  REQUESTED = 'REQUESTED',
  ACTIVE = 'ACTIVE',
  MUTED = 'MUTED',
  SUSPENDED = 'SUSPENDED',
  LEFT = 'LEFT',
  BANNED = 'BANNED'
}

export enum ModerationCaseState {
  NEW = 'NEW',
  TRIAGED = 'TRIAGED',
  ASSIGNED = 'ASSIGNED',
  IN_REVIEW = 'IN_REVIEW',
  ACTIONED = 'ACTIONED',
  APPEALED = 'APPEALED',
  RESOLVED = 'RESOLVED'
}

export enum ProfessionalVerificationState {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  IDENTITY_REVIEW = 'IDENTITY_REVIEW',
  CREDENTIAL_REVIEW = 'CREDENTIAL_REVIEW',
  LICENSE_REVIEW = 'LICENSE_REVIEW',
  APPROVED = 'APPROVED',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
  REVERIFICATION_REQUIRED = 'REVERIFICATION_REQUIRED'
}

export enum ProfessionalProfileState {
  DRAFT = 'DRAFT',
  ONBOARDING = 'ONBOARDING',
  VERIFICATION_REQUIRED = 'VERIFICATION_REQUIRED',
  IN_VERIFICATION = 'IN_VERIFICATION',
  ACTION_REQUIRED = 'ACTION_REQUIRED',
  VERIFIED = 'VERIFIED',
  ACTIVE = 'ACTIVE',
  RESTRICTED = 'RESTRICTED',
  SUSPENDED = 'SUSPENDED',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED',
  RETIRED = 'RETIRED'
}

export enum VerificationCaseState {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  IN_REVIEW = 'IN_REVIEW',
  ACTION_REQUIRED = 'ACTION_REQUIRED',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED'
}

export enum ServiceOfferingState {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  SUSPENDED = 'SUSPENDED',
  RETIRED = 'RETIRED'
}

export enum ProviderLifecycleStatus {
  DRAFT = 'DRAFT',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  ACTIVE = 'ACTIVE',
  RESTRICTED = 'RESTRICTED',
  SUSPENDED = 'SUSPENDED',
  RETIRED = 'RETIRED'
}

export enum CareRelationshipState {
  PROPOSED = 'PROPOSED',
  PENDING = 'PENDING',
  CONSENT_PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  RESTRICTED = 'RESTRICTED',
  TRANSFER_PENDING = 'TRANSFER_PENDING',
  TERMINATED = 'TERMINATED',
  ENDED = 'TERMINATED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED'
}

export enum CareTeamMembershipState {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  REMOVED = 'REMOVED'
}

export enum ClinicalEncounterState {
  PLANNED = 'PLANNED',
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW'
}

export enum ClinicalNoteState {
  DRAFT = 'DRAFT',
  IN_REVIEW = 'IN_REVIEW',
  SIGNED = 'SIGNED',
  AMENDED = 'AMENDED',
  SUPERSEDED = 'SUPERSEDED',
  CANCELLED = 'CANCELLED'
}

export enum CarePlanState {
  DRAFT = 'DRAFT',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  PENDING_USER_ACKNOWLEDGEMENT = 'PENDING_USER_ACKNOWLEDGEMENT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  COMPLETED = 'COMPLETED',
  TERMINATED = 'TERMINATED',
  SUPERSEDED = 'SUPERSEDED',
  REVOKED = 'REVOKED'
}

export enum CareGoalStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  ON_TRACK = 'ON_TRACK',
  AT_RISK = 'AT_RISK',
  ACHIEVED = 'ACHIEVED',
  NOT_ACHIEVED = 'NOT_ACHIEVED',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED'
}

export enum ClinicalTaskState {
  PENDING = 'PENDING',
  READY = 'READY',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  SKIPPED = 'SKIPPED',
  CANCELLED = 'CANCELLED',
  OVERDUE = 'OVERDUE',
  BLOCKED = 'BLOCKED',
  FAILED = 'FAILED'
}

export enum ProfessionalThreadStatus {
  OPEN = 'OPEN',
  PAUSED = 'PAUSED',
  CLOSED = 'CLOSED',
  ARCHIVED = 'ARCHIVED'
}

export enum MessageDeliveryStatus {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ'
}

// --- Sprint 23: Longitudinal Clinical Record & Outcomes ---

export enum LongitudinalClinicalRecordState {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SEALED = 'SEALED',
  RESTRICTED = 'RESTRICTED'
}

export enum ClinicalTimelineSourceType {
  ASSESSMENT_RESULT = 'ASSESSMENT_RESULT',
  CLINICAL_ENCOUNTER = 'CLINICAL_ENCOUNTER',
  CLINICAL_NOTE = 'CLINICAL_NOTE',
  CLINICAL_OBSERVATION = 'CLINICAL_OBSERVATION',
  CARE_PLAN_ACTIVATED = 'CARE_PLAN_ACTIVATED',
  CARE_PLAN_REVIEW = 'CARE_PLAN_REVIEW',
  CARE_GOAL_UPDATE = 'CARE_GOAL_UPDATE',
  CLINICAL_TASK_COMPLETION = 'CLINICAL_TASK_COMPLETION',
  SAFETY_STATE_CHANGE = 'SAFETY_STATE_CHANGE',
  SAFETY_ESCALATION = 'SAFETY_ESCALATION',
  APPOINTMENT_COMPLETION = 'APPOINTMENT_COMPLETION',
  REFERRAL = 'REFERRAL',
  CARE_RELATIONSHIP_CHANGE = 'CARE_RELATIONSHIP_CHANGE',
  OUTCOME_MEASUREMENT = 'OUTCOME_MEASUREMENT'
}

export enum ClinicalProvenance {
  USER_REPORTED = 'USER_REPORTED',
  SYSTEM_OBSERVED = 'SYSTEM_OBSERVED',
  AI_INFERRED = 'AI_INFERRED',
  PROFESSIONAL_RECORDED = 'PROFESSIONAL_RECORDED',
  CLINICALLY_ASSESSED = 'CLINICALLY_ASSESSED',
  IMPORTED = 'IMPORTED'
}

export enum TimelineVisibilityScope {
  USER = 'USER',
  PROFESSIONAL = 'PROFESSIONAL',
  CARE_TEAM = 'CARE_TEAM',
  CLINICAL_GOVERNANCE = 'CLINICAL_GOVERNANCE',
  SAFETY_OPERATIONS = 'SAFETY_OPERATIONS'
}

export enum OutcomeMeasureType {
  ASSESSMENT_SCORE = 'ASSESSMENT_SCORE',
  ASSESSMENT_SUBSCALE = 'ASSESSMENT_SUBSCALE',
  USER_REPORTED_OUTCOME = 'USER_REPORTED_OUTCOME',
  PROFESSIONAL_RATING = 'PROFESSIONAL_RATING',
  FUNCTIONAL_MEASURE = 'FUNCTIONAL_MEASURE',
  GOAL_MEASURE = 'GOAL_MEASURE',
  ENGAGEMENT_MEASURE = 'ENGAGEMENT_MEASURE',
  SAFETY_RELATED_MEASURE = 'SAFETY_RELATED_MEASURE',
  SYSTEM_DERIVED = 'SYSTEM_DERIVED'
}

export enum OutcomeValueType {
  INTEGER = 'INTEGER',
  DECIMAL = 'DECIMAL',
  BOOLEAN = 'BOOLEAN',
  CATEGORICAL = 'CATEGORICAL',
  ORDINAL = 'ORDINAL',
  DURATION = 'DURATION'
}

export enum OutcomeDirectionality {
  HIGHER_IS_BETTER = 'HIGHER_IS_BETTER',
  LOWER_IS_BETTER = 'LOWER_IS_BETTER',
  TARGET_RANGE = 'TARGET_RANGE',
  NON_DIRECTIONAL = 'NON_DIRECTIONAL'
}

export enum OutcomeMeasurementValidity {
  VALID = 'VALID',
  INVALIDATED = 'INVALIDATED',
  EXPIRED = 'EXPIRED',
  SUPERSEDED = 'SUPERSEDED',
  QUESTIONABLE = 'QUESTIONABLE'
}

export enum OutcomeTrendState {
  IMPROVING = 'IMPROVING',
  STABLE = 'STABLE',
  WORSENING = 'WORSENING',
  MIXED = 'MIXED',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  INCOMPARABLE = 'INCOMPARABLE',
  UNKNOWN = 'UNKNOWN'
}

export enum OutcomeReviewType {
  SCHEDULED = 'SCHEDULED',
  CARE_PLAN_REVIEW = 'CARE_PLAN_REVIEW',
  ASSESSMENT_TRIGGERED = 'ASSESSMENT_TRIGGERED',
  DETERIORATION_TRIGGERED = 'DETERIORATION_TRIGGERED',
  SAFETY_TRIGGERED = 'SAFETY_TRIGGERED',
  PROFESSIONAL_REQUESTED = 'PROFESSIONAL_REQUESTED',
  USER_REQUESTED = 'USER_REQUESTED'
}

export enum OutcomeReviewState {
  PENDING = 'PENDING',
  READY = 'READY',
  IN_REVIEW = 'IN_REVIEW',
  ACTION_REQUIRED = 'ACTION_REQUIRED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum OutcomeReviewDecision {
  CONTINUE_PLAN = 'CONTINUE_PLAN',
  MODIFY_PLAN = 'MODIFY_PLAN',
  REPEAT_MEASURE = 'REPEAT_MEASURE',
  SCHEDULE_FOLLOWUP = 'SCHEDULE_FOLLOWUP',
  ESCALATE_CARE = 'ESCALATE_CARE',
  SAFETY_REVIEW = 'SAFETY_REVIEW',
  NO_CHANGE = 'NO_CHANGE'
}

export enum OutcomeAlertType {
  DETERIORATION = 'DETERIORATION',
  THRESHOLD_CROSSED = 'THRESHOLD_CROSSED',
  MEASURE_OVERDUE = 'MEASURE_OVERDUE',
  CARE_PLAN_REVIEW_DUE = 'CARE_PLAN_REVIEW_DUE',
  MEASUREMENT_INVALIDATED = 'MEASUREMENT_INVALIDATED',
  DATA_INCOMPARABLE = 'DATA_INCOMPARABLE'
}

export enum OutcomeAlertState {
  OPEN = 'OPEN',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  IN_REVIEW = 'IN_REVIEW',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED'
}

export enum OutcomeBaselineType {
  FIRST_VALID = 'FIRST_VALID',
  CARE_PLAN_START = 'CARE_PLAN_START',
  RELATIONSHIP_START = 'RELATIONSHIP_START',
  PROFESSIONAL_SELECTED = 'PROFESSIONAL_SELECTED',
  ASSESSMENT_START = 'ASSESSMENT_START'
}

export enum AppointmentState {
  REQUESTED = 'REQUESTED',
  HELD = 'HELD',
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  CONFIRMED = 'CONFIRMED',
  CHECKED_IN = 'CHECKED_IN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED_BY_USER = 'CANCELLED_BY_USER',
  CANCELLED_BY_PROFESSIONAL = 'CANCELLED_BY_PROFESSIONAL',
  CANCELLED_BY_PROVIDER = 'CANCELLED_BY_PROVIDER',
  NO_SHOW = 'NO_SHOW',
  NO_SHOW_USER = 'NO_SHOW_USER',
  NO_SHOW_PROVIDER = 'NO_SHOW_PROVIDER',
  RESCHEDULED = 'RESCHEDULED',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED'
}

export enum AppointmentHoldState {
  ACTIVE = 'ACTIVE',
  CONSUMED = 'CONSUMED',
  EXPIRED = 'EXPIRED',
  RELEASED = 'RELEASED'
}

export enum WaitlistEntryState {
  ACTIVE = 'ACTIVE',
  OFFERED = 'OFFERED',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED'
}

export enum WaitlistOfferState {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED'
}

export enum ScheduleBlockState {
  ACTIVE = 'ACTIVE',
  RELEASED = 'RELEASED'
}

export enum SubscriptionState {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  GRACE = 'GRACE',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED'
}

export enum ClinicalArtifactState {
  DRAFT = 'DRAFT',
  EVIDENCE_REQUIRED = 'EVIDENCE_REQUIRED',
  READY_FOR_REVIEW = 'READY_FOR_REVIEW',
  CLINICAL_REVIEW_REQUIRED = 'CLINICAL_REVIEW_REQUIRED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  IN_REVIEW = 'IN_REVIEW',
  ACTION_REQUIRED = 'ACTION_REQUIRED',
  REVISION_REQUIRED = 'REVISION_REQUIRED',
  APPROVED = 'APPROVED',
  CONDITIONALLY_APPROVED = 'CONDITIONALLY_APPROVED',
  PUBLISHED = 'PUBLISHED',
  MONITORED = 'MONITORED',
  REVIEW_DUE = 'REVIEW_DUE',
  REVALIDATION = 'REVALIDATION',
  RETIRED = 'RETIRED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  SUSPENDED = 'SUSPENDED',
  REVOKED = 'REVOKED',
  SUPERSEDED = 'SUPERSEDED'
}

export enum DPIAState {
  DRAFT = 'DRAFT',
  SCREENING = 'SCREENING',
  REQUIRED = 'REQUIRED',
  ASSESSING = 'ASSESSING',
  MITIGATION_REQUIRED = 'MITIGATION_REQUIRED',
  READY_FOR_REVIEW = 'READY_FOR_REVIEW',
  APPROVED = 'APPROVED',
  APPROVED_WITH_CONTROLS = 'APPROVED_WITH_CONTROLS',
  REVIEW_DUE = 'REVIEW_DUE',
  SUPERSEDED = 'SUPERSEDED',
  REJECTED = 'REJECTED'
}

export enum RegulatoryReviewState {
  NOT_ASSESSED = 'NOT_ASSESSED',
  CLASSIFICATION_REQUIRED = 'CLASSIFICATION_REQUIRED',
  IN_REVIEW = 'IN_REVIEW',
  ADDITIONAL_EVIDENCE_REQUIRED = 'ADDITIONAL_EVIDENCE_REQUIRED',
  APPROVED = 'APPROVED',
  APPROVED_WITH_CONDITIONS = 'APPROVED_WITH_CONDITIONS',
  BLOCKED = 'BLOCKED',
  REVIEW_DUE = 'REVIEW_DUE',
  SUPERSEDED = 'SUPERSEDED'
}

export enum ConversationState {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  SAFETY_INTERVENED = 'SAFETY_INTERVENED',
  ESCALATED = 'ESCALATED',
  CLOSED = 'CLOSED',
  ARCHIVED = 'ARCHIVED'
}

export enum AISystemState {
  DRAFT = 'DRAFT',
  REGISTERED = 'REGISTERED',
  CONFIGURATION_REQUIRED = 'CONFIGURATION_REQUIRED',
  EVALUATION_REQUIRED = 'EVALUATION_REQUIRED',
  UNDER_EVALUATION = 'UNDER_EVALUATION',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  IN_REVIEW = 'IN_REVIEW',
  CLINICAL_REVIEW = 'CLINICAL_REVIEW',
  PRIVACY_REVIEW = 'PRIVACY_REVIEW',
  REGULATORY_REVIEW = 'REGULATORY_REVIEW',
  ACTION_REQUIRED = 'ACTION_REQUIRED',
  APPROVED = 'APPROVED',
  CONDITIONALLY_APPROVED = 'CONDITIONALLY_APPROVED',
  APPROVED_FOR_LIMITED_USE = 'APPROVED_FOR_LIMITED_USE',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  SUSPENDED = 'SUSPENDED',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED',
  SUPERSEDED = 'SUPERSEDED',
  RETIRED = 'RETIRED'
}

export enum GovernanceDecision {
  APPROVED = 'APPROVED',
  APPROVED_WITH_CONTROLS = 'APPROVED_WITH_CONTROLS',
  REVISION_REQUIRED = 'REVISION_REQUIRED',
  BLOCKED = 'BLOCKED',
  RETIRED = 'RETIRED'
}

export enum CarePathwayState {
  DRAFT = 'DRAFT',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  APPROVED = 'APPROVED',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  EXPIRED = 'EXPIRED',
  RETIRED = 'RETIRED',
  SUPERSEDED = 'SUPERSEDED'
}

export enum NavigationSessionState {
  CREATED = 'CREATED',
  IN_PROGRESS = 'IN_PROGRESS',
  OPTIONS_READY = 'OPTIONS_READY',
  NEEDS_EVALUATED = 'OPTIONS_READY',
  PATHWAY_SELECTED = 'PATHWAY_SELECTED',
  REFERRAL_REQUIRED = 'REFERRAL_REQUIRED',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
  EXPIRED = 'EXPIRED'
}

export enum ReferralState {
  DRAFT = 'DRAFT',
  READY = 'READY',
  SUBMITTED = 'SUBMITTED',
  TRANSMITTED = 'SUBMITTED',
  RECEIVED = 'RECEIVED',
  ACKNOWLEDGED = 'RECEIVED',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  REJECTED = 'DECLINED',
  ACTION_REQUIRED = 'ACTION_REQUIRED',
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED'
}

export enum HandoffPackageState {
  ACTIVE = 'ACTIVE',
  ACCESSED = 'ACCESSED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED'
}

// Transition Tables
export const ALLOWED_TRANSITIONS = {
  AccountState: {
    [AccountState.PENDING_VERIFICATION]: [AccountState.ACTIVE, AccountState.LOCKED],
    [AccountState.ACTIVE]: [AccountState.LOCKED, AccountState.SUSPENDED, AccountState.DISABLED, AccountState.DELETION_PENDING, AccountState.CLOSED, AccountState.DELETED],
    [AccountState.LOCKED]: [AccountState.ACTIVE, AccountState.SUSPENDED, AccountState.DELETION_PENDING],
    [AccountState.SUSPENDED]: [AccountState.ACTIVE, AccountState.DELETION_PENDING],
    [AccountState.DISABLED]: [AccountState.ACTIVE, AccountState.DELETION_PENDING, AccountState.CLOSED, AccountState.DELETED],
    [AccountState.DELETION_PENDING]: [AccountState.DELETED, AccountState.CLOSED, AccountState.ACTIVE],
    [AccountState.DELETED]: [],
    [AccountState.CLOSED]: []
  },
  ConsentState: {
    [ConsentState.NOT_REQUESTED]: [ConsentState.REQUESTED, ConsentState.GRANTED, ConsentState.DECLINED],
    [ConsentState.NOT_GRANTED]: [ConsentState.REQUESTED, ConsentState.GRANTED, ConsentState.DECLINED],
    [ConsentState.REQUESTED]: [ConsentState.GRANTED, ConsentState.DECLINED, ConsentState.EXPIRED],
    [ConsentState.GRANTED]: [ConsentState.WITHDRAWN, ConsentState.EXPIRED, ConsentState.SUPERSEDED],
    [ConsentState.DECLINED]: [ConsentState.REQUESTED, ConsentState.GRANTED],
    [ConsentState.WITHDRAWN]: [],
    [ConsentState.EXPIRED]: [],
    [ConsentState.SUPERSEDED]: []
  },
  AssessmentSessionState: {
    [AssessmentSessionState.CREATED]: [AssessmentSessionState.IN_PROGRESS, AssessmentSessionState.ABANDONED, AssessmentSessionState.EXPIRED],
    [AssessmentSessionState.IN_PROGRESS]: [AssessmentSessionState.PAUSED, AssessmentSessionState.SUBMITTED, AssessmentSessionState.COMPLETED, AssessmentSessionState.ABANDONED, AssessmentSessionState.EXPIRED, AssessmentSessionState.INVALIDATED],
    [AssessmentSessionState.PAUSED]: [AssessmentSessionState.IN_PROGRESS, AssessmentSessionState.ABANDONED, AssessmentSessionState.EXPIRED, AssessmentSessionState.INVALIDATED],
    [AssessmentSessionState.SUBMITTED]: [AssessmentSessionState.SCORING, AssessmentSessionState.COMPLETED, AssessmentSessionState.INVALIDATED],
    [AssessmentSessionState.SCORING]: [AssessmentSessionState.COMPLETED, AssessmentSessionState.INVALIDATED],
    [AssessmentSessionState.COMPLETED]: [AssessmentSessionState.INVALIDATED],
    [AssessmentSessionState.ABANDONED]: [],
    [AssessmentSessionState.EXPIRED]: [],
    [AssessmentSessionState.INVALIDATED]: []
  },
  AssessmentResultState: {
    [AssessmentResultState.VALID]: [AssessmentResultState.INVALIDATED, AssessmentResultState.EXPIRED, AssessmentResultState.SUPERSEDED],
    [AssessmentResultState.INVALIDATED]: [],
    [AssessmentResultState.EXPIRED]: [AssessmentResultState.INVALIDATED, AssessmentResultState.SUPERSEDED],
    [AssessmentResultState.SUPERSEDED]: [AssessmentResultState.INVALIDATED]
  },
  AssessmentVersionState: {
    [AssessmentVersionState.DRAFT]: [AssessmentVersionState.GOVERNANCE_REQUIRED, AssessmentVersionState.RETIRED],
    [AssessmentVersionState.GOVERNANCE_REQUIRED]: [AssessmentVersionState.APPROVED, AssessmentVersionState.DRAFT, AssessmentVersionState.RETIRED],
    [AssessmentVersionState.APPROVED]: [AssessmentVersionState.ACTIVE, AssessmentVersionState.SUSPENDED, AssessmentVersionState.RETIRED],
    [AssessmentVersionState.ACTIVE]: [AssessmentVersionState.SUSPENDED, AssessmentVersionState.SUPERSEDED, AssessmentVersionState.RETIRED],
    [AssessmentVersionState.SUSPENDED]: [AssessmentVersionState.ACTIVE, AssessmentVersionState.RETIRED],
    [AssessmentVersionState.SUPERSEDED]: [AssessmentVersionState.RETIRED],
    [AssessmentVersionState.RETIRED]: []
  },
  RiskState: {
    [RiskState.UNKNOWN]: [RiskState.NO_CONCERN, RiskState.POTENTIAL_CONCERN, RiskState.ELEVATED, RiskState.HIGH, RiskState.URGENT],
    [RiskState.NO_CONCERN]: [RiskState.POTENTIAL_CONCERN, RiskState.ELEVATED, RiskState.HIGH, RiskState.URGENT],
    [RiskState.POTENTIAL_CONCERN]: [RiskState.NO_CONCERN, RiskState.ELEVATED, RiskState.HIGH, RiskState.URGENT],
    [RiskState.ELEVATED]: [RiskState.POTENTIAL_CONCERN, RiskState.NO_CONCERN, RiskState.HIGH, RiskState.URGENT],
    [RiskState.HIGH]: [RiskState.ELEVATED, RiskState.URGENT, RiskState.POTENTIAL_CONCERN],
    [RiskState.URGENT]: [RiskState.HIGH, RiskState.ELEVATED]
  },
  SafetyEventState: {
    [SafetyEventState.DETECTED]: [SafetyEventState.CLASSIFIED],
    [SafetyEventState.CLASSIFIED]: [SafetyEventState.ACTIONED, SafetyEventState.ESCALATED],
    [SafetyEventState.ACTIONED]: [SafetyEventState.FOLLOW_UP, SafetyEventState.RESOLVED],
    [SafetyEventState.ESCALATED]: [SafetyEventState.FOLLOW_UP, SafetyEventState.RESOLVED],
    [SafetyEventState.FOLLOW_UP]: [SafetyEventState.RESOLVED],
    [SafetyEventState.RESOLVED]: [SafetyEventState.CLOSED],
    [SafetyEventState.CLOSED]: []
  },
  EscalationState: {
    [EscalationState.NEW]: [EscalationState.TRIAGED, EscalationState.CANCELLED],
    [EscalationState.TRIAGED]: [EscalationState.ASSIGNED, EscalationState.ACTION_REQUIRED, EscalationState.CANCELLED],
    [EscalationState.ASSIGNED]: [EscalationState.IN_REVIEW, EscalationState.CANCELLED],
    [EscalationState.IN_REVIEW]: [EscalationState.ACTION_REQUIRED, EscalationState.RESOLVED, EscalationState.FOLLOW_UP],
    [EscalationState.ACTION_REQUIRED]: [EscalationState.FOLLOW_UP, EscalationState.RESOLVED],
    [EscalationState.FOLLOW_UP]: [EscalationState.RESOLVED],
    [EscalationState.RESOLVED]: [],
    [EscalationState.CANCELLED]: []
  },
  CommunityMembershipState: {
    [CommunityMembershipState.REQUESTED]: [CommunityMembershipState.ACTIVE, CommunityMembershipState.BANNED],
    [CommunityMembershipState.ACTIVE]: [CommunityMembershipState.MUTED, CommunityMembershipState.SUSPENDED, CommunityMembershipState.LEFT, CommunityMembershipState.BANNED],
    [CommunityMembershipState.MUTED]: [CommunityMembershipState.ACTIVE, CommunityMembershipState.SUSPENDED, CommunityMembershipState.LEFT, CommunityMembershipState.BANNED],
    [CommunityMembershipState.SUSPENDED]: [CommunityMembershipState.ACTIVE, CommunityMembershipState.BANNED],
    [CommunityMembershipState.LEFT]: [CommunityMembershipState.REQUESTED, CommunityMembershipState.ACTIVE],
    [CommunityMembershipState.BANNED]: []
  },
  ModerationCaseState: {
    [ModerationCaseState.NEW]: [ModerationCaseState.TRIAGED],
    [ModerationCaseState.TRIAGED]: [ModerationCaseState.ASSIGNED, ModerationCaseState.ACTIONED],
    [ModerationCaseState.ASSIGNED]: [ModerationCaseState.IN_REVIEW],
    [ModerationCaseState.IN_REVIEW]: [ModerationCaseState.ACTIONED],
    [ModerationCaseState.ACTIONED]: [ModerationCaseState.APPEALED, ModerationCaseState.RESOLVED],
    [ModerationCaseState.APPEALED]: [ModerationCaseState.IN_REVIEW, ModerationCaseState.RESOLVED],
    [ModerationCaseState.RESOLVED]: []
  },
  ProfessionalVerificationState: {
    [ProfessionalVerificationState.DRAFT]: [ProfessionalVerificationState.SUBMITTED],
    [ProfessionalVerificationState.SUBMITTED]: [ProfessionalVerificationState.IDENTITY_REVIEW, ProfessionalVerificationState.CREDENTIAL_REVIEW, ProfessionalVerificationState.LICENSE_REVIEW, ProfessionalVerificationState.REJECTED],
    [ProfessionalVerificationState.IDENTITY_REVIEW]: [ProfessionalVerificationState.CREDENTIAL_REVIEW, ProfessionalVerificationState.LICENSE_REVIEW, ProfessionalVerificationState.APPROVED, ProfessionalVerificationState.VERIFIED, ProfessionalVerificationState.REJECTED, ProfessionalVerificationState.REVERIFICATION_REQUIRED],
    [ProfessionalVerificationState.CREDENTIAL_REVIEW]: [ProfessionalVerificationState.LICENSE_REVIEW, ProfessionalVerificationState.APPROVED, ProfessionalVerificationState.VERIFIED, ProfessionalVerificationState.REJECTED, ProfessionalVerificationState.REVERIFICATION_REQUIRED],
    [ProfessionalVerificationState.LICENSE_REVIEW]: [ProfessionalVerificationState.APPROVED, ProfessionalVerificationState.VERIFIED, ProfessionalVerificationState.REJECTED, ProfessionalVerificationState.REVERIFICATION_REQUIRED],
    [ProfessionalVerificationState.APPROVED]: [ProfessionalVerificationState.SUSPENDED, ProfessionalVerificationState.REVERIFICATION_REQUIRED],
    [ProfessionalVerificationState.VERIFIED]: [ProfessionalVerificationState.SUSPENDED, ProfessionalVerificationState.REVERIFICATION_REQUIRED],
    [ProfessionalVerificationState.REJECTED]: [ProfessionalVerificationState.SUBMITTED],
    [ProfessionalVerificationState.SUSPENDED]: [ProfessionalVerificationState.APPROVED, ProfessionalVerificationState.VERIFIED, ProfessionalVerificationState.REVERIFICATION_REQUIRED, ProfessionalVerificationState.REJECTED],
    [ProfessionalVerificationState.REVERIFICATION_REQUIRED]: [ProfessionalVerificationState.SUBMITTED, ProfessionalVerificationState.SUSPENDED]
  },
  CareRelationshipState: {
    [CareRelationshipState.PROPOSED]: [CareRelationshipState.PENDING, CareRelationshipState.ACTIVE, CareRelationshipState.REVOKED, CareRelationshipState.TERMINATED],
    [CareRelationshipState.PENDING]: [CareRelationshipState.ACTIVE, CareRelationshipState.REVOKED, CareRelationshipState.TERMINATED, CareRelationshipState.EXPIRED],
    [CareRelationshipState.ACTIVE]: [CareRelationshipState.PAUSED, CareRelationshipState.RESTRICTED, CareRelationshipState.TRANSFER_PENDING, CareRelationshipState.TERMINATED, CareRelationshipState.EXPIRED, CareRelationshipState.REVOKED],
    [CareRelationshipState.PAUSED]: [CareRelationshipState.ACTIVE, CareRelationshipState.RESTRICTED, CareRelationshipState.TRANSFER_PENDING, CareRelationshipState.TERMINATED, CareRelationshipState.REVOKED],
    [CareRelationshipState.RESTRICTED]: [CareRelationshipState.ACTIVE, CareRelationshipState.PAUSED, CareRelationshipState.TRANSFER_PENDING, CareRelationshipState.TERMINATED, CareRelationshipState.REVOKED],
    [CareRelationshipState.TRANSFER_PENDING]: [CareRelationshipState.TERMINATED, CareRelationshipState.ACTIVE, CareRelationshipState.PAUSED, CareRelationshipState.REVOKED],
    [CareRelationshipState.TERMINATED]: [],
    [CareRelationshipState.EXPIRED]: [CareRelationshipState.ACTIVE, CareRelationshipState.TERMINATED, CareRelationshipState.REVOKED],
    [CareRelationshipState.REVOKED]: []
  },
  AppointmentState: {
    [AppointmentState.REQUESTED]: [AppointmentState.HELD, AppointmentState.PENDING_CONFIRMATION, AppointmentState.CONFIRMED, AppointmentState.CANCELLED_BY_USER, AppointmentState.FAILED, AppointmentState.EXPIRED],
    [AppointmentState.HELD]: [AppointmentState.PENDING_CONFIRMATION, AppointmentState.CONFIRMED, AppointmentState.CANCELLED_BY_USER, AppointmentState.CANCELLED_BY_PROFESSIONAL, AppointmentState.CANCELLED_BY_PROVIDER, AppointmentState.EXPIRED, AppointmentState.FAILED],
    [AppointmentState.PENDING_CONFIRMATION]: [AppointmentState.CONFIRMED, AppointmentState.CANCELLED_BY_USER, AppointmentState.CANCELLED_BY_PROFESSIONAL, AppointmentState.CANCELLED_BY_PROVIDER, AppointmentState.EXPIRED, AppointmentState.FAILED],
    [AppointmentState.CONFIRMED]: [AppointmentState.CHECKED_IN, AppointmentState.IN_PROGRESS, AppointmentState.COMPLETED, AppointmentState.RESCHEDULED, AppointmentState.CANCELLED_BY_USER, AppointmentState.CANCELLED_BY_PROFESSIONAL, AppointmentState.CANCELLED_BY_PROVIDER, AppointmentState.NO_SHOW, AppointmentState.NO_SHOW_USER, AppointmentState.NO_SHOW_PROVIDER],
    [AppointmentState.CHECKED_IN]: [AppointmentState.IN_PROGRESS, AppointmentState.COMPLETED, AppointmentState.CANCELLED_BY_USER, AppointmentState.CANCELLED_BY_PROVIDER, AppointmentState.NO_SHOW_USER, AppointmentState.NO_SHOW_PROVIDER],
    [AppointmentState.IN_PROGRESS]: [AppointmentState.COMPLETED, AppointmentState.CANCELLED_BY_PROVIDER],
    [AppointmentState.COMPLETED]: [],
    [AppointmentState.CANCELLED_BY_USER]: [],
    [AppointmentState.CANCELLED_BY_PROFESSIONAL]: [],
    [AppointmentState.CANCELLED_BY_PROVIDER]: [],
    [AppointmentState.NO_SHOW]: [],
    [AppointmentState.NO_SHOW_USER]: [],
    [AppointmentState.NO_SHOW_PROVIDER]: [],
    [AppointmentState.RESCHEDULED]: [],
    [AppointmentState.EXPIRED]: [],
    [AppointmentState.FAILED]: []
  },
  AppointmentHoldState: {
    [AppointmentHoldState.ACTIVE]: [AppointmentHoldState.CONSUMED, AppointmentHoldState.EXPIRED, AppointmentHoldState.RELEASED],
    [AppointmentHoldState.CONSUMED]: [],
    [AppointmentHoldState.EXPIRED]: [],
    [AppointmentHoldState.RELEASED]: []
  },
  WaitlistEntryState: {
    [WaitlistEntryState.ACTIVE]: [WaitlistEntryState.OFFERED, WaitlistEntryState.EXPIRED, WaitlistEntryState.CANCELLED],
    [WaitlistEntryState.OFFERED]: [WaitlistEntryState.ACCEPTED, WaitlistEntryState.DECLINED, WaitlistEntryState.EXPIRED, WaitlistEntryState.CANCELLED],
    [WaitlistEntryState.ACCEPTED]: [],
    [WaitlistEntryState.DECLINED]: [WaitlistEntryState.ACTIVE, WaitlistEntryState.CANCELLED],
    [WaitlistEntryState.EXPIRED]: [],
    [WaitlistEntryState.CANCELLED]: []
  },
  WaitlistOfferState: {
    [WaitlistOfferState.PENDING]: [WaitlistOfferState.ACCEPTED, WaitlistOfferState.DECLINED, WaitlistOfferState.EXPIRED],
    [WaitlistOfferState.ACCEPTED]: [],
    [WaitlistOfferState.DECLINED]: [],
    [WaitlistOfferState.EXPIRED]: []
  },
  SubscriptionState: {
    [SubscriptionState.TRIAL]: [SubscriptionState.ACTIVE, SubscriptionState.EXPIRED, SubscriptionState.CANCELLED],
    [SubscriptionState.ACTIVE]: [SubscriptionState.PAST_DUE, SubscriptionState.CANCELLED],
    [SubscriptionState.PAST_DUE]: [SubscriptionState.GRACE, SubscriptionState.ACTIVE, SubscriptionState.CANCELLED],
    [SubscriptionState.GRACE]: [SubscriptionState.ACTIVE, SubscriptionState.EXPIRED, SubscriptionState.CANCELLED],
    [SubscriptionState.CANCELLED]: [SubscriptionState.EXPIRED, SubscriptionState.ACTIVE],
    [SubscriptionState.EXPIRED]: [SubscriptionState.ACTIVE]
  },
  ClinicalArtifactState: {
    [ClinicalArtifactState.DRAFT]: [
      ClinicalArtifactState.EVIDENCE_REQUIRED,
      ClinicalArtifactState.READY_FOR_REVIEW,
      ClinicalArtifactState.CLINICAL_REVIEW_REQUIRED,
      ClinicalArtifactState.UNDER_REVIEW,
      ClinicalArtifactState.IN_REVIEW
    ],
    [ClinicalArtifactState.EVIDENCE_REQUIRED]: [
      ClinicalArtifactState.READY_FOR_REVIEW,
      ClinicalArtifactState.DRAFT,
      ClinicalArtifactState.IN_REVIEW,
      ClinicalArtifactState.UNDER_REVIEW
    ],
    [ClinicalArtifactState.READY_FOR_REVIEW]: [
      ClinicalArtifactState.IN_REVIEW,
      ClinicalArtifactState.UNDER_REVIEW,
      ClinicalArtifactState.DRAFT
    ],
    [ClinicalArtifactState.CLINICAL_REVIEW_REQUIRED]: [
      ClinicalArtifactState.UNDER_REVIEW,
      ClinicalArtifactState.IN_REVIEW,
      ClinicalArtifactState.READY_FOR_REVIEW
    ],
    [ClinicalArtifactState.UNDER_REVIEW]: [
      ClinicalArtifactState.APPROVED,
      ClinicalArtifactState.CONDITIONALLY_APPROVED,
      ClinicalArtifactState.REVISION_REQUIRED,
      ClinicalArtifactState.ACTION_REQUIRED,
      ClinicalArtifactState.REJECTED
    ],
    [ClinicalArtifactState.IN_REVIEW]: [
      ClinicalArtifactState.APPROVED,
      ClinicalArtifactState.CONDITIONALLY_APPROVED,
      ClinicalArtifactState.REVISION_REQUIRED,
      ClinicalArtifactState.ACTION_REQUIRED,
      ClinicalArtifactState.REJECTED
    ],
    [ClinicalArtifactState.ACTION_REQUIRED]: [
      ClinicalArtifactState.DRAFT,
      ClinicalArtifactState.EVIDENCE_REQUIRED,
      ClinicalArtifactState.READY_FOR_REVIEW,
      ClinicalArtifactState.IN_REVIEW,
      ClinicalArtifactState.REJECTED
    ],
    [ClinicalArtifactState.REVISION_REQUIRED]: [
      ClinicalArtifactState.DRAFT,
      ClinicalArtifactState.EVIDENCE_REQUIRED,
      ClinicalArtifactState.READY_FOR_REVIEW,
      ClinicalArtifactState.UNDER_REVIEW,
      ClinicalArtifactState.IN_REVIEW
    ],
    [ClinicalArtifactState.APPROVED]: [
      ClinicalArtifactState.PUBLISHED,
      ClinicalArtifactState.CONDITIONALLY_APPROVED,
      ClinicalArtifactState.MONITORED,
      ClinicalArtifactState.REVIEW_DUE,
      ClinicalArtifactState.EXPIRED,
      ClinicalArtifactState.SUSPENDED,
      ClinicalArtifactState.REVOKED,
      ClinicalArtifactState.SUPERSEDED,
      ClinicalArtifactState.RETIRED
    ],
    [ClinicalArtifactState.CONDITIONALLY_APPROVED]: [
      ClinicalArtifactState.PUBLISHED,
      ClinicalArtifactState.APPROVED,
      ClinicalArtifactState.MONITORED,
      ClinicalArtifactState.REVIEW_DUE,
      ClinicalArtifactState.EXPIRED,
      ClinicalArtifactState.SUSPENDED,
      ClinicalArtifactState.REVOKED,
      ClinicalArtifactState.SUPERSEDED,
      ClinicalArtifactState.RETIRED
    ],
    [ClinicalArtifactState.PUBLISHED]: [
      ClinicalArtifactState.MONITORED,
      ClinicalArtifactState.REVIEW_DUE,
      ClinicalArtifactState.REVALIDATION,
      ClinicalArtifactState.SUSPENDED,
      ClinicalArtifactState.REVOKED,
      ClinicalArtifactState.RETIRED,
      ClinicalArtifactState.SUPERSEDED
    ],
    [ClinicalArtifactState.MONITORED]: [
      ClinicalArtifactState.REVIEW_DUE,
      ClinicalArtifactState.REVALIDATION,
      ClinicalArtifactState.SUSPENDED,
      ClinicalArtifactState.REVOKED,
      ClinicalArtifactState.RETIRED
    ],
    [ClinicalArtifactState.REVIEW_DUE]: [
      ClinicalArtifactState.REVALIDATION,
      ClinicalArtifactState.IN_REVIEW,
      ClinicalArtifactState.UNDER_REVIEW,
      ClinicalArtifactState.EXPIRED,
      ClinicalArtifactState.SUSPENDED,
      ClinicalArtifactState.REVOKED
    ],
    [ClinicalArtifactState.REVALIDATION]: [
      ClinicalArtifactState.PUBLISHED,
      ClinicalArtifactState.APPROVED,
      ClinicalArtifactState.REVISION_REQUIRED,
      ClinicalArtifactState.ACTION_REQUIRED,
      ClinicalArtifactState.RETIRED,
      ClinicalArtifactState.REVOKED
    ],
    [ClinicalArtifactState.SUSPENDED]: [
      ClinicalArtifactState.APPROVED,
      ClinicalArtifactState.CONDITIONALLY_APPROVED,
      ClinicalArtifactState.IN_REVIEW,
      ClinicalArtifactState.UNDER_REVIEW,
      ClinicalArtifactState.REVOKED,
      ClinicalArtifactState.RETIRED
    ],
    [ClinicalArtifactState.EXPIRED]: [
      ClinicalArtifactState.IN_REVIEW,
      ClinicalArtifactState.UNDER_REVIEW,
      ClinicalArtifactState.REVALIDATION,
      ClinicalArtifactState.RETIRED,
      ClinicalArtifactState.REVOKED
    ],
    [ClinicalArtifactState.REVOKED]: [
      ClinicalArtifactState.SUPERSEDED,
      ClinicalArtifactState.RETIRED
    ],
    [ClinicalArtifactState.RETIRED]: [],
    [ClinicalArtifactState.REJECTED]: [
      ClinicalArtifactState.DRAFT
    ],
    [ClinicalArtifactState.SUPERSEDED]: []
  },
  DPIAState: {
    [DPIAState.DRAFT]: [DPIAState.SCREENING],
    [DPIAState.SCREENING]: [DPIAState.REQUIRED, DPIAState.APPROVED],
    [DPIAState.REQUIRED]: [DPIAState.ASSESSING],
    [DPIAState.ASSESSING]: [DPIAState.MITIGATION_REQUIRED, DPIAState.READY_FOR_REVIEW],
    [DPIAState.MITIGATION_REQUIRED]: [DPIAState.READY_FOR_REVIEW, DPIAState.REJECTED],
    [DPIAState.READY_FOR_REVIEW]: [DPIAState.APPROVED, DPIAState.APPROVED_WITH_CONTROLS, DPIAState.REJECTED],
    [DPIAState.APPROVED]: [DPIAState.REVIEW_DUE, DPIAState.SUPERSEDED],
    [DPIAState.APPROVED_WITH_CONTROLS]: [DPIAState.REVIEW_DUE, DPIAState.SUPERSEDED],
    [DPIAState.REVIEW_DUE]: [DPIAState.ASSESSING],
    [DPIAState.SUPERSEDED]: [],
    [DPIAState.REJECTED]: []
  },
  RegulatoryReviewState: {
    [RegulatoryReviewState.NOT_ASSESSED]: [RegulatoryReviewState.CLASSIFICATION_REQUIRED],
    [RegulatoryReviewState.CLASSIFICATION_REQUIRED]: [RegulatoryReviewState.IN_REVIEW],
    [RegulatoryReviewState.IN_REVIEW]: [RegulatoryReviewState.APPROVED, RegulatoryReviewState.APPROVED_WITH_CONDITIONS, RegulatoryReviewState.ADDITIONAL_EVIDENCE_REQUIRED, RegulatoryReviewState.BLOCKED],
    [RegulatoryReviewState.ADDITIONAL_EVIDENCE_REQUIRED]: [RegulatoryReviewState.IN_REVIEW, RegulatoryReviewState.BLOCKED],
    [RegulatoryReviewState.APPROVED]: [RegulatoryReviewState.REVIEW_DUE, RegulatoryReviewState.SUPERSEDED, RegulatoryReviewState.BLOCKED],
    [RegulatoryReviewState.APPROVED_WITH_CONDITIONS]: [RegulatoryReviewState.REVIEW_DUE, RegulatoryReviewState.SUPERSEDED, RegulatoryReviewState.BLOCKED],
    [RegulatoryReviewState.BLOCKED]: [RegulatoryReviewState.IN_REVIEW],
    [RegulatoryReviewState.REVIEW_DUE]: [RegulatoryReviewState.IN_REVIEW],
    [RegulatoryReviewState.SUPERSEDED]: []
  },
  AISystemState: {
    [AISystemState.DRAFT]: [AISystemState.REGISTERED, AISystemState.CONFIGURATION_REQUIRED],
    [AISystemState.REGISTERED]: [AISystemState.CONFIGURATION_REQUIRED, AISystemState.EVALUATION_REQUIRED, AISystemState.REVIEW_REQUIRED, AISystemState.APPROVED],
    [AISystemState.CONFIGURATION_REQUIRED]: [AISystemState.EVALUATION_REQUIRED, AISystemState.DRAFT],
    [AISystemState.EVALUATION_REQUIRED]: [AISystemState.UNDER_EVALUATION, AISystemState.REVIEW_REQUIRED],
    [AISystemState.UNDER_EVALUATION]: [AISystemState.REVIEW_REQUIRED, AISystemState.ACTION_REQUIRED, AISystemState.CLINICAL_REVIEW, AISystemState.PRIVACY_REVIEW, AISystemState.REGULATORY_REVIEW, AISystemState.APPROVED_FOR_LIMITED_USE, AISystemState.APPROVED, AISystemState.REVOKED],
    [AISystemState.REVIEW_REQUIRED]: [AISystemState.IN_REVIEW, AISystemState.CLINICAL_REVIEW, AISystemState.PRIVACY_REVIEW, AISystemState.REGULATORY_REVIEW, AISystemState.ACTION_REQUIRED],
    [AISystemState.IN_REVIEW]: [AISystemState.APPROVED, AISystemState.CONDITIONALLY_APPROVED, AISystemState.ACTION_REQUIRED, AISystemState.REVOKED],
    [AISystemState.CLINICAL_REVIEW]: [AISystemState.APPROVED_FOR_LIMITED_USE, AISystemState.APPROVED, AISystemState.CONDITIONALLY_APPROVED, AISystemState.ACTION_REQUIRED, AISystemState.REVOKED],
    [AISystemState.PRIVACY_REVIEW]: [AISystemState.APPROVED_FOR_LIMITED_USE, AISystemState.APPROVED, AISystemState.CONDITIONALLY_APPROVED, AISystemState.ACTION_REQUIRED, AISystemState.REVOKED],
    [AISystemState.REGULATORY_REVIEW]: [AISystemState.APPROVED_FOR_LIMITED_USE, AISystemState.APPROVED, AISystemState.CONDITIONALLY_APPROVED, AISystemState.ACTION_REQUIRED, AISystemState.REVOKED],
    [AISystemState.ACTION_REQUIRED]: [AISystemState.EVALUATION_REQUIRED, AISystemState.UNDER_EVALUATION, AISystemState.IN_REVIEW, AISystemState.REVOKED],
    [AISystemState.APPROVED]: [AISystemState.ACTIVE, AISystemState.PAUSED, AISystemState.SUSPENDED, AISystemState.REVOKED, AISystemState.EXPIRED, AISystemState.SUPERSEDED, AISystemState.RETIRED],
    [AISystemState.CONDITIONALLY_APPROVED]: [AISystemState.ACTIVE, AISystemState.APPROVED, AISystemState.PAUSED, AISystemState.SUSPENDED, AISystemState.REVOKED, AISystemState.RETIRED],
    [AISystemState.APPROVED_FOR_LIMITED_USE]: [AISystemState.ACTIVE, AISystemState.APPROVED, AISystemState.PAUSED, AISystemState.SUSPENDED, AISystemState.REVOKED],
    [AISystemState.ACTIVE]: [AISystemState.PAUSED, AISystemState.SUSPENDED, AISystemState.REVOKED, AISystemState.EXPIRED, AISystemState.SUPERSEDED, AISystemState.RETIRED],
    [AISystemState.PAUSED]: [AISystemState.ACTIVE, AISystemState.APPROVED, AISystemState.SUSPENDED, AISystemState.REVOKED, AISystemState.RETIRED],
    [AISystemState.SUSPENDED]: [AISystemState.ACTIVE, AISystemState.APPROVED, AISystemState.EVALUATION_REQUIRED, AISystemState.REVOKED, AISystemState.RETIRED],
    [AISystemState.EXPIRED]: [AISystemState.EVALUATION_REQUIRED, AISystemState.REVIEW_REQUIRED, AISystemState.RETIRED],
    [AISystemState.SUPERSEDED]: [AISystemState.RETIRED],
    [AISystemState.REVOKED]: [AISystemState.RETIRED],
    [AISystemState.RETIRED]: []
  },
  GovernanceDecision: {
    [GovernanceDecision.APPROVED]: [GovernanceDecision.RETIRED],
    [GovernanceDecision.APPROVED_WITH_CONTROLS]: [GovernanceDecision.APPROVED, GovernanceDecision.RETIRED],
    [GovernanceDecision.REVISION_REQUIRED]: [GovernanceDecision.APPROVED, GovernanceDecision.BLOCKED],
    [GovernanceDecision.BLOCKED]: [GovernanceDecision.REVISION_REQUIRED, GovernanceDecision.RETIRED],
    [GovernanceDecision.RETIRED]: []
  },
  ContentVersionState: {
    [ContentVersionState.DRAFT]: [ContentVersionState.EDITORIAL_REVIEW, ContentVersionState.CLINICAL_REVIEW_REQUIRED, ContentVersionState.GOVERNANCE_REVIEW, ContentVersionState.APPROVED, ContentVersionState.RETIRED],
    [ContentVersionState.EDITORIAL_REVIEW]: [ContentVersionState.DRAFT, ContentVersionState.CLINICAL_REVIEW_REQUIRED, ContentVersionState.GOVERNANCE_REVIEW, ContentVersionState.APPROVED, ContentVersionState.RETIRED],
    [ContentVersionState.CLINICAL_REVIEW_REQUIRED]: [ContentVersionState.DRAFT, ContentVersionState.GOVERNANCE_REVIEW, ContentVersionState.APPROVED, ContentVersionState.RETIRED],
    [ContentVersionState.GOVERNANCE_REVIEW]: [ContentVersionState.DRAFT, ContentVersionState.APPROVED, ContentVersionState.RETIRED],
    [ContentVersionState.APPROVED]: [ContentVersionState.SCHEDULED, ContentVersionState.PUBLISHED, ContentVersionState.SUSPENDED, ContentVersionState.RETIRED],
    [ContentVersionState.SCHEDULED]: [ContentVersionState.PUBLISHED, ContentVersionState.APPROVED, ContentVersionState.RETIRED],
    [ContentVersionState.PUBLISHED]: [ContentVersionState.SUSPENDED, ContentVersionState.EXPIRED, ContentVersionState.SUPERSEDED, ContentVersionState.RETIRED],
    [ContentVersionState.SUSPENDED]: [ContentVersionState.PUBLISHED, ContentVersionState.RETIRED, ContentVersionState.SUPERSEDED],
    [ContentVersionState.EXPIRED]: [ContentVersionState.RETIRED, ContentVersionState.SUPERSEDED, ContentVersionState.CLINICAL_REVIEW_REQUIRED, ContentVersionState.DRAFT],
    [ContentVersionState.SUPERSEDED]: [ContentVersionState.RETIRED],
    [ContentVersionState.RETIRED]: []
  },
  ExerciseSessionState: {
    [ExerciseSessionState.CREATED]: [ExerciseSessionState.IN_PROGRESS, ExerciseSessionState.ABANDONED, ExerciseSessionState.EXPIRED],
    [ExerciseSessionState.IN_PROGRESS]: [ExerciseSessionState.PAUSED, ExerciseSessionState.COMPLETED, ExerciseSessionState.ABANDONED, ExerciseSessionState.EXPIRED],
    [ExerciseSessionState.PAUSED]: [ExerciseSessionState.IN_PROGRESS, ExerciseSessionState.ABANDONED, ExerciseSessionState.EXPIRED],
    [ExerciseSessionState.COMPLETED]: [],
    [ExerciseSessionState.ABANDONED]: [],
    [ExerciseSessionState.EXPIRED]: []
  },
  ContentProgressState: {
    [ContentProgressState.NOT_STARTED]: [ContentProgressState.IN_PROGRESS, ContentProgressState.COMPLETED],
    [ContentProgressState.IN_PROGRESS]: [ContentProgressState.COMPLETED],
    [ContentProgressState.COMPLETED]: [ContentProgressState.IN_PROGRESS]
  },
  ContentIssueState: {
    [ContentIssueState.REPORTED]: [ContentIssueState.UNDER_REVIEW, ContentIssueState.INVESTIGATING, ContentIssueState.DISMISSED],
    [ContentIssueState.UNDER_REVIEW]: [ContentIssueState.INVESTIGATING, ContentIssueState.RESOLVED, ContentIssueState.DISMISSED],
    [ContentIssueState.INVESTIGATING]: [ContentIssueState.RESOLVED, ContentIssueState.DISMISSED],
    [ContentIssueState.RESOLVED]: [],
    [ContentIssueState.DISMISSED]: []
  },
  ConversationState: {
    [ConversationState.ACTIVE]: [ConversationState.PAUSED, ConversationState.SAFETY_INTERVENED, ConversationState.ESCALATED, ConversationState.CLOSED, ConversationState.ARCHIVED],
    [ConversationState.PAUSED]: [ConversationState.ACTIVE, ConversationState.CLOSED, ConversationState.ARCHIVED],
    [ConversationState.SAFETY_INTERVENED]: [ConversationState.ACTIVE, ConversationState.ESCALATED, ConversationState.CLOSED, ConversationState.ARCHIVED],
    [ConversationState.ESCALATED]: [ConversationState.ACTIVE, ConversationState.CLOSED, ConversationState.ARCHIVED],
    [ConversationState.CLOSED]: [ConversationState.ARCHIVED],
    [ConversationState.ARCHIVED]: []
  },
  CarePathwayState: {
    [CarePathwayState.DRAFT]: [CarePathwayState.REVIEW_REQUIRED, CarePathwayState.RETIRED],
    [CarePathwayState.REVIEW_REQUIRED]: [CarePathwayState.APPROVED, CarePathwayState.DRAFT, CarePathwayState.RETIRED],
    [CarePathwayState.APPROVED]: [CarePathwayState.ACTIVE, CarePathwayState.SUSPENDED, CarePathwayState.RETIRED],
    [CarePathwayState.ACTIVE]: [CarePathwayState.SUSPENDED, CarePathwayState.SUPERSEDED, CarePathwayState.RETIRED, CarePathwayState.EXPIRED],
    [CarePathwayState.SUSPENDED]: [CarePathwayState.ACTIVE, CarePathwayState.RETIRED, CarePathwayState.SUPERSEDED],
    [CarePathwayState.EXPIRED]: [CarePathwayState.RETIRED, CarePathwayState.SUPERSEDED],
    [CarePathwayState.SUPERSEDED]: [CarePathwayState.RETIRED],
    [CarePathwayState.RETIRED]: []
  },
  NavigationSessionState: {
    [NavigationSessionState.CREATED]: [NavigationSessionState.IN_PROGRESS, NavigationSessionState.ABANDONED, NavigationSessionState.EXPIRED],
    [NavigationSessionState.IN_PROGRESS]: [NavigationSessionState.OPTIONS_READY, NavigationSessionState.PATHWAY_SELECTED, NavigationSessionState.REFERRAL_REQUIRED, NavigationSessionState.COMPLETED, NavigationSessionState.ABANDONED, NavigationSessionState.EXPIRED],
    [NavigationSessionState.OPTIONS_READY]: [NavigationSessionState.PATHWAY_SELECTED, NavigationSessionState.REFERRAL_REQUIRED, NavigationSessionState.COMPLETED, NavigationSessionState.ABANDONED, NavigationSessionState.EXPIRED],
    [NavigationSessionState.PATHWAY_SELECTED]: [NavigationSessionState.REFERRAL_REQUIRED, NavigationSessionState.COMPLETED, NavigationSessionState.ABANDONED, NavigationSessionState.EXPIRED],
    [NavigationSessionState.REFERRAL_REQUIRED]: [NavigationSessionState.COMPLETED, NavigationSessionState.ABANDONED, NavigationSessionState.EXPIRED],
    [NavigationSessionState.COMPLETED]: [],
    [NavigationSessionState.ABANDONED]: [],
    [NavigationSessionState.EXPIRED]: []
  },
  ReferralState: {
    [ReferralState.DRAFT]: [ReferralState.READY, ReferralState.CANCELLED, ReferralState.EXPIRED],
    [ReferralState.READY]: [ReferralState.SUBMITTED, ReferralState.CANCELLED, ReferralState.EXPIRED],
    [ReferralState.SUBMITTED]: [ReferralState.RECEIVED, ReferralState.ACTION_REQUIRED, ReferralState.FAILED, ReferralState.CANCELLED, ReferralState.EXPIRED],
    [ReferralState.RECEIVED]: [ReferralState.ACCEPTED, ReferralState.DECLINED, ReferralState.ACTION_REQUIRED, ReferralState.CANCELLED, ReferralState.EXPIRED],
    [ReferralState.ACTION_REQUIRED]: [ReferralState.READY, ReferralState.SUBMITTED, ReferralState.CANCELLED, ReferralState.FAILED, ReferralState.EXPIRED],
    [ReferralState.ACCEPTED]: [ReferralState.SCHEDULED, ReferralState.COMPLETED, ReferralState.CANCELLED, ReferralState.EXPIRED],
    [ReferralState.DECLINED]: [],
    [ReferralState.SCHEDULED]: [ReferralState.COMPLETED, ReferralState.CANCELLED],
    [ReferralState.COMPLETED]: [],
    [ReferralState.CANCELLED]: [],
    [ReferralState.EXPIRED]: [],
    [ReferralState.FAILED]: [ReferralState.READY, ReferralState.DRAFT, ReferralState.CANCELLED]
  },
  HandoffPackageState: {
    [HandoffPackageState.ACTIVE]: [HandoffPackageState.ACCESSED, HandoffPackageState.EXPIRED, HandoffPackageState.REVOKED],
    [HandoffPackageState.ACCESSED]: [HandoffPackageState.EXPIRED, HandoffPackageState.REVOKED],
    [HandoffPackageState.EXPIRED]: [],
    [HandoffPackageState.REVOKED]: []
  },
  ProfessionalProfileState: {
    [ProfessionalProfileState.DRAFT]: [ProfessionalProfileState.ONBOARDING, ProfessionalProfileState.VERIFICATION_REQUIRED, ProfessionalProfileState.RETIRED],
    [ProfessionalProfileState.ONBOARDING]: [ProfessionalProfileState.VERIFICATION_REQUIRED, ProfessionalProfileState.IN_VERIFICATION, ProfessionalProfileState.RETIRED],
    [ProfessionalProfileState.VERIFICATION_REQUIRED]: [ProfessionalProfileState.IN_VERIFICATION, ProfessionalProfileState.ACTION_REQUIRED, ProfessionalProfileState.RETIRED],
    [ProfessionalProfileState.IN_VERIFICATION]: [ProfessionalProfileState.VERIFIED, ProfessionalProfileState.ACTION_REQUIRED, ProfessionalProfileState.REVOKED, ProfessionalProfileState.RETIRED],
    [ProfessionalProfileState.ACTION_REQUIRED]: [ProfessionalProfileState.IN_VERIFICATION, ProfessionalProfileState.RETIRED],
    [ProfessionalProfileState.VERIFIED]: [ProfessionalProfileState.ACTIVE, ProfessionalProfileState.RESTRICTED, ProfessionalProfileState.SUSPENDED, ProfessionalProfileState.EXPIRED, ProfessionalProfileState.RETIRED],
    [ProfessionalProfileState.ACTIVE]: [ProfessionalProfileState.RESTRICTED, ProfessionalProfileState.SUSPENDED, ProfessionalProfileState.EXPIRED, ProfessionalProfileState.REVOKED, ProfessionalProfileState.RETIRED],
    [ProfessionalProfileState.RESTRICTED]: [ProfessionalProfileState.ACTIVE, ProfessionalProfileState.SUSPENDED, ProfessionalProfileState.EXPIRED, ProfessionalProfileState.REVOKED, ProfessionalProfileState.RETIRED],
    [ProfessionalProfileState.SUSPENDED]: [ProfessionalProfileState.ACTIVE, ProfessionalProfileState.RESTRICTED, ProfessionalProfileState.REVOKED, ProfessionalProfileState.RETIRED],
    [ProfessionalProfileState.EXPIRED]: [ProfessionalProfileState.IN_VERIFICATION, ProfessionalProfileState.ACTIVE, ProfessionalProfileState.RETIRED],
    [ProfessionalProfileState.REVOKED]: [ProfessionalProfileState.RETIRED],
    [ProfessionalProfileState.RETIRED]: []
  },
  VerificationCaseState: {
    [VerificationCaseState.DRAFT]: [VerificationCaseState.SUBMITTED],
    [VerificationCaseState.SUBMITTED]: [VerificationCaseState.IN_REVIEW, VerificationCaseState.ACTION_REQUIRED, VerificationCaseState.REJECTED],
    [VerificationCaseState.IN_REVIEW]: [VerificationCaseState.VERIFIED, VerificationCaseState.ACTION_REQUIRED, VerificationCaseState.REJECTED, VerificationCaseState.EXPIRED, VerificationCaseState.REVOKED],
    [VerificationCaseState.ACTION_REQUIRED]: [VerificationCaseState.IN_REVIEW, VerificationCaseState.REJECTED, VerificationCaseState.EXPIRED],
    [VerificationCaseState.VERIFIED]: [VerificationCaseState.EXPIRED, VerificationCaseState.REVOKED],
    [VerificationCaseState.REJECTED]: [VerificationCaseState.SUBMITTED],
    [VerificationCaseState.EXPIRED]: [VerificationCaseState.SUBMITTED],
    [VerificationCaseState.REVOKED]: []
  },
  ServiceOfferingState: {
    [ServiceOfferingState.DRAFT]: [ServiceOfferingState.ACTIVE, ServiceOfferingState.RETIRED],
    [ServiceOfferingState.ACTIVE]: [ServiceOfferingState.PAUSED, ServiceOfferingState.SUSPENDED, ServiceOfferingState.RETIRED],
    [ServiceOfferingState.PAUSED]: [ServiceOfferingState.ACTIVE, ServiceOfferingState.SUSPENDED, ServiceOfferingState.RETIRED],
    [ServiceOfferingState.SUSPENDED]: [ServiceOfferingState.ACTIVE, ServiceOfferingState.RETIRED],
    [ServiceOfferingState.RETIRED]: []
  },
  ProviderLifecycleStatus: {
    [ProviderLifecycleStatus.DRAFT]: [ProviderLifecycleStatus.PENDING_VERIFICATION, ProviderLifecycleStatus.RETIRED],
    [ProviderLifecycleStatus.PENDING_VERIFICATION]: [ProviderLifecycleStatus.ACTIVE, ProviderLifecycleStatus.RESTRICTED, ProviderLifecycleStatus.RETIRED],
    [ProviderLifecycleStatus.ACTIVE]: [ProviderLifecycleStatus.RESTRICTED, ProviderLifecycleStatus.SUSPENDED, ProviderLifecycleStatus.RETIRED],
    [ProviderLifecycleStatus.RESTRICTED]: [ProviderLifecycleStatus.ACTIVE, ProviderLifecycleStatus.SUSPENDED, ProviderLifecycleStatus.RETIRED],
    [ProviderLifecycleStatus.SUSPENDED]: [ProviderLifecycleStatus.ACTIVE, ProviderLifecycleStatus.RESTRICTED, ProviderLifecycleStatus.RETIRED],
    [ProviderLifecycleStatus.RETIRED]: []
  },
  CareTeamMembershipState: {
    [CareTeamMembershipState.ACTIVE]: [CareTeamMembershipState.INACTIVE, CareTeamMembershipState.SUSPENDED, CareTeamMembershipState.REMOVED],
    [CareTeamMembershipState.INACTIVE]: [CareTeamMembershipState.ACTIVE, CareTeamMembershipState.REMOVED],
    [CareTeamMembershipState.SUSPENDED]: [CareTeamMembershipState.ACTIVE, CareTeamMembershipState.REMOVED],
    [CareTeamMembershipState.REMOVED]: []
  },
  ClinicalEncounterState: {
    [ClinicalEncounterState.PLANNED]: [ClinicalEncounterState.SCHEDULED, ClinicalEncounterState.IN_PROGRESS, ClinicalEncounterState.CANCELLED],
    [ClinicalEncounterState.SCHEDULED]: [ClinicalEncounterState.IN_PROGRESS, ClinicalEncounterState.CANCELLED, ClinicalEncounterState.NO_SHOW],
    [ClinicalEncounterState.IN_PROGRESS]: [ClinicalEncounterState.COMPLETED, ClinicalEncounterState.CANCELLED],
    [ClinicalEncounterState.COMPLETED]: [],
    [ClinicalEncounterState.CANCELLED]: [],
    [ClinicalEncounterState.NO_SHOW]: []
  },
  ClinicalNoteState: {
    [ClinicalNoteState.DRAFT]: [ClinicalNoteState.IN_REVIEW, ClinicalNoteState.SIGNED, ClinicalNoteState.CANCELLED],
    [ClinicalNoteState.IN_REVIEW]: [ClinicalNoteState.DRAFT, ClinicalNoteState.SIGNED, ClinicalNoteState.CANCELLED],
    [ClinicalNoteState.SIGNED]: [ClinicalNoteState.AMENDED, ClinicalNoteState.SUPERSEDED],
    [ClinicalNoteState.AMENDED]: [ClinicalNoteState.SUPERSEDED],
    [ClinicalNoteState.SUPERSEDED]: [],
    [ClinicalNoteState.CANCELLED]: []
  },
  CarePlanState: {
    [CarePlanState.DRAFT]: [CarePlanState.REVIEW_REQUIRED, CarePlanState.PENDING_USER_ACKNOWLEDGEMENT, CarePlanState.ACTIVE, CarePlanState.REVOKED],
    [CarePlanState.REVIEW_REQUIRED]: [CarePlanState.DRAFT, CarePlanState.PENDING_USER_ACKNOWLEDGEMENT, CarePlanState.ACTIVE, CarePlanState.REVOKED],
    [CarePlanState.PENDING_USER_ACKNOWLEDGEMENT]: [CarePlanState.ACTIVE, CarePlanState.DRAFT, CarePlanState.REVOKED],
    [CarePlanState.ACTIVE]: [CarePlanState.PAUSED, CarePlanState.UNDER_REVIEW, CarePlanState.COMPLETED, CarePlanState.TERMINATED, CarePlanState.SUPERSEDED, CarePlanState.REVOKED],
    [CarePlanState.PAUSED]: [CarePlanState.ACTIVE, CarePlanState.UNDER_REVIEW, CarePlanState.TERMINATED, CarePlanState.REVOKED],
    [CarePlanState.UNDER_REVIEW]: [CarePlanState.ACTIVE, CarePlanState.SUPERSEDED, CarePlanState.COMPLETED, CarePlanState.TERMINATED, CarePlanState.REVOKED],
    [CarePlanState.COMPLETED]: [],
    [CarePlanState.TERMINATED]: [],
    [CarePlanState.SUPERSEDED]: [],
    [CarePlanState.REVOKED]: []
  },
  CareGoalStatus: {
    [CareGoalStatus.NOT_STARTED]: [CareGoalStatus.IN_PROGRESS, CareGoalStatus.CANCELLED, CareGoalStatus.PAUSED],
    [CareGoalStatus.IN_PROGRESS]: [CareGoalStatus.ON_TRACK, CareGoalStatus.AT_RISK, CareGoalStatus.ACHIEVED, CareGoalStatus.NOT_ACHIEVED, CareGoalStatus.PAUSED, CareGoalStatus.CANCELLED],
    [CareGoalStatus.ON_TRACK]: [CareGoalStatus.AT_RISK, CareGoalStatus.ACHIEVED, CareGoalStatus.NOT_ACHIEVED, CareGoalStatus.PAUSED, CareGoalStatus.CANCELLED],
    [CareGoalStatus.AT_RISK]: [CareGoalStatus.ON_TRACK, CareGoalStatus.IN_PROGRESS, CareGoalStatus.ACHIEVED, CareGoalStatus.NOT_ACHIEVED, CareGoalStatus.PAUSED, CareGoalStatus.CANCELLED],
    [CareGoalStatus.PAUSED]: [CareGoalStatus.IN_PROGRESS, CareGoalStatus.ON_TRACK, CareGoalStatus.CANCELLED],
    [CareGoalStatus.ACHIEVED]: [],
    [CareGoalStatus.NOT_ACHIEVED]: [CareGoalStatus.IN_PROGRESS],
    [CareGoalStatus.CANCELLED]: []
  },
  ClinicalTaskState: {
    [ClinicalTaskState.PENDING]: [ClinicalTaskState.READY, ClinicalTaskState.BLOCKED, ClinicalTaskState.CANCELLED],
    [ClinicalTaskState.BLOCKED]: [ClinicalTaskState.READY, ClinicalTaskState.CANCELLED],
    [ClinicalTaskState.READY]: [ClinicalTaskState.IN_PROGRESS, ClinicalTaskState.COMPLETED, ClinicalTaskState.OVERDUE, ClinicalTaskState.SKIPPED, ClinicalTaskState.CANCELLED, ClinicalTaskState.FAILED],
    [ClinicalTaskState.IN_PROGRESS]: [ClinicalTaskState.COMPLETED, ClinicalTaskState.OVERDUE, ClinicalTaskState.SKIPPED, ClinicalTaskState.CANCELLED, ClinicalTaskState.FAILED],
    [ClinicalTaskState.OVERDUE]: [ClinicalTaskState.IN_PROGRESS, ClinicalTaskState.COMPLETED, ClinicalTaskState.SKIPPED, ClinicalTaskState.CANCELLED, ClinicalTaskState.FAILED],
    [ClinicalTaskState.COMPLETED]: [],
    [ClinicalTaskState.SKIPPED]: [],
    [ClinicalTaskState.CANCELLED]: [],
    [ClinicalTaskState.FAILED]: [ClinicalTaskState.READY, ClinicalTaskState.CANCELLED]
  },
  ProfessionalThreadStatus: {
    [ProfessionalThreadStatus.OPEN]: [ProfessionalThreadStatus.PAUSED, ProfessionalThreadStatus.CLOSED, ProfessionalThreadStatus.ARCHIVED],
    [ProfessionalThreadStatus.PAUSED]: [ProfessionalThreadStatus.OPEN, ProfessionalThreadStatus.CLOSED, ProfessionalThreadStatus.ARCHIVED],
    [ProfessionalThreadStatus.CLOSED]: [ProfessionalThreadStatus.ARCHIVED],
    [ProfessionalThreadStatus.ARCHIVED]: []
  },
  MessageDeliveryStatus: {
    [MessageDeliveryStatus.SENT]: [MessageDeliveryStatus.DELIVERED, MessageDeliveryStatus.READ],
    [MessageDeliveryStatus.DELIVERED]: [MessageDeliveryStatus.READ],
    [MessageDeliveryStatus.READ]: []
  },
  OutcomeReviewState: {
    [OutcomeReviewState.PENDING]: [OutcomeReviewState.READY, OutcomeReviewState.IN_REVIEW, OutcomeReviewState.CANCELLED],
    [OutcomeReviewState.READY]: [OutcomeReviewState.IN_REVIEW, OutcomeReviewState.CANCELLED],
    [OutcomeReviewState.IN_REVIEW]: [OutcomeReviewState.ACTION_REQUIRED, OutcomeReviewState.COMPLETED, OutcomeReviewState.CANCELLED],
    [OutcomeReviewState.ACTION_REQUIRED]: [OutcomeReviewState.COMPLETED, OutcomeReviewState.CANCELLED],
    [OutcomeReviewState.COMPLETED]: [],
    [OutcomeReviewState.CANCELLED]: []
  },
  OutcomeAlertState: {
    [OutcomeAlertState.OPEN]: [OutcomeAlertState.ACKNOWLEDGED, OutcomeAlertState.IN_REVIEW, OutcomeAlertState.RESOLVED, OutcomeAlertState.DISMISSED],
    [OutcomeAlertState.ACKNOWLEDGED]: [OutcomeAlertState.IN_REVIEW, OutcomeAlertState.RESOLVED, OutcomeAlertState.DISMISSED],
    [OutcomeAlertState.IN_REVIEW]: [OutcomeAlertState.RESOLVED, OutcomeAlertState.DISMISSED],
    [OutcomeAlertState.RESOLVED]: [],
    [OutcomeAlertState.DISMISSED]: []
  },
  OutcomeMeasurementValidity: {
    [OutcomeMeasurementValidity.VALID]: [OutcomeMeasurementValidity.INVALIDATED, OutcomeMeasurementValidity.SUPERSEDED, OutcomeMeasurementValidity.EXPIRED, OutcomeMeasurementValidity.QUESTIONABLE],
    [OutcomeMeasurementValidity.QUESTIONABLE]: [OutcomeMeasurementValidity.VALID, OutcomeMeasurementValidity.INVALIDATED, OutcomeMeasurementValidity.SUPERSEDED],
    [OutcomeMeasurementValidity.INVALIDATED]: [],
    [OutcomeMeasurementValidity.SUPERSEDED]: [],
    [OutcomeMeasurementValidity.EXPIRED]: []
  }
};

/**
 * Validates a state transition against the canonical state machine.
 * Throws DomainInvariantError if invalid.
 */
export function validateStateTransition<T extends string>(
  stateMachineName: keyof typeof ALLOWED_TRANSITIONS,
  fromState: T,
  toState: T,
  entityId: string,
  actorId?: string
): void {
  const machine = ALLOWED_TRANSITIONS[stateMachineName] as Record<string, string[]>;
  if (!machine) {
    throw new DomainInvariantError(`Unknown state machine: ${String(stateMachineName)}`);
  }

  const allowedTargets = machine[fromState] || [];
  if (!allowedTargets.includes(toState)) {
    AuditService.record({
      actor_type: actorId ? 'STAFF' : 'SERVICE',
      actor_id: actorId,
      action: `STATE_MACHINE.INVALID_TRANSITION.${String(stateMachineName)}`,
      resource_type: String(stateMachineName),
      resource_id: entityId,
      purpose: 'State Transition Validation',
      authorization_basis: { fromState, toState },
      result: 'DENIED',
      metadata: { fromState, toState, allowedTargets }
    });

    throw new DomainInvariantError(
      `INVALID_STATE_TRANSITION: Cannot transition ${String(stateMachineName)} on entity ${entityId} from ${fromState} to ${toState}. Allowed: [${allowedTargets.join(', ')}]`,
      {
        safeUserMessage: `The requested lifecycle transition from ${fromState} to ${toState} is invalid.`
      }
    );
  }

  // Audit sensitive state transitions
  AuditService.record({
    actor_type: actorId ? 'STAFF' : 'SERVICE',
    actor_id: actorId,
    action: `STATE_MACHINE.TRANSITION.${String(stateMachineName)}`,
    resource_type: String(stateMachineName),
    resource_id: entityId,
    purpose: 'State Transition Executed',
    authorization_basis: { fromState, toState },
    result: 'ALLOWED',
    metadata: { fromState, toState }
  });
}
