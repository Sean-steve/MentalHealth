/**
 * MindOS Canonical Consent Domain Types & Enums
 * Authority: Master Architecture Index Section 14, Volume III, IV, VIII & Appendices B, C, D, E, F
 * ADR-006, ADR-016, ADR-019, ADR-020, ADR-021
 */

import { ConsentState } from '../../platform/shared/state_machines.js';

export { ConsentState };

export enum ConsentCategory {
  PLATFORM_TERMS = 'PLATFORM_TERMS',
  PRIVACY_PROCESSING = 'PRIVACY_PROCESSING',
  AI_PROCESSING = 'AI_PROCESSING',
  AI_PERSONALIZATION = 'AI_PERSONALIZATION',
  COMMUNITY_PARTICIPATION = 'COMMUNITY_PARTICIPATION',
  PROFESSIONAL_DATA_SHARING = 'PROFESSIONAL_DATA_SHARING',
  TRUSTED_PERSON_SHARING = 'TRUSTED_PERSON_SHARING',
  RESEARCH = 'RESEARCH',
  PRODUCT_ANALYTICS = 'PRODUCT_ANALYTICS',
  MARKETING = 'MARKETING'
}

export enum ConsentCode {
  PLATFORM_TERMS = 'CONSENT_PLATFORM_TERMS',
  PRIVACY_PROCESSING = 'CONSENT_PRIVACY_PROCESSING',
  AI_PROCESSING = 'CONSENT_AI_PROCESSING',
  AI_PERSONALIZATION = 'CONSENT_AI_PERSONALIZATION',
  COMMUNITY_PARTICIPATION = 'CONSENT_COMMUNITY_PARTICIPATION',
  PROFESSIONAL_DATA_SHARING = 'CONSENT_PROFESSIONAL_DATA_SHARING',
  TRUSTED_PERSON_SHARING = 'CONSENT_TRUSTED_PERSON_SHARING',
  RESEARCH = 'CONSENT_RESEARCH',
  PRODUCT_ANALYTICS = 'CONSENT_PRODUCT_ANALYTICS',
  MARKETING = 'CONSENT_MARKETING'
}

export enum ConsentRequirementType {
  REQUIRED_FOR_SERVICE = 'REQUIRED_FOR_SERVICE',
  OPTIONAL = 'OPTIONAL',
  CONTEXTUAL = 'CONTEXTUAL'
}

export enum ConsentScopeType {
  GLOBAL_TO_PURPOSE = 'GLOBAL_TO_PURPOSE',
  RESOURCE_TYPE = 'RESOURCE_TYPE',
  SPECIFIC_RESOURCE = 'SPECIFIC_RESOURCE',
  SPECIFIC_RECIPIENT = 'SPECIFIC_RECIPIENT',
  SPECIFIC_RELATIONSHIP = 'SPECIFIC_RELATIONSHIP'
}

export enum ConsentDecisionEffect {
  ALLOW = 'ALLOW',
  DENY = 'DENY',
  NOT_REQUIRED = 'NOT_REQUIRED',
  REQUIRES_CONSENT = 'REQUIRES_CONSENT',
  UNKNOWN = 'UNKNOWN'
}

export interface ConsentExpiryPolicy {
  has_expiry: boolean;
  default_duration_days?: number;
}

export interface ConsentVersioningPolicy {
  requires_reconsent_on_material_change: boolean;
}

export interface ConsentDefinition {
  id: string; // UUIDv7
  code: string; // e.g. CONSENT_AI_PROCESSING
  name: string;
  description: string;
  category: ConsentCategory;
  purpose: string; // canonical purpose code
  data_categories: string[];
  required_or_optional: ConsentRequirementType;
  withdrawal_allowed: boolean;
  expiry_policy: ConsentExpiryPolicy;
  jurisdiction_scope: string[]; // ['KE', 'GLOBAL']
  versioning_policy: ConsentVersioningPolicy;
  status: 'ACTIVE' | 'DRAFT' | 'DEPRECATED';
  processing_activity_id?: string;
  dpia_assessment_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ConsentPolicyVersion {
  id: string; // UUIDv7
  consent_definition_id: string;
  consent_code: string;
  version: string; // semver e.g. 1.0.0
  title: string;
  summary: string;
  full_text_reference: string;
  effective_at: string;
  retired_at?: string;
  jurisdiction: string;
  language: string;
  status: 'ACTIVE' | 'SUPERSEDED' | 'RETIRED';
  is_material_change: boolean;
  approved_by: string;
  created_at: string;
}

export interface ConsentEvidence {
  id: string; // UUIDv7
  consent_grant_id: string;
  presentation_version: string;
  policy_version: string;
  language: string;
  interface: string;
  interaction_type: 'GRANT' | 'DECLINE' | 'WITHDRAW';
  captured_at: string;
  request_context: {
    ip_hash?: string;
    user_agent?: string;
    correlation_id?: string;
    presented_copy_summary?: string;
    details?: Record<string, unknown>;
  };
  evidence_hash: string; // SHA-256
}

export interface ConsentScopeEntry {
  id: string;
  consent_grant_id: string;
  scope_type: ConsentScopeType;
  target_type: string; // e.g. 'assessment_summary', 'care_summary', 'journal'
  target_id?: string;
  is_allowed: boolean;
  created_at: string;
}

export interface ConsentRecipient {
  id: string;
  consent_grant_id: string;
  recipient_type: 'PROFESSIONAL' | 'TRUSTED_PERSON' | 'ORGANIZATION' | 'RESEARCH_STUDY';
  recipient_id: string; // specific actor/org ID
  recipient_name?: string;
  role?: string;
  expires_at?: string;
  created_at: string;
}

export interface ConsentGrant {
  id: string; // UUIDv7
  subject_user_id: string;
  consent_definition_id: string;
  consent_code: string;
  policy_version_id: string;
  policy_version: string;
  status: ConsentState;
  granted_at?: string;
  declined_at?: string;
  withdrawn_at?: string;
  expires_at?: string;
  source: string;
  method: string;
  jurisdiction: string;
  evidence_id?: string;
  correlation_id: string;
  authority_type: 'SELF' | 'GUARDIAN' | 'LEGAL_REPRESENTATIVE';
  withdrawal_reason?: string;
  scopes?: ConsentScopeEntry[];
  recipients?: ConsentRecipient[];
  created_at: string;
  updated_at: string;
}

export interface ConsentReceipt {
  receipt_id: string;
  subject_user_id: string;
  consent_code: string;
  consent_name: string;
  category: ConsentCategory;
  purpose: string;
  policy_version: string;
  status: ConsentState;
  granted_at?: string;
  withdrawn_at?: string;
  expires_at?: string;
  jurisdiction: string;
  data_categories: string[];
  evidence_hash?: string;
  generated_at: string;
  verified_authentic: boolean;
}

export interface ConsentDecisionResult {
  effect: ConsentDecisionEffect;
  allowed: boolean;
  reason: string;
  reasonCode: string;
  consentCode?: string;
  grantId?: string;
  policyVersion?: string;
  expiresAt?: string;
}

export interface ConsentEvaluationRequest {
  subjectId: string;
  actorId: string;
  resourceType: string;
  action?: string;
  purpose: string;
  scope?: string;
  recipientId?: string;
  jurisdiction?: string;
  context?: Record<string, unknown>;
}

export interface PrivacyCentreConsentItem {
  code: string;
  name: string;
  description: string;
  category: ConsentCategory;
  purpose: string;
  data_categories: string[];
  required_or_optional: ConsentRequirementType;
  withdrawal_allowed: boolean;
  status: ConsentState;
  current_policy_version: string;
  granted_policy_version?: string;
  requires_reconsent: boolean;
  granted_at?: string;
  withdrawn_at?: string;
  expires_at?: string;
  grant_id?: string;
}
