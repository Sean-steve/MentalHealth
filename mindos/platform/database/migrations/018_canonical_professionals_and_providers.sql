-- ==============================================================================
-- MINDOS CANONICAL MIGRATION: 018_canonical_professionals_and_providers.sql
-- ==============================================================================
-- Purpose: Canonical Professional Bounded Context, Credential Registry,
--          Verification Workflow, Scope of Practice, Provider Registry,
--          Service Offerings, Discoverability & Care Network Eligibility.
-- Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q / J
--            Clinical Safety Policy Catalogue (R-SAFE-001, ADR-026..032)
--            Kenya Data Protection Act 2019, Digital Health Act 2023, KMPDC Act Cap 253
-- Sprint 19: Professional Identity, Credential Verification, Provider Registry,
--            Service Offerings, Scope of Practice & Care-Network Eligibility
-- Strategy: Additive expand phase (100% backwards compatible).
-- ==============================================================================

-- UP --

-- 1. Professional Profiles
CREATE TABLE IF NOT EXISTS professional_profiles (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  professional_type VARCHAR(60) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  legal_name_reference VARCHAR(200) NOT NULL,
  bio TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  verification_status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  jurisdictions TEXT[] NOT NULL DEFAULT '{"KE"}',
  languages TEXT[] NOT NULL DEFAULT '{"English", "Swahili"}',
  specialties TEXT[] NOT NULL DEFAULT '{}',
  delivery_modes TEXT[] NOT NULL DEFAULT '{"TELEHEALTH"}',
  organization_refs TEXT[] NOT NULL DEFAULT '{}',
  profile_visibility VARCHAR(40) NOT NULL DEFAULT 'PUBLIC_DIRECTORY',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Legacy Sprint-1 compatibility: expand professional_profiles in place.
ALTER TABLE professional_profiles
  ADD COLUMN IF NOT EXISTS professional_type VARCHAR(60),
  ADD COLUMN IF NOT EXISTS legal_name_reference VARCHAR(200),
  ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS jurisdictions TEXT[] NOT NULL DEFAULT '{"KE"}',
  ADD COLUMN IF NOT EXISTS specialties TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS delivery_modes TEXT[] NOT NULL DEFAULT '{"TELEHEALTH"}',
  ADD COLUMN IF NOT EXISTS organization_refs TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS profile_visibility VARCHAR(40) NOT NULL DEFAULT 'PUBLIC_DIRECTORY';
UPDATE professional_profiles
SET professional_type = COALESCE(professional_type, profession_type),
    legal_name_reference = COALESCE(legal_name_reference, display_name),
    verification_status = COALESCE(verification_status, verification_state::text),
    jurisdictions = CASE WHEN cardinality(jurisdictions) = 0 THEN COALESCE(country_codes, ARRAY['KE']::text[]) ELSE jurisdictions END,
    delivery_modes = CASE WHEN cardinality(delivery_modes) = 0 THEN COALESCE(consultation_modes, ARRAY['TELEHEALTH']::text[]) ELSE delivery_modes END
WHERE professional_type IS NULL OR legal_name_reference IS NULL;
ALTER TABLE professional_profiles
  ALTER COLUMN professional_type SET NOT NULL,
  ALTER COLUMN legal_name_reference SET NOT NULL,
  ALTER COLUMN profession_type DROP NOT NULL,
  ALTER COLUMN consultation_modes SET DEFAULT '{}',
  ALTER COLUMN country_codes SET DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_professional_profiles_user ON professional_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_professional_profiles_type ON professional_profiles(professional_type);
CREATE INDEX IF NOT EXISTS idx_professional_profiles_status ON professional_profiles(status, verification_status);

-- 2. Professional Credentials Registry
CREATE TABLE IF NOT EXISTS professional_credentials (
  id UUID PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  credential_type VARCHAR(60) NOT NULL,
  title VARCHAR(200) NOT NULL,
  issuer VARCHAR(200) NOT NULL,
  issue_date DATE NOT NULL,
  expiry_date DATE,
  credential_number_reference VARCHAR(120) NOT NULL,
  jurisdiction VARCHAR(40) NOT NULL DEFAULT 'KE',
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  evidence_id UUID REFERENCES governance_evidence(id) ON DELETE SET NULL,
  evidence_hash VARCHAR(128),
  verified_at TIMESTAMPTZ,
  verified_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Legacy Sprint-1 compatibility: expand professional_credentials in place.
ALTER TABLE professional_credentials
  ADD COLUMN IF NOT EXISTS credential_type VARCHAR(60),
  ADD COLUMN IF NOT EXISTS title VARCHAR(200),
  ADD COLUMN IF NOT EXISTS issue_date DATE,
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS credential_number_reference VARCHAR(120),
  ADD COLUMN IF NOT EXISTS jurisdiction VARCHAR(40) NOT NULL DEFAULT 'KE',
  ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS evidence_id UUID,
  ADD COLUMN IF NOT EXISTS evidence_hash VARCHAR(128),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE professional_credentials
SET credential_type = COALESCE(credential_type, claim_type, 'LEGACY_CREDENTIAL'),
    title = COALESCE(title, claim_type, 'Legacy credential'),
    issue_date = COALESCE(issue_date, valid_from, created_at::date),
    expiry_date = COALESCE(expiry_date, valid_until),
    credential_number_reference = COALESCE(credential_number_reference, 'legacy:' || id::text),
    status = COALESCE(status, verification_status)
WHERE credential_type IS NULL OR title IS NULL OR issue_date IS NULL OR credential_number_reference IS NULL;
ALTER TABLE professional_credentials
  ALTER COLUMN credential_type SET NOT NULL,
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN issuer SET DEFAULT 'UNKNOWN_LEGACY_ISSUER',
  ALTER COLUMN issuer SET NOT NULL,
  ALTER COLUMN issue_date SET NOT NULL,
  ALTER COLUMN credential_number_reference SET NOT NULL,
  ALTER COLUMN claim_type DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_professional_credentials_prof ON professional_credentials(professional_id, status);
CREATE INDEX IF NOT EXISTS idx_professional_credentials_expiry ON professional_credentials(expiry_date);

-- 3. Professional Registrations (Regulatory Licensure)
CREATE TABLE IF NOT EXISTS professional_registrations (
  id UUID PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  authority_id VARCHAR(60) NOT NULL,
  registration_type VARCHAR(80) NOT NULL,
  registration_number VARCHAR(120) NOT NULL,
  jurisdiction VARCHAR(40) NOT NULL DEFAULT 'KE',
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING_VERIFICATION',
  verification_method VARCHAR(60) NOT NULL DEFAULT 'MANUAL',
  last_verified_at TIMESTAMPTZ,
  next_verification_at TIMESTAMPTZ,
  evidence_id UUID REFERENCES governance_evidence(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unq_reg_number_authority UNIQUE (authority_id, registration_number)
);

CREATE INDEX IF NOT EXISTS idx_professional_registrations_prof ON professional_registrations(professional_id, status);
CREATE INDEX IF NOT EXISTS idx_professional_registrations_expiry ON professional_registrations(expires_at);

-- 4. Professional Verification Cases
CREATE TABLE IF NOT EXISTS professional_verification_cases (
  id UUID PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  verification_type VARCHAR(60) NOT NULL DEFAULT 'INITIAL_ONBOARDING',
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  submitted_at TIMESTAMPTZ,
  assigned_reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  required_evidence TEXT[] NOT NULL DEFAULT '{}',
  decision VARCHAR(40),
  decision_reason TEXT,
  policy_version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_cases_prof ON professional_verification_cases(professional_id, status);
CREATE INDEX IF NOT EXISTS idx_verification_cases_reviewer ON professional_verification_cases(assigned_reviewer_id, status);

-- 5. Professional Verification Checks
CREATE TABLE IF NOT EXISTS professional_verification_checks (
  id UUID PRIMARY KEY,
  verification_case_id UUID NOT NULL REFERENCES professional_verification_cases(id) ON DELETE CASCADE,
  check_type VARCHAR(60) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  evidence_ref UUID,
  checked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_checks_case ON professional_verification_checks(verification_case_id);

-- 6. Professional Scopes of Practice
CREATE TABLE IF NOT EXISTS professional_scopes (
  id UUID PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  jurisdiction VARCHAR(40) NOT NULL DEFAULT 'KE',
  scope_type VARCHAR(60) NOT NULL,
  allowed_service_types TEXT[] NOT NULL DEFAULT '{}',
  allowed_populations TEXT[] NOT NULL DEFAULT '{}',
  allowed_modalities TEXT[] NOT NULL DEFAULT '{}',
  restrictions TEXT[] NOT NULL DEFAULT '{}',
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  source_credential_refs TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_professional_scopes_prof ON professional_scopes(professional_id, status);

-- 7. Governed Specialties Registry

-- Sprint-1 used professional_specialties as a join table. Preserve it, then
-- create the canonical governed specialty registry under the canonical name.
ALTER TABLE professional_specialties RENAME TO professional_specialties_legacy_sprint1;

CREATE TABLE IF NOT EXISTS professional_specialties (
  id UUID PRIMARY KEY,
  code VARCHAR(80) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  domain VARCHAR(80) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Professional Specialty Assignments
CREATE TABLE IF NOT EXISTS professional_specialty_assignments (
  id UUID PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  specialty_code VARCHAR(80) NOT NULL REFERENCES professional_specialties(code) ON DELETE CASCADE,
  verification_status VARCHAR(40) NOT NULL DEFAULT 'DECLARED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unq_prof_spec UNIQUE (professional_id, specialty_code)
);

-- 9. Canonical Providers Registry
CREATE TABLE IF NOT EXISTS providers (
  id UUID PRIMARY KEY,
  professional_profile_id UUID REFERENCES professional_profiles(id) ON DELETE CASCADE,
  provider_type VARCHAR(60) NOT NULL DEFAULT 'INDIVIDUAL_PROFESSIONAL',
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  verification_status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  jurisdictions TEXT[] NOT NULL DEFAULT '{"KE"}',
  organization_refs TEXT[] NOT NULL DEFAULT '{}',
  discoverability_status VARCHAR(40) NOT NULL DEFAULT 'HIDDEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Migrate Sprint-1 specialty catalogue and assignments into the Sprint-19 model.
INSERT INTO professional_specialties (id, code, name, description, domain, is_active, created_at)
SELECT s.id, s.code, s.name, NULL, 'LEGACY_IMPORTED', s.active, s.created_at
FROM specialties s
ON CONFLICT (id) DO NOTHING;

INSERT INTO professional_specialty_assignments (id, professional_id, specialty_code, verification_status, created_at)
SELECT uuid_generate_v4(), l.professional_id, s.code,
       CASE WHEN l.active THEN 'VERIFIED_LEGACY' ELSE 'INACTIVE_LEGACY' END,
       NOW()
FROM professional_specialties_legacy_sprint1 l
JOIN specialties s ON s.id = l.specialty_id
ON CONFLICT (professional_id, specialty_code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_providers_profile ON providers(professional_profile_id);
CREATE INDEX IF NOT EXISTS idx_providers_status ON providers(status, verification_status, discoverability_status);

-- 10. Provider Organizations
CREATE TABLE IF NOT EXISTS provider_organizations (
  id UUID PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  organization_type VARCHAR(60) NOT NULL,
  registration_number VARCHAR(120) NOT NULL,
  jurisdiction VARCHAR(40) NOT NULL DEFAULT 'KE',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Professional Organization Affiliations
CREATE TABLE IF NOT EXISTS professional_organization_affiliations (
  id UUID PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES provider_organizations(id) ON DELETE CASCADE,
  role VARCHAR(80) NOT NULL DEFAULT 'STAFF_CLINICIAN',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unq_prof_org UNIQUE (professional_id, organization_id)
);

-- 12. Service Offerings Registry
CREATE TABLE IF NOT EXISTS service_offerings (
  id UUID PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  service_code VARCHAR(80) NOT NULL,
  service_type VARCHAR(80) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  delivery_mode VARCHAR(40) NOT NULL DEFAULT 'TELEHEALTH',
  jurisdiction VARCHAR(40) NOT NULL DEFAULT 'KE',
  population VARCHAR(60) NOT NULL DEFAULT 'ADULTS',
  duration_minutes INT NOT NULL DEFAULT 50,
  pricing_reference JSONB,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  clinical_scope_reference UUID REFERENCES professional_scopes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_offerings_provider ON service_offerings(provider_id, status);
CREATE INDEX IF NOT EXISTS idx_service_offerings_type ON service_offerings(service_type, status);
