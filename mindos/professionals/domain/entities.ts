/**
 * MindOS Professional Domain Entities
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 */

import {
  ProfessionalType,
  ProfessionalState,
  ProfessionalVerificationState,
  CredentialType,
  CredentialStatus,
  VerificationMethod,
  VerificationType,
  VerificationCaseStatus,
  VerificationDecision,
  VerificationCheck,
  ScopeType,
  TargetPopulation,
  DeliveryMode,
  ProviderType,
  ProviderStatus,
  DiscoverabilityStatus,
  ServiceType,
  ServiceOfferingStatus,
  ProfileVisibility
} from './types.js';

export interface ProfessionalProfileEntity {
  id: string; // UUIDv7
  user_id: string; // Foreign key to users(id)
  professional_type: ProfessionalType;
  display_name: string;
  legal_name_reference: string;
  bio?: string;
  status: ProfessionalState;
  verification_status: ProfessionalVerificationState;
  jurisdictions: string[];
  languages: string[];
  specialties: string[];
  delivery_modes: DeliveryMode[];
  organization_refs: string[];
  profile_visibility: ProfileVisibility;
  created_at: string;
  updated_at: string;
}

export interface ProfessionalCredentialEntity {
  id: string;
  professional_id: string;
  credential_type: CredentialType;
  title: string;
  issuer: string;
  issue_date: string; // YYYY-MM-DD
  expiry_date?: string | null; // YYYY-MM-DD
  credential_number_reference: string;
  jurisdiction: string;
  status: CredentialStatus;
  evidence_id?: string; // Foreign key to governance_evidence(id)
  evidence_hash?: string; // SHA-256 integrity hash from Evidence Vault
  verified_at?: string | null;
  verified_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfessionalRegistrationEntity {
  id: string;
  professional_id: string;
  authority_id: string; // e.g., 'KMPDC', 'NCK', 'CPK'
  registration_type: string;
  registration_number: string;
  jurisdiction: string;
  issued_at: string;
  expires_at: string;
  status: 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
  verification_method: VerificationMethod;
  last_verified_at?: string | null;
  next_verification_at?: string | null;
  evidence_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ProfessionalVerificationCaseEntity {
  id: string;
  professional_id: string;
  verification_type: VerificationType;
  status: VerificationCaseStatus;
  submitted_at?: string | null;
  assigned_reviewer_id?: string | null;
  required_evidence: string[];
  verification_checks: VerificationCheck[];
  decision?: VerificationDecision | null;
  decision_reason?: string | null;
  policy_version: string;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfessionalScopeEntity {
  id: string;
  professional_id: string;
  jurisdiction: string;
  scope_type: ScopeType;
  allowed_service_types: ServiceType[];
  allowed_populations: TargetPopulation[];
  allowed_modalities: DeliveryMode[];
  restrictions: string[];
  effective_at: string;
  expires_at?: string | null;
  source_credential_refs: string[];
  status: 'ACTIVE' | 'RESTRICTED' | 'SUSPENDED' | 'EXPIRED' | 'SUPERSEDED';
  created_at: string;
  updated_at: string;
}

export interface ProfessionalSpecialtyEntity {
  id: string;
  code: string;
  name: string;
  description?: string;
  domain: string;
  is_active: boolean;
  created_at: string;
}

export interface ProfessionalSpecialtyAssignmentEntity {
  id: string;
  professional_id: string;
  specialty_code: string;
  verification_status: 'DECLARED' | 'VERIFIED' | 'REJECTED';
  created_at: string;
}

export interface ProviderEntity {
  id: string;
  professional_profile_id: string;
  provider_type: ProviderType;
  status: ProviderStatus;
  verification_status: ProfessionalVerificationState;
  jurisdictions: string[];
  organization_refs: string[];
  discoverability_status: DiscoverabilityStatus;
  created_at: string;
  updated_at: string;
}

export interface ProviderOrganizationEntity {
  id: string;
  name: string;
  organization_type: string;
  registration_number: string;
  jurisdiction: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  verified_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ProfessionalOrganizationAffiliationEntity {
  id: string;
  professional_id: string;
  organization_id: string;
  role: string;
  status: 'ACTIVE' | 'INACTIVE' | 'TERMINATED';
  effective_at: string;
  ended_at?: string | null;
  created_at: string;
}

export interface ServiceOfferingEntity {
  id: string;
  provider_id: string;
  service_code: string;
  service_type: ServiceType;
  name: string;
  description: string;
  delivery_mode: DeliveryMode;
  jurisdiction: string;
  population: TargetPopulation;
  duration_minutes: number;
  pricing_reference?: {
    currency: string;
    amount: number;
    billing_model: string;
  } | null;
  status: ServiceOfferingStatus;
  clinical_scope_reference?: string;
  created_at: string;
  updated_at: string;
}
