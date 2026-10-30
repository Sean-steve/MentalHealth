/**
 * MindOS Analytics Bounded Context
 * Authority: Volumes I, III & Appendix B / C / Q
 * Owns: analytics_events, aggregated_metrics
 * Invariant: Analytics ingestion must strip PII and sensitive health notes; only pseudonymized metrics stored.
 */

import { generateUUIDv7 } from '../platform/database/uuid.js';
import { DataClassification } from '../platform/shared/data_classification.js';
import { sensitiveRedactor } from '../platform/observability/redactor.js';

export interface MinimizedAnalyticsEvent {
  id: string; // UUIDv7
  event_name: string;
  pseudonym_id: string;
  properties_json: Record<string, unknown>;
  timestamp: string;
}

export class AnalyticsService {
  private static events: MinimizedAnalyticsEvent[] = [];

  public static async recordEvent(eventName: string, userId: string, properties: Record<string, unknown>): Promise<void> {
    const pseudonym = `anon_${userId.substring(0, 8)}`;
    const sanitizedProps = sensitiveRedactor.redactObject(properties);

    const event: MinimizedAnalyticsEvent = {
      id: generateUUIDv7(),
      event_name: eventName,
      pseudonym_id: pseudonym,
      properties_json: sanitizedProps,
      timestamp: new Date().toISOString()
    };

    AnalyticsService.events.push(event);
  }

  public static getEvents(): MinimizedAnalyticsEvent[] {
    return [...AnalyticsService.events];
  }

  public static resetForTesting(): void {
    AnalyticsService.events = [];
  }
}
