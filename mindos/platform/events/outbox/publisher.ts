/**
 * MindOS Canonical Transactional Outbox Publisher
 * Authority: Master Architecture Index Section 12, Volume IX & Appendix E & ADR-007, ADR-021
 * Delivers at-least-once guaranteed publication from database outbox to message transport.
 */

import { OutboxRepository } from '../../database/outbox/repository.js';
import { DatabaseManager } from '../../database/connection.js';
import { EventTransport } from '../transport/types.js';
import { DomainEventEnvelope, EventPriority } from '../types.js';
import { EventMetrics } from '../observability/metrics.js';
import { logger } from '../../observability/logger.js';
import { OutboxEventRow } from '../../database/outbox/types.js';

export class OutboxPublisher {
  private outboxRepo: OutboxRepository;
  private transport: EventTransport;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private maxRetries: number;

  constructor(
    repoOrTransport: OutboxRepository | EventTransport,
    transportOrOptions?: EventTransport | { batchSize?: number; maxRetries?: number },
    maxRetries = OutboxRepository.DEFAULT_MAX_RETRIES
  ) {
    if (repoOrTransport && ('claimBatch' in (repoOrTransport as any))) {
      this.outboxRepo = repoOrTransport as OutboxRepository;
      this.transport = transportOrOptions as EventTransport;
      this.maxRetries = maxRetries;
    } else {
      this.transport = repoOrTransport as EventTransport;
      this.outboxRepo = new OutboxRepository(DatabaseManager.getClient());
      const opts = (transportOrOptions as { batchSize?: number; maxRetries?: number }) || {};
      this.maxRetries = opts.maxRetries || maxRetries;
    }
  }

  public async publishBatch(batchSize = 50): Promise<number> {
    const res = await this.tick(batchSize);
    return res.published;
  }

  public start(intervalMs = 200): void {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      await this.tick().catch(err => {
        logger.error('OutboxPublisher tick error', { error: err.message });
      });
    }, intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Executes a single publishing cycle.
   * Drains events respecting priority: CRITICAL > HIGH > NORMAL > LOW.
   */
  public async tick(batchSize = 50): Promise<{ published: number; failed: number }> {
    if (this.isProcessing) {
      return { published: 0, failed: 0 };
    }

    this.isProcessing = true;
    let published = 0;
    let failed = 0;

    try {
      const batch = await this.outboxRepo.claimBatch(batchSize);

      for (const row of batch) {
        const start = Date.now();
        try {
          const envelope = this.reconstructEnvelope(row);
          await this.transport.publish(envelope);

          await this.outboxRepo.markPublished(row.id);
          EventMetrics.recordPublishSuccess(Date.now() - start);
          published++;
        } catch (err: any) {
          failed++;
          EventMetrics.recordPublishFailure();

          // Calculate exponential backoff with jitter
          const attempts = (row.attempt_count || 0) + 1;
          const baseDelayMs = Math.min(100 * Math.pow(2, attempts), 30000);
          const jitterMs = Math.floor(Math.random() * 50);
          const nextAvailableAt = new Date(Date.now() + baseDelayMs + jitterMs).toISOString();

          await this.outboxRepo.markFailed(row.id, err.message, {
            errorCode: err.code || 'TRANSPORT_PUBLISH_FAILURE',
            nextAvailableAt,
            maxRetries: this.maxRetries
          });

          logger.warn('Outbox publisher failed to dispatch event; scheduled retry', {
            eventId: row.event_id || row.id,
            eventType: row.event_type,
            attempt: attempts,
            error: err.message
          });
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return { published, failed };
  }

  /**
   * Cleans up published outbox records past retention window
   */
  public async cleanupPublished(retentionPeriodDays = 7): Promise<number> {
    const cutoffDate = new Date(Date.now() - retentionPeriodDays * 24 * 60 * 60 * 1000).toISOString();
    return this.outboxRepo.purgePublished(cutoffDate);
  }

  private reconstructEnvelope(row: OutboxEventRow): DomainEventEnvelope {
    const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {};

    return {
      event_id: (row.event_id || row.id) as string,
      event_type: row.event_type,
      schema_version: row.schema_version || 1,
      occurred_at: row.occurred_at,
      producer: (metadata.producer as string) || (row.aggregate_type || 'platform'),
      producer_version: (metadata.producer_version as string) || '1.0.0',
      aggregate_type: row.aggregate_type,
      aggregate_id: row.aggregate_id,
      correlation_id: row.correlation_id || (metadata.correlationId as string) || (row.event_id || row.id),
      causation_id: row.causation_id || (metadata.causationId as string),
      request_id: metadata.requestId as string,
      classification: (row.classification as any) || (metadata.classification as any) || 'INTERNAL',
      jurisdiction: (metadata.jurisdiction as string) || 'KE',
      payload,
      metadata: {
        priority: (row.priority as EventPriority) || (metadata.priority as EventPriority) || EventPriority.NORMAL,
        ...metadata
      }
    };
  }
}
