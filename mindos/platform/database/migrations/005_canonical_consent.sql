-- Migration: 005_canonical_consent.sql
-- Expand -> Migrate/Backfill -> Switch -> Contract
-- Authority: Master Architecture Index Section 14, Volume VIII, Appendix C/D/F & ADR-006, ADR-019, ADR-020, ADR-021
-- Sprint 6: Canonical Consent Engine, Policy Versioning, Granular Data Sharing & Authorization Kernel Integration

-- UP --
-- 1. Consent Definitions Registry
CREATE TABLE IF NOT EXISTS consent_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(80) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(60) NOT NULL,
  purpose VARCHAR(60) NOT NULL,
  data_categories_json TEXT NOT NULL,
  required_or_optional VARCHAR(40) NOT NULL DEFAULT 'OPTIONAL',
  withdrawal_allowed BOOLEAN NOT NULL DEFAULT true,
  expiry_policy_json TEXT NOT NULL DEFAULT '{}',
  jurisdiction_scope_json TEXT NOT NULL DEFAULT '["KE"]',
  versioning_policy_json TEXT NOT NULL DEFAULT '{"requires_reconsent_on_material_change": true}',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  processing_activity_id VARCHAR(80),
  dpia_assessment_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_consent_definitions_code ON consent_definitions(code);
CREATE INDEX IF NOT EXISTS idx_consent_definitions_cat ON consent_definitions(category);
CREATE INDEX IF NOT EXISTS idx_consent_definitions_purpose ON consent_definitions(purpose);

-- 2. Versioned Consent Policies
CREATE TABLE IF NOT EXISTS consent_policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_definition_id UUID NOT NULL REFERENCES consent_definitions(id) ON DELETE CASCADE,
  consent_code VARCHAR(80) NOT NULL,
  version VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  summary TEXT NOT NULL,
  full_text_reference TEXT NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retired_at TIMESTAMPTZ,
  jurisdiction VARCHAR(20) NOT NULL DEFAULT 'KE',
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  is_material_change BOOLEAN NOT NULL DEFAULT false,
  approved_by VARCHAR(80) NOT NULL DEFAULT 'legal-counsel@mindos.dev',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(consent_definition_id, version)
);

CREATE INDEX IF NOT EXISTS idx_consent_policy_def_version ON consent_policy_versions(consent_definition_id, version);
CREATE INDEX IF NOT EXISTS idx_consent_policy_code ON consent_policy_versions(consent_code);

-- 3. Consent Grants (Subject Decisions with Append-Oriented State Transitions)
CREATE TABLE IF NOT EXISTS consent_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_definition_id UUID NOT NULL REFERENCES consent_definitions(id) ON DELETE CASCADE,
  consent_code VARCHAR(80) NOT NULL,
  policy_version_id UUID NOT NULL REFERENCES consent_policy_versions(id),
  policy_version VARCHAR(40) NOT NULL,
  status VARCHAR(40) NOT NULL,
  granted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  source VARCHAR(60) NOT NULL DEFAULT 'WEB_UI',
  method VARCHAR(60) NOT NULL DEFAULT 'EXPLICIT_CHECKBOX',
  jurisdiction VARCHAR(20) NOT NULL DEFAULT 'KE',
  evidence_id UUID,
  correlation_id VARCHAR(80) NOT NULL,
  authority_type VARCHAR(40) NOT NULL DEFAULT 'SELF',
  withdrawal_reason VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_consent_grants_subject_code ON consent_grants(subject_user_id, consent_code);
CREATE INDEX IF NOT EXISTS idx_consent_grants_status ON consent_grants(status);
CREATE INDEX IF NOT EXISTS idx_consent_grants_expires_at ON consent_grants(expires_at);

-- 4. Tamper-Evident Consent Evidence
CREATE TABLE IF NOT EXISTS consent_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_grant_id UUID NOT NULL,
  presentation_version VARCHAR(40) NOT NULL,
  policy_version VARCHAR(40) NOT NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  interface VARCHAR(60) NOT NULL DEFAULT 'WEB_PRIVACY_CENTRE',
  interaction_type VARCHAR(40) NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  request_context_json TEXT NOT NULL,
  evidence_hash VARCHAR(64) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consent_evidence_grant ON consent_evidence(consent_grant_id);

-- 5. Granular Consent Scope Entries
CREATE TABLE IF NOT EXISTS consent_scope_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_grant_id UUID NOT NULL REFERENCES consent_grants(id) ON DELETE CASCADE,
  scope_type VARCHAR(60) NOT NULL,
  target_type VARCHAR(60) NOT NULL,
  target_id VARCHAR(80),
  is_allowed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_consent_scope_grant ON consent_scope_entries(consent_grant_id);

-- 6. Granular Sharing Recipients
CREATE TABLE IF NOT EXISTS consent_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_grant_id UUID NOT NULL REFERENCES consent_grants(id) ON DELETE CASCADE,
  recipient_type VARCHAR(60) NOT NULL,
  recipient_id VARCHAR(80) NOT NULL,
  recipient_name VARCHAR(120),
  role VARCHAR(60),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_consent_recipients_grant ON consent_recipients(consent_grant_id);
CREATE INDEX IF NOT EXISTS idx_consent_recipients_target ON consent_recipients(recipient_id);

-- DOWN --
DROP TABLE IF EXISTS consent_recipients;
DROP TABLE IF EXISTS consent_scope_entries;
DROP TABLE IF EXISTS consent_evidence;
DROP TABLE IF EXISTS consent_grants;
DROP TABLE IF EXISTS consent_policy_versions;
DROP TABLE IF EXISTS consent_definitions;
