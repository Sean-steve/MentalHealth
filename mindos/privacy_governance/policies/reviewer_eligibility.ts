/**
 * MindOS Privacy Reviewer Eligibility & Separation of Duties Policy
 * Authority: Master Architecture Index Section 7, Volume I, III, VIII & Appendix B / Q
 *            Kenya Data Protection Act 2019 Section 24 (Data Protection Officer)
 */

export interface ReviewerActor {
  id?: string;
  userId?: string;
  roles: string[];
}

export interface ReviewerEligibilityResult {
  eligible: boolean;
  reason?: string;
}

export class PrivacyReviewerEligibilityEngine {
  public static readonly ALLOWED_ROLES = [
    'ROLE_DATA_PROTECTION_OFFICER',
    'ROLE_PRIVACY_OFFICER',
    'DATA_PROTECTION_OFFICER',
    'PRIVACY_OFFICER'
  ];

  /**
   * Assesses whether an actor is authorized to review or approve a DPIA / Processing Activity.
   * Enforces:
   * 1. Explicit DPO / Privacy Officer role assignment
   * 2. Strict separation of duties: Activity owner CANNOT approve their own activity.
   */
  public static evaluateEligibility(
    actor: ReviewerActor,
    activityOwnerId: string
  ): ReviewerEligibilityResult {
    const actorId = actor.userId || actor.id || '';
    const roles = actor.roles || [];

    // 1. Separation of duties check
    if (actorId && actorId === activityOwnerId) {
      return {
        eligible: false,
        reason: `Separation of Duties Violation: Processing activity owner (${activityOwnerId}) cannot act as the privacy reviewer or approver.`
      };
    }

    // 2. Role authorization check
    const hasRequiredRole = roles.some((r) => this.ALLOWED_ROLES.includes(r));
    if (!hasRequiredRole) {
      return {
        eligible: false,
        reason: `Actor ${actorId} lacks required Data Protection Officer role (requires one of: ${this.ALLOWED_ROLES.join(', ')}).`
      };
    }

    return { eligible: true };
  }
}
