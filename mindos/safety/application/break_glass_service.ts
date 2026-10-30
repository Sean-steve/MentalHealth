/**
 * MindOS Safety Break-Glass Emergency Service
 * Authority: Volumes I, V, VIII & Appendix G
 * 
 * Rules:
 * - Eligible roles: CLINICAL_REVIEWER, CLINICAL_ADMIN, SAFETY_REVIEWER.
 * - Platform admins and moderators are unauthorized (R-SEC-001).
 * - Maximum lease duration: 60 minutes.
 * - Mandatory clinical post-review requirement.
 */

import { ISafetyRepository } from '../repositories/safety_repository.js';
import { SafetyBreakGlassSessionEntity } from '../domain/types.js';
import { SafetyBreakGlassUnauthorizedError, SafetyBreakGlassExpiredError } from '../domain/errors.js';
import { SafetyReviewerAuth } from '../review/reviewer_auth.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { AuditService } from '../../platform/audit/index.js';
import { DomainInvariantError } from '../../platform/errors/index.js';

export interface InitiateBreakGlassRequest {
  subject_user_id: string;
  actor_id: string;
  actor_role: string;
  justification: string;
  durationMinutes?: number;
}

export class SafetyBreakGlassService {
  constructor(private repo: ISafetyRepository) {}

  /**
   * Initiates an emergency break-glass override session.
   */
  public async initiateSession(req: InitiateBreakGlassRequest): Promise<SafetyBreakGlassSessionEntity> {
    // 1. Verify actor eligibility
    if (!SafetyReviewerAuth.isEligibleReviewer(req.actor_role)) {
      throw new SafetyBreakGlassUnauthorizedError(
        `Actor with role "${req.actor_role}" is not authorized for emergency break-glass protocols.`,
        { actorId: req.actor_id, attemptedRole: req.actor_role }
      );
    }

    // 2. Validate justification
    if (!req.justification || req.justification.trim().length < 20) {
      throw new DomainInvariantError('A substantive clinical justification (minimum 20 characters) is required to break glass.');
    }

    // 3. Calculate lease (capped at 60 minutes)
    const duration = Math.min(req.durationMinutes || 30, 60);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + duration * 60 * 1000).toISOString();

    const session: SafetyBreakGlassSessionEntity = {
      id: generateUUIDv7(),
      subject_user_id: req.subject_user_id,
      actor_id: req.actor_id,
      actor_role: req.actor_role,
      justification: req.justification,
      purpose: 'SAFETY_RESPONSE',
      started_at: now.toISOString(),
      expires_at: expiresAt,
      post_review_required: true,
      created_at: now.toISOString()
    };

    await this.repo.saveBreakGlassSession(session);

    // 4. Record audit event
    AuditService.record({
      actor_type: 'USER',
      actor_id: req.actor_id,
      action: 'SAFETY.BREAK_GLASS_INITIATED',
      resource_type: 'safety_break_glass_sessions',
      resource_id: session.id,
      purpose: 'SAFETY_RESPONSE',
      authorization_basis: {
        role: req.actor_role,
        justification: req.justification
      },
      result: 'ALLOWED',
      metadata: {
        subject_user_id: req.subject_user_id,
        durationMinutes: duration,
        expires_at: expiresAt
      }
    });

    return session;
  }

  /**
   * Asserts an active break-glass session exists and is not expired.
   */
  public async assertActiveSession(userId: string, actorId: string): Promise<SafetyBreakGlassSessionEntity> {
    const session = await this.repo.getActiveBreakGlassSession(userId, actorId);
    if (!session) {
      throw new SafetyBreakGlassExpiredError(
        'No active break-glass emergency session exists for this user and actor.',
        { userId, actorId }
      );
    }
    return session;
  }

  /**
   * Terminates active break-glass session.
   */
  public async terminateSession(userId: string, actorId: string): Promise<void> {
    const session = await this.repo.getActiveBreakGlassSession(userId, actorId);
    if (session) {
      session.terminated_at = new Date().toISOString();
      await this.repo.saveBreakGlassSession(session);

      AuditService.record({
        actor_type: 'USER',
        actor_id: actorId,
        action: 'SAFETY.BREAK_GLASS_TERMINATED',
        resource_type: 'safety_break_glass_sessions',
        resource_id: session.id,
        purpose: 'SAFETY_RESPONSE',
        authorization_basis: { role: session.actor_role },
        result: 'ALLOWED',
        metadata: {
          subject_user_id: userId,
          terminated_at: session.terminated_at
        }
      });
    }
  }
}
