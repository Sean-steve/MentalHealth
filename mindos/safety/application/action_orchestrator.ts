/**
 * MindOS Safety Action Orchestrator
 * Authority: Volumes I, V & Clinical Safety Policy Catalogue Section 6
 * 
 * Rules:
 * - Generates deduplicated actions from RiskState.
 * - Dispatches critical actions first.
 * - Publishes safety.action_required events.
 */

import { ISafetyRepository } from '../repositories/safety_repository.js';
import {
  SafetyActionEntity,
  RiskStateEntity,
  SafetyActionPriority
} from '../domain/types.js';
import { ActionGenerator } from '../actions/action_generator.js';
import { SafetyActionWorker } from '../actions/action_worker.js';
import { EvaluatedRiskPolicyResult } from '../policies/canonical_policies.js';
import { EventPublisher } from '../../platform/events/index.js';
import { CanonicalEventTypes, EventPriority } from '../../platform/events/registry/event_registry.js';
import { SafetyMetrics } from '../infrastructure/metrics.js';

export class ActionOrchestrator {
  constructor(private repo: ISafetyRepository) {}

  /**
   * Generates, persists, and orchestrates safety actions for a user's risk state.
   */
  public async orchestrateActions(
    riskState: RiskStateEntity,
    policyResult: EvaluatedRiskPolicyResult,
    customExecutor?: (action: SafetyActionEntity) => Promise<string>
  ): Promise<SafetyActionEntity[]> {
    const existingActions = await this.repo.getActionsByUser(riskState.subject_user_id);

    // 1. Generate deduplicated actions
    const generated = ActionGenerator.generateActions({
      userId: riskState.subject_user_id,
      riskStateId: riskState.id,
      policyVersion: riskState.policy_version,
      requiredActions: policyResult.requiredActions,
      existingActions
    });

    // 2. Persist new actions
    for (const action of generated) {
      await this.repo.saveAction(action);
    }

    // 3. Sort by priority (CRITICAL > HIGH > NORMAL)
    const sorted = SafetyActionWorker.sortByPriority(generated);

    // 4. Publish action_required events and execute in priority order
    for (const action of sorted) {
      try {
        await EventPublisher.publish({
          type: CanonicalEventTypes.SAFETY_ACTION_REQUIRED,
          subjectId: action.subject_user_id,
          payload: {
            actionId: action.id,
            actionType: action.action_type,
            priority: action.priority,
            riskStateId: action.risk_state_id
          },
          priority: action.priority === SafetyActionPriority.CRITICAL ? EventPriority.CRITICAL : EventPriority.HIGH
        });
      } catch (err) {
        // Event publish non-blocking
      }

      // Execute action via worker
      await SafetyActionWorker.executeAction(action, customExecutor);
      await this.repo.saveAction(action);
      SafetyMetrics.recordActionSuccess(action.action_type);
    }

    return sorted;
  }
}
