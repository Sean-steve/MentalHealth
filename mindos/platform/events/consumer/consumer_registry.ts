/**
 * MindOS Canonical Consumer Registry
 * Authority: Master Architecture Index Section 12, Volume IX & Appendix E & ADR-021
 */

import { ConsumerDefinition } from './types.js';
import { CanonicalEventRegistry } from '../registry/event_registry.js';
import { DomainInvariantError, ConflictError } from '../../errors/index.js';

export class ConsumerRegistry {
  private static consumers: Map<string, ConsumerDefinition> = new Map();
  private static eventToConsumers: Map<string, Set<string>> = new Map();

  public static register<T = Record<string, unknown>>(consumer: ConsumerDefinition<T>): void {
    if (ConsumerRegistry.consumers.has(consumer.consumer_id)) {
      throw new ConflictError(
        `DUPLICATE_CONSUMER_ID: Consumer with id "${consumer.consumer_id}" is already registered.`
      );
    }

    // Verify event is in canonical registry
    const eventDef = CanonicalEventRegistry.get(consumer.event_type);
    if (!eventDef) {
      throw new DomainInvariantError(
        `CONSUMER_REGISTRATION_FAILED: Event type "${consumer.event_type}" must be registered in CanonicalEventRegistry before binding consumers.`
      );
    }

    // Verify schema version is compatible
    if (consumer.supported_schema_version > eventDef.schema_version) {
      throw new DomainInvariantError(
        `SCHEMA_MISMATCH: Consumer "${consumer.consumer_id}" supports v${consumer.supported_schema_version}, but registry only has v${eventDef.schema_version}.`
      );
    }

    ConsumerRegistry.consumers.set(consumer.consumer_id, consumer as ConsumerDefinition);

    const list = ConsumerRegistry.eventToConsumers.get(consumer.event_type) || new Set();
    list.add(consumer.consumer_id);
    ConsumerRegistry.eventToConsumers.set(consumer.event_type, list);
  }

  public static get(consumerId: string): ConsumerDefinition | undefined {
    return ConsumerRegistry.consumers.get(consumerId);
  }

  public static getForEventType(eventType: string): ConsumerDefinition[] {
    const ids = ConsumerRegistry.eventToConsumers.get(eventType);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => ConsumerRegistry.consumers.get(id)!)
      .filter(Boolean);
  }

  public static listAll(): ConsumerDefinition[] {
    return Array.from(ConsumerRegistry.consumers.values());
  }

  public static resetForTesting(): void {
    ConsumerRegistry.consumers.clear();
    ConsumerRegistry.eventToConsumers.clear();
  }
}
