/**
 * MindOS Relationship-Scoped Access Evaluator
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * 
 * Rules:
 * - Active relationship != unlimited access (R-REL-005).
 * - Enforces minimum necessary access via data domains and action permissions.
 * - Enforces purpose limitation and active consent checks.
 */

import { AuditService } from '../../platform/audit/index.js';
import { AuthorizationError, NotFoundError } from '../../platform/errors/index.js';
import {
  CareRelationship,
  CareTeamMembership
} from '../domain/entities.js';
import {
  CareRelationshipState,
  CareTeamMembershipState,
  DataDomain,
  ActionPermission
} from '../domain/types.js';
import { CareRelationshipInvariants } from '../domain/invariants.js';
import { ICareRelationshipRepository } from '../repositories/interfaces.js';
import { ProfessionalService } from '../../professionals/index.js';
import { ConsentService } from '../../consent/index.js';

export interface EvaluateRelationshipAccessRequest {
  relationshipId: string;
  professionalId: string;
  dataDomain: DataDomain;
  action: ActionPermission;
  purpose: string;
  correlationId?: string;
}

export interface EvaluateRelationshipAccessResult {
  allowed: boolean;
  relationship: CareRelationship;
  membership?: CareTeamMembership;
  denialReason?: string;
  errorCode?: 'AUTHZ_001' | 'AUTHZ_002' | 'AUTHZ_003' | 'AUTHZ_004';
}

export class RelationshipAccessEvaluator {
  private static repository: ICareRelationshipRepository;

  public static setRepository(repo: ICareRelationshipRepository): void {
    RelationshipAccessEvaluator.repository = repo;
  }

  public static async evaluateAccess(
    request: EvaluateRelationshipAccessRequest
  ): Promise<EvaluateRelationshipAccessResult> {
    const rel = await RelationshipAccessEvaluator.repository.findRelationshipById(request.relationshipId);
    if (!rel) {
      throw new NotFoundError(`CareRelationship ${request.relationshipId} not found.`);
    }

    const auditBase = {
      actor_type: 'STAFF',
      actor_id: request.professionalId,
      action: `CARE_RELATIONSHIP.ACCESS.${request.action}.${request.dataDomain}`,
      resource_type: 'care_relationship',
      resource_id: request.relationshipId,
      purpose: request.purpose,
      authorization_basis: { relationshipId: request.relationshipId }
    };

    // 1. Verify Professional Verification & State
    const isVerified = ProfessionalService.isVerified(request.professionalId);
    if (!isVerified) {
      AuditService.record({
        ...auditBase,
        result: 'DENIED',
        metadata: { denialReason: 'Professional is not verified.' }
      });
      return {
        allowed: false,
        relationship: rel,
        denialReason: 'Professional must be verified to access clinical records.',
        errorCode: 'AUTHZ_003'
      };
    }

    // 2. Check Relationship State
    if (rel.status === CareRelationshipState.TERMINATED || rel.status === CareRelationshipState.REVOKED) {
      // Post-termination: only READ is permitted if authorized by data retention policy
      if (request.action !== ActionPermission.READ) {
        AuditService.record({
          ...auditBase,
          result: 'DENIED',
          metadata: { denialReason: `Relationship is ${rel.status}; write actions forbidden.` }
        });
        return {
          allowed: false,
          relationship: rel,
          denialReason: `Care relationship is ${rel.status}. Write access is permanently revoked.`,
          errorCode: 'AUTHZ_003'
        };
      }
    } else if (rel.status === CareRelationshipState.PAUSED) {
      if (request.action !== ActionPermission.READ) {
        AuditService.record({
          ...auditBase,
          result: 'DENIED',
          metadata: { denialReason: 'Relationship is PAUSED; active clinical writes blocked.' }
        });
        return {
          allowed: false,
          relationship: rel,
          denialReason: 'Care relationship is paused. Active modifications are suspended.',
          errorCode: 'AUTHZ_003'
        };
      }
    } else if (rel.status !== CareRelationshipState.ACTIVE) {
      AuditService.record({
        ...auditBase,
        result: 'DENIED',
        metadata: { denialReason: `Relationship state ${rel.status} does not permit access.` }
      });
      return {
        allowed: false,
        relationship: rel,
        denialReason: `Care relationship state is ${rel.status}. Active status required.`,
        errorCode: 'AUTHZ_003'
      };
    }

    // 3. Check Team Membership or Primary Provider
    const isPrimary = rel.primary_provider_id === request.professionalId;
    const membership = await RelationshipAccessEvaluator.repository.findMembership(
      request.relationshipId,
      request.professionalId
    );

    if (!isPrimary && (!membership || membership.status !== CareTeamMembershipState.ACTIVE)) {
      AuditService.record({
        ...auditBase,
        result: 'DENIED',
        metadata: { denialReason: 'Professional is not primary provider and has no active team membership.' }
      });
      return {
        allowed: false,
        relationship: rel,
        denialReason: 'Professional is not an active participant in this care relationship.',
        errorCode: 'AUTHZ_003'
      };
    }

    // 4. Data Domain Check against Relationship Scope
    if (!rel.scope.allowed_data_domains.includes(request.dataDomain)) {
      AuditService.record({
        ...auditBase,
        result: 'DENIED',
        metadata: { denialReason: `Data domain ${request.dataDomain} not in relationship scope.` }
      });
      return {
        allowed: false,
        relationship: rel,
        denialReason: `Data domain '${request.dataDomain}' is outside authorized care relationship scope.`,
        errorCode: 'AUTHZ_004'
      };
    }

    // 5. Data Domain Check against Membership Scope (if team member)
    if (membership && !membership.scope.allowed_data_domains.includes(request.dataDomain)) {
      AuditService.record({
        ...auditBase,
        result: 'DENIED',
        metadata: { denialReason: `Data domain ${request.dataDomain} not in member scope.` }
      });
      return {
        allowed: false,
        relationship: rel,
        denialReason: `Data domain '${request.dataDomain}' is outside professional care team role scope.`,
        errorCode: 'AUTHZ_004'
      };
    }

    // 6. Action Permission Check against Relationship Scope
    if (!rel.scope.allowed_actions.includes(request.action)) {
      AuditService.record({
        ...auditBase,
        result: 'DENIED',
        metadata: { denialReason: `Action ${request.action} not permitted by relationship scope.` }
      });
      return {
        allowed: false,
        relationship: rel,
        denialReason: `Action '${request.action}' is not permitted by care relationship scope.`,
        errorCode: 'AUTHZ_004'
      };
    }

    // 7. Action Permission Check against Membership Scope (if team member)
    if (membership && !membership.scope.allowed_actions.includes(request.action)) {
      AuditService.record({
        ...auditBase,
        result: 'DENIED',
        metadata: { denialReason: `Action ${request.action} not permitted by member role scope.` }
      });
      return {
        allowed: false,
        relationship: rel,
        denialReason: `Action '${request.action}' is not permitted by care team member role.`,
        errorCode: 'AUTHZ_004'
      };
    }

    // 8. Purpose Limitation Check
    const validPurposes = [
      'CARE_DELIVERY',
      'CARE_COORDINATION',
      'PROFESSIONAL_SUPPORT',
      'CLINICAL_DOCUMENTATION',
      'SAFETY_MONITORING',
      'EMERGENCY_ACCESS'
    ];
    if (!validPurposes.includes(request.purpose.toUpperCase())) {
      AuditService.record({
        ...auditBase,
        result: 'DENIED',
        metadata: { denialReason: `Purpose ${request.purpose} is not canonical.` }
      });
      return {
        allowed: false,
        relationship: rel,
        denialReason: `Purpose '${request.purpose}' is invalid. Canonical clinical purpose required.`,
        errorCode: 'AUTHZ_002'
      };
    }

    // 9. User Consent Linkage
    const hasConsent = ConsentService.hasActiveConsent(rel.subject_user_id, 'CLINICAL_CONSULTATION');
    if (!hasConsent) {
      AuditService.record({
        ...auditBase,
        result: 'DENIED',
        metadata: { denialReason: 'Active clinical consultation consent missing.' }
      });
      return {
        allowed: false,
        relationship: rel,
        denialReason: 'Active patient consent for clinical consultation is required.',
        errorCode: 'AUTHZ_003'
      };
    }

    // Access Allowed
    AuditService.record({
      ...auditBase,
      result: 'ALLOWED',
      metadata: {
        dataDomain: request.dataDomain,
        action: request.action,
        purpose: request.purpose
      }
    });

    return {
      allowed: true,
      relationship: rel,
      membership: membership || undefined
    };
  }

  public static async assertAccess(
    request: EvaluateRelationshipAccessRequest
  ): Promise<{ relationship: CareRelationship; membership?: CareTeamMembership }> {
    const result = await RelationshipAccessEvaluator.evaluateAccess(request);
    if (!result.allowed) {
      throw new AuthorizationError(
        result.denialReason || 'Access denied by relationship-scoped authorization policy.',
        { errorCode: result.errorCode || 'AUTHZ_003' }
      );
    }
    return {
      relationship: result.relationship,
      membership: result.membership
    };
  }

  /**
   * Helper evaluating relationship access for a subject user and professional across all active relationships.
   */
  public static async evaluateProfessionalAccess(params: {
    subjectUserId: string;
    professionalId: string;
    purpose: string;
    action?: ActionPermission | string;
    dataDomain?: DataDomain | string;
  }): Promise<{ allowed: boolean; reason?: string; reasonCode?: 'AUTHZ_001' | 'AUTHZ_002' | 'AUTHZ_003' | 'AUTHZ_004' }> {
    if (!RelationshipAccessEvaluator.repository) {
      return { allowed: false, reason: 'Repository uninitialized.', reasonCode: 'AUTHZ_003' };
    }

    const rels = await RelationshipAccessEvaluator.repository.findRelationshipsByUserId(params.subjectUserId);
    if (!rels || rels.length === 0) {
      return {
        allowed: false,
        reason: 'No care relationship found between professional and subject.',
        reasonCode: 'AUTHZ_003'
      };
    }

    const targetAction = (params.action || ActionPermission.READ) as ActionPermission;
    const targetDomain = (params.dataDomain || DataDomain.CLINICAL_NOTES) as DataDomain;

    let lastDenialReason = 'No active authorized relationship found.';
    let lastErrorCode: 'AUTHZ_001' | 'AUTHZ_002' | 'AUTHZ_003' | 'AUTHZ_004' = 'AUTHZ_003';

    for (const rel of rels) {
      const evalResult = await RelationshipAccessEvaluator.evaluateAccess({
        relationshipId: rel.id,
        professionalId: params.professionalId,
        dataDomain: targetDomain,
        action: targetAction,
        purpose: params.purpose
      });

      if (evalResult.allowed) {
        return { allowed: true };
      }
      lastDenialReason = evalResult.denialReason || lastDenialReason;
      lastErrorCode = evalResult.errorCode || lastErrorCode;
    }

    return { allowed: false, reason: lastDenialReason, reasonCode: lastErrorCode };
  }
}
