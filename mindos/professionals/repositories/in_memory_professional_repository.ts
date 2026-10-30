/**
 * MindOS In-Memory Professional Repository Implementation
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 */

import { IProfessionalRepository } from './interfaces.js';
import {
  ProfessionalProfileEntity,
  ProfessionalCredentialEntity,
  ProfessionalRegistrationEntity,
  ProfessionalVerificationCaseEntity,
  ProfessionalScopeEntity,
  ProfessionalSpecialtyEntity,
  ProfessionalSpecialtyAssignmentEntity,
  ProviderEntity,
  ProviderOrganizationEntity,
  ProfessionalOrganizationAffiliationEntity,
  ServiceOfferingEntity
} from '../domain/entities.js';

export class InMemoryProfessionalRepository implements IProfessionalRepository {
  private profiles = new Map<string, ProfessionalProfileEntity>();
  private credentials = new Map<string, ProfessionalCredentialEntity>();
  private registrations = new Map<string, ProfessionalRegistrationEntity>();
  private verificationCases = new Map<string, ProfessionalVerificationCaseEntity>();
  private scopes = new Map<string, ProfessionalScopeEntity>();
  private specialties = new Map<string, ProfessionalSpecialtyEntity>();
  private specialtyAssignments = new Map<string, ProfessionalSpecialtyAssignmentEntity>();
  private providers = new Map<string, ProviderEntity>();
  private organizations = new Map<string, ProviderOrganizationEntity>();
  private affiliations = new Map<string, ProfessionalOrganizationAffiliationEntity>();
  private serviceOfferings = new Map<string, ServiceOfferingEntity>();

  // Profiles
  public async saveProfile(profile: ProfessionalProfileEntity): Promise<void> {
    this.profiles.set(profile.id, { ...profile });
  }

  public async findProfileById(id: string): Promise<ProfessionalProfileEntity | null> {
    const profile = this.profiles.get(id);
    return profile ? { ...profile } : null;
  }

  public async findProfileByUserId(userId: string): Promise<ProfessionalProfileEntity | null> {
    for (const profile of this.profiles.values()) {
      if (profile.user_id === userId) {
        return { ...profile };
      }
    }
    return null;
  }

  public async listProfiles(filter?: Partial<ProfessionalProfileEntity>): Promise<ProfessionalProfileEntity[]> {
    let result = Array.from(this.profiles.values());
    if (filter) {
      if (filter.status) result = result.filter(p => p.status === filter.status);
      if (filter.verification_status) result = result.filter(p => p.verification_status === filter.verification_status);
      if (filter.professional_type) result = result.filter(p => p.professional_type === filter.professional_type);
    }
    return result.map(p => ({ ...p }));
  }

  // Credentials
  public async saveCredential(credential: ProfessionalCredentialEntity): Promise<void> {
    this.credentials.set(credential.id, { ...credential });
  }

  public async findCredentialById(id: string): Promise<ProfessionalCredentialEntity | null> {
    const cred = this.credentials.get(id);
    return cred ? { ...cred } : null;
  }

  public async listCredentialsByProfessionalId(professionalId: string): Promise<ProfessionalCredentialEntity[]> {
    return Array.from(this.credentials.values())
      .filter(c => c.professional_id === professionalId)
      .map(c => ({ ...c }));
  }

  public async listAllCredentials(): Promise<ProfessionalCredentialEntity[]> {
    return Array.from(this.credentials.values()).map(c => ({ ...c }));
  }

  // Registrations
  public async saveRegistration(registration: ProfessionalRegistrationEntity): Promise<void> {
    this.registrations.set(registration.id, { ...registration });
  }

  public async findRegistrationById(id: string): Promise<ProfessionalRegistrationEntity | null> {
    const reg = this.registrations.get(id);
    return reg ? { ...reg } : null;
  }

  public async findRegistrationByAuthorityAndNumber(
    authorityId: string,
    registrationNumber: string
  ): Promise<ProfessionalRegistrationEntity | null> {
    const normalizedTarget = registrationNumber.trim().toUpperCase();
    for (const reg of this.registrations.values()) {
      if (reg.authority_id === authorityId && reg.registration_number.trim().toUpperCase() === normalizedTarget) {
        return { ...reg };
      }
    }
    return null;
  }

  public async listRegistrationsByProfessionalId(professionalId: string): Promise<ProfessionalRegistrationEntity[]> {
    return Array.from(this.registrations.values())
      .filter(r => r.professional_id === professionalId)
      .map(r => ({ ...r }));
  }

  public async listAllRegistrations(): Promise<ProfessionalRegistrationEntity[]> {
    return Array.from(this.registrations.values()).map(r => ({ ...r }));
  }

  // Verification Cases
  public async saveVerificationCase(vCase: ProfessionalVerificationCaseEntity): Promise<void> {
    this.verificationCases.set(vCase.id, { ...vCase });
  }

  public async findVerificationCaseById(id: string): Promise<ProfessionalVerificationCaseEntity | null> {
    const vCase = this.verificationCases.get(id);
    return vCase ? { ...vCase } : null;
  }

  public async findVerificationCaseByProfessionalId(professionalId: string): Promise<ProfessionalVerificationCaseEntity | null> {
    for (const vCase of this.verificationCases.values()) {
      if (vCase.professional_id === professionalId) {
        return { ...vCase };
      }
    }
    return null;
  }

  public async listVerificationCases(status?: string): Promise<ProfessionalVerificationCaseEntity[]> {
    let list = Array.from(this.verificationCases.values());
    if (status) {
      list = list.filter(v => v.status === status);
    }
    return list.map(v => ({ ...v }));
  }

  // Scopes
  public async saveScope(scope: ProfessionalScopeEntity): Promise<void> {
    this.scopes.set(scope.id, { ...scope });
  }

  public async findScopeById(id: string): Promise<ProfessionalScopeEntity | null> {
    const scope = this.scopes.get(id);
    return scope ? { ...scope } : null;
  }

  public async findActiveScopeByProfessionalId(professionalId: string): Promise<ProfessionalScopeEntity | null> {
    for (const scope of this.scopes.values()) {
      if (scope.professional_id === professionalId && (scope.status === 'ACTIVE' || scope.status === 'RESTRICTED')) {
        return { ...scope };
      }
    }
    return null;
  }

  public async listScopesByProfessionalId(professionalId: string): Promise<ProfessionalScopeEntity[]> {
    return Array.from(this.scopes.values())
      .filter(s => s.professional_id === professionalId)
      .map(s => ({ ...s }));
  }

  // Specialties
  public async saveSpecialty(specialty: ProfessionalSpecialtyEntity): Promise<void> {
    this.specialties.set(specialty.code, { ...specialty });
  }

  public async listSpecialties(): Promise<ProfessionalSpecialtyEntity[]> {
    return Array.from(this.specialties.values()).map(s => ({ ...s }));
  }

  public async saveSpecialtyAssignment(assignment: ProfessionalSpecialtyAssignmentEntity): Promise<void> {
    const key = `${assignment.professional_id}:${assignment.specialty_code}`;
    this.specialtyAssignments.set(key, { ...assignment });
  }

  public async listSpecialtyAssignments(professionalId: string): Promise<ProfessionalSpecialtyAssignmentEntity[]> {
    return Array.from(this.specialtyAssignments.values())
      .filter(a => a.professional_id === professionalId)
      .map(a => ({ ...a }));
  }

  // Providers
  public async saveProvider(provider: ProviderEntity): Promise<void> {
    this.providers.set(provider.id, { ...provider });
  }

  public async findProviderById(id: string): Promise<ProviderEntity | null> {
    const provider = this.providers.get(id);
    return provider ? { ...provider } : null;
  }

  public async findProviderByProfileId(profileId: string): Promise<ProviderEntity | null> {
    for (const provider of this.providers.values()) {
      if (provider.professional_profile_id === profileId) {
        return { ...provider };
      }
    }
    return null;
  }

  public async listProviders(filter?: Partial<ProviderEntity>): Promise<ProviderEntity[]> {
    let list = Array.from(this.providers.values());
    if (filter) {
      if (filter.status) list = list.filter(p => p.status === filter.status);
      if (filter.verification_status) list = list.filter(p => p.verification_status === filter.verification_status);
      if (filter.discoverability_status) list = list.filter(p => p.discoverability_status === filter.discoverability_status);
    }
    return list.map(p => ({ ...p }));
  }

  // Organizations & Affiliations
  public async saveOrganization(org: ProviderOrganizationEntity): Promise<void> {
    this.organizations.set(org.id, { ...org });
  }

  public async findOrganizationById(id: string): Promise<ProviderOrganizationEntity | null> {
    const org = this.organizations.get(id);
    return org ? { ...org } : null;
  }

  public async saveAffiliation(affiliation: ProfessionalOrganizationAffiliationEntity): Promise<void> {
    this.affiliations.set(affiliation.id, { ...affiliation });
  }

  public async listAffiliationsByProfessionalId(professionalId: string): Promise<ProfessionalOrganizationAffiliationEntity[]> {
    return Array.from(this.affiliations.values())
      .filter(a => a.professional_id === professionalId)
      .map(a => ({ ...a }));
  }

  // Service Offerings
  public async saveServiceOffering(service: ServiceOfferingEntity): Promise<void> {
    this.serviceOfferings.set(service.id, { ...service });
  }

  public async findServiceOfferingById(id: string): Promise<ServiceOfferingEntity | null> {
    const service = this.serviceOfferings.get(id);
    return service ? { ...service } : null;
  }

  public async listServiceOfferingsByProviderId(providerId: string): Promise<ServiceOfferingEntity[]> {
    return Array.from(this.serviceOfferings.values())
      .filter(s => s.provider_id === providerId)
      .map(s => ({ ...s }));
  }

  public async listAllActiveServices(): Promise<ServiceOfferingEntity[]> {
    return Array.from(this.serviceOfferings.values())
      .filter(s => s.status === 'ACTIVE')
      .map(s => ({ ...s }));
  }

  // Reset
  public async reset(): Promise<void> {
    this.profiles.clear();
    this.credentials.clear();
    this.registrations.clear();
    this.verificationCases.clear();
    this.scopes.clear();
    this.specialties.clear();
    this.specialtyAssignments.clear();
    this.providers.clear();
    this.organizations.clear();
    this.affiliations.clear();
    this.serviceOfferings.clear();
  }
}
