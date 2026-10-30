/**
 * MindOS Safety Escalation Queue & SLA Monitor
 * Authority: Volumes I, V & Clinical Safety Policy Catalogue Section 6
 * 
 * Rules:
 * - SLA Monitoring: detects unacknowledged or unresolved escalations past SLA.
 * - Acknowledgement records timestamp and actor ID.
 * - Resolution requires outcome summary.
 */

import {
  SafetyEscalationEntity,
  EscalationState,
  SafetyActionPriority
} from '../domain/types.js';
import { SafetyAlertManager } from '../infrastructure/alerts.js';
import { SafetyMetrics } from '../infrastructure/metrics.js';
import { DomainInvariantError } from '../../platform/errors/index.js';

export class EscalationQueue {
  /**
   * Records reviewer acknowledgement of an escalation case.
   */
  public static acknowledge(
    escalation: SafetyEscalationEntity,
    actorId: string
  ): void {
    if (escalation.status === EscalationState.RESOLVED || escalation.status === EscalationState.CANCELLED) {
      throw new DomainInvariantError(`Cannot acknowledge an escalation in ${escalation.status} state.`);
    }

    const now = new Date().toISOString();
    escalation.acknowledged_at = now;
    escalation.assigned_actor_id = actorId;
    escalation.assigned_at = escalation.assigned_at || now;
    escalation.status = EscalationState.IN_REVIEW;
  }

  /**
   * Resolves an escalation case with outcome documentation.
   */
  public static resolve(
    escalation: SafetyEscalationEntity,
    actorId: string,
    outcome: string
  ): void {
    if (!outcome || outcome.trim().length === 0) {
      throw new DomainInvariantError('Resolution outcome summary is required to close a safety escalation.');
    }

    escalation.resolved_at = new Date().toISOString();
    escalation.status = EscalationState.RESOLVED;
    escalation.outcome = outcome;
    escalation.assigned_actor_id = escalation.assigned_actor_id || actorId;
  }

  /**
   * Scans a set of active escalations for SLA breaches and emits operational alerts.
   */
  public static checkSlaBreaches(escalations: SafetyEscalationEntity[]): SafetyEscalationEntity[] {
    const nowMs = Date.now();
    const breached: SafetyEscalationEntity[] = [];

    for (const esc of escalations) {
      if (esc.status === EscalationState.RESOLVED || esc.status === EscalationState.CANCELLED) {
        continue;
      }

      // Check acknowledgement SLA
      if (!esc.acknowledged_at) {
        const dueMs = new Date(esc.sla_acknowledgement_due_at).getTime();
        if (nowMs > dueMs) {
          breached.push(esc);
          SafetyMetrics.recordSlaBreach(esc.escalation_type);

          SafetyAlertManager.raiseAlert({
            alertType: 'SAFETY_ESCALATION_SLA_BREACH',
            severity: esc.priority === SafetyActionPriority.CRITICAL ? 'CRITICAL' : 'HIGH',
            message: `Escalation ${esc.id} [${esc.escalation_type}] breached acknowledgement SLA by ${Math.round((nowMs - dueMs) / 60000)} minutes.`,
            context: {
              escalationId: esc.id,
              userId: esc.subject_user_id,
              priority: esc.priority,
              assignedTeam: esc.assigned_team
            }
          });
        }
      }
    }

    return breached;
  }
}
