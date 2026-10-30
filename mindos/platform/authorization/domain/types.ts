/**
 * MindOS Canonical Authorization Domain Types & Contracts
 * Authority: Master Architecture Index Section 14, Volume VIII & Appendix F
 * ADR-016, ADR-017, ADR-018
 * 
 * Strict Invariants:
 * - Deny-by-default is non-negotiable.
 * - Platform Admin SHALL NOT imply unrestricted health or clinical record access (R-SEC-001).
 * - Moderators SHALL NOT access clinical notes, assessments or private journals (R-COM-001).
 * - Identity ("who you are") is strictly separate from Authorization ("what you can do").
 */

import { DataClassification } from '../../shared/data_classification.js';

export enum RoleCode {
  USER = 'USER',
  PROFESSIONAL = 'PROFESSIONAL',
  VERIFIED_PROFESSIONAL = 'VERIFIED_PROFESSIONAL',
  PEER_SUPPORTER = 'PEER_SUPPORTER',
  MODERATOR = 'MODERATOR',
  SAFETY_REVIEWER = 'SAFETY_REVIEWER',
  CLINICAL_REVIEWER = 'CLINICAL_REVIEWER',
  CLINICAL_ADMIN = 'CLINICAL_ADMIN',
  PRIVACY_OFFICER = 'PRIVACY_OFFICER',
  REGULATORY_REVIEWER = 'REGULATORY_REVIEWER',
  PROVIDER_VERIFICATION_REVIEWER = 'PROVIDER_VERIFICATION_REVIEWER',
  PROFESSIONAL_NETWORK_ADMIN = 'PROFESSIONAL_NETWORK_ADMIN',
  AI_SAFETY_REVIEWER = 'AI_SAFETY_REVIEWER',
  SECURITY_REVIEWER = 'SECURITY_REVIEWER',
  SUPPORT_AGENT = 'SUPPORT_AGENT',
  FINANCE_OPERATOR = 'FINANCE_OPERATOR',
  ORG_ADMIN = 'ORG_ADMIN',
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  ADMIN = 'ADMIN',
  AUDITOR = 'AUDITOR',
  SYSTEM_SERVICE = 'SYSTEM_SERVICE'
}

export enum RoleScope {
  GLOBAL = 'GLOBAL',
  ORGANIZATION = 'ORGANIZATION',
  COMMUNITY = 'COMMUNITY',
  CLINIC = 'CLINIC',
  JURISDICTION = 'JURISDICTION'
}

export enum RoleAssignmentStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED'
}

export interface ActorRoleAssignment {
  id: string; // UUIDv7
  actor_id: string;
  role: RoleCode | string;
  scope: RoleScope;
  organization_id?: string | null;
  community_id?: string | null;
  jurisdiction?: string | null;
  status: RoleAssignmentStatus;
  assigned_by: string;
  assigned_at: string;
  expires_at?: string | null;
  revoked_at?: string | null;
  revocation_reason?: string | null;
}

export interface ActorContext {
  actor_id: string;
  identity_account_id: string;
  actor_type: RoleCode | string;
  session_id?: string;
  roles: string[];
  active_role_assignments?: ActorRoleAssignment[];
  scopes: string[];
  organization_context?: {
    orgId?: string;
    orgRole?: string;
  };
  professional_context?: {
    isVerified?: boolean;
    licenseNumber?: string;
    specialties?: string[];
  };
  security_attributes?: {
    accountState?: string;
    securityVersion?: number;
    mfaVerified?: boolean;
    recentAuth?: boolean;
  };
  jurisdiction?: string;
}

export interface ResourceTarget {
  type: string;
  id?: string;
  ownerId?: string;
  organizationId?: string;
  authorId?: string;
  assignedReviewerId?: string;
  classification?: DataClassification;
  attributes?: Record<string, unknown>;
}

export interface RelationshipContext {
  careRelationshipActive?: boolean;
  hasActiveCareRelationship?: boolean;
  relationshipType?: string;
  status?: string;
  caregiverId?: string;
  patientId?: string;
}

export interface ConsentContext {
  consentGrantActive?: boolean;
  consentReceiptId?: string;
  scopes?: string[];
}

export interface AuthorizationRequest {
  actor: ActorContext;
  action: string;
  resource: ResourceTarget;
  purpose?: string;
  context?: Record<string, unknown>;
  environment?: {
    ipAddress?: string;
    userAgent?: string;
    requestTime?: string;
  };
  relationship_context?: RelationshipContext;
  scope_context?: string[];
  consent_context?: ConsentContext;
  jurisdiction_context?: string;
  correlation_id?: string;
}

export type PolicyEffect = 'ALLOW' | 'DENY' | 'CONDITIONAL';

export interface PolicyDecision {
  decision_id: string; // UUIDv7
  effect: PolicyEffect;
  allowed: boolean;
  reason_code: string;
  reason: string;
  denialReason?: string; // Backward compatibility alias for reason
  errorCode?: string;
  policy_id: string;
  policy_version: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  purpose: string;
  context: Record<string, unknown>;
  evaluated_at: string;
  correlation_id?: string;
  conditions?: string[];
}

export type PolicyStatus = 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'RETIRED';

export interface PolicyDefinition {
  policy_id: string;
  name: string;
  domain: string;
  version: string;
  description: string;
  status: PolicyStatus;
  resource_type: string;
  actions: string[];
  classification: DataClassification;
  effective_at: string;
  supersedes?: string;
  owner: string;
}

// Backward compatibility interfaces matching Sprint 1-3 AuthorizationEngine
export interface ActorPrincipal {
  id: string;
  role: RoleCode | string;
  roles?: string[];
  jurisdiction?: string;
  orgId?: string;
}

export interface AuthContext {
  purpose: string;
  scope?: string;
  careRelationshipActive?: boolean;
  hasActiveCareRelationship?: boolean;
  consentGrantActive?: boolean;
  breakGlassActive?: boolean;
  [key: string]: unknown;
}

export interface AuthDecision {
  allowed: boolean;
  reason: string;
  denialReason?: string;
  errorCode?: string;
  decision_id?: string;
  effect?: PolicyEffect;
  reason_code?: string;
  policy_id?: string;
  policy_version?: string;
}

export interface EvaluateParams {
  subjectId?: string;
  subjectRoles?: string[];
  action: string;
  resourceType: string;
  resourceId?: string;
  purpose?: string;
  context?: Record<string, unknown>;
}
