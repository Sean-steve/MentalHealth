/**
 * MindOS Canonical Event Transport Abstraction Types
 * Authority: Master Architecture Index Section 12, Volume IX & Appendix E & ADR-007
 */

import { DomainEventEnvelope, EventPriority } from '../types.js';

export interface TransportMessage {
  messageId: string;
  queue: string;
  routingKey: string;
  priority: EventPriority;
  envelope: DomainEventEnvelope;
  attempts: number;
  publishedAt: string;
}

export type TransportMessageHandler = (
  envelope: DomainEventEnvelope,
  messageId: string
) => Promise<void>;

export interface EventTransport {
  publish(envelope: DomainEventEnvelope, routingKey?: string): Promise<void>;
  subscribe(
    queue: string,
    handler: TransportMessageHandler
  ): Promise<() => void>;
  ack(queue: string, messageId: string): Promise<void>;
  nack(queue: string, messageId: string, requeue?: boolean): Promise<void>;
  getQueueDepth(queue: string): number;
  healthCheck(): Promise<boolean>;
  simulateBrokerFailure(fail: boolean): void;
  resetForTesting(): void;
}
