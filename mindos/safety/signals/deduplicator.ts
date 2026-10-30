/**
 * MindOS Safety Signal Deduplicator & Recurrence Tracker
 * Authority: Volumes I, V & Clinical Safety Policy Catalogue
 * 
 * Rules:
 * - Repeated identical signals within a short window SHALL NOT generate duplicate crisis actions.
 * - Recurrence over time is preserved: high frequency of repeated signals can increase risk concern.
 */

import { NormalizedSignalResult } from './normalizer.js';

export interface DeduplicationAssessment {
  isDuplicate: boolean;
  recurrenceCount: number;
  escalatedByRecurrence: boolean;
  suppressNewAction: boolean;
  semanticKey: string;
}

interface SignalRecord {
  signal_code: string;
  observed_at: number;
}

export class SignalDeduplicator {
  private static userSignalHistory: Map<string, SignalRecord[]> = new Map();
  private static readonly DUPLICATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  private static readonly RECURRENCE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
  private static readonly RECURRENCE_ESCALATION_THRESHOLD = 3;

  /**
   * Evaluates inbound normalized signal against user's recent signal window.
   */
  public static evaluate(
    userId: string,
    signal: NormalizedSignalResult
  ): DeduplicationAssessment {
    const now = new Date(signal.observed_at).getTime();
    const history = SignalDeduplicator.userSignalHistory.get(userId) || [];

    // Clean up records older than recurrence window
    const recent = history.filter(r => now - r.observed_at < SignalDeduplicator.RECURRENCE_WINDOW_MS);

    // Check for exact duplicates within DUPLICATE_WINDOW_MS
    const exactDuplicates = recent.filter(
      r => r.signal_code === signal.signal_code && now - r.observed_at < SignalDeduplicator.DUPLICATE_WINDOW_MS
    );

    const isDuplicate = exactDuplicates.length > 0;
    const recurrenceCount = recent.filter(r => r.signal_code === signal.signal_code).length + 1;

    // If recurrence count >= threshold, escalate risk concern
    const escalatedByRecurrence = recurrenceCount >= SignalDeduplicator.RECURRENCE_ESCALATION_THRESHOLD;

    // Record this instance
    recent.push({
      signal_code: signal.signal_code,
      observed_at: now
    });
    SignalDeduplicator.userSignalHistory.set(userId, recent);

    const semanticKey = `${userId}:${signal.signal_code}:${Math.floor(now / SignalDeduplicator.DUPLICATE_WINDOW_MS)}`;

    return {
      isDuplicate,
      recurrenceCount,
      escalatedByRecurrence,
      suppressNewAction: isDuplicate && !escalatedByRecurrence,
      semanticKey
    };
  }

  public static clearHistory(userId?: string): void {
    if (userId) {
      SignalDeduplicator.userSignalHistory.delete(userId);
    } else {
      SignalDeduplicator.userSignalHistory.clear();
    }
  }

  public static reset(): void {
    SignalDeduplicator.clearHistory();
  }
}
