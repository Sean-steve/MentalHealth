/**
 * MindOS Security Event Repository
 * Authority: Master Architecture Index Section 14, Volumes III, VIII, X, Appendix M
 * ADR-022 (Operational Security Logging Separation)
 */

import { DatabaseManager, DatabaseClient } from '../../database/connection.js';
import { SecurityEvent } from '../domain/security_event.js';

export interface SecurityEventFilter {
  category?: string;
  severity?: string;
  account_reference?: string;
  correlation_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export class SecurityEventRepository {
  private static inMemoryEvents: SecurityEvent[] = [];

  public static async append(
    event: Omit<SecurityEvent, 'created_at'>,
    txClient?: DatabaseClient
  ): Promise<SecurityEvent> {
    const fullEvent: SecurityEvent = {
      ...event,
      created_at: new Date().toISOString()
    };

    const client = txClient || DatabaseManager.getClient();

    await client.query(
      `INSERT INTO security_events (
        id, category, severity, actor_reference, account_reference,
        source, occurred_at, correlation_id, signal, status,
        metadata_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        fullEvent.id,
        fullEvent.category,
        fullEvent.severity,
        fullEvent.actor_reference || null,
        fullEvent.account_reference || null,
        fullEvent.source,
        fullEvent.occurred_at,
        fullEvent.correlation_id,
        fullEvent.signal,
        fullEvent.status,
        JSON.stringify(fullEvent.metadata || {}),
        fullEvent.created_at
      ]
    );

    SecurityEventRepository.inMemoryEvents.push(fullEvent);
    return fullEvent;
  }

  public static async query(filter: SecurityEventFilter): Promise<{ events: SecurityEvent[]; total: number }> {
    let list = [...SecurityEventRepository.inMemoryEvents];

    if (filter.category) {
      list = list.filter((e) => e.category === filter.category);
    }
    if (filter.severity) {
      list = list.filter((e) => e.severity === filter.severity);
    }
    if (filter.account_reference) {
      list = list.filter((e) => e.account_reference === filter.account_reference);
    }
    if (filter.correlation_id) {
      list = list.filter((e) => e.correlation_id === filter.correlation_id);
    }
    if (filter.status) {
      list = list.filter((e) => e.status === filter.status);
    }

    const total = list.length;
    const offset = filter.offset || 0;
    const limit = filter.limit !== undefined ? filter.limit : 50;
    const paginated = list.slice(offset, offset + limit);

    return { events: paginated, total };
  }

  public static getAllEvents(): SecurityEvent[] {
    return [...SecurityEventRepository.inMemoryEvents];
  }

  public static resetForTesting(): void {
    SecurityEventRepository.inMemoryEvents = [];
  }
}
