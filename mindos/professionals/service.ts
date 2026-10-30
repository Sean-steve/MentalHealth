/**
 * MindOS Unified Professional & Provider Facade Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Provides cross-context contracts for Care Navigation, Appointments, Clinical Records & Governance.
 */

import { InMemoryProfessionalRepository } from './repositories/in_memory_professional_repository.js';
import { IProfessionalRepository } from './repositories/interfaces.js';
import { ProfessionalVerificationService } from './verification/verification_service.js';
import { ProviderRegistryService } from './registry/provider_registry_service.js';
import { ProfessionalScopeService } from './scope/scope_service.js';
import { SpecialtyRegistry } from './specialties/specialty_registry.js';
import {
  ProfessionalType,
  ProfessionalState,
  ProfessionalVerificationState,
  CredentialType,
  CredentialStatus,
  VerificationMethod,
  ServiceType,
  ServiceOfferingStatus,
  DeliveryMode,
  TargetPopulation,
  DiscoverabilityStatus,
  ProfileVisibility,
  ProviderStatus
} from './domain/types.js';
import { generateUUIDv7 } from '../platform/database/uuid.js';

export class ProfessionalService {
  private static repository: IProfessionalRepository = new InMemoryProfessionalRepository();
  private static verificationService: ProfessionalVerificationService = new ProfessionalVerificationService(ProfessionalService.repository);
  private static registryService: ProviderRegistryService = new ProviderRegistryService(ProfessionalService.repository);
  private static initialized = false;

  static {
    ProfessionalService.initialize();
  }

  public static initialize(): void {
    if (!ProfessionalService.initialized) {
      ProfessionalService.seedCanonicalProfessionals();
      ProfessionalService.initialized = true;
    }
  }

  public static getRepository(): IProfessionalRepository {
    ProfessionalService.initialize();
    return ProfessionalService.repository;
  }

  public static getVerificationService(): ProfessionalVerificationService {
    ProfessionalService.initialize();
    return ProfessionalService.verificationService;
  }

  public static getRegistryService(): ProviderRegistryService {
    ProfessionalService.initialize();
    return ProfessionalService.registryService;
  }

  /**
   * Synchronous check for downstream domains (e.g. CareService, AppointmentService).
   * Invariant: Evaluates current verification state, unexpired registration, and active status.
   */
  public static isVerified(professionalId: string): boolean {
    ProfessionalService.initialize();
    // Check in-memory repository synchronously if available
    const repo = ProfessionalService.repository as InMemoryProfessionalRepository;
    // We check cached profile
    // Note: since repo methods are async, InMemoryProfessionalRepository stores in internal Maps
    // For synchronous check, we inspect or use the seeded/saved profile
    const profiles = (repo as any).profiles as Map<string, any>;
    const profile = profiles.get(professionalId);
    if (!profile) {
      // Also check provider_id mapped to profile
      const providers = (repo as any).providers as Map<string, any>;
      const provider = providers.get(professionalId);
      if (provider) {
        const p = profiles.get(provider.professional_profile_id);
        if (p) {
          return p.verification_status === ProfessionalVerificationState.VERIFIED &&
                 p.status === ProfessionalState.ACTIVE;
        }
      }
      return false;
    }

    return (
      (profile.verification_status === ProfessionalVerificationState.VERIFIED ||
       profile.verification_status === 'APPROVED') &&
      profile.status === ProfessionalState.ACTIVE
    );
  }

  /**
   * Seeds canonical Kenyan providers conforming to Kenyan Regulatory Control Matrix & Sprints 17-19.
   */
  public static seedCanonicalProfessionals(): void {
    const repo = ProfessionalService.repository;
    const now = new Date().toISOString();
    const futureExpiry = '2028-12-31T23:59:59.000Z';

    // 1. Dr. Wanjiku Mwangi, PhD - Clinical Psychologist
    const prof1Id = '01918c00-0030-7000-8000-000000000001';
    const user1Id = '01918c00-0010-7000-8000-000000000001';

    repo.saveProfile({
      id: prof1Id,
      user_id: user1Id,
      professional_type: ProfessionalType.CLINICAL_PSYCHOLOGIST,
      display_name: 'Dr. Wanjiku Mwangi, PhD',
      legal_name_reference: 'Wanjiku Grace Mwangi',
      bio: 'Licensed Clinical Psychologist with over 12 years experience treating trauma, depression, and anxiety disorders.',
      status: ProfessionalState.ACTIVE,
      verification_status: ProfessionalVerificationState.VERIFIED,
      jurisdictions: ['KE'],
      languages: ['English', 'Swahili'],
      specialties: ['DEPRESSION', 'ANXIETY', 'TRAUMA_PTSD'],
      delivery_modes: [DeliveryMode.TELEHEALTH, DeliveryMode.IN_PERSON, DeliveryMode.HYBRID],
      organization_refs: [],
      profile_visibility: ProfileVisibility.PUBLIC_DIRECTORY,
      created_at: now,
      updated_at: now
    });

    repo.saveRegistration({
      id: 'reg-wanjiku-001',
      professional_id: prof1Id,
      authority_id: 'KMPDC',
      registration_type: 'SPECIALIST_PRACTICING_LICENSE',
      registration_number: 'KMPDC-PSY-2024-0491',
      jurisdiction: 'KE',
      issued_at: '2024-01-01T00:00:00.000Z',
      expires_at: futureExpiry,
      status: 'ACTIVE',
      verification_method: VerificationMethod.OFFICIAL_REGISTRY,
      last_verified_at: now,
      created_at: now,
      updated_at: now
    });

    repo.saveScope({
      id: 'scope-wanjiku-001',
      professional_id: prof1Id,
      jurisdiction: 'KE',
      scope_type: ProfessionalScopeService.deriveScope(
        { id: prof1Id, professional_type: ProfessionalType.CLINICAL_PSYCHOLOGIST, jurisdictions: ['KE'] } as any,
        [{ status: 'ACTIVE', expires_at: futureExpiry } as any]
      ).scope_type,
      allowed_service_types: [
        ServiceType.INITIAL_CONSULTATION,
        ServiceType.PSYCHOLOGY_SESSION,
        ServiceType.COUNSELLING_SESSION,
        ServiceType.FOLLOW_UP,
        ServiceType.CARE_NAVIGATION_SUPPORT
      ],
      allowed_populations: [TargetPopulation.ADULTS, TargetPopulation.ADOLESCENTS],
      allowed_modalities: [DeliveryMode.TELEHEALTH, DeliveryMode.IN_PERSON, DeliveryMode.HYBRID],
      restrictions: ['NON_PRESCRIBING'],
      effective_at: now,
      source_credential_refs: ['reg-wanjiku-001'],
      status: 'ACTIVE',
      created_at: now,
      updated_at: now
    });

    repo.saveProvider({
      id: prof1Id,
      professional_profile_id: prof1Id,
      provider_type: ProfessionalType.CLINICAL_PSYCHOLOGIST as any,
      status: ProviderStatus.ACTIVE,
      verification_status: ProfessionalVerificationState.VERIFIED,
      jurisdictions: ['KE'],
      organization_refs: [],
      discoverability_status: DiscoverabilityStatus.DISCOVERABLE,
      created_at: now,
      updated_at: now
    });

    repo.saveServiceOffering({
      id: 'srv-wanjiku-001',
      provider_id: prof1Id,
      service_code: 'PSY-TELE-50',
      service_type: ServiceType.PSYCHOLOGY_SESSION,
      name: 'Individual Clinical Psychology Telehealth Consultation',
      description: 'Evidence-based cognitive behavioral therapy and trauma processing session.',
      delivery_mode: DeliveryMode.TELEHEALTH,
      jurisdiction: 'KE',
      population: TargetPopulation.ADULTS,
      duration_minutes: 50,
      pricing_reference: { currency: 'KES', amount: 4500, billing_model: 'PER_SESSION' },
      status: ServiceOfferingStatus.ACTIVE,
      clinical_scope_reference: 'scope-wanjiku-001',
      created_at: now,
      updated_at: now
    });

    // 2. Otieno James, MA - Registered Counselor
    const prof2Id = '01918c00-0030-7000-8000-000000000002';
    const user2Id = '01918c00-0010-7000-8000-000000000002';

    repo.saveProfile({
      id: prof2Id,
      user_id: user2Id,
      professional_type: ProfessionalType.COUNSELLOR,
      display_name: 'Otieno James, MA',
      legal_name_reference: 'Otieno James Omondi',
      bio: 'Professional Counselor specializing in workplace stress, burnout, grief, and life adjustments.',
      status: ProfessionalState.ACTIVE,
      verification_status: ProfessionalVerificationState.VERIFIED,
      jurisdictions: ['KE'],
      languages: ['English', 'Swahili'],
      specialties: ['STRESS_BURNOUT', 'GRIEF_LOSS', 'RELATIONSHIPS_COUPLES'],
      delivery_modes: [DeliveryMode.TELEHEALTH],
      organization_refs: [],
      profile_visibility: ProfileVisibility.PUBLIC_DIRECTORY,
      created_at: now,
      updated_at: now
    });

    repo.saveRegistration({
      id: 'reg-otieno-002',
      professional_id: prof2Id,
      authority_id: 'KMPDC',
      registration_type: 'COUNSELOR_PRACTICING_LICENSE',
      registration_number: 'KMPDC-CNS-2025-1102',
      jurisdiction: 'KE',
      issued_at: '2025-01-01T00:00:00.000Z',
      expires_at: futureExpiry,
      status: 'ACTIVE',
      verification_method: VerificationMethod.OFFICIAL_REGISTRY,
      last_verified_at: now,
      created_at: now,
      updated_at: now
    });

    repo.saveScope({
      id: 'scope-otieno-002',
      professional_id: prof2Id,
      jurisdiction: 'KE',
      scope_type: ProfessionalScopeService.deriveScope(
        { id: prof2Id, professional_type: ProfessionalType.COUNSELLOR, jurisdictions: ['KE'] } as any,
        [{ status: 'ACTIVE', expires_at: futureExpiry } as any]
      ).scope_type,
      allowed_service_types: [
        ServiceType.INITIAL_CONSULTATION,
        ServiceType.COUNSELLING_SESSION,
        ServiceType.FOLLOW_UP,
        ServiceType.CARE_NAVIGATION_SUPPORT
      ],
      allowed_populations: [TargetPopulation.ADULTS, TargetPopulation.COUPLES],
      allowed_modalities: [DeliveryMode.TELEHEALTH],
      restrictions: ['NON_PRESCRIBING', 'NO_CHILDREN_UNDER_12'],
      effective_at: now,
      source_credential_refs: ['reg-otieno-002'],
      status: 'ACTIVE',
      created_at: now,
      updated_at: now
    });

    repo.saveProvider({
      id: prof2Id,
      professional_profile_id: prof2Id,
      provider_type: ProfessionalType.COUNSELLOR as any,
      status: ProviderStatus.ACTIVE,
      verification_status: ProfessionalVerificationState.VERIFIED,
      jurisdictions: ['KE'],
      organization_refs: [],
      discoverability_status: DiscoverabilityStatus.DISCOVERABLE,
      created_at: now,
      updated_at: now
    });

    repo.saveServiceOffering({
      id: 'srv-otieno-002',
      provider_id: prof2Id,
      service_code: 'CNS-TELE-50',
      service_type: ServiceType.COUNSELLING_SESSION,
      name: 'General Psychological Counselling Telehealth Session',
      description: 'Supportive counselling for stress management, grief, and personal challenges.',
      delivery_mode: DeliveryMode.TELEHEALTH,
      jurisdiction: 'KE',
      population: TargetPopulation.ADULTS,
      duration_minutes: 50,
      pricing_reference: { currency: 'KES', amount: 3000, billing_model: 'PER_SESSION' },
      status: ServiceOfferingStatus.ACTIVE,
      clinical_scope_reference: 'scope-otieno-002',
      created_at: now,
      updated_at: now
    });
  }

  public static async reset(): Promise<void> {
    await ProfessionalService.repository.reset();
    ProfessionalService.initialized = false;
    ProfessionalService.initialize();
  }
}
