/**
 * MindOS Canonical Privacy Governance Reconciliation & Drift Daemon
 * Authority: Master Architecture Index Section 7, Volumes I, VIII & Appendix B / Q
 *            Kenya Data Protection Act 2019 Section 41
 * Invariant: Continuous background verification of approvals, expirations, and processor authorizations.
 */

import { PrivacyGovernancePersistence } from './persistence.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { AuditAction, AuditActorType, AuditResult } from '../../platform/audit/domain/taxonomy.js';
import { ProcessingActivityState } from '../types.js';
import { logger } from '../../platform/observability/logger.js';

export interface ReconciliationSummary {
  checked_approvals: number;
  expired_approvals: number;
  reconciled_activities: number;
  drift_detected: boolean;
  issues: string[];
}

export class PrivacyGovernanceReconciliationDaemon {
  private static timer: NodeJS.Timeout | null = null;

  /**
   * Executes a single pass of the reconciliation check
   */
  public static async reconcileOnce(): Promise<ReconciliationSummary> {
    const approvals = await PrivacyGovernancePersistence.listApprovals();
    const activities = await PrivacyGovernancePersistence.listActivities();
    const now = Date.now();

    const issues: string[] = [];
    let expiredCount = 0;
    let reconciledActivities = 0;

    for (const approval of approvals) {
      if (approval.status === 'ACTIVE' && new Date(approval.expires_at).getTime() < now) {
        approval.status = 'EXPIRED';
        await PrivacyGovernancePersistence.saveApproval(approval);
        expiredCount++;

        const activity = activities.find((a) => a.id === approval.processing_activity_id);
        if (activity && activity.status === ProcessingActivityState.APPROVED) {
          activity.status = ProcessingActivityState.EXPIRED;
          await PrivacyGovernancePersistence.saveActivity(activity);
          reconciledActivities++;

          const msg = `Privacy approval for activity ${activity.code} v${approval.processing_activity_version} expired at ${approval.expires_at}`;
          issues.push(msg);

          await EventBus.publish({
            type: 'privacy.approval_expired',
            payload: {
              activity_id: activity.id,
              activity_code: activity.code,
              version: approval.processing_activity_version,
              expired_at: approval.expires_at
            }
          });

          await AuditService.record({
            action: AuditAction.UPDATE,
            actor_id: 'daemon-privacy-reconciliation',
            actor_type: AuditActorType.SYSTEM_SERVICE,
            resource_type: 'processing_activity',
            resource_id: activity.id,
            result: AuditResult.SUCCESS,
            authorization_basis: { reason: 'Approval validity period lapsed; transition to EXPIRED' }
          });
        }
      }
    }

    const summary: ReconciliationSummary = {
      checked_approvals: approvals.length,
      expired_approvals: expiredCount,
      reconciled_activities: reconciledActivities,
      drift_detected: issues.length > 0,
      issues
    };

    if (summary.drift_detected) {
      logger.warn('Privacy Governance Reconciliation detected drift/expiry', { summary });
    }

    return summary;
  }

  /**
   * Starts periodic execution
   */
  public static start(intervalMs: number = 60000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.reconcileOnce().catch((err) => {
        logger.error('Privacy Governance reconciliation error', { error: err.message });
      });
    }, intervalMs);
    // unref so tests can exit cleanly
    this.timer.unref();
  }

  public static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
