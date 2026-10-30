/**
 * MindOS In-Memory AMQP-Compatible Event Transport
 * Authority: Master Architecture Index Section 12, Volume IX & Appendix E
 * Deterministic message broker with priority queues, topic routing, and ACK semantics.
 */

import { EventTransport, TransportMessage, TransportMessageHandler } from './types.js';
import { DomainEventEnvelope, EventPriority } from '../types.js';
import { UUIDv7 } from '../../database/uuid.js';
import { InfrastructureError } from '../../errors/index.js';

export class InMemoryEventTransport implements EventTransport {
  private queues: Map<string, TransportMessage[]> = new Map();
  private subscribers: Map<string, Set<TransportMessageHandler>> = new Map();
  private inFlight: Map<string, TransportMessage> = new Map();
  private brokerHealthy = true;

  public simulateBrokerFailure(fail: boolean): void {
    this.brokerHealthy = !fail;
  }

  public async healthCheck(): Promise<boolean> {
    return this.brokerHealthy;
  }

  public async publish(envelope: DomainEventEnvelope, routingKey?: string): Promise<void> {
    if (!this.brokerHealthy) {
      throw new InfrastructureError('BROKER_UNAVAILABLE: Connection to message broker lost (simulated outage).');
    }

    const key = routingKey || envelope.event_type;
    const priority = envelope.priority || (envelope.metadata?.priority as EventPriority) || EventPriority.NORMAL;
    const messageId = UUIDv7.generate();

    const message: TransportMessage = {
      messageId,
      queue: key,
      routingKey: key,
      priority,
      envelope,
      attempts: 0,
      publishedAt: new Date().toISOString()
    };

    // Determine target queues based on topic subscriptions
    // E.g. queue could be exact match 'identity.user_registered', or pattern 'identity.*', or '*'
    const matchedQueues = new Set<string>();
    for (const subQueue of this.subscribers.keys()) {
      if (this.matchesTopic(subQueue, key)) {
        matchedQueues.add(subQueue);
      }
    }

    // If no explicit subscribers yet, record in key queue
    if (matchedQueues.size === 0) {
      matchedQueues.add(key);
    }

    for (const q of matchedQueues) {
      const qList = this.queues.get(q) || [];
      qList.push({ ...message, queue: q });
      
      // Sort queue by priority: CRITICAL > HIGH > NORMAL > LOW
      const priorityOrder: Record<string, number> = {
        CRITICAL: 4,
        HIGH: 3,
        NORMAL: 2,
        LOW: 1
      };
      qList.sort((a, b) => {
        const pA = priorityOrder[a.priority] || 2;
        const pB = priorityOrder[b.priority] || 2;
        return pB - pA;
      });

      this.queues.set(q, qList);
      setTimeout(() => {
        this.dispatchNext(q);
      }, 25);
    }
  }

  public async subscribe(queue: string, handler: TransportMessageHandler): Promise<() => void> {
    const subs = this.subscribers.get(queue) || new Set();
    subs.add(handler);
    this.subscribers.set(queue, subs);

    // Immediately drain pending queue messages for this subscriber
    process.nextTick(() => {
      this.dispatchNext(queue);
    });

    return () => {
      subs.delete(handler);
      if (subs.size === 0) {
        this.subscribers.delete(queue);
      }
    };
  }

  public async ack(queue: string, messageId: string): Promise<void> {
    this.inFlight.delete(messageId);
  }

  public async nack(queue: string, messageId: string, requeue = true): Promise<void> {
    const msg = this.inFlight.get(messageId);
    this.inFlight.delete(messageId);

    if (requeue && msg) {
      msg.attempts += 1;
      const qList = this.queues.get(queue) || [];
      qList.unshift(msg);
      this.queues.set(queue, qList);
      this.dispatchNext(queue);
    }
  }

  public getQueueDepth(queue: string): number {
    return (this.queues.get(queue) || []).length;
  }

  private async dispatchNext(queue: string): Promise<void> {
    const subs = this.subscribers.get(queue);
    if (!subs || subs.size === 0) return;

    const qList = this.queues.get(queue);
    if (!qList || qList.length === 0) return;

    const msg = qList.shift();
    if (!msg) return;

    this.inFlight.set(msg.messageId, msg);

    const handlerArg: any = {
      messageId: msg.messageId,
      queue: msg.queue,
      routingKey: msg.routingKey,
      priority: msg.priority,
      envelope: msg.envelope,
      attempts: msg.attempts,
      publishedAt: msg.publishedAt,
      ...msg.envelope
    };
    handlerArg.envelope = msg.envelope;

    const promises = [];
    for (const handler of subs) {
      promises.push(
        Promise.resolve(handler(handlerArg, msg.messageId)).catch(err => {
          // Consumer error handled by consumer worker
        })
      );
    }
    await Promise.all(promises);
  }

  private matchesTopic(pattern: string, key: string): boolean {
    if (pattern === '#' || pattern === '*') return true;
    if (pattern === key) return true;

    const pParts = pattern.split('.');
    const kParts = key.split('.');

    for (let i = 0; i < pParts.length; i++) {
      const p = pParts[i];
      if (p === '#') return true;
      if (p === '*') continue;
      if (p !== kParts[i]) return false;
    }

    return pParts.length === kParts.length;
  }

  public async drain(): Promise<void> {
    let hasMore = true;
    let passes = 0;
    while (hasMore && passes < 100) {
      hasMore = false;
      passes++;
      for (const queue of Array.from(this.queues.keys())) {
        const qList = this.queues.get(queue);
        if (qList && qList.length > 0) {
          hasMore = true;
          await this.dispatchNext(queue);
        }
      }
      await new Promise(r => setTimeout(r, 5));
    }
  }

  public resetForTesting(): void {
    this.queues.clear();
    this.subscribers.clear();
    this.inFlight.clear();
    this.brokerHealthy = true;
  }
}
