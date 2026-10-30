-- ==============================================================================
-- MINDOS CANONICAL MIGRATION: 017_canonical_care_navigation_and_referrals.sql
-- ==============================================================================
-- Purpose: Formalize Canonical Care Navigation, Support Pathway Registry,
--          Referral Orchestration, Provider Matching Readiness & Safety-Aware Handoff.
-- Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
--            Clinical Safety Policy Catalogue (R-SAFE-001, R-NAV-001..010, ADR-006, ADR-016)
--            Kenya Data Protection Act 2019, Digital Health Act 2023
-- Sprint 18: Care Navigation, Support Pathways, Referral Orchestration,
--            Provider Matching Readiness & Safety-Aware Handoff
-- Strategy: Additive expand phase (100% backwards compatible).
-- ==============================================================================

-- UP --

-- 1. Governed Care Pathways Registry
CREATE TABLE IF NOT EXISTS care_pathways (
  id UUID PRIMARY KEY,
  code VARCHAR(80) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  care_level VARCHAR(40) NOT NULL, -- LEVEL_0..LEVEL_4, LEVEL_EMERGENCY
  target_need_domains TEXT[] NOT NULL,
  clinical_artifact_id UUID,
  description TEXT NOT NULL,
  eligibility_criteria JSONB NOT NULL DEFAULT '{}',
  exclusion_criteria JSONB NOT NULL DEFAULT '{}',
  recommended_interventions JSONB NOT NULL DEFAULT '[]',
  state VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  review_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_care_pathways_care_level ON care_pathways(care_level);
CREATE INDEX IF NOT EXISTS idx_care_pathways_state ON care_pathways(state);

-- 2. Care Navigation Sessions
CREATE TABLE IF NOT EXISTS navigation_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(40) NOT NULL DEFAULT 'CREATED',
  risk_state_snapshot VARCHAR(40) NOT NULL,
  declared_needs JSONB NOT NULL DEFAULT '{}',
  assessment_result_ids UUID[] DEFAULT '{}',
  classified_need JSONB,
  recommended_pathway_ids UUID[] DEFAULT '{}',
  selected_pathway_id UUID REFERENCES care_pathways(id) ON DELETE SET NULL,
  safety_override BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_navigation_sessions_user ON navigation_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_navigation_sessions_created ON navigation_sessions(created_at);

-- 3. Canonical Referrals
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  navigation_session_id UUID REFERENCES navigation_sessions(id) ON DELETE SET NULL,
  pathway_id UUID REFERENCES care_pathways(id) ON DELETE SET NULL,
  care_level VARCHAR(40) NOT NULL,
  urgency VARCHAR(30) NOT NULL DEFAULT 'ROUTINE', -- ROUTINE, PRIORITY, URGENT, EMERGENCY
  state VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  receiving_provider_id UUID,
  receiving_organization_id UUID,
  receiving_service_type VARCHAR(80) NOT NULL,
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  clinical_summary_hash VARCHAR(128),
  consent_grant_id UUID,
  action_notes TEXT,
  rejection_reason TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_referrals_user_state ON referrals(user_id, state);
CREATE INDEX IF NOT EXISTS idx_referrals_provider ON referrals(receiving_provider_id, state);

-- 4. Minimum-Necessary Safety-Aware Handoff Packages
CREATE TABLE IF NOT EXISTS referral_handoff_packages (
  id UUID PRIMARY KEY,
  referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  evidence_hash VARCHAR(128) NOT NULL,
  payload_ciphertext TEXT NOT NULL,
  minimum_necessary_fields TEXT[] NOT NULL,
  access_count INT NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_handoff_referral ON referral_handoff_packages(referral_id, state);

-- 5. Provider Matching Profiles Cache (Directory Matching Readiness)
CREATE TABLE IF NOT EXISTS provider_matching_profiles (
  id UUID PRIMARY KEY,
  professional_id UUID NOT NULL,
  title VARCHAR(120) NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  verification_state VARCHAR(40) NOT NULL,
  regulatory_body VARCHAR(40) NOT NULL DEFAULT 'KMPDC',
  license_number VARCHAR(80) NOT NULL,
  license_expires_at TIMESTAMPTZ NOT NULL,
  specialties TEXT[] NOT NULL DEFAULT '{}',
  supported_care_levels TEXT[] NOT NULL DEFAULT '{}',
  modalities TEXT[] NOT NULL DEFAULT '{"TELEHEALTH"}',
  jurisdictions TEXT[] NOT NULL DEFAULT '{"KE"}',
  languages TEXT[] NOT NULL DEFAULT '{"English", "Swahili"}',
  capacity_status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_matching_lookup ON provider_matching_profiles(verification_state, capacity_status);
