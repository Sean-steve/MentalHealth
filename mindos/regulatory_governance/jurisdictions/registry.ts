/**
 * MindOS Jurisdiction Registry
 * Authority: Volumes III, XV & Appendices B / C / I
 * Core Principle: Multi-jurisdiction architecture with strict isolation.
 * Regulatory approval is jurisdiction-specific; approvals cannot be inherited across jurisdictions.
 */

import { Jurisdiction } from '../domain/types.js';
import { JurisdictionStatus } from '../domain/taxonomy.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { ValidationError } from '../../platform/errors/index.js';

export class JurisdictionRegistry {
  private static jurisdictions: Map<string, Jurisdiction> = new Map();

  static {
    JurisdictionRegistry.initializeCanonicalJurisdictions();
  }

  public static initializeCanonicalJurisdictions(): void {
    JurisdictionRegistry.jurisdictions.clear();

    // 1. Primary Active Jurisdiction: Kenya (KE)
    const keId = generateUUIDv7();
    JurisdictionRegistry.jurisdictions.set('KE', {
      id: keId,
      code: 'KE',
      name: 'Republic of Kenya',
      country_code: 'KE',
      region: 'EAST_AFRICA',
      status: JurisdictionStatus.ACTIVE,
      default_language: 'en',
      timezone_reference: 'Africa/Nairobi',
      regulatory_profile_version: '1.0.0',
      effective_at: '2026-01-01T00:00:00.000Z',
      metadata: {
        currency: 'KES',
        dha_mandatory: true,
        odpc_mandatory: true,
        kmpdc_mandatory: true
      }
    });

    // 2. Extensible Regional Profiles (Prepared for Phase 2/3 - DRAFT status)
    const planned = [
      { code: 'UG', name: 'Republic of Uganda', region: 'EAST_AFRICA', tz: 'Africa/Kampala' },
      { code: 'TZ', name: 'United Republic of Tanzania', region: 'EAST_AFRICA', tz: 'Africa/Dar_es_Salaam' },
      { code: 'RW', name: 'Republic of Rwanda', region: 'EAST_AFRICA', tz: 'Africa/Kigali' },
      { code: 'ZA', name: 'Republic of South Africa', region: 'SOUTHERN_AFRICA', tz: 'Africa/Johannesburg' },
      { code: 'UK', name: 'United Kingdom', region: 'EUROPE', tz: 'Europe/London' },
      { code: 'EU', name: 'European Union', region: 'EUROPE', tz: 'Europe/Brussels' },
      { code: 'US', name: 'United States of America', region: 'NORTH_AMERICA', tz: 'America/New_York' }
    ];

    for (const p of planned) {
      JurisdictionRegistry.jurisdictions.set(p.code, {
        id: generateUUIDv7(),
        code: p.code,
        name: p.name,
        country_code: p.code,
        region: p.region,
        status: JurisdictionStatus.DRAFT,
        default_language: 'en',
        timezone_reference: p.tz,
        regulatory_profile_version: '0.1.0',
        effective_at: '2027-01-01T00:00:00.000Z',
        metadata: { expansion_phase: 'FUTURE' }
      });
    }
  }

  public static get(code: string): Jurisdiction | undefined {
    return JurisdictionRegistry.jurisdictions.get(code.toUpperCase());
  }

  public static requireActive(code: string): Jurisdiction {
    const jur = JurisdictionRegistry.get(code);
    if (!jur) {
      throw new ValidationError(`Unknown jurisdiction code: ${code}`);
    }
    if (jur.status !== JurisdictionStatus.ACTIVE) {
      throw new ValidationError(`Jurisdiction ${code} is currently ${jur.status} and not active for regulatory governance.`);
    }
    return jur;
  }

  public static list(): Jurisdiction[] {
    return Array.from(JurisdictionRegistry.jurisdictions.values());
  }

  public static listActive(): Jurisdiction[] {
    return Array.from(JurisdictionRegistry.jurisdictions.values()).filter(
      (j) => j.status === JurisdictionStatus.ACTIVE
    );
  }

  public static register(jurisdiction: Jurisdiction): void {
    JurisdictionRegistry.jurisdictions.set(jurisdiction.code.toUpperCase(), jurisdiction);
  }

  public static updateStatus(code: string, status: JurisdictionStatus): void {
    const jur = JurisdictionRegistry.get(code);
    if (jur) {
      jur.status = status;
    }
  }

  public static resetForTesting(): void {
    JurisdictionRegistry.initializeCanonicalJurisdictions();
  }
}
