/**
 * MindOS Provider Registry, Service Offerings & Care-Network Eligibility Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * ADR-026, ADR-028, ADR-030, ADR-032
 */

import { IProfessionalRepository } from '../repositories/interfaces.js';
import { SpecialtyRegistry } from '../specialties/specialty_registry.js';
import { ProfessionalScopeService } from '../scope/scope_service.js';
import { ProfessionalInvariants } from '../domain/invariants.js';
import {
  ProfessionalProfileEntity,
  ProfessionalCredentialEntity,
  ProfessionalRegistrationEntity,
  ProviderEntity,
  ServiceOfferingEntity
} from '../domain/entities.js';
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
  ProviderStatus,
  DestinationEligibilityResult
} from '../domain/types.js';
import {
  ProfessionalProfileRequiredError,
  ProfessionalNotVerifiedError,
  ProfessionalSuspendedError,
  ProfessionalScopeDeniedError,
  ProviderNotDiscoverableError,
  DuplicateProfessionalRegistrationError,
  DomainInvariantError
} from '../../platform/errors/index.js';
import { EventBus } from '../../platform/events/index.js';
import { EventPriority } from '../../platform/events/types.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { AuthoritiesRegistry } from '../../regulatory_governance/authorities/registry.js';

export interface CreateProfileRequest {
  userId: string;
  professionalType: ProfessionalType;
  displayName: string;
  legalNameReference: string;
  bio?: string;
  jurisdictions?: string[];
  languages?: string[];
  deliveryModes?: DeliveryMode[];
  profileVisibility?: ProfileVisibility;
}

export interface AddCredentialRequest {
  professionalId: string;
  credentialType: CredentialType;
  title: string;
  issuer: string;
  issueDate: string;
  expiryDate?: string | null;
  credentialNumberReference: string;
  jurisdiction?: string;
  evidenceId?: string;
  evidenceHash?: string;
}

export interface AddRegistrationRequest {
  professionalId: string;
  authorityId: string;
  registrationType: string;
  registrationNumber: string;
  jurisdiction?: string;
  issuedAt: string;
  expiresAt: string;
  evidenceId?: string;
  verificationMethod?: VerificationMethod;
}

export interface CreateServiceOfferingRequest {
  providerId: string;
  serviceCode: string;
  serviceType: ServiceType;
  name: string;
  description: string;
  deliveryMode: DeliveryMode;
  jurisdiction?: string;
  population: TargetPopulation;
  durationMinutes?: number;
  pricingReference?: {
    currency: string;
    amount: number;
    billing_model: string;
  };
}

export interface ProviderSearchQuery {
  jurisdiction?: string;
  serviceType?: ServiceType;
  specialtyCode?: string;
  language?: string;
  deliveryMode?: DeliveryMode;
  population?: TargetPopulation;
  maxPrice?: number;
}

export interface ProviderPublicSearchResult {
  provider_id: string;
  professional_profile_id: string;
  display_name: string;
  professional_type: ProfessionalType;
  bio?: string;
  jurisdictions: string[];
  languages: string[];
  delivery_modes: DeliveryMode[];
  specialties: string[];
  services: {
    service_id: string;
    service_code: string;
    name: string;
    service_type: ServiceType;
    duration_minutes: number;
    pricing_reference?: {
      currency: string;
      amount: number;
      billing_model: string;
    } | null;
  }[];
}

export class ProviderRegistryService {
  constructor(private readonly repo: IProfessionalRepository) {}

  /**
   * Registers a new professional profile.
   */
  public async createProfile(req: CreateProfileRequest): Promise<ProfessionalProfileEntity> {
    const existing = await this.repo.findProfileByUserId(req.userId);
    if (existing) {
      throw new DomainInvariantError('A professional profile already exists for this user account');
    }

    const sanitizedBio = req.bio ? ProfessionalInvariants.sanitizeAndValidateContent(req.bio, 'bio') : '';
    const now = new Date().toISOString();

    const profile: ProfessionalProfileEntity = {
      id: generateUUIDv7(),
      user_id: req.userId,
      professional_type: req.professionalType,
      display_name: req.displayName.trim(),
      legal_name_reference: req.legalNameReference.trim(),
      bio: sanitizedBio,
      status: ProfessionalState.DRAFT,
      verification_status: ProfessionalVerificationState.DRAFT,
      jurisdictions: req.jurisdictions || ['KE'],
      languages: req.languages || ['English', 'Swahili'],
      specialties: [],
      delivery_modes: req.deliveryModes || [DeliveryMode.TELEHEALTH],
      organization_refs: [],
      profile_visibility: req.profileVisibility || ProfileVisibility.PUBLIC_DIRECTORY,
      created_at: now,
      updated_at: now
    };

    await this.repo.saveProfile(profile);

    // Dispatch canonical event
    EventBus.enqueue(
      'professional.profile_created',
      'professionals.registry_service',
      profile.id,
      DataClassification.PERSONAL,
      {
        profile_id: profile.id,
        user_id: profile.user_id,
        professional_type: profile.professional_type
      },
      { correlation_id: profile.id, priority: EventPriority.NORMAL }
    );

    return profile;
  }

  /**
   * Adds an academic degree, diploma, or training credential.
   */
  public async addCredential(req: AddCredentialRequest): Promise<ProfessionalCredentialEntity> {
    const profile = await this.repo.findProfileById(req.professionalId);
    if (!profile) {
      throw new ProfessionalProfileRequiredError('Professional profile not found');
    }

    const now = new Date().toISOString();
    const credential: ProfessionalCredentialEntity = {
      id: generateUUIDv7(),
      professional_id: profile.id,
      credential_type: req.credentialType,
      title: req.title.trim(),
      issuer: req.issuer.trim(),
      issue_date: req.issueDate,
      expiry_date: req.expiryDate || null,
      credential_number_reference: req.credentialNumberReference.trim(),
      jurisdiction: req.jurisdiction || 'KE',
      status: CredentialStatus.PENDING,
      evidence_id: req.evidenceId,
      evidence_hash: req.evidenceHash,
      created_at: now,
      updated_at: now
    };

    await this.repo.saveCredential(credential);
    return credential;
  }

  /**
   * Adds statutory professional council registration / practicing license.
   */
  public async addRegistration(req: AddRegistrationRequest): Promise<ProfessionalRegistrationEntity> {
    const profile = await this.repo.findProfileById(req.professionalId);
    if (!profile) {
      throw new ProfessionalProfileRequiredError('Professional profile not found');
    }

    // Verify statutory authority is recognized
    const authority = AuthoritiesRegistry.getAuthority(req.authorityId);
    if (!authority) {
      throw new DomainInvariantError(`Regulatory authority '${req.authorityId}' is not recognized in canonical registry.`);
    }

    // Verify duplicate registration numbers across different profiles
    const existing = await this.repo.findRegistrationByAuthorityAndNumber(req.authorityId, req.registrationNumber);
    if (existing && existing.professional_id !== profile.id && existing.status === 'ACTIVE') {
      throw new DuplicateProfessionalRegistrationError(
        `Registration number ${req.registrationNumber} is already registered under authority ${req.authorityId}`
      );
    }

    const now = new Date().toISOString();
    const registration: ProfessionalRegistrationEntity = {
      id: generateUUIDv7(),
      professional_id: profile.id,
      authority_id: req.authorityId,
      registration_type: req.registrationType,
      registration_number: req.registrationNumber.trim().toUpperCase(),
      jurisdiction: req.jurisdiction || 'KE',
      issued_at: req.issuedAt,
      expires_at: req.expiresAt,
      status: 'PENDING_VERIFICATION',
      verification_method: req.verificationMethod || VerificationMethod.MANUAL,
      evidence_id: req.evidenceId,
      created_at: now,
      updated_at: now
    };

    await this.repo.saveRegistration(registration);
    return registration;
  }

  /**
   * Assigns a governed specialty to a professional profile.
   */
  public async assignSpecialty(professionalId: string, specialtyCode: string): Promise<void> {
    const profile = await this.repo.findProfileById(professionalId);
    if (!profile) {
      throw new ProfessionalProfileRequiredError('Professional profile not found');
    }

    if (!SpecialtyRegistry.isValidSpecialty(specialtyCode)) {
      throw new DomainInvariantError(`Specialty code '${specialtyCode}' is not in the governed specialty registry.`);
    }

    await this.repo.saveSpecialtyAssignment({
      id: generateUUIDv7(),
      professional_id: profile.id,
      specialty_code: specialtyCode,
      verification_status: 'DECLARED',
      created_at: new Date().toISOString()
    });

    if (!profile.specialties.includes(specialtyCode)) {
      profile.specialties.push(specialtyCode);
      profile.updated_at = new Date().toISOString();
      await this.repo.saveProfile(profile);
    }
  }

  /**
   * Creates and governs a service offering within provider scope of practice.
   */
  public async createServiceOffering(req: CreateServiceOfferingRequest): Promise<ServiceOfferingEntity> {
    const provider = await this.repo.findProviderById(req.providerId);
    if (!provider) {
      throw new DomainInvariantError('Provider not found');
    }

    if (provider.status === ProviderStatus.SUSPENDED) {
      throw new ProfessionalSuspendedError('Cannot create service offerings while provider is suspended');
    }

    const profile = await this.repo.findProfileById(provider.professional_profile_id);
    if (!profile) {
      throw new ProfessionalProfileRequiredError('Professional profile not found for provider');
    }

    const scope = await this.repo.findActiveScopeByProfessionalId(profile.id);
    const jurisdiction = req.jurisdiction || profile.jurisdictions[0] || 'KE';

    // Validate scope of practice
    const scopeEval = ProfessionalScopeService.validateScope({
      professional: profile,
      scope,
      serviceType: req.serviceType,
      population: req.population,
      deliveryMode: req.deliveryMode,
      jurisdiction
    });

    if (!scopeEval.allowed) {
      throw new ProfessionalScopeDeniedError(
        `Service offering out of scope: ${scopeEval.reason_codes.join('; ')}`
      );
    }

    // Moderate description
    const sanitizedDesc = ProfessionalInvariants.sanitizeAndValidateContent(req.description, 'service description');

    const now = new Date().toISOString();
    const service: ServiceOfferingEntity = {
      id: generateUUIDv7(),
      provider_id: provider.id,
      service_code: req.serviceCode.trim().toUpperCase(),
      service_type: req.serviceType,
      name: req.name.trim(),
      description: sanitizedDesc,
      delivery_mode: req.deliveryMode,
      jurisdiction,
      population: req.population,
      duration_minutes: req.durationMinutes || 50,
      pricing_reference: req.pricingReference,
      status: ServiceOfferingStatus.ACTIVE,
      clinical_scope_reference: scope?.id,
      created_at: now,
      updated_at: now
    };

    await this.repo.saveServiceOffering(service);

    // Emit event
    EventBus.enqueue(
      'professional.service_activated',
      'professionals.registry_service',
      service.id,
      DataClassification.INTERNAL,
      {
        service_id: service.id,
        provider_id: provider.id,
        service_code: service.service_code,
        service_type: service.service_type
      },
      { correlation_id: service.id, priority: EventPriority.NORMAL }
    );

    return service;
  }

  /**
   * Evaluates care-network destination eligibility for referral routing and care navigation.
   * ADR-032: Snapshots current eligibility and credentials for referral anchoring.
   */
  public async evaluateCareNetworkEligibility(
    providerId: string,
    serviceType: ServiceType,
    population: TargetPopulation,
    deliveryMode: DeliveryMode,
    jurisdiction: string
  ): Promise<DestinationEligibilityResult> {
    const reasons: string[] = [];
    const provider = await this.repo.findProviderById(providerId);

    if (!provider) {
      return {
        eligible: false,
        provider_id: providerId,
        reasons: ['PROVIDER_NOT_FOUND']
      };
    }

    if (provider.status === ProviderStatus.SUSPENDED) {
      reasons.push('PROVIDER_SUSPENDED');
    }

    if (provider.verification_status !== ProfessionalVerificationState.VERIFIED) {
      reasons.push('PROVIDER_NOT_VERIFIED');
    }

    const profile = await this.repo.findProfileById(provider.professional_profile_id);
    if (!profile) {
      reasons.push('PROFILE_NOT_FOUND');
      return { eligible: false, provider_id: providerId, reasons };
    }

    if (profile.status === ProfessionalState.SUSPENDED) {
      reasons.push('PROFESSIONAL_SUSPENDED');
    }

    // Verify registrations
    const registrations = await this.repo.listRegistrationsByProfessionalId(profile.id);
    const activeReg = registrations.find(
      r => r.status === 'ACTIVE' && new Date(r.expires_at).getTime() > Date.now()
    );

    if (!activeReg && (
      profile.professional_type === ProfessionalType.PSYCHIATRIST ||
      profile.professional_type === ProfessionalType.CLINICAL_PSYCHOLOGIST ||
      profile.professional_type === ProfessionalType.PSYCHOLOGIST ||
      profile.professional_type === ProfessionalType.COUNSELLOR
    )) {
      reasons.push('NO_ACTIVE_REGULATORY_REGISTRATION');
    }

    // Verify scope
    const scope = await this.repo.findActiveScopeByProfessionalId(profile.id);
    const scopeEval = ProfessionalScopeService.validateScope({
      professional: profile,
      scope,
      serviceType,
      population,
      deliveryMode,
      jurisdiction
    });

    if (!scopeEval.allowed) {
      reasons.push(...scopeEval.reason_codes);
    }

    // Verify service offering exists and is active
    const services = await this.repo.listServiceOfferingsByProviderId(provider.id);
    const matchingService = services.find(
      s => s.status === ServiceOfferingStatus.ACTIVE &&
           s.service_type === serviceType &&
           s.delivery_mode === deliveryMode &&
           s.jurisdiction === jurisdiction &&
           s.population === population
    );

    if (!matchingService) {
      // If no exact match on population/delivery, check at least active service_type
      const typeService = services.find(s => s.status === ServiceOfferingStatus.ACTIVE && s.service_type === serviceType);
      if (!typeService) {
        reasons.push('NO_ACTIVE_MATCHING_SERVICE_OFFERING');
      }
    }

    const isEligible = reasons.length === 0;

    let snapshot;
    if (isEligible) {
      snapshot = {
        provider_id: provider.id,
        professional_id: profile.id,
        display_name: profile.display_name,
        verification_state: profile.verification_status,
        regulatory_body: activeReg?.authority_id || 'NONE',
        license_number: activeReg?.registration_number || 'NONE',
        license_expires_at: activeReg?.expires_at || '',
        scope_id: scope?.id || '',
        service_id: matchingService?.id,
        jurisdiction,
        snapshot_taken_at: new Date().toISOString()
      };
    }

    return {
      eligible: isEligible,
      provider_id: providerId,
      service_id: matchingService?.id,
      reasons,
      destination_snapshot: snapshot
    };
  }

  /**
   * Search discoverable providers in public / user directory (ADR-030).
   * Strict Projection: Returns only governed, safe directory fields.
   */
  public async searchDiscoverableProviders(query: ProviderSearchQuery): Promise<ProviderPublicSearchResult[]> {
    const providers = await this.repo.listProviders({
      status: ProviderStatus.ACTIVE,
      verification_status: ProfessionalVerificationState.VERIFIED,
      discoverability_status: DiscoverabilityStatus.DISCOVERABLE
    });

    const results: ProviderPublicSearchResult[] = [];

    for (const provider of providers) {
      const profile = await this.repo.findProfileById(provider.professional_profile_id);
      if (!profile || profile.status !== ProfessionalState.ACTIVE || profile.profile_visibility === ProfileVisibility.INTERNAL_ONLY) {
        continue;
      }

      // Filter jurisdiction
      if (query.jurisdiction && !profile.jurisdictions.includes(query.jurisdiction)) {
        continue;
      }

      // Filter language
      if (query.language && !profile.languages.includes(query.language)) {
        continue;
      }

      // Filter delivery mode
      if (query.deliveryMode && !profile.delivery_modes.includes(query.deliveryMode)) {
        continue;
      }

      // Filter specialty
      if (query.specialtyCode && !profile.specialties.includes(query.specialtyCode)) {
        continue;
      }

      // Load active services
      const allServices = await this.repo.listServiceOfferingsByProviderId(provider.id);
      let activeServices = allServices.filter(s => s.status === ServiceOfferingStatus.ACTIVE);

      if (query.serviceType) {
        activeServices = activeServices.filter(s => s.service_type === query.serviceType);
      }

      if (query.population) {
        activeServices = activeServices.filter(s => s.population === query.population);
      }

      if (query.maxPrice !== undefined) {
        activeServices = activeServices.filter(s => !s.pricing_reference || s.pricing_reference.amount <= query.maxPrice!);
      }

      if (activeServices.length === 0 && (query.serviceType || query.maxPrice !== undefined)) {
        // Did not match service filters
        continue;
      }

      results.push({
        provider_id: provider.id,
        professional_profile_id: profile.id,
        display_name: profile.display_name,
        professional_type: profile.professional_type,
        bio: profile.bio,
        jurisdictions: profile.jurisdictions,
        languages: profile.languages,
        delivery_modes: profile.delivery_modes,
        specialties: profile.specialties,
        services: activeServices.map(s => ({
          service_id: s.id,
          service_code: s.service_code,
          name: s.name,
          service_type: s.service_type,
          duration_minutes: s.duration_minutes,
          pricing_reference: s.pricing_reference
        }))
      });
    }

    return results;
  }
}
