/**
 * MindOS Canonical Policy Definitions
 * Authority: Master Architecture Index Section 14, Volume VIII & Appendix F
 * ADR-016, ADR-017, ADR-018
 */

import { DataClassification } from '../../shared/data_classification.js';
import { PolicyDefinition } from '../domain/types.js';

export const CANONICAL_POLICIES: PolicyDefinition[] = [
  {
    policy_id: 'policy.identity.account.manage_own',
    name: 'Identity Account Self-Management Policy',
    domain: 'identity',
    version: '1.0.0',
    status: 'ACTIVE',
    description: 'Allows an authenticated account owner to inspect and manage their own identity account profile.',
    resource_type: 'account',
    actions: ['read', 'update', 'manage'],
    classification: DataClassification.PERSONAL,
    effective_at: '2026-01-01T00:00:00.000Z',
    owner: 'IDENTITY_GOVERNANCE'
  },
  {
    policy_id: 'policy.identity.session.manage_own',
    name: 'Identity Session Self-Management Policy',
    domain: 'identity',
    version: '1.0.0',
    status: 'ACTIVE',
    description: 'Allows an authenticated actor to inspect and terminate their own authentication sessions.',
    resource_type: 'identity_session',
    actions: ['read', 'revoke'],
    classification: DataClassification.PERSONAL,
    effective_at: '2026-01-01T00:00:00.000Z',
    owner: 'IDENTITY_GOVERNANCE'
  },
  {
    policy_id: 'policy.community.post.manage',
    name: 'Community Post Publication & Author Management Policy',
    domain: 'community',
    version: '1.0.0',
    status: 'ACTIVE',
    description: 'Governs creation, public viewing, and author-controlled deletion of community forum posts.',
    resource_type: 'post',
    actions: ['read', 'create', 'delete'],
    classification: DataClassification.PUBLIC,
    effective_at: '2026-01-01T00:00:00.000Z',
    owner: 'COMMUNITY_GOVERNANCE'
  },
  {
    policy_id: 'policy.community.post.moderate',
    name: 'Community Forum Moderation Policy',
    domain: 'community',
    version: '1.0.0',
    status: 'ACTIVE',
    description: 'Authorizes designated moderators to review, hide, or remove non-compliant community content.',
    resource_type: 'post',
    actions: ['moderate', 'flag', 'remove'],
    classification: DataClassification.INTERNAL,
    effective_at: '2026-01-01T00:00:00.000Z',
    owner: 'COMMUNITY_GOVERNANCE'
  },
  {
    policy_id: 'policy.clinical.record.access',
    name: 'Clinical Record Multi-Party Access Policy',
    domain: 'clinical',
    version: '1.0.0',
    status: 'ACTIVE',
    description: 'Enforces strict care-relationship, professional verification, purpose limitation, and consent for clinical health data.',
    resource_type: 'clinical_record',
    actions: ['read', 'create', 'update'],
    classification: DataClassification.CLINICAL_RECORD,
    effective_at: '2026-01-01T00:00:00.000Z',
    owner: 'CLINICAL_GOVERNANCE'
  },
  {
    policy_id: 'policy.governance.review',
    name: 'Assignment-Bound Governance Review Policy',
    domain: 'governance',
    version: '1.0.0',
    status: 'ACTIVE',
    description: 'Restricts governance reviews strictly to designated, actively assigned clinical, privacy, or regulatory reviewers.',
    resource_type: 'governance_case',
    actions: ['read', 'review', 'approve', 'reject'],
    classification: DataClassification.INTERNAL,
    effective_at: '2026-01-01T00:00:00.000Z',
    owner: 'PLATFORM_GOVERNANCE'
  },
  {
    policy_id: 'policy.administration.manage',
    name: 'Platform Technical Administration Policy',
    domain: 'administration',
    version: '1.0.0',
    status: 'ACTIVE',
    description: 'Enables authorized platform administrators to manage technical configurations with zero clinical data bypass.',
    resource_type: 'platform_config',
    actions: ['read', 'manage'],
    classification: DataClassification.INTERNAL,
    effective_at: '2026-01-01T00:00:00.000Z',
    owner: 'PLATFORM_GOVERNANCE'
  },
  {
    policy_id: 'policy.professional.profile.manage_own',
    name: 'Professional Profile Self-Management Policy',
    domain: 'professional',
    version: '1.0.0',
    status: 'ACTIVE',
    description: 'Enables professionals to manage their own profile and submit credentials for review.',
    resource_type: 'professional_profile',
    actions: ['read', 'update', 'submit_credentials'],
    classification: DataClassification.CONFIDENTIAL,
    effective_at: '2026-01-01T00:00:00.000Z',
    owner: 'PROFESSIONAL_GOVERNANCE'
  },
  {
    policy_id: 'policy.provider.verification.review',
    name: 'Provider Verification Governance Policy',
    domain: 'professional',
    version: '1.0.0',
    status: 'ACTIVE',
    description: 'Authorizes designated verification reviewers to inspect credentials and issue verification decisions, enforcing separation of duties.',
    resource_type: 'verification_case',
    actions: ['read', 'review', 'decide', 'suspend'],
    classification: DataClassification.INTERNAL,
    effective_at: '2026-01-01T00:00:00.000Z',
    owner: 'PROFESSIONAL_GOVERNANCE'
  },
  {
    policy_id: 'policy.professional.referrals.access',
    name: 'Assigned Referral Access Policy',
    domain: 'professional',
    version: '1.0.0',
    status: 'ACTIVE',
    description: 'Permits verified providers to inspect and accept assigned referrals under explicit consent and valid handoff packages.',
    resource_type: 'referral',
    actions: ['read_assigned', 'accept', 'decline'],
    classification: DataClassification.CLINICAL_RECORD,
    effective_at: '2026-01-01T00:00:00.000Z',
    owner: 'CLINICAL_GOVERNANCE'
  }
];
