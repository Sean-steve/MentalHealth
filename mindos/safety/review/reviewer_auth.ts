/**
 * MindOS Safety Reviewer Authorization & Role Verification
 * Authority: Volumes I, V, VIII & Appendices B / F / Q
 * 
 * Strict Invariants:
 * - Deny-by-default is non-negotiable.
 * - Platform Admin SHALL NOT imply unrestricted health or clinical safety override (R-SEC-001).
 * - Only verified CLINICAL_REVIEWER, CLINICAL_ADMIN, or SAFETY_REVIEWER can authorize risk transitions.
 */

import { RoleCode } from '../../platform/authorization/domain/types.js';
import { SafetyAccessDeniedError } from '../domain/errors.js';

export class SafetyReviewerAuth {
  private static readonly ELIGIBLE_REVIEW_ROLES = new Set<string>([
    RoleCode.CLINICAL_REVIEWER,
    RoleCode.CLINICAL_ADMIN,
    RoleCode.SAFETY_REVIEWER
  ]);

  /**
   * Asserts that the actor holds an authorized clinical/safety review role.
   * Throws SafetyAccessDeniedError if actor is an ordinary user, moderator, or general platform admin.
   */
  public static assertReviewerEligibility(actor: {
    actor_id: string;
    role: string | RoleCode;
  }): void {
    if (!actor || !actor.role) {
      throw new SafetyAccessDeniedError('Actor credentials missing for safety review operation.');
    }

    const role = actor.role.toString().toUpperCase();

    // Specific check: General platform admin without clinical role is strictly forbidden
    if (role === RoleCode.PLATFORM_ADMIN || role === 'ADMIN' || role === 'ADMINISTRATOR') {
      throw new SafetyAccessDeniedError(
        'Platform Administrator role does not confer clinical safety review or override authority (R-SEC-001).',
        { actorId: actor.actor_id, attemptedRole: role }
      );
    }

    if (!SafetyReviewerAuth.ELIGIBLE_REVIEW_ROLES.has(role)) {
      throw new SafetyAccessDeniedError(
        `Role "${role}" is not authorized to review safety escalations or modify risk states.`,
        { actorId: actor.actor_id, attemptedRole: role }
      );
    }
  }

  public static isEligibleReviewer(role?: string | RoleCode): boolean {
    if (!role) return false;
    return SafetyReviewerAuth.ELIGIBLE_REVIEW_ROLES.has(role.toString().toUpperCase());
  }
}
