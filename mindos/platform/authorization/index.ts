/**
 * MindOS Canonical Authorization Engine & Policy Enforcement Kernel
 * Authority: Master Architecture Index Section 14, Volume VIII & Appendix F
 * Sprint 5: Canonical Authorization, Access Control, Resource Ownership & Policy Enforcement
 */

import { AuthorizationError } from '../errors/index.js';
import { AuditService } from '../audit/index.js';
import {
  RoleCode,
  ActorPrincipal,
  ResourceTarget,
  AuthContext,
  AuthDecision,
  EvaluateParams,
  AuthorizationRequest,
  PolicyDecision,
  ActorContext
} from './domain/types.js';
import { CanonicalReasonCodes } from './domain/reason_codes.js';
import { PolicyEngine } from './evaluators/policy_engine.js';
import { RoleRepository } from './persistence/role_repository.js';
import { PolicyRegistry } from './policies/registry.js';
import { CANONICAL_POLICIES } from './policies/definitions.js';
import { AuthorizationMiddleware } from './middleware/authz_middleware.js';
import { CanonicalPermissions, CANONICAL_PERMISSION_CATALOG } from './domain/permissions.js';
import { CanonicalPurposes, isCanonicalPurpose, requiresExplicitPurpose } from './domain/purposes.js';
import { ConsentDecisionPort, DefaultConsentDecisionPort } from './ports/consent.js';
import {
  ClinicalGovernanceDecisionPort,
  PrivacyGovernanceDecisionPort,
  RegulatoryDecisionPort,
  AISafetyGovernanceDecisionPort,
  DefaultClinicalGovernancePort,
  DefaultPrivacyGovernancePort,
  DefaultRegulatoryGovernancePort,
  DefaultAISafetyGovernancePort
} from './ports/governance.js';

// Backward compatibility alias for Role enum
export const Role = RoleCode;
export type Role = RoleCode;

export class AuthorizationEngine {
  /**
   * Evaluates access with the canonical Deny-by-Default algorithm
   * Appendix F:
   * authorize(actor, action, resource, context):
   *  require authenticated identity (unless explicitly public)
   *  require role/capability permits action
   *  require ownership/relationship/assignment predicate
   *  require purpose/scope
   *  require consent/grant if policy demands it
   *  require jurisdiction/org policy
   *  audit sensitive decision
   *  else DENY without resource-existence leak
   */
  public static async evaluate(
    actorOrParams: ActorPrincipal | EvaluateParams,
    actionArg?: string,
    resourceArg?: ResourceTarget,
    contextArg?: AuthContext
  ): Promise<AuthDecision> {
    let actorId: string;
    let roles: string[];
    let primaryRole: string;
    let action: string;
    let resourceType: string;
    let resourceId: string | undefined;
    let context: AuthContext;

    if ('action' in actorOrParams && !actionArg) {
      const p = actorOrParams as EvaluateParams;
      actorId = p.subjectId || '';
      roles = p.subjectRoles || [];
      primaryRole = roles[0] || 'ANONYMOUS';
      action = p.action;
      resourceType = p.resourceType;
      resourceId = p.resourceId;
      context = {
        purpose: p.purpose || 'UNSPECIFIED',
        careRelationshipActive: !!p.context?.hasActiveCareRelationship || !!p.context?.careRelationshipActive,
        hasActiveCareRelationship: !!p.context?.hasActiveCareRelationship || !!p.context?.careRelationshipActive,
        consentGrantActive: p.context?.consentGrantActive !== false,
        ...p.context
      };
    } else {
      const a = actorOrParams as ActorPrincipal;
      actorId = a.id;
      roles = a.roles || (a.role ? [String(a.role)] : []);
      primaryRole = String(a.role || roles[0] || 'ANONYMOUS');
      action = actionArg || '';
      resourceType = resourceArg?.type || '';
      resourceId = resourceArg?.id;
      context = contextArg || { purpose: 'UNSPECIFIED', consentGrantActive: true };
    }

    // Convert to canonical AuthorizationRequest
    const actorContext: ActorContext = {
      actor_id: actorId,
      identity_account_id: actorId,
      actor_type: primaryRole,
      roles: roles.length > 0 ? roles : [primaryRole],
      scopes: []
    };

    const resourceTarget: ResourceTarget = {
      type: resourceType,
      id: resourceId,
      ownerId: (context.ownerId as string) || (resourceArg?.ownerId) || undefined,
      authorId: (context.authorId as string) || (resourceArg?.authorId) || undefined
    };

    const authzRequest: AuthorizationRequest = {
      actor: actorContext,
      action,
      resource: resourceTarget,
      purpose: context.purpose || 'UNSPECIFIED',
      relationship_context: {
        careRelationshipActive: context.careRelationshipActive || context.hasActiveCareRelationship,
        hasActiveCareRelationship: context.careRelationshipActive || context.hasActiveCareRelationship
      },
      consent_context: {
        consentGrantActive: context.consentGrantActive !== false
      },
      context
    };

    const decision: PolicyDecision = await PolicyEngine.evaluate(authzRequest);

    return {
      allowed: decision.allowed,
      reason: decision.reason,
      denialReason: decision.denialReason || decision.reason,
      errorCode: (decision.errorCode as any) || 'AUTHZ_001',
      decision_id: decision.decision_id,
      effect: decision.effect,
      reason_code: decision.reason_code,
      policy_id: decision.policy_id,
      policy_version: decision.policy_version
    };
  }

  /**
   * Enforces authorization or throws AuthorizationError
   */
  public static async enforce(
    actor: ActorPrincipal,
    action: string,
    resource: ResourceTarget,
    context: AuthContext
  ): Promise<void> {
    const decision = await AuthorizationEngine.evaluate(actor, action, resource, context);
    if (!decision.allowed) {
      const errCode = (decision.errorCode === 'AUTHZ_002' || decision.errorCode === 'AUTHZ_003' || decision.errorCode === 'AUTHZ_004')
        ? decision.errorCode
        : 'AUTHZ_001';
      throw new AuthorizationError(decision.reason, {
        errorCode: errCode,
        safeUserMessage: 'You do not have permission to access this resource or perform this action.'
      });
    }
  }
}

// Re-export domain, persistence, evaluators, middleware, policies, and ports
export * from './domain/index.js';
export * from './policies/definitions.js';
export * from './policies/registry.js';
export * from './persistence/role_repository.js';
export * from './evaluators/policy_engine.js';
export * from './middleware/authz_middleware.js';
export * from './ports/consent.js';
export * from './ports/governance.js';
