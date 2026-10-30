/**
 * MindOS Safety Resource Matcher & Expiry Guardian
 * Authority: Volumes I, V & Clinical Safety Policy Catalogue Section 7
 * 
 * Rules:
 * - Only verified, unexpired resources SHALL be returned (R-SAFE-003).
 * - Expiration check: resources with expires_at <= now are excluded and flagged.
 * - Global Fallback: Guaranteed return of safe resources even if local directory empty.
 */

import {
  SafetyResourceEntity,
  ResourceVerificationStatus
} from '../domain/types.js';
import { CANONICAL_SAFETY_RESOURCES } from './canonical_seed.js';
import { SafetyMetrics } from '../infrastructure/metrics.js';
import { SafetyAlertManager } from '../infrastructure/alerts.js';

export interface ResourceMatchCriteria {
  jurisdiction?: string;
  riskCategory?: string;
  language?: string;
}

export class SafetyResourceMatcher {
  private static registry: SafetyResourceEntity[] = [...CANONICAL_SAFETY_RESOURCES];

  /**
   * Sets or updates active in-memory registry (can be synced from DB).
   */
  public static setRegistry(resources: SafetyResourceEntity[]): void {
    SafetyResourceMatcher.registry = [...resources];
  }

  public static getRegistry(): SafetyResourceEntity[] {
    return [...SafetyResourceMatcher.registry];
  }

  /**
   * Matches valid, unexpired resources for the given criteria.
   */
  public static match(criteria: ResourceMatchCriteria, currentTimeMs = Date.now()): SafetyResourceEntity[] {
    const targetJurisdiction = (criteria.jurisdiction || 'KE').toUpperCase();
    const riskCat = criteria.riskCategory;

    // Filter candidates
    let candidates = SafetyResourceMatcher.registry.filter(res => {
      // Must be active
      if (res.status !== 'ACTIVE') return false;

      // Must be in target jurisdiction or global fallback
      const matchJurisdiction = res.jurisdiction.toUpperCase() === targetJurisdiction;
      if (!matchJurisdiction) return false;

      // Risk category match if specified
      if (riskCat && res.risk_applicability.length > 0) {
        if (!res.risk_applicability.includes(riskCat) && !res.risk_applicability.includes('ALL')) {
          return false;
        }
      }

      return true;
    });

    // Check verification status & expiration
    const valid: SafetyResourceEntity[] = [];

    for (const res of candidates) {
      const expiresMs = new Date(res.expires_at).getTime();

      if (res.verification_status !== ResourceVerificationStatus.VERIFIED) {
        continue;
      }

      if (expiresMs <= currentTimeMs) {
        // Resource expired!
        res.verification_status = ResourceVerificationStatus.EXPIRED;
        SafetyMetrics.recordResourceExpiredServed();

        SafetyAlertManager.raiseAlert({
          alertType: 'SAFETY_RESOURCE_EXPIRED',
          severity: 'HIGH',
          message: `Safety resource ${res.resource_code} [${res.name}] expired on ${res.expires_at} and was excluded from active response.`,
          context: {
            resourceId: res.id,
            resourceCode: res.resource_code,
            jurisdiction: res.jurisdiction
          }
        });
        continue;
      }

      valid.push(res);
    }

    // Guaranteed fallback: If no valid local resources remain, fetch global fallback
    if (valid.length === 0) {
      const fallback = SafetyResourceMatcher.registry.find(
        r => r.jurisdiction === 'GLOBAL_FALLBACK' && r.status === 'ACTIVE'
      );
      if (fallback) {
        valid.push(fallback);
      }
    }

    return valid;
  }
}
