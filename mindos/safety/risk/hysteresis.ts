/**
 * MindOS Safety Risk Hysteresis & Flapping Prevention
 * Authority: Volumes I, V & Clinical Safety Policy Catalogue Section 5
 * 
 * Rules:
 * - Prevents rapid oscillation (e.g. HIGH -> NO_CONCERN -> HIGH).
 * - Topic change alone SHALL NOT reset active elevated, high, or urgent risk states (SP-004).
 * - Minimum persistence window for high/urgent states before automated decay.
 */

import { RiskState } from '../domain/types.js';

export interface HysteresisState {
  userId: string;
  currentState: RiskState;
  peakState: RiskState;
  lastElevatedAt: number;
  lastEvaluatedAt: number;
}

export class RiskHysteresisManager {
  private static userStates: Map<string, HysteresisState> = new Map();
  // Minimum cooldown before automatic decay of HIGH/URGENT states (2 hours)
  private static readonly HIGH_RISK_STABILITY_WINDOW_MS = 2 * 60 * 60 * 1000;
  // Minimum cooldown for ELEVATED state (30 minutes)
  private static readonly ELEVATED_STABILITY_WINDOW_MS = 30 * 60 * 1000;

  /**
   * Applies hysteresis rules to candidate state.
   */
  public static applyHysteresis(
    userId: string,
    candidateState: RiskState,
    currentTimeMs = Date.now()
  ): { finalState: RiskState; isHeldByHysteresis: boolean; holdReason?: string } {
    const existing = RiskHysteresisManager.userStates.get(userId);
    if (!existing) {
      // First evaluation
      RiskHysteresisManager.userStates.set(userId, {
        userId,
        currentState: candidateState,
        peakState: candidateState,
        lastElevatedAt: candidateState !== RiskState.NO_CONCERN && candidateState !== RiskState.UNKNOWN ? currentTimeMs : 0,
        lastEvaluatedAt: currentTimeMs
      });
      return { finalState: candidateState, isHeldByHysteresis: false };
    }

    // If candidate state is higher or equal, accept immediately and update peak
    const candidateRank = RiskHysteresisManager.getRank(candidateState);
    const currentRank = RiskHysteresisManager.getRank(existing.currentState);

    if (candidateRank >= currentRank) {
      existing.currentState = candidateState;
      if (candidateRank > RiskHysteresisManager.getRank(existing.peakState)) {
        existing.peakState = candidateState;
      }
      if (candidateRank >= RiskHysteresisManager.getRank(RiskState.ELEVATED)) {
        existing.lastElevatedAt = currentTimeMs;
      }
      existing.lastEvaluatedAt = currentTimeMs;
      return { finalState: candidateState, isHeldByHysteresis: false };
    }

    // Candidate state is lower: check hysteresis hold window
    if (existing.currentState === RiskState.URGENT || existing.currentState === RiskState.HIGH) {
      const elapsed = currentTimeMs - existing.lastElevatedAt;
      if (elapsed < RiskHysteresisManager.HIGH_RISK_STABILITY_WINDOW_MS) {
        // Hold active state
        return {
          finalState: existing.currentState,
          isHeldByHysteresis: true,
          holdReason: `High-risk state held by hysteresis (active for ${Math.round(elapsed / 60000)}m of ${RiskHysteresisManager.HIGH_RISK_STABILITY_WINDOW_MS / 60000}m stability window).`
        };
      }
    } else if (existing.currentState === RiskState.ELEVATED) {
      const elapsed = currentTimeMs - existing.lastElevatedAt;
      if (elapsed < RiskHysteresisManager.ELEVATED_STABILITY_WINDOW_MS) {
        return {
          finalState: existing.currentState,
          isHeldByHysteresis: true,
          holdReason: `Elevated state held by hysteresis (active for ${Math.round(elapsed / 60000)}m of ${RiskHysteresisManager.ELEVATED_STABILITY_WINDOW_MS / 60000}m stability window).`
        };
      }
    }

    // Hysteresis window has expired, permit transition
    existing.currentState = candidateState;
    existing.lastEvaluatedAt = currentTimeMs;
    return { finalState: candidateState, isHeldByHysteresis: false };
  }

  public static forceReset(userId: string): void {
    RiskHysteresisManager.userStates.delete(userId);
  }

  public static clearAll(): void {
    RiskHysteresisManager.userStates.clear();
  }

  public static reset(): void {
    RiskHysteresisManager.clearAll();
  }

  private static getRank(state: RiskState): number {
    switch (state) {
      case RiskState.URGENT: return 5;
      case RiskState.HIGH: return 4;
      case RiskState.ELEVATED: return 3;
      case RiskState.POTENTIAL_CONCERN: return 2;
      case RiskState.NO_CONCERN: return 1;
      default: return 0;
    }
  }
}
