/**
 * MindOS Professional Repository Interfaces
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 */

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

export interface IProfessionalRepository {
  // Profiles
  saveProfile(profile: ProfessionalProfileEntity): Promise<void>;
  findProfileById(id: string): Promise<ProfessionalProfileEntity | null>;
  findProfileByUserId(userId: string): Promise<ProfessionalProfileEntity | null>;
  listProfiles(filter?: Partial<ProfessionalProfileEntity>): Promise<ProfessionalProfileEntity[]>;

  // Credentials
  saveCredential(credential: ProfessionalCredentialEntity): Promise<void>;
  findCredentialById(id: string): Promise<ProfessionalCredentialEntity | null>;
  listCredentialsByProfessionalId(professionalId: string): Promise<ProfessionalCredentialEntity[]>;
  listAllCredentials(): Promise<ProfessionalCredentialEntity[]>;

  // Registrations
  saveRegistration(registration: ProfessionalRegistrationEntity): Promise<void>;
  findRegistrationById(id: string): Promise<ProfessionalRegistrationEntity | null>;
  findRegistrationByAuthorityAndNumber(authorityId: string, registrationNumber: string): Promise<ProfessionalRegistrationEntity | null>;
  listRegistrationsByProfessionalId(professionalId: string): Promise<ProfessionalRegistrationEntity[]>;
  listAllRegistrations(): Promise<ProfessionalRegistrationEntity[]>;

  // Verification Cases
  saveVerificationCase(vCase: ProfessionalVerificationCaseEntity): Promise<void>;
  findVerificationCaseById(id: string): Promise<ProfessionalVerificationCaseEntity | null>;
  findVerificationCaseByProfessionalId(professionalId: string): Promise<ProfessionalVerificationCaseEntity | null>;
  listVerificationCases(status?: string): Promise<ProfessionalVerificationCaseEntity[]>;

  // Scopes
  saveScope(scope: ProfessionalScopeEntity): Promise<void>;
  findScopeById(id: string): Promise<ProfessionalScopeEntity | null>;
  findActiveScopeByProfessionalId(professionalId: string): Promise<ProfessionalScopeEntity | null>;
  listScopesByProfessionalId(professionalId: string): Promise<ProfessionalScopeEntity[]>;

  // Specialties
  saveSpecialty(specialty: ProfessionalSpecialtyEntity): Promise<void>;
  listSpecialties(): Promise<ProfessionalSpecialtyEntity[]>;
  saveSpecialtyAssignment(assignment: ProfessionalSpecialtyAssignmentEntity): Promise<void>;
  listSpecialtyAssignments(professionalId: string): Promise<ProfessionalSpecialtyAssignmentEntity[]>;

  // Providers
  saveProvider(provider: ProviderEntity): Promise<void>;
  findProviderById(id: string): Promise<ProviderEntity | null>;
  findProviderByProfileId(profileId: string): Promise<ProviderEntity | null>;
  listProviders(filter?: Partial<ProviderEntity>): Promise<ProviderEntity[]>;

  // Organizations & Affiliations
  saveOrganization(org: ProviderOrganizationEntity): Promise<void>;
  findOrganizationById(id: string): Promise<ProviderOrganizationEntity | null>;
  saveAffiliation(affiliation: ProfessionalOrganizationAffiliationEntity): Promise<void>;
  listAffiliationsByProfessionalId(professionalId: string): Promise<ProfessionalOrganizationAffiliationEntity[]>;

  // Service Offerings
  saveServiceOffering(service: ServiceOfferingEntity): Promise<void>;
  findServiceOfferingById(id: string): Promise<ServiceOfferingEntity | null>;
  listServiceOfferingsByProviderId(providerId: string): Promise<ServiceOfferingEntity[]>;
  listAllActiveServices(): Promise<ServiceOfferingEntity[]>;

  // Reset for testing
  reset(): Promise<void>;
}
