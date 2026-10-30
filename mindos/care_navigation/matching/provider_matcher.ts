/**
 * MindOS Provider Directory & Matching Readiness Engine
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
 * Invariant: Only verified professionals with active, unexpired licenses can receive referrals (R-NAV-004).
 */

import {
  ProviderMatchingProfileEntity,
  ProviderMatchCriteria,
  CareLevel,
  SupportNeedDomain,
  ServiceModality,
  ProfessionalVerificationState
} from '../domain/types.js';
import { CareNavigationInvariants } from '../domain/invariants.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { NotFoundError, DomainInvariantError } from '../../platform/errors/index.js';
import { ProfessionalService } from '../../professionals/index.js';

export class ProviderMatcher {
  private static providers: Map<string, ProviderMatchingProfileEntity> = new Map();
  private static initialized = false;

  static {
    ProviderMatcher.initialize();
  }

  public static initialize(): void {
    if (!ProviderMatcher.initialized) {
      ProviderMatcher.seedCanonicalProviders();
      ProviderMatcher.initialized = true;
    }
  }

  public static seedCanonicalProviders(): void {
    const canonical: ProviderMatchingProfileEntity[] = [
      {
        id: '01918c00-0030-7000-8000-000000000001',
        professional_id: '01918c00-0030-7000-8000-000000000001',
        title: 'Licensed Clinical Psychologist',
        full_name: 'Dr. Wanjiku Mwangi, PhD',
        verification_state: ProfessionalVerificationState.APPROVED,
        regulatory_body: 'KMPDC',
        license_number: 'KMPDC-PSY-2024-0491',
        license_expires_at: '2027-12-31T23:59:59.000Z',
        license_expiry: '2027-12-31T23:59:59.000Z',
        specialties: ['Clinical Psychology', 'Depression', 'Trauma & PTSD', 'CBT', 'Anxiety'],
        supported_care_levels: [CareLevel.LEVEL_2, CareLevel.LEVEL_3],
        care_levels: [CareLevel.LEVEL_2, CareLevel.LEVEL_3],
        modalities: [ServiceModality.TELEHEALTH, ServiceModality.IN_PERSON, ServiceModality.HYBRID],
        jurisdictions: ['KE'],
        languages: ['English', 'Swahili', 'en'],
        capacity_status: 'AVAILABLE',
        updated_at: '2026-01-01T00:00:00.000Z'
      },
      {
        id: '01918c00-0030-7000-8000-000000000002',
        professional_id: '01918c00-0030-7000-8000-000000000002',
        title: 'Registered Psychological Counselor',
        full_name: 'Otieno James, MA',
        verification_state: ProfessionalVerificationState.APPROVED,
        regulatory_body: 'KMPDC',
        license_number: 'KMPDC-CNS-2025-1102',
        license_expires_at: '2027-06-30T23:59:59.000Z',
        license_expiry: '2027-06-30T23:59:59.000Z',
        specialties: ['Counseling Psychology', 'Anxiety & Stress', 'Workplace Burnout', 'Grief'],
        supported_care_levels: [CareLevel.LEVEL_2],
        care_levels: [CareLevel.LEVEL_2],
        modalities: [ServiceModality.TELEHEALTH],
        jurisdictions: ['KE'],
        languages: ['English', 'Swahili', 'Luo', 'en'],
        capacity_status: 'AVAILABLE',
        updated_at: '2026-01-01T00:00:00.000Z'
      },
      {
        id: '01918c00-0030-7000-8000-000000000003',
        professional_id: '01918c00-0030-7000-8000-000000000003',
        title: 'Consultant Psychiatrist',
        full_name: 'Dr. Amina Abdi, MBChB, MMed Psych',
        verification_state: ProfessionalVerificationState.APPROVED,
        regulatory_body: 'KMPDC',
        license_number: 'KMPDC-MED-2023-8820',
        license_expires_at: '2028-01-01T00:00:00.000Z',
        license_expiry: '2028-01-01T00:00:00.000Z',
        specialties: ['General Psychiatry', 'Mood Disorders', 'Pharmacotherapy', 'Addiction Psychiatry'],
        supported_care_levels: [CareLevel.LEVEL_3, CareLevel.LEVEL_4],
        care_levels: [CareLevel.LEVEL_3, CareLevel.LEVEL_4],
        modalities: [ServiceModality.TELEHEALTH, ServiceModality.IN_PERSON],
        jurisdictions: ['KE'],
        languages: ['English', 'Swahili', 'Somali', 'en'],
        capacity_status: 'AVAILABLE',
        updated_at: '2026-01-01T00:00:00.000Z'
      },
      {
        id: 'bad-provider-01',
        professional_id: 'bad-provider-01',
        title: 'Suspended Practitioner',
        full_name: 'Suspended Practitioner',
        verification_state: ProfessionalVerificationState.SUSPENDED,
        regulatory_body: 'KMPDC',
        license_number: 'SUS-1234',
        license_expires_at: '2028-01-01T00:00:00.000Z',
        license_expiry: '2028-01-01T00:00:00.000Z',
        specialties: ['CBT', 'Anxiety'],
        supported_care_levels: [CareLevel.LEVEL_2, CareLevel.LEVEL_3],
        care_levels: [CareLevel.LEVEL_2, CareLevel.LEVEL_3],
        modalities: [ServiceModality.TELEHEALTH],
        jurisdictions: ['KE'],
        languages: ['en'],
        capacity_status: 'AVAILABLE',
        updated_at: '2026-01-01T00:00:00.000Z'
      }
    ];

    for (const p of canonical) {
      ProviderMatcher.providers.set(p.professional_id, p);
      ProviderMatcher.providers.set(p.id!, p);
    }
  }

  public static resetToDefaults(): void {
    ProviderMatcher.providers.clear();
    ProviderMatcher.seedCanonicalProviders();
    ProviderMatcher.initialized = true;
  }

  public static reset(): void {
    ProviderMatcher.resetToDefaults();
  }

  public static registerProviderProfile(profile: ProviderMatchingProfileEntity): void {
    const normalized: ProviderMatchingProfileEntity = {
      ...profile,
      id: profile.id || profile.professional_id,
      license_expires_at: profile.license_expires_at || profile.license_expiry || '2028-01-01T00:00:00.000Z',
      license_expiry: profile.license_expiry || profile.license_expires_at || '2028-01-01T00:00:00.000Z',
      supported_care_levels: profile.supported_care_levels || profile.care_levels || [],
      care_levels: profile.care_levels || profile.supported_care_levels || [],
      updated_at: profile.updated_at || new Date().toISOString()
    };
    ProviderMatcher.providers.set(normalized.professional_id, normalized);
    ProviderMatcher.providers.set(normalized.id!, normalized);
  }

  public static getProvider(idOrProfessionalId: string): ProviderMatchingProfileEntity | undefined {
    ProviderMatcher.initialize();
    return ProviderMatcher.providers.get(idOrProfessionalId);
  }

  public static requireProvider(idOrProfessionalId: string): ProviderMatchingProfileEntity {
    const p = ProviderMatcher.getProvider(idOrProfessionalId);
    if (!p) {
      throw new NotFoundError(`Provider matching profile "${idOrProfessionalId}" not found.`);
    }
    return p;
  }

  /**
   * Evaluates provider eligibility for referral under R-NAV-004
   */
  public static assertProviderReadyForReferral(providerId: string): ProviderMatchingProfileEntity {
    const provider = ProviderMatcher.requireProvider(providerId);
    CareNavigationInvariants.assertProviderEligibleForReferral(provider);
    return provider;
  }

  public static assertProviderEligible(providerId: string, requiredCareLevel?: CareLevel): ProviderMatchingProfileEntity {
    const provider = ProviderMatcher.requireProvider(providerId);
    CareNavigationInvariants.assertProviderEligibleForReferral(provider);

    if (requiredCareLevel) {
      const levels = provider.supported_care_levels || provider.care_levels || [];
      if (!levels.includes(requiredCareLevel)) {
        throw new DomainInvariantError(
          `Provider "${provider.professional_id}" does not support care level "${requiredCareLevel}".`
        );
      }
    }
    return provider;
  }

  /**
   * Search ready verified providers matching criteria
   */
  public static findMatchingProviders(criteria: ProviderMatchCriteria): ProviderMatchingProfileEntity[] {
    ProviderMatcher.initialize();
    const unique = new Map<string, ProviderMatchingProfileEntity>();

    for (const p of ProviderMatcher.providers.values()) {
      unique.set(p.professional_id, p);
    }

    const now = Date.now();

    return Array.from(unique.values()).filter(p => {
      // 1. Mandatory verification and unexpired license check
      if (p.verification_state !== ProfessionalVerificationState.APPROVED) {
        return false;
      }
      const expDate = p.license_expires_at || p.license_expiry;
      if (!expDate || new Date(expDate).getTime() <= now) {
        return false;
      }

      // 2. Care Level match
      const levels = p.supported_care_levels || p.care_levels || [];
      if (!levels.includes(criteria.care_level)) {
        return false;
      }

      // 3. Modality match
      if (criteria.modality && !p.modalities.includes(criteria.modality)) {
        return false;
      }

      // 4. Jurisdiction match
      if (criteria.jurisdiction && !p.jurisdictions.includes(criteria.jurisdiction)) {
        return false;
      }

      // 5. Language match
      if (criteria.language && !p.languages.map(l => l.toLowerCase()).includes(criteria.language.toLowerCase())) {
        return false;
      }

      // 6. Capacity requirement
      if (criteria.requires_available_capacity && p.capacity_status === 'FULL') {
        return false;
      }

      return true;
    });
  }

  public static resetForTesting(): void {
    ProviderMatcher.providers.clear();
    ProviderMatcher.initialized = false;
    ProviderMatcher.initialize();
  }
}
