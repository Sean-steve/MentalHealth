/**
 * MindOS Safety Resource Registry Service
 * Authority: Volumes I, V & Clinical Safety Policy Catalogue Section 7
 * 
 * Rules:
 * - Only verified, unexpired resources SHALL be presented (R-SAFE-003).
 * - Publishes safety.resource_expired event on expiry detection.
 * - Enforces fallback to GLOBAL_FALLBACK if local jurisdiction empty.
 */

import { ISafetyRepository } from '../repositories/safety_repository.js';
import { SafetyResourceEntity, ResourceVerificationStatus } from '../domain/types.js';
import { SafetyResourceMatcher, ResourceMatchCriteria } from '../resources/resource_matcher.js';
import { EventPublisher } from '../../platform/events/index.js';
import { CanonicalEventTypes, EventPriority } from '../../platform/events/registry/event_registry.js';

export class ResourceRegistryService {
  constructor(private repo: ISafetyRepository) {}

  /**
   * Retrieves verified, active, unexpired crisis resources.
   */
  public async getVerifiedResources(criteria: ResourceMatchCriteria): Promise<SafetyResourceEntity[]> {
    const resources = await this.repo.getResources(criteria.jurisdiction);
    SafetyResourceMatcher.setRegistry(resources);

    const matched = SafetyResourceMatcher.match(criteria);
    return matched;
  }

  /**
   * Scans repository for expired resources, flags them, and publishes safety.resource_expired events.
   */
  public async auditResourceExpirations(): Promise<SafetyResourceEntity[]> {
    const all = await this.repo.getResources();
    const nowMs = Date.now();
    const expired: SafetyResourceEntity[] = [];

    for (const res of all) {
      const expMs = new Date(res.expires_at).getTime();
      if (expMs <= nowMs && res.verification_status === ResourceVerificationStatus.VERIFIED) {
        res.verification_status = ResourceVerificationStatus.EXPIRED;
        await this.repo.saveResource(res);
        expired.push(res);

        try {
          await EventPublisher.publish({
            type: CanonicalEventTypes.SAFETY_RESOURCE_EXPIRED,
            subjectId: res.resource_code,
            payload: {
              resourceId: res.id,
              resourceCode: res.resource_code,
              jurisdiction: res.jurisdiction,
              expiredAt: res.expires_at
            },
            priority: EventPriority.HIGH
          });
        } catch (err) {
          // Non-blocking
        }
      }
    }

    return expired;
  }
}
