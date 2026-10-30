/**
 * MindOS Canonical Event Schema Versioning & Upcasting Engine
 * Authority: Master Architecture Index Section 12, Volume IX & Appendix E
 */

import { DomainEventEnvelope } from '../types.js';
import { DomainInvariantError } from '../../errors/index.js';

export type EventUpcasterFn<TOld = any, TNew = any> = (oldPayload: TOld) => TNew;

export class EventSchemaVersioningEngine {
  private static upcasters: Map<string, EventUpcasterFn> = new Map();

  private static makeKey(eventType: string, fromVersion: number, toVersion: number): string {
    return `${eventType}:${fromVersion}->${toVersion}`;
  }

  public static registerUpcaster<TOld, TNew>(
    eventType: string,
    fromVersion: number,
    toVersion: number,
    upcaster: EventUpcasterFn<TOld, TNew>
  ): void {
    if (toVersion <= fromVersion) {
      throw new DomainInvariantError('UPCASTER_VERSION_ERROR: Target version must be greater than source version');
    }
    const key = EventSchemaVersioningEngine.makeKey(eventType, fromVersion, toVersion);
    EventSchemaVersioningEngine.upcasters.set(key, upcaster);
  }

  /**
   * Upcasts an event envelope from its current schema_version to the target version.
   */
  public static upcast<T = Record<string, unknown>>(
    event: DomainEventEnvelope,
    targetVersion: number
  ): DomainEventEnvelope<T> {
    if (event.schema_version === targetVersion) {
      return event as DomainEventEnvelope<T>;
    }

    if (event.schema_version > targetVersion) {
      throw new DomainInvariantError(
        `EVENT_DOWNCAST_FORBIDDEN: Event schema version ${event.schema_version} cannot be downcast to ${targetVersion}`
      );
    }

    let currentVersion = event.schema_version;
    let currentPayload = event.payload;

    while (currentVersion < targetVersion) {
      const nextVersion = currentVersion + 1;
      const key = EventSchemaVersioningEngine.makeKey(event.event_type, currentVersion, nextVersion);
      const upcaster = EventSchemaVersioningEngine.upcasters.get(key);

      if (!upcaster) {
        throw new DomainInvariantError(
          `NO_UPCASTER_REGISTERED: No upcaster found for event "${event.event_type}" from v${currentVersion} to v${nextVersion}`
        );
      }

      currentPayload = upcaster(currentPayload);
      currentVersion = nextVersion;
    }

    return {
      ...event,
      schema_version: targetVersion,
      payload: currentPayload as T
    };
  }

  public static resetForTesting(): void {
    EventSchemaVersioningEngine.upcasters.clear();
  }
}

export { EventSchemaVersioningEngine as UpcastingEngine };
