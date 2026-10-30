/**
 * MindOS Safety Metrics Collector
 * Authority: Volumes I, V & Appendices B / E
 * 
 * Rules:
 * - Metric labels MUST NOT contain user IDs, patient names, or PII.
 * - Dimension aggregation by signal_code, severity, risk_state, and action_type.
 */

import { RiskState, SafetyActionType } from '../domain/types.js';

export class SafetyMetrics {
  private static signalCounts: Map<string, number> = new Map();
  private static riskTransitions: Map<string, number> = new Map();
  private static actionSuccessCounts: Map<string, number> = new Map();
  private static actionFailureCounts: Map<string, number> = new Map();
  private static escalationCounts: Map<string, number> = new Map();
  private static escalationSlaBreaches: Map<string, number> = new Map();
  private static resourceExpiryAlerts: number = 0;

  public static recordSignalDetected(signalCode: string, severity: string): void {
    const key = `${signalCode}:${severity}`;
    SafetyMetrics.signalCounts.set(key, (SafetyMetrics.signalCounts.get(key) || 0) + 1);
  }

  public static recordStateTransition(fromState: RiskState, toState: RiskState): void {
    const key = `${fromState}->${toState}`;
    SafetyMetrics.riskTransitions.set(key, (SafetyMetrics.riskTransitions.get(key) || 0) + 1);
  }

  public static recordActionSuccess(actionType: SafetyActionType): void {
    SafetyMetrics.actionSuccessCounts.set(actionType, (SafetyMetrics.actionSuccessCounts.get(actionType) || 0) + 1);
  }

  public static recordActionFailure(actionType: SafetyActionType): void {
    SafetyMetrics.actionFailureCounts.set(actionType, (SafetyMetrics.actionFailureCounts.get(actionType) || 0) + 1);
  }

  public static recordEscalationCreated(escalationType: string, priority: string): void {
    const key = `${escalationType}:${priority}`;
    SafetyMetrics.escalationCounts.set(key, (SafetyMetrics.escalationCounts.get(key) || 0) + 1);
  }

  public static recordSlaBreach(escalationType: string): void {
    SafetyMetrics.escalationSlaBreaches.set(escalationType, (SafetyMetrics.escalationSlaBreaches.get(escalationType) || 0) + 1);
  }

  public static recordResourceExpiredServed(): void {
    SafetyMetrics.resourceExpiryAlerts++;
  }

  public static getSnapshot(): Record<string, unknown> {
    return {
      signalsDetected: Object.fromEntries(SafetyMetrics.signalCounts),
      stateTransitions: Object.fromEntries(SafetyMetrics.riskTransitions),
      actionSuccesses: Object.fromEntries(SafetyMetrics.actionSuccessCounts),
      actionFailures: Object.fromEntries(SafetyMetrics.actionFailureCounts),
      escalations: Object.fromEntries(SafetyMetrics.escalationCounts),
      slaBreaches: Object.fromEntries(SafetyMetrics.escalationSlaBreaches),
      resourceExpiryAlerts: SafetyMetrics.resourceExpiryAlerts
    };
  }

  public static reset(): void {
    SafetyMetrics.signalCounts.clear();
    SafetyMetrics.riskTransitions.clear();
    SafetyMetrics.actionSuccessCounts.clear();
    SafetyMetrics.actionFailureCounts.clear();
    SafetyMetrics.escalationCounts.clear();
    SafetyMetrics.escalationSlaBreaches.clear();
    SafetyMetrics.resourceExpiryAlerts = 0;
  }
}
