/**
 * MindOS Safety Action Generator & Idempotency Filter
 * Authority: Volumes I, V & Clinical Safety Policy Catalogue
 * 
 * Rules:
 * - Deterministic generation from approved RiskPolicy + RiskState.
 * - Semantic Idempotency: Repeated evaluations SHALL NOT create duplicate pending actions of the same type.
 */

import {
  SafetyActionEntity,
  SafetyActionType,
  SafetyActionPriority,
  SafetyActionStatus
} from '../domain/types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';

export interface ActionGenerationRequest {
  userId: string;
  riskStateId: string;
  policyVersion: string;
  requiredActions: Array<{
    actionType: SafetyActionType;
    priority: SafetyActionPriority;
  }>;
  existingActions?: SafetyActionEntity[];
}

export class ActionGenerator {
  /**
   * Generates deduplicated, prioritized SafetyAction entities.
   */
  public static generateActions(request: ActionGenerationRequest): SafetyActionEntity[] {
    const now = new Date();
    const nowIso = now.toISOString();
    const existing = request.existingActions || [];

    // Filter out active existing actions to prevent duplicate storms
    const activeTypes = new Set(
      existing
        .filter(a => a.status === SafetyActionStatus.PENDING || a.status === SafetyActionStatus.IN_PROGRESS)
        .map(a => a.action_type)
    );

    const generated: SafetyActionEntity[] = [];

    for (const req of request.requiredActions) {
      if (activeTypes.has(req.actionType)) {
        // Idempotent suppression: action already pending/in progress
        continue;
      }

      // Compute SLA due date based on priority
      let dueMinutes = 60; // default 1 hour
      if (req.priority === SafetyActionPriority.CRITICAL) {
        dueMinutes = 5; // 5 minutes for critical
      } else if (req.priority === SafetyActionPriority.HIGH) {
        dueMinutes = 15; // 15 minutes for high
      }

      const dueAt = new Date(now.getTime() + dueMinutes * 60 * 1000).toISOString();

      generated.push({
        id: generateUUIDv7(),
        subject_user_id: request.userId,
        risk_state_id: request.riskStateId,
        action_type: req.actionType,
        priority: req.priority,
        status: SafetyActionStatus.PENDING,
        required_by_policy: true,
        generated_at: nowIso,
        due_at: dueAt,
        policy_version: request.policyVersion
      });
    }

    return generated;
  }
}
