/**
 * MindOS Canonical Permission Registry Constants & Helpers
 * Authority: Master Architecture Index Section 14, Volume VIII & Appendix F
 * Format: <domain>.<resource>.<action>
 */

export const CanonicalPermissions = {
  // Identity & Account Domain
  IDENTITY_ACCOUNT_READ_OWN: 'identity.account.read_own',
  IDENTITY_ACCOUNT_MANAGE_OWN: 'identity.account.manage_own',
  IDENTITY_SESSION_READ_OWN: 'identity.session.read_own',
  IDENTITY_SESSION_REVOKE_OWN: 'identity.session.revoke_own',
  IDENTITY_SESSION_READ_ALL: 'identity.session.read_all',
  IDENTITY_SESSION_REVOKE_ALL: 'identity.session.revoke_all',

  // Community Domain
  COMMUNITY_POST_READ: 'community.post.read',
  COMMUNITY_POST_CREATE: 'community.post.create',
  COMMUNITY_POST_DELETE_OWN: 'community.post.delete_own',
  COMMUNITY_POST_MODERATE: 'community.post.moderate',
  COMMUNITY_MODERATE: 'community.moderate',

  // Clinical & Care Domain
  CLINICAL_RECORD_READ: 'clinical.record.read',
  CLINICAL_RECORD_CREATE: 'clinical.record.create',
  CLINICAL_RECORD_UPDATE: 'clinical.record.update',
  CARE_RELATIONSHIP_VIEW: 'care.relationship.view',
  CARE_APPOINTMENT_MANAGE: 'care.appointment.manage',

  // Governance Domain
  GOVERNANCE_CLINICAL_REVIEW: 'governance.clinical.review',
  GOVERNANCE_PRIVACY_REVIEW: 'governance.privacy.review',
  GOVERNANCE_REGULATORY_REVIEW: 'governance.regulatory.review',
  GOVERNANCE_AI_SAFETY_REVIEW: 'governance.ai_safety.review',

  // Professional & Provider Domain
  PROFESSIONAL_PROFILE_READ_OWN: 'professional.profile.read_own',
  PROFESSIONAL_PROFILE_UPDATE_OWN: 'professional.profile.update_own',
  PROFESSIONAL_CREDENTIALS_SUBMIT: 'professional.credentials.submit',
  PROFESSIONAL_SERVICES_MANAGE: 'professional.services.manage',
  PROFESSIONAL_REFERRALS_READ_ASSIGNED: 'professional.referrals.read_assigned',
  PROFESSIONAL_REFERRALS_ACCEPT: 'professional.referrals.accept',
  PROFESSIONAL_REFERRALS_DECLINE: 'professional.referrals.decline',
  PROVIDER_VERIFICATION_REVIEW: 'provider.verification.review',
  PROVIDER_VERIFICATION_DECIDE: 'provider.verification.decide',
  PROVIDER_VERIFICATION_SUSPEND: 'provider.verification.suspend',

  // Administration Domain
  ADMINISTRATION_USER_MANAGE: 'administration.user.manage',
  ADMINISTRATION_CONFIG_MANAGE: 'administration.config.manage',
  ADMINISTRATION_AUDIT_READ: 'administration.audit.read'
} as const;

export type CanonicalPermission = typeof CanonicalPermissions[keyof typeof CanonicalPermissions];

export interface PermissionDefinition {
  code: string;
  domain: string;
  resource: string;
  action: string;
  description: string;
  minClassification: string;
}

export const CANONICAL_PERMISSION_CATALOG: PermissionDefinition[] = [
  {
    code: CanonicalPermissions.IDENTITY_ACCOUNT_READ_OWN,
    domain: 'identity',
    resource: 'account',
    action: 'read_own',
    description: 'Read own account information and profile state',
    minClassification: 'PERSONAL'
  },
  {
    code: CanonicalPermissions.IDENTITY_ACCOUNT_MANAGE_OWN,
    domain: 'identity',
    resource: 'account',
    action: 'manage_own',
    description: 'Update own account settings, password, and preferences',
    minClassification: 'PERSONAL'
  },
  {
    code: CanonicalPermissions.IDENTITY_SESSION_READ_OWN,
    domain: 'identity',
    resource: 'session',
    action: 'read_own',
    description: 'List and view own active authentication sessions',
    minClassification: 'PERSONAL'
  },
  {
    code: CanonicalPermissions.IDENTITY_SESSION_REVOKE_OWN,
    domain: 'identity',
    resource: 'session',
    action: 'revoke_own',
    description: 'Terminate or revoke own authentication sessions',
    minClassification: 'PERSONAL'
  },
  {
    code: CanonicalPermissions.IDENTITY_SESSION_READ_ALL,
    domain: 'identity',
    resource: 'session',
    action: 'read_all',
    description: 'Administrative inspection of all platform active sessions',
    minClassification: 'INTERNAL'
  },
  {
    code: CanonicalPermissions.IDENTITY_SESSION_REVOKE_ALL,
    domain: 'identity',
    resource: 'session',
    action: 'revoke_all',
    description: 'Administrative termination of platform sessions for security',
    minClassification: 'INTERNAL'
  },
  {
    code: CanonicalPermissions.COMMUNITY_POST_READ,
    domain: 'community',
    resource: 'post',
    action: 'read',
    description: 'Read published public community posts',
    minClassification: 'PUBLIC'
  },
  {
    code: CanonicalPermissions.COMMUNITY_POST_CREATE,
    domain: 'community',
    resource: 'post',
    action: 'create',
    description: 'Publish new community content under community guidelines',
    minClassification: 'PUBLIC'
  },
  {
    code: CanonicalPermissions.COMMUNITY_POST_DELETE_OWN,
    domain: 'community',
    resource: 'post',
    action: 'delete_own',
    description: 'Delete authored community posts',
    minClassification: 'PUBLIC'
  },
  {
    code: CanonicalPermissions.COMMUNITY_MODERATE,
    domain: 'community',
    resource: 'post',
    action: 'moderate',
    description: 'Review and moderate community posts and reports',
    minClassification: 'INTERNAL'
  },
  {
    code: CanonicalPermissions.CLINICAL_RECORD_READ,
    domain: 'clinical',
    resource: 'record',
    action: 'read',
    description: 'Read clinical records subject to active care relationship and consent',
    minClassification: 'CLINICAL_RECORD'
  },
  {
    code: CanonicalPermissions.CLINICAL_RECORD_CREATE,
    domain: 'clinical',
    resource: 'record',
    action: 'create',
    description: 'Create clinical record entries within verified care delivery',
    minClassification: 'CLINICAL_RECORD'
  },
  {
    code: CanonicalPermissions.CLINICAL_RECORD_UPDATE,
    domain: 'clinical',
    resource: 'record',
    action: 'update',
    description: 'Append or update clinical record entries',
    minClassification: 'CLINICAL_RECORD'
  },
  {
    code: CanonicalPermissions.CARE_RELATIONSHIP_VIEW,
    domain: 'care',
    resource: 'relationship',
    action: 'view',
    description: 'Inspect assigned care relationships',
    minClassification: 'SENSITIVE'
  },
  {
    code: CanonicalPermissions.CARE_APPOINTMENT_MANAGE,
    domain: 'care',
    resource: 'appointment',
    action: 'manage',
    description: 'Schedule, reschedule, or cancel clinical appointments',
    minClassification: 'SENSITIVE'
  },
  {
    code: CanonicalPermissions.GOVERNANCE_CLINICAL_REVIEW,
    domain: 'governance',
    resource: 'clinical',
    action: 'review',
    description: 'Perform clinical peer reviews and artifact safety evaluations',
    minClassification: 'INTERNAL'
  },
  {
    code: CanonicalPermissions.GOVERNANCE_PRIVACY_REVIEW,
    domain: 'governance',
    resource: 'privacy',
    action: 'review',
    description: 'Review DPIA assessments and consent compliance',
    minClassification: 'INTERNAL'
  },
  {
    code: CanonicalPermissions.GOVERNANCE_REGULATORY_REVIEW,
    domain: 'governance',
    resource: 'regulatory',
    action: 'review',
    description: 'Inspect regulatory audit logs and legal readiness',
    minClassification: 'INTERNAL'
  },
  {
    code: CanonicalPermissions.GOVERNANCE_AI_SAFETY_REVIEW,
    domain: 'governance',
    resource: 'ai_safety',
    action: 'review',
    description: 'Review AI safety evaluations, guardrail incidents, and prompt policies',
    minClassification: 'INTERNAL'
  },
  {
    code: CanonicalPermissions.ADMINISTRATION_USER_MANAGE,
    domain: 'administration',
    resource: 'user',
    action: 'manage',
    description: 'Administrative user lifecycle management (exclude clinical data)',
    minClassification: 'INTERNAL'
  },
  {
    code: CanonicalPermissions.ADMINISTRATION_CONFIG_MANAGE,
    domain: 'administration',
    resource: 'config',
    action: 'manage',
    description: 'Configure non-clinical platform feature flags and system settings',
    minClassification: 'INTERNAL'
  },
  {
    code: CanonicalPermissions.ADMINISTRATION_AUDIT_READ,
    domain: 'administration',
    resource: 'audit',
    action: 'read',
    description: 'Inspect hash-chained tamper-evident audit ledger entries',
    minClassification: 'INTERNAL'
  },
  {
    code: CanonicalPermissions.PROFESSIONAL_PROFILE_READ_OWN,
    domain: 'professional',
    resource: 'profile',
    action: 'read_own',
    description: 'Read own professional profile details and verification status',
    minClassification: 'PERSONAL'
  },
  {
    code: CanonicalPermissions.PROFESSIONAL_PROFILE_UPDATE_OWN,
    domain: 'professional',
    resource: 'profile',
    action: 'update_own',
    description: 'Update own professional bio, delivery modes, and languages',
    minClassification: 'PERSONAL'
  },
  {
    code: CanonicalPermissions.PROFESSIONAL_CREDENTIALS_SUBMIT,
    domain: 'professional',
    resource: 'credentials',
    action: 'submit',
    description: 'Submit credentials and registration certificates for verification',
    minClassification: 'CONFIDENTIAL'
  },
  {
    code: CanonicalPermissions.PROFESSIONAL_SERVICES_MANAGE,
    domain: 'professional',
    resource: 'services',
    action: 'manage',
    description: 'Create and configure service offerings within governed scope of practice',
    minClassification: 'INTERNAL'
  },
  {
    code: CanonicalPermissions.PROFESSIONAL_REFERRALS_READ_ASSIGNED,
    domain: 'professional',
    resource: 'referrals',
    action: 'read_assigned',
    description: 'Read incoming referrals assigned specifically to this verified provider',
    minClassification: 'CLINICAL_RECORD'
  },
  {
    code: CanonicalPermissions.PROFESSIONAL_REFERRALS_ACCEPT,
    domain: 'professional',
    resource: 'referrals',
    action: 'accept',
    description: 'Accept incoming referrals and establish care relationship with user consent',
    minClassification: 'CLINICAL_RECORD'
  },
  {
    code: CanonicalPermissions.PROFESSIONAL_REFERRALS_DECLINE,
    domain: 'professional',
    resource: 'referrals',
    action: 'decline',
    description: 'Decline incoming referrals with clinical capacity or scope reason',
    minClassification: 'CLINICAL_RECORD'
  },
  {
    code: CanonicalPermissions.PROVIDER_VERIFICATION_REVIEW,
    domain: 'provider',
    resource: 'verification',
    action: 'review',
    description: 'Inspect and evaluate submitted professional credentials and licenses',
    minClassification: 'CONFIDENTIAL'
  },
  {
    code: CanonicalPermissions.PROVIDER_VERIFICATION_DECIDE,
    domain: 'provider',
    resource: 'verification',
    action: 'decide',
    description: 'Issue formal verification approval, rejection, or restriction decision',
    minClassification: 'INTERNAL'
  },
  {
    code: CanonicalPermissions.PROVIDER_VERIFICATION_SUSPEND,
    domain: 'provider',
    resource: 'verification',
    action: 'suspend',
    description: 'Suspend provider verification and active service delivery for safety or regulatory cause',
    minClassification: 'INTERNAL'
  }
];
