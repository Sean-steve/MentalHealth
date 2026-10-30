/**
 * MindOS Canonical Security Event Service
 * Authority: Master Architecture Index Section 14, Volumes III, VIII, X, Appendix M
 * ADR-022 (Operational Security Logging Separation)
 */

import { v7 as uuidv7 } from 'uuid';
import { CorrelationManager } from '../../shared/correlation.js';
import { DatabaseClient } from '../../database/connection.js';
import { metrics } from '../../observability/metrics.js';
import { logger } from '../../observability/logger.js';
import { SecurityEvent, SecurityEventInput } from '../domain/security_event.js';
import { SecurityEventCategory, SecurityEventSeverity } from '../domain/taxonomy.js';
import { auditRedactor } from '../redaction/audit_redactor.js';
import { SecurityEventRepository } from '../repositories/security_event_repository.js';

export class SecurityEventService {
  /**
   * Records an operational security incident or anomaly.
   * Stored in security_events table, distinct from audit_records.
   */
  public static async record(
    input: SecurityEventInput,
    txClient?: DatabaseClient
  ): Promise<SecurityEvent> {
    const correlation = CorrelationManager.get();
    const id = input.id || uuidv7();
    const occurred_at = input.occurred_at || new Date().toISOString();
    const correlation_id = input.correlation_id || correlation.correlationId;
    const source = input.source || 'SECURITY_MONITOR';
    const status = input.status || 'OPEN';

    // Scrub secrets from security metadata
    const cleanMetadata = input.metadata ? auditRedactor.redactMetadata(input.metadata) : {};

    const eventToSave: Omit<SecurityEvent, 'created_at'> = {
      id,
      category: input.category,
      severity: input.severity,
      actor_reference: input.actor_reference,
      account_reference: input.account_reference,
      source,
      occurred_at,
      correlation_id,
      signal: input.signal,
      status,
      metadata: cleanMetadata
    };

    const saved = await SecurityEventRepository.append(eventToSave, txClient);
    metrics.increment('security_event_total', 1);

    if (input.severity === SecurityEventSeverity.CRITICAL || input.severity === SecurityEventSeverity.HIGH) {
      logger.warn(`High-severity security event: [${input.category}] ${input.signal}`, {
        security_event_id: id,
        category: input.category,
        severity: input.severity,
        account: input.account_reference
      });
    }

    return saved;
  }

  public static async listEvents(filter: {
    category?: string;
    severity?: string;
    account_reference?: string;
    correlation_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ events: SecurityEvent[]; total: number }> {
    return SecurityEventRepository.query(filter);
  }

  public static resetForTesting(): void {
    SecurityEventRepository.resetForTesting();
  }
}
