/**
 * MindOS Canonical Policy Engine & Evaluator
 * Authority: Master Architecture Index Section 14, Volume VIII & Appendix F
 * ADR-016, ADR-017, ADR-018
 * 
 * Strict Invariants:
 * - Deny-by-default is non-negotiable (Section 6, 24).
 * - Administrator status SHALL NOT imply unrestricted health or clinical record read access (R-SEC-001).
 * - Community moderators SHALL NOT gain journal, assessment or clinical-record access by role (R-COM-001).
 * - Fail-closed: unexpected errors, missing configurations or unhandled conditions result in DENY.
 */

import { v7 as uuidv7 } from 'uuid';
import { DataClassification } from '../../shared/data_classification.js';
import {
  AuthorizationRequest,
  PolicyDecision,
  RoleCode
} from '../domain/types.js';
import { CanonicalReasonCodes } from '../domain/reason_codes.js';
import { isCanonicalPurpose, requiresExplicitPurpose, CanonicalPurposes } from '../domain/purposes.js';
import { PolicyRegistry } from '../policies/registry.js';
import { RoleRepository } from '../persistence/role_repository.js';
import { ConsentDecisionPort, DefaultConsentDecisionPort } from '../ports/consent.js';
import {
  ClinicalGovernanceDecisionPort,
  PrivacyGovernanceDecisionPort,
  DefaultClinicalGovernancePort,
  DefaultPrivacyGovernancePort
} from '../ports/governance.js';
import { AuditService } from '../../audit/index.js';

export interface PolicyEngineMetrics {
  evaluationsTotal: number;
  allowedTotal: number;
  deniedTotal: number;
  errorsTotal: number;
}

export class PolicyEngine {
  private static consentPort: ConsentDecisionPort = new DefaultConsentDecisionPort();
  private static clinicalGovPort: ClinicalGovernanceDecisionPort = new DefaultClinicalGovernancePort();
  private static privacyGovPort: PrivacyGovernanceDecisionPort = new DefaultPrivacyGovernancePort();
  private static roleRepo: RoleRepository = new RoleRepository();

  private static metrics: PolicyEngineMetrics = {
    evaluationsTotal: 0,
    allowedTotal: 0,
    deniedTotal: 0,
    errorsTotal: 0
  };

  /**
   * Configures custom ports for dependency injection in tests or specialized environments.
   */
  public static setPorts(ports: {
    consentPort?: ConsentDecisionPort;
    clinicalGovPort?: ClinicalGovernanceDecisionPort;
    privacyGovPort?: PrivacyGovernanceDecisionPort;
    roleRepo?: RoleRepository;
  }): void {
    if (ports.consentPort) PolicyEngine.consentPort = ports.consentPort;
    if (ports.clinicalGovPort) PolicyEngine.clinicalGovPort = ports.clinicalGovPort;
    if (ports.privacyGovPort) PolicyEngine.privacyGovPort = ports.privacyGovPort;
    if (ports.roleRepo) PolicyEngine.roleRepo = ports.roleRepo;
  }

  public static getMetrics(): Readonly<PolicyEngineMetrics> {
    return { ...PolicyEngine.metrics };
  }

  public static resetMetrics(): void {
    PolicyEngine.metrics = {
      evaluationsTotal: 0,
      allowedTotal: 0,
      deniedTotal: 0,
      errorsTotal: 0
    };
  }

  /**
   * Canonical Policy Evaluation Algorithm (Appendix F & Volume VIII)
   */
  public static async evaluate(request: AuthorizationRequest): Promise<PolicyDecision> {
    PolicyEngine.metrics.evaluationsTotal++;
    const evaluatedAt = new Date().toISOString();
    const decisionId = uuidv7();

    try {
      const decision = await PolicyEngine.executeEvaluation(request, decisionId, evaluatedAt);

      if (decision.allowed) {
        PolicyEngine.metrics.allowedTotal++;
      } else {
        PolicyEngine.metrics.deniedTotal++;
      }

      // Check if this action requires audit recording
      PolicyEngine.recordAuditIfNecessary(request, decision);

      return decision;
    } catch (err: unknown) {
      PolicyEngine.metrics.errorsTotal++;
      PolicyEngine.metrics.deniedTotal++;

      let actorId = 'UNKNOWN';
      let action = 'UNKNOWN';
      let resourceType = 'UNKNOWN';
      let resourceId: string | undefined;
      let purpose = 'UNSPECIFIED';
      let context: Record<string, unknown> = {};
      let correlationId: string | undefined;

      try {
        if (request) {
          actorId = request.actor?.actor_id || 'UNKNOWN';
          action = request.action || 'UNKNOWN';
          resourceType = request.resource?.type || 'UNKNOWN';
          resourceId = request.resource?.id;
          purpose = request.purpose || 'UNSPECIFIED';
          context = request.context || {};
          correlationId = request.correlation_id;
        }
      } catch {
        // Suppress any property getter errors during fail-closed recovery
      }

      // Fail-closed invariant: any uncaught error results in a secure DENY
      const errorDecision: PolicyDecision = {
        decision_id: decisionId,
        effect: 'DENY',
        allowed: false,
        reason_code: CanonicalReasonCodes.AUTHZ_HARD_DENY,
        reason: 'Internal policy evaluation error. Access denied by fail-closed safeguard.',
        denialReason: 'Internal policy evaluation error. Access denied by fail-closed safeguard.',
        errorCode: 'AUTHZ_ERROR',
        policy_id: 'policy.fail_closed',
        policy_version: '1.0.0',
        actor_id: actorId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        purpose,
        context,
        evaluated_at: evaluatedAt,
        correlation_id: correlationId
      };

      try {
        AuditService.record({
          actor_type: 'STAFF',
          actor_id: actorId,
          action: `AUTHZ.ERROR.${action}`,
          resource_type: resourceType,
          resource_id: resourceId,
          purpose: purpose || 'SYSTEM_OPERATION',
          authorization_basis: { errorCode: 'AUTHZ_ERROR' },
          result: 'ERROR',
          metadata: { error: err instanceof Error ? err.message : String(err) }
        });
      } catch {
        // Suppress audit failure during critical fail-closed path
      }

      return errorDecision;
    }
  }

  private static async executeEvaluation(
    request: AuthorizationRequest,
    decisionId: string,
    evaluatedAt: string
  ): Promise<PolicyDecision> {
    const actor = request.actor;
    const action = request.action;
    const resource = request.resource || { type: 'unknown' };
    const purpose = request.purpose || 'UNSPECIFIED';
    const context = request.context || {};
    const correlationId = request.correlation_id;

    const baseDecision = {
      decision_id: decisionId,
      actor_id: actor?.actor_id || '',
      action,
      resource_type: resource.type,
      resource_id: resource.id,
      purpose,
      context,
      evaluated_at: evaluatedAt,
      correlation_id: correlationId
    };

    // 1. Authenticated Identity Invariant
    if (!actor || !actor.actor_id) {
      return {
        ...baseDecision,
        effect: 'DENY',
        allowed: false,
        reason_code: CanonicalReasonCodes.AUTHZ_UNAUTHENTICATED,
        reason: 'Unauthenticated actor. Explicit authentication required.',
        denialReason: 'Unauthenticated actor. Explicit authentication required.',
        errorCode: 'AUTHZ_001',
        policy_id: 'policy.core.security',
        policy_version: '1.0.0'
      };
    }

    // 2. Account Security State Check
    const accountState = actor.security_attributes?.accountState;
    if (accountState && ['SUSPENDED', 'LOCKED', 'DEACTIVATED', 'PENDING_VERIFICATION'].includes(accountState)) {
      return {
        ...baseDecision,
        effect: 'DENY',
        allowed: false,
        reason_code: CanonicalReasonCodes.AUTHZ_ACCOUNT_STATE_DENIED,
        reason: `Actor account status is ${accountState}. Operations are prohibited.`,
        denialReason: `Actor account status is ${accountState}. Operations are prohibited.`,
        errorCode: 'AUTHZ_003',
        policy_id: 'policy.core.security',
        policy_version: '1.0.0'
      };
    }

    // Identify actor roles
    const roles = Array.from(new Set([
      ...(actor.roles || []),
      ...(actor.actor_type ? [String(actor.actor_type)] : [])
    ]));

    const hasRole = (role: RoleCode | string) =>
      roles.includes(role) || roles.includes(String(role).toUpperCase());

    const isClinicalOrHealth =
      resource.classification === DataClassification.CLINICAL_RECORD ||
      resource.classification === DataClassification.HEALTH_SENSITIVE ||
      resource.type.startsWith('clinical_') ||
      resource.type === 'clinical_notes' ||
      resource.type === 'clinical_records' ||
      resource.type === 'journal' ||
      resource.type === 'assessment';

    // 3. CRITICAL INVARIANT: R-SEC-001 (Platform Admin Health Restriction)
    // "Platform admin status SHALL NOT imply unrestricted health/clinical record read access"
    if (hasRole(RoleCode.PLATFORM_ADMIN) && isClinicalOrHealth) {
      const isSelfAccess = resource.ownerId && resource.ownerId === actor.actor_id;
      if (!isSelfAccess) {
        return {
          ...baseDecision,
          effect: 'DENY',
          allowed: false,
          reason_code: CanonicalReasonCodes.AUTHZ_ADMIN_HEALTH_PROHIBITED,
          reason: 'Platform administrators are prohibited from reading clinical records or private journals (R-SEC-001).',
          denialReason: 'Platform administrators are prohibited from reading clinical records or private journals (R-SEC-001).',
          errorCode: 'AUTHZ_001',
          policy_id: 'policy.clinical.record.access',
          policy_version: '1.0.0'
        };
      }
    }

    // 4. CRITICAL INVARIANT: R-COM-001 (Community Moderator Health Restriction)
    // "Community moderators SHALL NOT gain journal, assessment or clinical-record access by role."
    if (hasRole(RoleCode.MODERATOR) && isClinicalOrHealth) {
      const isSelfAccess = resource.ownerId && resource.ownerId === actor.actor_id;
      if (!isSelfAccess) {
        return {
          ...baseDecision,
          effect: 'DENY',
          allowed: false,
          reason_code: CanonicalReasonCodes.AUTHZ_MODERATOR_HEALTH_PROHIBITED,
          reason: 'MODERATOR role is strictly prohibited from accessing private journals, assessments, or clinical records (R-COM-001).',
          denialReason: 'MODERATOR role is strictly prohibited from accessing private journals, assessments, or clinical records (R-COM-001).',
          errorCode: 'AUTHZ_001',
          policy_id: 'policy.clinical.record.access',
          policy_version: '1.0.0'
        };
      }
    }

    // 5. Auditor Read-Only Invariant
    if (hasRole(RoleCode.AUDITOR) && action !== 'read') {
      return {
        ...baseDecision,
        effect: 'DENY',
        allowed: false,
        reason_code: CanonicalReasonCodes.AUTHZ_AUDITOR_READ_ONLY,
        reason: 'AUDITOR role is strictly read-only and prohibited from modifying resources.',
        denialReason: 'AUDITOR role is strictly read-only and prohibited from modifying resources.',
        errorCode: 'AUTHZ_001',
        policy_id: 'policy.administration.manage',
        policy_version: '1.0.0'
      };
    }

    // 6. Identity Self-Management & Cross-User Session Isolation (IDOR Prevention)
    if (resource.type === 'identity_session' || resource.type === 'session') {
      const isOwner = resource.ownerId && resource.ownerId === actor.actor_id;

      if (action === 'read_own' || action === 'revoke_own' || action === 'revoke') {
        if (!isOwner && resource.ownerId) {
          return {
            ...baseDecision,
            effect: 'DENY',
            allowed: false,
            reason_code: CanonicalReasonCodes.AUTHZ_NOT_OWNER,
            reason: 'Actor is not the owner of this session. Cross-user session access is strictly prohibited.',
            denialReason: 'Actor is not the owner of this session. Cross-user session access is strictly prohibited.',
            errorCode: 'AUTHZ_002',
            policy_id: 'policy.identity.session.manage_own',
            policy_version: '1.0.0'
          };
        }
        return {
          ...baseDecision,
          effect: 'ALLOW',
          allowed: true,
          reason_code: CanonicalReasonCodes.AUTHZ_ALLOWED,
          reason: 'Session owner permitted to inspect and revoke active authentication session.',
          policy_id: 'policy.identity.session.manage_own',
          policy_version: '1.0.0'
        };
      }

      if (action === 'read_all' || action === 'revoke_all') {
        if (hasRole(RoleCode.PLATFORM_ADMIN) || hasRole(RoleCode.SECURITY_REVIEWER)) {
          return {
            ...baseDecision,
            effect: 'ALLOW',
            allowed: true,
            reason_code: CanonicalReasonCodes.AUTHZ_ALLOWED,
            reason: 'Platform administrator permitted to inspect or revoke sessions for security response.',
            policy_id: 'policy.identity.session.manage_own',
            policy_version: '1.0.0'
          };
        }
        return {
          ...baseDecision,
          effect: 'DENY',
          allowed: false,
          reason_code: CanonicalReasonCodes.AUTHZ_ROLE_REQUIRED,
          reason: 'Administrative role required for global session management.',
          denialReason: 'Administrative role required for global session management.',
          errorCode: 'AUTHZ_001',
          policy_id: 'policy.identity.session.manage_own',
          policy_version: '1.0.0'
        };
      }
    }

    // 7. Identity Account Self-Management
    if (resource.type === 'account' || resource.type === 'user_profile') {
      const isOwner =
        (resource.ownerId && resource.ownerId === actor.actor_id) ||
        (resource.id && resource.id === actor.identity_account_id) ||
        (resource.id && resource.id === actor.actor_id);

      if (action.includes('read_own') || action.includes('manage_own') || action === 'read' || action === 'update') {
        if (isOwner) {
          return {
            ...baseDecision,
            effect: 'ALLOW',
            allowed: true,
            reason_code: CanonicalReasonCodes.AUTHZ_ALLOWED,
            reason: 'Account owner permitted to manage own account profile.',
            policy_id: 'policy.identity.account.manage_own',
            policy_version: '1.0.0'
          };
        }
        // Cross-user account access
        if (hasRole(RoleCode.PLATFORM_ADMIN) || hasRole(RoleCode.SUPPORT_AGENT)) {
          return {
            ...baseDecision,
            effect: 'ALLOW',
            allowed: true,
            reason_code: CanonicalReasonCodes.AUTHZ_ALLOWED,
            reason: 'Staff actor authorized for administrative account lifecycle support.',
            policy_id: 'policy.administration.manage',
            policy_version: '1.0.0'
          };
        }
        return {
          ...baseDecision,
          effect: 'DENY',
          allowed: false,
          reason_code: CanonicalReasonCodes.AUTHZ_CROSS_USER_DENIED,
          reason: 'Access to other user accounts is prohibited.',
          denialReason: 'Access to other user accounts is prohibited.',
          errorCode: 'AUTHZ_002',
          policy_id: 'policy.identity.account.manage_own',
          policy_version: '1.0.0'
        };
      }
    }

    // 8. Clinical Records & Health-Sensitive Data Access
    if (isClinicalOrHealth) {
      // 8a. Data subject self-access
      const isSelfAccess = resource.ownerId && resource.ownerId === actor.actor_id;
      if (isSelfAccess) {
        return {
          ...baseDecision,
          effect: 'ALLOW',
          allowed: true,
          reason_code: CanonicalReasonCodes.AUTHZ_ALLOWED,
          reason: 'Patient self-service access to own health records granted.',
          policy_id: 'policy.clinical.record.access',
          policy_version: '1.0.0'
        };
      }

      // 8b. Healthcare Professional Access
      const isProfessional =
        hasRole(RoleCode.PROFESSIONAL) ||
        hasRole(RoleCode.VERIFIED_PROFESSIONAL);

      if (isProfessional) {
        // Verification Check
        const isVerified =
          hasRole(RoleCode.VERIFIED_PROFESSIONAL) ||
          actor.professional_context?.isVerified === true;

        if (!isVerified) {
          return {
            ...baseDecision,
            effect: 'DENY',
            allowed: false,
            reason_code: CanonicalReasonCodes.AUTHZ_ROLE_REQUIRED,
            reason: 'Verified healthcare professional credential required for clinical record operations.',
            denialReason: 'Verified healthcare professional credential required for clinical record operations.',
            errorCode: 'AUTHZ_002',
            policy_id: 'policy.clinical.record.access',
            policy_version: '1.0.0'
          };
        }

        // Active Care Relationship Check
        const hasCareRelationship =
          request.relationship_context?.careRelationshipActive === true ||
          request.relationship_context?.hasActiveCareRelationship === true ||
          context.careRelationshipActive === true ||
          context.hasActiveCareRelationship === true;

        if (!hasCareRelationship) {
          return {
            ...baseDecision,
            effect: 'DENY',
            allowed: false,
            reason_code: CanonicalReasonCodes.AUTHZ_RELATIONSHIP_REQUIRED,
            reason: 'Active clinical care relationship required for clinical access.',
            denialReason: 'Active care relationship required for clinical access.',
            errorCode: 'AUTHZ_002',
            policy_id: 'policy.clinical.record.access',
            policy_version: '1.0.0'
          };
        }

        // Purpose Limitation Check
        if (!isCanonicalPurpose(purpose)) {
          return {
            ...baseDecision,
            effect: 'DENY',
            allowed: false,
            reason_code: CanonicalReasonCodes.AUTHZ_PURPOSE_REQUIRED,
            reason: `Invalid or missing clinical purpose (${purpose}). Explicit canonical purpose required for health records.`,
            denialReason: `Invalid or missing clinical purpose (${purpose}). Explicit canonical purpose required for health records.`,
            errorCode: 'AUTHZ_002',
            policy_id: 'policy.clinical.record.access',
            policy_version: '1.0.0'
          };
        }

        // Consent Check
        const consentDecision = await PolicyEngine.consentPort.evaluate({
          dataSubjectId: resource.ownerId || '',
          actorId: actor.actor_id,
          resourceType: resource.type,
          resourceId: resource.id,
          purpose,
          context: { ...context, ...request.consent_context }
        });

        if (!consentDecision.hasConsent) {
          return {
            ...baseDecision,
            effect: 'DENY',
            allowed: false,
            reason_code: CanonicalReasonCodes.AUTHZ_CONSENT_REQUIRED,
            reason: consentDecision.reason || 'Active patient consent grant required.',
            denialReason: consentDecision.reason || 'Active patient consent grant required.',
            errorCode: 'AUTHZ_002',
            policy_id: 'policy.clinical.record.access',
            policy_version: '1.0.0'
          };
        }

        return {
          ...baseDecision,
          effect: 'ALLOW',
          allowed: true,
          reason_code: CanonicalReasonCodes.AUTHZ_ALLOWED,
          reason: 'Verified healthcare professional access granted under active care relationship and patient consent.',
          policy_id: 'policy.clinical.record.access',
          policy_version: '1.0.0'
        };
      }

      // 8c. If neither patient nor professional, deny
      return {
        ...baseDecision,
        effect: 'DENY',
        allowed: false,
        reason_code: CanonicalReasonCodes.AUTHZ_ROLE_REQUIRED,
        reason: 'Clinical data access requires patient ownership or verified professional role in an active care relationship.',
        denialReason: 'Clinical data access requires patient ownership or verified professional role in an active care relationship.',
        errorCode: 'AUTHZ_002',
        policy_id: 'policy.clinical.record.access',
        policy_version: '1.0.0'
      };
    }

    // 9. Community Posts Domain
    if (resource.type === 'community_post' || resource.type === 'post') {
      if (action === 'read') {
        return {
          ...baseDecision,
          effect: 'ALLOW',
          allowed: true,
          reason_code: CanonicalReasonCodes.AUTHZ_ALLOWED,
          reason: 'Public community content reading permitted.',
          policy_id: 'policy.community.post.manage',
          policy_version: '1.0.0'
        };
      }

      if (action === 'create') {
        if (hasRole(RoleCode.USER) || hasRole(RoleCode.PEER_SUPPORTER) || hasRole(RoleCode.PROFESSIONAL)) {
          return {
            ...baseDecision,
            effect: 'ALLOW',
            allowed: true,
            reason_code: CanonicalReasonCodes.AUTHZ_ALLOWED,
            reason: 'Community post creation permitted.',
            policy_id: 'policy.community.post.manage',
            policy_version: '1.0.0'
          };
        }
      }

      if (action === 'delete_own' || action === 'delete') {
        const isAuthor = resource.authorId && resource.authorId === actor.actor_id;
        if (isAuthor) {
          return {
            ...baseDecision,
            effect: 'ALLOW',
            allowed: true,
            reason_code: CanonicalReasonCodes.AUTHZ_ALLOWED,
            reason: 'Post author permitted to delete own content.',
            policy_id: 'policy.community.post.manage',
            policy_version: '1.0.0'
          };
        }
        // If not author, check if moderator
        if (hasRole(RoleCode.MODERATOR)) {
          return {
            ...baseDecision,
            effect: 'ALLOW',
            allowed: true,
            reason_code: CanonicalReasonCodes.AUTHZ_ALLOWED,
            reason: 'Moderator permitted to moderate non-compliant community content.',
            policy_id: 'policy.community.post.moderate',
            policy_version: '1.0.0'
          };
        }
        return {
          ...baseDecision,
          effect: 'DENY',
          allowed: false,
          reason_code: CanonicalReasonCodes.AUTHZ_NOT_OWNER,
          reason: 'Only the author or a community moderator can delete this post.',
          denialReason: 'Only the author or a community moderator can delete this post.',
          errorCode: 'AUTHZ_002',
          policy_id: 'policy.community.post.manage',
          policy_version: '1.0.0'
        };
      }

      if (action === 'moderate' || action === 'flag' || action === 'remove') {
        if (hasRole(RoleCode.MODERATOR)) {
          return {
            ...baseDecision,
            effect: 'ALLOW',
            allowed: true,
            reason_code: CanonicalReasonCodes.AUTHZ_ALLOWED,
            reason: 'Moderator action permitted on community content.',
            policy_id: 'policy.community.post.moderate',
            policy_version: '1.0.0'
          };
        }
        return {
          ...baseDecision,
          effect: 'DENY',
          allowed: false,
          reason_code: CanonicalReasonCodes.AUTHZ_ROLE_REQUIRED,
          reason: 'MODERATOR role required for moderation actions.',
          denialReason: 'MODERATOR role required for moderation actions.',
          errorCode: 'AUTHZ_001',
          policy_id: 'policy.community.post.moderate',
          policy_version: '1.0.0'
        };
      }
    }

    // 9b. AI Processing & Companion Dialogue Domain (Consent Enforced)
    if (
      resource.type === 'chat_session' ||
      resource.type === 'ai_session' ||
      purpose === 'AI_SUPPORT' ||
      purpose === 'AI_PERSONALIZATION'
    ) {
      const subjectId = resource.ownerId || actor.actor_id;
      const consentDecision = await PolicyEngine.consentPort.evaluate({
        dataSubjectId: subjectId,
        actorId: actor.actor_id,
        resourceType: resource.type,
        resourceId: resource.id,
        purpose,
        context: { ...context, ...request.consent_context }
      });

      if (!consentDecision.hasConsent) {
        return {
          ...baseDecision,
          effect: 'DENY',
          allowed: false,
          reason_code: CanonicalReasonCodes.AUTHZ_CONSENT_REQUIRED,
          reason: consentDecision.reason || 'Explicit user consent required for AI companion dialogue processing.',
          denialReason: consentDecision.reason || 'Explicit user consent required for AI companion dialogue processing.',
          errorCode: 'AUTHZ_002',
          policy_id: 'policy.ai.processing',
          policy_version: '1.0.0'
        };
      }

      return {
        ...baseDecision,
        effect: 'ALLOW',
        allowed: true,
        reason_code: CanonicalReasonCodes.AUTHZ_ALLOWED,
        reason: 'AI companion processing authorized under valid user consent.',
        policy_id: 'policy.ai.processing',
        policy_version: '1.0.0'
      };
    }

    // 9c. Research Domain (Consent Enforced)
    if (purpose === 'RESEARCH' || resource.type === 'research_study') {
      const subjectId = resource.ownerId || actor.actor_id;
      const consentDecision = await PolicyEngine.consentPort.evaluate({
        dataSubjectId: subjectId,
        actorId: actor.actor_id,
        resourceType: resource.type,
        resourceId: resource.id,
        purpose,
        context: { ...context, ...request.consent_context }
      });

      if (!consentDecision.hasConsent) {
        return {
          ...baseDecision,
          effect: 'DENY',
          allowed: false,
          reason_code: CanonicalReasonCodes.AUTHZ_CONSENT_REQUIRED,
          reason: consentDecision.reason || 'Explicit user consent required for research data contribution.',
          denialReason: consentDecision.reason || 'Explicit user consent required for research data contribution.',
          errorCode: 'AUTHZ_002',
          policy_id: 'policy.research.access',
          policy_version: '1.0.0'
        };
      }

      return {
        ...baseDecision,
        effect: 'ALLOW',
        allowed: true,
        reason_code: CanonicalReasonCodes.AUTHZ_ALLOWED,
        reason: 'Research data access authorized under voluntary participant consent.',
        policy_id: 'policy.research.access',
        policy_version: '1.0.0'
      };
    }

    // 9d. Marketing Domain (Consent Enforced)
    if (purpose === 'MARKETING' || resource.type === 'marketing_message') {
      const subjectId = resource.ownerId || actor.actor_id;
      const consentDecision = await PolicyEngine.consentPort.evaluate({
        dataSubjectId: subjectId,
        actorId: actor.actor_id,
        resourceType: resource.type,
        resourceId: resource.id,
        purpose,
        context: { ...context, ...request.consent_context }
      });

      if (!consentDecision.hasConsent) {
        return {
          ...baseDecision,
          effect: 'DENY',
          allowed: false,
          reason_code: CanonicalReasonCodes.AUTHZ_CONSENT_REQUIRED,
          reason: consentDecision.reason || 'Explicit user consent required for marketing communications.',
          denialReason: consentDecision.reason || 'Explicit user consent required for marketing communications.',
          errorCode: 'AUTHZ_002',
          policy_id: 'policy.marketing.communication',
          policy_version: '1.0.0'
        };
      }

      return {
        ...baseDecision,
        effect: 'ALLOW',
        allowed: true,
        reason_code: CanonicalReasonCodes.AUTHZ_ALLOWED,
        reason: 'Marketing communications authorized under explicit user opt-in.',
        policy_id: 'policy.marketing.communication',
        policy_version: '1.0.0'
      };
    }

    // 10. Governance Reviews Domain
    if (resource.type === 'governance_case' || resource.type === 'clinical_review' || resource.type === 'privacy_review') {
      if (hasRole(RoleCode.CLINICAL_REVIEWER)) {
        const isAssigned =
          (resource.assignedReviewerId && resource.assignedReviewerId === actor.actor_id) ||
          context.isAssignedReviewer === true;

        if (!isAssigned) {
          return {
            ...baseDecision,
            effect: 'DENY',
            allowed: false,
            reason_code: CanonicalReasonCodes.AUTHZ_GOVERNANCE_REVIEW_REQUIRED,
            reason: 'Clinical reviewer is not assigned to this specific case (assignment-bound governance restriction).',
            denialReason: 'Clinical reviewer is not assigned to this specific case (assignment-bound governance restriction).',
            errorCode: 'AUTHZ_002',
            policy_id: 'policy.governance.review',
            policy_version: '1.0.0'
          };
        }
        return {
          ...baseDecision,
          effect: 'ALLOW',
          allowed: true,
          reason_code: CanonicalReasonCodes.AUTHZ_ALLOWED,
          reason: 'Assigned clinical reviewer authorized for peer review.',
          policy_id: 'policy.governance.review',
          policy_version: '1.0.0'
        };
      }

      if (hasRole(RoleCode.PRIVACY_OFFICER)) {
        if (purpose === CanonicalPurposes.PRIVACY_REQUEST || purpose === 'PRIVACY_REVIEW') {
          return {
            ...baseDecision,
            effect: 'ALLOW',
            allowed: true,
            reason_code: CanonicalReasonCodes.AUTHZ_ALLOWED,
            reason: 'Privacy officer authorized for privacy review under formal request purpose.',
            policy_id: 'policy.governance.review',
            policy_version: '1.0.0'
          };
        }
        return {
          ...baseDecision,
          effect: 'DENY',
          allowed: false,
          reason_code: CanonicalReasonCodes.AUTHZ_PURPOSE_REQUIRED,
          reason: 'Privacy review purpose required for privacy officer access.',
          denialReason: 'Privacy review purpose required for privacy officer access.',
          errorCode: 'AUTHZ_002',
          policy_id: 'policy.governance.review',
          policy_version: '1.0.0'
        };
      }
    }

    // 11. Platform Administration Domain
    if (resource.type === 'platform_config' || resource.type === 'system_settings') {
      if (hasRole(RoleCode.PLATFORM_ADMIN) || hasRole(RoleCode.SYSTEM_SERVICE)) {
        return {
          ...baseDecision,
          effect: 'ALLOW',
          allowed: true,
          reason_code: CanonicalReasonCodes.AUTHZ_ALLOWED,
          reason: 'Platform administrator authorized for system configuration management.',
          policy_id: 'policy.administration.manage',
          policy_version: '1.0.0'
        };
      }
      return {
        ...baseDecision,
        effect: 'DENY',
        allowed: false,
        reason_code: CanonicalReasonCodes.AUTHZ_ROLE_REQUIRED,
        reason: 'PLATFORM_ADMIN role required for system configuration.',
        denialReason: 'PLATFORM_ADMIN role required for system configuration.',
        errorCode: 'AUTHZ_001',
        policy_id: 'policy.administration.manage',
        policy_version: '1.0.0'
      };
    }

    // 12. General RBAC and Permission Lookup
    const permissions = PolicyEngine.roleRepo.getPermissionsForRoles(roles);
    const requiredPermission = `${resource.type}.${action}`;
    if (permissions.has(requiredPermission) || permissions.has(`${resource.type}.*`)) {
      return {
        ...baseDecision,
        effect: 'ALLOW',
        allowed: true,
        reason_code: CanonicalReasonCodes.AUTHZ_ALLOWED,
        reason: `Granted by explicit role permission: ${requiredPermission}`,
        policy_id: 'policy.general.rbac',
        policy_version: '1.0.0'
      };
    }

    // 13. Default Deny-by-Default (Section 6, 24)
    const denyReason = `Access denied by default policy for action '${action}' on resource '${resource.type}'`;
    return {
      ...baseDecision,
      effect: 'DENY',
      allowed: false,
      reason_code: CanonicalReasonCodes.AUTHZ_DENY_BY_DEFAULT,
      reason: denyReason,
      denialReason: denyReason,
      errorCode: 'AUTHZ_001',
      policy_id: 'policy.deny_by_default',
      policy_version: '1.0.0'
    };
  }

  private static recordAuditIfNecessary(
    request: AuthorizationRequest,
    decision: PolicyDecision
  ): void {
    const isSensitive =
      decision.resource_type.startsWith('clinical_') ||
      decision.resource_type === 'clinical_notes' ||
      decision.resource_type === 'clinical_records' ||
      decision.resource_type === 'journal' ||
      decision.resource_type === 'assessment' ||
      decision.reason_code === CanonicalReasonCodes.AUTHZ_ADMIN_HEALTH_PROHIBITED ||
      decision.reason_code === CanonicalReasonCodes.AUTHZ_MODERATOR_HEALTH_PROHIBITED ||
      decision.reason_code === CanonicalReasonCodes.AUTHZ_CROSS_USER_DENIED;

    if (isSensitive || !decision.allowed) {
      AuditService.record({
        actor_type: 'USER',
        actor_id: decision.actor_id,
        action: `AUTHZ.${decision.effect}.${decision.action}`,
        resource_type: decision.resource_type,
        resource_id: decision.resource_id,
        purpose: decision.purpose,
        authorization_basis: {
          reason_code: decision.reason_code,
          policy_id: decision.policy_id,
          policy_version: decision.policy_version,
          roles: request.actor?.roles || []
        },
        result: decision.allowed ? 'ALLOWED' : 'DENIED',
        metadata: {
          reason: decision.reason,
          correlation_id: decision.correlation_id
        }
      });
    }
  }
}
