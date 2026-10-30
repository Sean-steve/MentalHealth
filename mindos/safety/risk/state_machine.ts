/**
 * MindOS Canonical Risk State Machine & Transition Rules
 * Authority: Volumes I, V & Appendices B / C / P (ADR-003, ADR-010, ADR-018)
 * 
 * Strict Invariants:
 * - One canonical RiskState per user.
 * - URGENT state SHALL NOT transition directly to NO_CONCERN or POTENTIAL_CONCERN (R-SAFE-001).
 * - Downward transitions from URGENT/HIGH require formal clinical review or approved safety verification.
 */

import { RiskState } from '../domain/types.js';
import { DomainInvariantError, ValidationError } from '../../platform/errors/index.js';
import { IllegalRiskStateTransitionError } from '../domain/errors.js';

export class RiskStateMachine {
  /**
   * Canonical transition matrix matching Appendix C
   */
  private static readonly ALLOWED_TRANSITIONS: Record<RiskState, RiskState[]> = {
    [RiskState.UNKNOWN]: [
      RiskState.NO_CONCERN,
      RiskState.POTENTIAL_CONCERN,
      RiskState.ELEVATED,
      RiskState.HIGH,
      RiskState.URGENT
    ],
    [RiskState.NO_CONCERN]: [
      RiskState.POTENTIAL_CONCERN,
      RiskState.ELEVATED,
      RiskState.HIGH,
      RiskState.URGENT
    ],
    [RiskState.POTENTIAL_CONCERN]: [
      RiskState.NO_CONCERN,
      RiskState.ELEVATED,
      RiskState.HIGH,
      RiskState.URGENT
    ],
    [RiskState.ELEVATED]: [
      RiskState.POTENTIAL_CONCERN,
      RiskState.NO_CONCERN,
      RiskState.HIGH,
      RiskState.URGENT
    ],
    [RiskState.HIGH]: [
      RiskState.ELEVATED,
      RiskState.URGENT,
      RiskState.POTENTIAL_CONCERN
    ],
    [RiskState.URGENT]: [
      RiskState.HIGH,
      RiskState.ELEVATED
    ]
  };

  /**
   * Numeric severity rank for comparing states
   */
  public static readonly SEVERITY_RANK: Record<RiskState, number> = {
    [RiskState.UNKNOWN]: 0,
    [RiskState.NO_CONCERN]: 1,
    [RiskState.POTENTIAL_CONCERN]: 2,
    [RiskState.ELEVATED]: 3,
    [RiskState.HIGH]: 4,
    [RiskState.URGENT]: 5
  };

  /**
   * Validates whether a state transition is mathematically and clinically permissible.
   */
  public static validateTransition(
    fromState: RiskState,
    toState: RiskState,
    options: {
      userId: string;
      isClinicalReviewApproved?: boolean;
      rationale?: string;
    }
  ): void {
    if (fromState === toState) {
      return; // No-op transition is permitted
    }

    const allowedTargets = RiskStateMachine.ALLOWED_TRANSITIONS[fromState];
    if (!allowedTargets || !allowedTargets.includes(toState)) {
      throw new IllegalRiskStateTransitionError(
        `Direct risk state transition from ${fromState} to ${toState} is strictly forbidden by clinical safety state-machine policy.`,
        {
          internalContext: {
            userId: options.userId,
            fromState,
            toState,
            allowedTargets
          }
        }
      );
    }

    // Downward transition enforcement
    const isDownward = RiskStateMachine.SEVERITY_RANK[toState] < RiskStateMachine.SEVERITY_RANK[fromState];
    if (isDownward) {
      if (fromState === RiskState.URGENT) {
        // Must have formal clinical review signoff or safety check verification
        if (!options.isClinicalReviewApproved) {
          throw new DomainInvariantError(
            `Downgrading from URGENT requires authorized clinical review sign-off. Cannot transition automatically.`,
            {
              internalContext: {
                userId: options.userId,
                fromState,
                toState
              }
            }
          );
        }
      }
    }
  }

  /**
   * Checks if candidateState is strictly higher than currentState
   */
  public static isHigherRisk(candidateState: RiskState, currentState: RiskState): boolean {
    return RiskStateMachine.SEVERITY_RANK[candidateState] > RiskStateMachine.SEVERITY_RANK[currentState];
  }
}
