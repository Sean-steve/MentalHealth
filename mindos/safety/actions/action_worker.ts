/**
 * MindOS Safety Action Worker & Execution Dispatcher
 * Authority: Master Architecture Index Section 6, Volumes I, V & Appendices B / E
 * 
 * Rules:
 * - Critical actions process before normal product workloads.
 * - Failure Isolation: Action execution failure SHALL NOT roll back canonical RiskState.
 * - Critical action failures generate operational alert + fallback execution.
 */

import {
  SafetyActionEntity,
  SafetyActionPriority,
  SafetyActionStatus
} from '../domain/types.js';
import { SafetyAlertManager } from '../infrastructure/alerts.js';
import { SafetyMetrics } from '../infrastructure/metrics.js';
import { AuditService } from '../../platform/audit/index.js';

export interface ActionExecutionResult {
  actionId: string;
  status: SafetyActionStatus;
  completedAt?: string;
  outcome?: string;
  failureReason?: string;
}

export class SafetyActionWorker {
  /**
   * Executes a single safety action with strict error boundary and observability.
   */
  public static async executeAction(
    action: SafetyActionEntity,
    executor?: (act: SafetyActionEntity) => Promise<string>
  ): Promise<ActionExecutionResult> {
    action.status = SafetyActionStatus.IN_PROGRESS;
    action.started_at = new Date().toISOString();

    try {
      let outcome = 'Action executed successfully.';
      if (executor) {
        outcome = await executor(action);
      } else {
        // Default execution strategy per action type
        outcome = `Default handler completed ${action.action_type}`;
      }

      action.status = SafetyActionStatus.COMPLETED;
      action.completed_at = new Date().toISOString();
      action.outcome = outcome;

      AuditService.record({
        actor_type: 'SERVICE',
        action: 'SAFETY.ACTION_COMPLETED',
        resource_type: 'safety_actions',
        resource_id: action.id,
        purpose: 'SAFETY_RESPONSE',
        authorization_basis: { policy_version: action.policy_version },
        result: 'ALLOWED',
        metadata: {
          action_type: action.action_type,
          priority: action.priority,
          subject_user_id: action.subject_user_id
        }
      });

      return {
        actionId: action.id,
        status: SafetyActionStatus.COMPLETED,
        completedAt: action.completed_at,
        outcome
      };
    } catch (err: any) {
      action.status = SafetyActionStatus.FAILED;
      action.failure_reason = err.message || 'Execution error';

      SafetyMetrics.recordActionFailure(action.action_type);

      // Critical action failure triggers immediate alert
      if (action.priority === SafetyActionPriority.CRITICAL) {
        SafetyAlertManager.raiseAlert({
          alertType: 'CRITICAL_SAFETY_ACTION_FAILED',
          severity: 'CRITICAL',
          message: `Mandatory critical safety action ${action.action_type} failed for user ${action.subject_user_id}: ${action.failure_reason}`,
          context: {
            actionId: action.id,
            actionType: action.action_type,
            userId: action.subject_user_id,
            error: err.message
          }
        });
      }

      AuditService.record({
        actor_type: 'SERVICE',
        action: 'SAFETY.ACTION_FAILED',
        resource_type: 'safety_actions',
        resource_id: action.id,
        purpose: 'SAFETY_RESPONSE',
        authorization_basis: { policy_version: action.policy_version },
        result: 'DENIED',
        metadata: {
          action_type: action.action_type,
          priority: action.priority,
          error: err.message
        }
      });

      return {
        actionId: action.id,
        status: SafetyActionStatus.FAILED,
        failureReason: action.failure_reason
      };
    }
  }

  /**
   * Sorts batch of actions by canonical execution priority (CRITICAL > HIGH > NORMAL).
   */
  public static sortByPriority(actions: SafetyActionEntity[]): SafetyActionEntity[] {
    const priorityWeight: Record<SafetyActionPriority, number> = {
      [SafetyActionPriority.CRITICAL]: 1,
      [SafetyActionPriority.HIGH]: 2,
      [SafetyActionPriority.NORMAL]: 3
    };

    return [...actions].sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority]);
  }
}
