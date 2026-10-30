/**
 * MindOS Canonical Event Consumer Worker
 * Authority: Master Architecture Index Section 12, Volume IX & Appendix E & ADR-021
 * Enforces at-least-once delivery, idempotency, retry backoff, and dead-letter handling.
 */

import { EventTransport } from '../transport/types.js';
import { DomainEventEnvelope, EventPriority } from '../types.js';
import { ConsumerRegistry } from './consumer_registry.js';
import { ConsumerDefinition, DEFAULT_CONSUMER_RETRY_POLICY } from './types.js';
import { ProcessedEventsRepository } from './idempotency.js';
import { DeadLetterService } from '../dead_letter/service.js';
import { CorrelationManager } from '../../shared/correlation.js';
import { EventMetrics } from '../observability/metrics.js';
import { logger } from '../../observability/logger.js';

export interface EventWorkerConfig {
  consumerId?: string;
  transport?: EventTransport;
  idempotencyRepo?: ProcessedEventsRepository;
  deadLetterService?: DeadLetterService;
  maxRetries?: number;
  baseBackoffMs?: number;
}

export class EventWorker {
  private transport: EventTransport;
  private idempotencyRepo: ProcessedEventsRepository;
  private deadLetterService: DeadLetterService;
  private unsubscribers: Array<() => void> = [];
  private running = false;
  private consumerId: string;
  private maxRetries: number;
  private baseBackoffMs: number;
  private customHandlers: Map<string, Array<(envelope: DomainEventEnvelope) => Promise<void> | void>> = new Map();

  constructor(
    transportOrConfig: EventTransport | EventWorkerConfig,
    idempotencyRepo?: ProcessedEventsRepository,
    deadLetterService?: DeadLetterService
  ) {
    if (transportOrConfig && ('publish' in (transportOrConfig as any))) {
      this.transport = transportOrConfig as EventTransport;
      this.idempotencyRepo = idempotencyRepo || new ProcessedEventsRepository();
      this.deadLetterService = deadLetterService || new DeadLetterService(undefined, this.transport);
      this.consumerId = 'default_worker';
      this.maxRetries = 3;
      this.baseBackoffMs = 50;
    } else {
      const cfg = (transportOrConfig as EventWorkerConfig) || {};
      this.transport = cfg.transport || ({} as EventTransport);
      this.idempotencyRepo = cfg.idempotencyRepo || idempotencyRepo || new ProcessedEventsRepository();
      this.deadLetterService = cfg.deadLetterService || deadLetterService || new DeadLetterService(undefined, this.transport);
      this.consumerId = cfg.consumerId || 'default_worker';
      this.maxRetries = cfg.maxRetries ?? 3;
      this.baseBackoffMs = cfg.baseBackoffMs ?? 50;
    }
  }

  public registerHandler(eventType: string, handler: (envelope: DomainEventEnvelope) => Promise<void> | void): void {
    const handlers = this.customHandlers.get(eventType) || [];
    handlers.push(handler);
    this.customHandlers.set(eventType, handlers);
  }

  public async handleEnvelope(
    envelope: DomainEventEnvelope
  ): Promise<{ status: 'SUCCESS' | 'SKIPPED_DUPLICATE' | 'DEAD_LETTERED'; attempts: number }> {
    const alreadyProcessed = await this.idempotencyRepo.isProcessed(this.consumerId, envelope.event_id);
    if (alreadyProcessed) {
      EventMetrics.recordIdempotencyHit(this.consumerId, envelope.event_type);
      return { status: 'SKIPPED_DUPLICATE', attempts: 0 };
    }

    const handlers = this.customHandlers.get(envelope.event_type) || this.customHandlers.get('*') || [];
    let attempt = 0;
    let delayMs = this.baseBackoffMs;
    let lastError: any = null;

    while (attempt < this.maxRetries) {
      attempt++;
      try {
        for (const handler of handlers) {
          await handler(envelope);
        }
        await this.idempotencyRepo.recordProcessed(this.consumerId, envelope.event_id, envelope.event_type, 'SUCCESS');
        EventMetrics.recordConsumerSuccess(this.consumerId, envelope.event_type, 10);
        return { status: 'SUCCESS', attempts: attempt };
      } catch (err: any) {
        lastError = err;
        EventMetrics.recordConsumerRetry(this.consumerId, envelope.event_type);
        if (attempt < this.maxRetries) {
          await new Promise(r => setTimeout(r, delayMs));
          delayMs *= 2;
        }
      }
    }

    EventMetrics.recordDeadLetter(this.consumerId, envelope.event_type);
    await this.deadLetterService.recordPoisonEvent(
      envelope,
      this.consumerId,
      attempt,
      lastError?.code || 'CONSUMER_EXECUTION_FAILURE',
      lastError?.message || String(lastError)
    );
    await this.idempotencyRepo.recordProcessed(
      this.consumerId,
      envelope.event_id,
      envelope.event_type,
      'FAILED',
      lastError?.message
    );
    return { status: 'DEAD_LETTERED', attempts: attempt };
  }

  public async start(topics: string[] = ['*']): Promise<void> {
    if (this.running) return;
    this.running = true;

    for (const topic of topics) {
      const unsub = await this.transport.subscribe(topic, async (envelope, messageId) => {
        await this.handleIncomingMessage(envelope, messageId, topic);
      });
      this.unsubscribers.push(unsub);
    }
  }

  public async stop(): Promise<void> {
    this.running = false;
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
  }

  public async handleIncomingMessage(
    envelope: DomainEventEnvelope,
    messageId: string,
    queueName: string
  ): Promise<void> {
    const consumers = ConsumerRegistry.getForEventType(envelope.event_type);

    if (consumers.length === 0) {
      // No consumers bound; safely acknowledge
      await this.transport.ack(queueName, messageId);
      return;
    }

    for (const consumer of consumers) {
      await this.dispatchToConsumer(consumer, envelope);
    }

    // Acknowledge transport message once all consumers have processed or dead-lettered
    await this.transport.ack(queueName, messageId);
  }

  public async dispatchToConsumer(
    consumer: ConsumerDefinition,
    envelope: DomainEventEnvelope
  ): Promise<{ status: 'SUCCESS' | 'SKIPPED' | 'DEAD_LETTERED'; attempts: number }> {
    // 1. Idempotency Check
    const alreadyProcessed = await this.idempotencyRepo.isProcessed(
      consumer.consumer_id,
      envelope.event_id
    );

    if (alreadyProcessed) {
      EventMetrics.recordIdempotencyHit(consumer.consumer_id, envelope.event_type);
      logger.info('Consumer idempotency hit: skipping duplicate delivery', {
        consumerId: consumer.consumer_id,
        eventId: envelope.event_id,
        eventType: envelope.event_type
      });
      return { status: 'SKIPPED', attempts: 0 };
    }

    // 2. Retry policy setup
    const policy = consumer.retry_policy || DEFAULT_CONSUMER_RETRY_POLICY;
    let attempt = 0;
    let delayMs = policy.initialDelayMs;
    let lastError: any = null;

    const startTimer = Date.now();

    while (attempt < policy.maxAttempts) {
      attempt++;
      try {
        await CorrelationManager.withCorrelation(
          envelope.correlation_id,
          envelope.request_id,
          envelope.causation_id,
          async () => {
            await consumer.handler(envelope, {
              correlationId: envelope.correlation_id,
              requestId: envelope.request_id,
              actor: consumer.service_actor,
              scopes: consumer.authorized_scopes,
              attempt
            });
          }
        );

        // Success: record in idempotency registry
        await this.idempotencyRepo.recordProcessed(
          consumer.consumer_id,
          envelope.event_id,
          envelope.event_type,
          'SUCCESS'
        );

        EventMetrics.recordConsumerSuccess(
          consumer.consumer_id,
          envelope.event_type,
          Date.now() - startTimer
        );

        return { status: 'SUCCESS', attempts: attempt };
      } catch (err: any) {
        lastError = err;
        EventMetrics.recordConsumerRetry(consumer.consumer_id, envelope.event_type);

        if (attempt < policy.maxAttempts) {
          // Exponential backoff
          await new Promise(r => setTimeout(r, delayMs));
          delayMs = Math.min(delayMs * policy.backoffMultiplier, policy.maxDelayMs);
        }
      }
    }

    // 3. Poison event: All retries exhausted -> Route to Dead-Letter Quarantine
    EventMetrics.recordDeadLetter(consumer.consumer_id, envelope.event_type);
    await this.deadLetterService.recordPoisonEvent(
      envelope,
      consumer.consumer_id,
      attempt,
      lastError?.code || 'CONSUMER_EXECUTION_FAILURE',
      lastError?.message || String(lastError)
    );

    await this.idempotencyRepo.recordProcessed(
      consumer.consumer_id,
      envelope.event_id,
      envelope.event_type,
      'FAILED',
      lastError?.message
    );

    return { status: 'DEAD_LETTERED', attempts: attempt };
  }
}
