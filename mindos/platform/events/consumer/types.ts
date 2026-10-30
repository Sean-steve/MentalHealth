/**
 * MindOS Canonical Worker & Consumer Architecture Types
 * Authority: Master Architecture Index Section 12, Volume IX & Appendix E & ADR-021
 */

import { DomainEventEnvelope, EventPriority } from '../types.js';

export interface ConsumerContext {
  correlationId: string;
  requestId?: string;
  actor: string;
  scopes: string[];
  attempt: number;
}

export interface ConsumerRetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

export const DEFAULT_CONSUMER_RETRY_POLICY: ConsumerRetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 50,
  backoffMultiplier: 2,
  maxDelayMs: 2000
};

export interface ConsumerDefinition<T = Record<string, unknown>> {
  consumer_id: string;
  event_type: string;
  supported_schema_version: number;
  priority?: EventPriority;
  service_actor: string;
  authorized_scopes: string[];
  retry_policy?: ConsumerRetryPolicy;
  handler: (event: DomainEventEnvelope<T>, context: ConsumerContext) => Promise<void>;
}
