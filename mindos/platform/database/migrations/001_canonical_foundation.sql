-- ==============================================================================
-- MINDOS CANONICAL DATABASE SCHEMA MIGRATION: 001_canonical_foundation.sql
-- Baseline date: 2026-09-04
-- Authority: MindOS Volumes I-XVI, Appendix B (Entity & Field Dictionary), Appendix C
-- Target Database: PostgreSQL 15+
-- ==============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ==============================================================================
-- 1. CANONICAL ENUM TYPES (Appendix C)
-- ==============================================================================

DO $$ BEGIN
  CREATE TYPE account_state_enum AS ENUM (
    'PENDING_VERIFICATION', 'ACTIVE', 'LOCKED', 'SUSPENDED', 'DELETION_PENDING', 'DELETED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE consent_state_enum AS ENUM (
    'NOT_GRANTED', 'GRANTED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE assessment_session_state_enum AS ENUM (
    'CREATED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'INVALIDATED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE risk_state_enum AS ENUM (
    'UNKNOWN', 'NO_CONCERN', 'POTENTIAL_CONCERN', 'ELEVATED', 'HIGH', 'URGENT'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE safety_event_state_enum AS ENUM (
    'DETECTED', 'CLASSIFIED', 'ACTIONED', 'ESCALATED', 'FOLLOW_UP', 'RESOLVED', 'CLOSED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE escalation_state_enum AS ENUM (
    'NEW', 'TRIAGED', 'ASSIGNED', 'IN_REVIEW', 'ACTION_REQUIRED', 'FOLLOW_UP', 'RESOLVED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE community_membership_state_enum AS ENUM (
    'REQUESTED', 'ACTIVE', 'MUTED', 'SUSPENDED', 'LEFT', 'BANNED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE moderation_case_state_enum AS ENUM (
    'NEW', 'TRIAGED', 'ASSIGNED', 'IN_REVIEW', 'ACTIONED', 'APPEALED', 'RESOLVED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE professional_verification_state_enum AS ENUM (
    'DRAFT', 'SUBMITTED', 'IDENTITY_REVIEW', 'CREDENTIAL_REVIEW', 'LICENSE_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED', 'REVERIFICATION_REQUIRED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE care_relationship_state_enum AS ENUM (
    'PROPOSED', 'CONSENT_PENDING', 'ACTIVE', 'PAUSED', 'ENDED', 'REVOKED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE appointment_state_enum AS ENUM (
    'REQUESTED', 'HELD', 'CONFIRMED', 'CANCELLED_BY_USER', 'CANCELLED_BY_PROFESSIONAL', 'NO_SHOW', 'COMPLETED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_state_enum AS ENUM (
    'TRIAL', 'ACTIVE', 'PAST_DUE', 'GRACE', 'CANCELLED', 'EXPIRED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE clinical_artifact_state_enum AS ENUM (
    'DRAFT', 'CLINICAL_REVIEW_REQUIRED', 'UNDER_REVIEW', 'REVISION_REQUIRED', 'APPROVED', 'PUBLISHED', 'MONITORED', 'REVIEW_DUE', 'REVALIDATION', 'RETIRED', 'REJECTED', 'SUPERSEDED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE dpia_state_enum AS ENUM (
    'DRAFT', 'SCREENING', 'REQUIRED', 'ASSESSING', 'MITIGATION_REQUIRED', 'READY_FOR_REVIEW', 'APPROVED', 'APPROVED_WITH_CONTROLS', 'REVIEW_DUE', 'SUPERSEDED', 'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE regulatory_review_state_enum AS ENUM (
    'NOT_ASSESSED', 'CLASSIFICATION_REQUIRED', 'IN_REVIEW', 'ADDITIONAL_EVIDENCE_REQUIRED', 'APPROVED', 'APPROVED_WITH_CONDITIONS', 'BLOCKED', 'REVIEW_DUE', 'SUPERSEDED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE ai_system_state_enum AS ENUM (
    'DRAFT', 'REGISTERED', 'EVALUATION_REQUIRED', 'UNDER_EVALUATION', 'CLINICAL_REVIEW', 'PRIVACY_REVIEW', 'REGULATORY_REVIEW', 'APPROVED_FOR_LIMITED_USE', 'APPROVED', 'PAUSED', 'REVOKED', 'RETIRED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE governance_decision_enum AS ENUM (
    'APPROVED', 'APPROVED_WITH_CONTROLS', 'REVISION_REQUIRED', 'BLOCKED', 'RETIRED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ==============================================================================
-- 2. SCHEMA DEFINITION & CANONICAL TABLES (Appendix B)
-- ==============================================================================

-- Schema migrations tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(80) PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- users (Identity domain)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email_normalized CITEXT NOT NULL,
  account_state account_state_enum NOT NULL DEFAULT 'PENDING_VERIFICATION',
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deletion_requested_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active ON users (email_normalized) WHERE account_state != 'DELETED';

-- user_profiles (Users domain)
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(120),
  country_code CHAR(2) NOT NULL DEFAULT 'KE',
  region_code VARCHAR(80),
  locale VARCHAR(20) NOT NULL DEFAULT 'en-KE',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Nairobi',
  accessibility_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- auth_sessions (Identity domain)
CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_family_hash BYTEA NOT NULL,
  device_label VARCHAR(120),
  ip_risk_metadata JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON auth_sessions(user_id);

-- consent_receipts (Consent domain)
CREATE TABLE IF NOT EXISTS consent_receipts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type VARCHAR(80) NOT NULL,
  policy_version VARCHAR(40) NOT NULL,
  state consent_state_enum NOT NULL,
  granted_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  source VARCHAR(40) NOT NULL,
  evidence_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consent_user_type ON consent_receipts(user_id, consent_type);

-- data_access_grants (Consent domain)
CREATE TABLE IF NOT EXISTS data_access_grants (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grantee_type VARCHAR(40) NOT NULL,
  grantee_id UUID NOT NULL,
  scopes TEXT[] NOT NULL,
  purpose VARCHAR(120) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- assessment_definitions (Assessments domain)
CREATE TABLE IF NOT EXISTS assessment_definitions (
  id UUID PRIMARY KEY,
  code VARCHAR(80) UNIQUE NOT NULL,
  name VARCHAR(180) NOT NULL,
  assessment_kind VARCHAR(40) NOT NULL,
  clinical_artifact_id UUID,
  active_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- assessment_versions (Assessments domain)
CREATE TABLE IF NOT EXISTS assessment_versions (
  id UUID PRIMARY KEY,
  assessment_id UUID NOT NULL REFERENCES assessment_definitions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  question_schema JSONB NOT NULL,
  scoring_schema JSONB NOT NULL,
  interpretation_schema JSONB NOT NULL,
  limitations TEXT NOT NULL,
  status clinical_artifact_state_enum NOT NULL DEFAULT 'DRAFT',
  published_at TIMESTAMPTZ,
  UNIQUE(assessment_id, version)
);

-- assessment_sessions (Assessments domain)
CREATE TABLE IF NOT EXISTS assessment_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assessment_version_id UUID NOT NULL REFERENCES assessment_versions(id),
  state assessment_session_state_enum NOT NULL DEFAULT 'CREATED',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  safety_event_id UUID,
  version BIGINT NOT NULL DEFAULT 1
);

-- assessment_responses (Assessments domain)
CREATE TABLE IF NOT EXISTS assessment_responses (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  item_key VARCHAR(100) NOT NULL,
  answer_json JSONB NOT NULL,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR(40) NOT NULL DEFAULT 'USER',
  revision INTEGER NOT NULL DEFAULT 1,
  UNIQUE(session_id, item_key, revision)
);

-- assessment_results (Assessments domain)
CREATE TABLE IF NOT EXISTS assessment_results (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL UNIQUE REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  raw_score_json JSONB NOT NULL,
  result_band VARCHAR(80),
  interpretation_version VARCHAR(40) NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invalidated_at TIMESTAMPTZ,
  invalidation_reason TEXT
);

-- mental_state_observations (Users domain)
CREATE TABLE IF NOT EXISTS mental_state_observations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dimension VARCHAR(80) NOT NULL,
  value_json JSONB NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  source_ref UUID,
  confidence NUMERIC(4,3),
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- journal_entries (Journal/Care domain)
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ciphertext BYTEA NOT NULL,
  encryption_key_ref VARCHAR(120) NOT NULL,
  entry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  analysis_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- journal_analyses (Journal domain)
CREATE TABLE IF NOT EXISTS journal_analyses (
  id UUID PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  ai_system_version_id UUID NOT NULL,
  structured_output JSONB NOT NULL,
  confidence_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- ai_conversations (AI domain)
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(80) NOT NULL,
  consent_receipt_id UUID NOT NULL,
  state VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

-- ai_messages (AI domain)
CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content_ciphertext BYTEA NOT NULL,
  ai_release_id UUID,
  safety_policy_version VARCHAR(40),
  risk_event_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ai_context_snapshots (AI domain)
CREATE TABLE IF NOT EXISTS ai_context_snapshots (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  request_message_id UUID NOT NULL,
  context_categories TEXT[] NOT NULL,
  resource_refs JSONB NOT NULL,
  purpose VARCHAR(80) NOT NULL,
  consent_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- risk_events (Safety domain)
CREATE TABLE IF NOT EXISTS risk_events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_domain VARCHAR(40) NOT NULL,
  source_ref UUID,
  risk_category VARCHAR(60) NOT NULL,
  previous_state risk_state_enum,
  current_state risk_state_enum NOT NULL,
  signal_summary JSONB NOT NULL,
  policy_version VARCHAR(40) NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- safety_actions (Safety domain)
CREATE TABLE IF NOT EXISTS safety_actions (
  id UUID PRIMARY KEY,
  risk_event_id UUID NOT NULL REFERENCES risk_events(id) ON DELETE CASCADE,
  action_type VARCHAR(60) NOT NULL,
  action_payload JSONB NOT NULL,
  performed_by_type VARCHAR(40) NOT NULL,
  performed_by_id UUID,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome VARCHAR(60)
);

-- safety_plans (Safety domain)
CREATE TABLE IF NOT EXISTS safety_plans (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  encrypted_content BYTEA NOT NULL,
  share_policy JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- crisis_resources (Safety domain)
CREATE TABLE IF NOT EXISTS crisis_resources (
  id UUID PRIMARY KEY,
  country_code CHAR(2) NOT NULL,
  region_code VARCHAR(80),
  resource_type VARCHAR(60) NOT NULL,
  name VARCHAR(180) NOT NULL,
  contact_json JSONB NOT NULL,
  availability_json JSONB NOT NULL,
  languages TEXT[] NOT NULL,
  verification_status VARCHAR(40) NOT NULL,
  verified_at TIMESTAMPTZ,
  next_verify_at TIMESTAMPTZ,
  source_evidence_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- trusted_contacts (Safety domain)
CREATE TABLE IF NOT EXISTS trusted_contacts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name_ciphertext BYTEA NOT NULL,
  contact_ciphertext BYTEA NOT NULL,
  relationship_label VARCHAR(80),
  permission_json JSONB NOT NULL,
  verified_by_user_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- communities (Community domain)
CREATE TABLE IF NOT EXISTS communities (
  id UUID PRIMARY KEY,
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(160) NOT NULL,
  community_type VARCHAR(40) NOT NULL,
  visibility VARCHAR(30) NOT NULL DEFAULT 'PUBLIC',
  rules_version VARCHAR(40) NOT NULL,
  moderation_policy_id UUID,
  state VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- community_pseudonyms (Community domain)
CREATE TABLE IF NOT EXISTS community_pseudonyms (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_name VARCHAR(80) NOT NULL,
  avatar_ref VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at TIMESTAMPTZ
);

-- community_memberships (Community domain)
CREATE TABLE IF NOT EXISTS community_memberships (
  id UUID PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state community_membership_state_enum NOT NULL DEFAULT 'ACTIVE',
  community_role VARCHAR(40) NOT NULL DEFAULT 'MEMBER',
  pseudonym_id UUID NOT NULL REFERENCES community_pseudonyms(id),
  joined_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

-- community_posts (Community domain)
CREATE TABLE IF NOT EXISTS community_posts (
  id UUID PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  pseudonym_id UUID NOT NULL REFERENCES community_pseudonyms(id),
  content_ciphertext BYTEA NOT NULL,
  post_type VARCHAR(40) NOT NULL,
  state VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  sensitivity_labels TEXT[] NOT NULL DEFAULT '{}',
  published_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- community_comments (Community domain)
CREATE TABLE IF NOT EXISTS community_comments (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  pseudonym_id UUID NOT NULL REFERENCES community_pseudonyms(id),
  content_ciphertext BYTEA NOT NULL,
  state VARCHAR(40) NOT NULL DEFAULT 'PUBLISHED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- moderation_cases (Moderation domain)
CREATE TABLE IF NOT EXISTS moderation_cases (
  id UUID PRIMARY KEY,
  source_type VARCHAR(40) NOT NULL,
  source_id UUID NOT NULL,
  reporter_user_id UUID REFERENCES users(id),
  severity VARCHAR(30) NOT NULL,
  state moderation_case_state_enum NOT NULL DEFAULT 'NEW',
  policy_version VARCHAR(40) NOT NULL,
  assigned_to UUID,
  safety_event_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- moderation_actions (Moderation domain)
CREATE TABLE IF NOT EXISTS moderation_actions (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES moderation_cases(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL,
  reason_code VARCHAR(80) NOT NULL,
  actor_id UUID NOT NULL,
  evidence_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- professional_profiles (Professionals domain)
CREATE TABLE IF NOT EXISTS professional_profiles (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profession_type VARCHAR(80) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  bio TEXT,
  languages TEXT[] NOT NULL,
  consultation_modes TEXT[] NOT NULL,
  country_codes TEXT[] NOT NULL,
  verification_state professional_verification_state_enum NOT NULL DEFAULT 'DRAFT',
  discoverable BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- professional_credentials (Professionals domain)
CREATE TABLE IF NOT EXISTS professional_credentials (
  id UUID PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  claim_type VARCHAR(50) NOT NULL,
  issuer VARCHAR(180),
  identifier_ciphertext BYTEA,
  valid_from DATE,
  valid_until DATE,
  verification_status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  evidence_object_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- specialties (Professionals domain)
CREATE TABLE IF NOT EXISTS specialties (
  id UUID PRIMARY KEY,
  code VARCHAR(80) UNIQUE NOT NULL,
  name VARCHAR(160) NOT NULL,
  jurisdiction_rules JSONB NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- professional_specialties (Professionals domain)
CREATE TABLE IF NOT EXISTS professional_specialties (
  professional_id UUID NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  specialty_id UUID NOT NULL REFERENCES specialties(id) ON DELETE CASCADE,
  claim_basis VARCHAR(40) NOT NULL,
  verification_credential_id UUID,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (professional_id, specialty_id)
);

-- professional_services (Professionals domain)
CREATE TABLE IF NOT EXISTS professional_services (
  id UUID PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  service_type VARCHAR(80) NOT NULL,
  duration_minutes INTEGER NOT NULL,
  currency CHAR(3),
  price_minor BIGINT,
  consultation_mode VARCHAR(30) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- professional_availability (Appointments domain)
CREATE TABLE IF NOT EXISTS professional_availability (
  id UUID PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(64) NOT NULL,
  recurrence_rule TEXT,
  service_ids UUID[] NOT NULL,
  state VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_availability_dates CHECK (ends_at > starts_at)
);

-- care_match_requests (Care domain)
CREATE TABLE IF NOT EXISTS care_match_requests (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  need_taxonomy JSONB NOT NULL,
  preferences_json JSONB NOT NULL,
  risk_state_snapshot risk_state_enum NOT NULL,
  jurisdiction CHAR(2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- care_match_results (Care domain)
CREATE TABLE IF NOT EXISTS care_match_results (
  id UUID PRIMARY KEY,
  match_request_id UUID NOT NULL REFERENCES care_match_requests(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES professional_profiles(id),
  rank INTEGER NOT NULL,
  score_components JSONB NOT NULL,
  eligibility_snapshot JSONB NOT NULL,
  reason_codes TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- care_relationships (Care domain)
CREATE TABLE IF NOT EXISTS care_relationships (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES professional_profiles(id),
  state care_relationship_state_enum NOT NULL DEFAULT 'PROPOSED',
  scopes TEXT[] NOT NULL,
  consent_grant_id UUID,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- care_referrals (Care domain)
CREATE TABLE IF NOT EXISTS care_referrals (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type VARCHAR(40) NOT NULL,
  source_id UUID,
  target_type VARCHAR(40) NOT NULL,
  target_id UUID,
  reason_codes TEXT[] NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'OFFERED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- appointments (Appointments domain)
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES professional_profiles(id),
  service_id UUID NOT NULL REFERENCES professional_services(id),
  state appointment_state_enum NOT NULL DEFAULT 'REQUESTED',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  timezone_snapshot VARCHAR(64) NOT NULL,
  price_snapshot JSONB,
  idempotency_key VARCHAR(120) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- clinical_notes (Care domain)
CREATE TABLE IF NOT EXISTS clinical_notes (
  id UUID PRIMARY KEY,
  care_relationship_id UUID NOT NULL REFERENCES care_relationships(id) ON DELETE CASCADE,
  author_professional_id UUID NOT NULL,
  note_type VARCHAR(60) NOT NULL,
  ciphertext BYTEA NOT NULL,
  signed_at TIMESTAMPTZ,
  amended_from_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- organizations (Organizations domain)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY,
  organization_type VARCHAR(60) NOT NULL,
  legal_name VARCHAR(200) NOT NULL,
  country_code CHAR(2) NOT NULL,
  state VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- organization_memberships (Organizations domain)
CREATE TABLE IF NOT EXISTS organization_memberships (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_role VARCHAR(60) NOT NULL,
  scopes TEXT[] NOT NULL,
  state VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- products (Billing domain)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY,
  code VARCHAR(80) UNIQUE NOT NULL,
  name VARCHAR(160) NOT NULL,
  product_type VARCHAR(40) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- plans (Billing domain)
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  code VARCHAR(80) UNIQUE NOT NULL,
  entitlements JSONB NOT NULL DEFAULT '{}',
  state VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- prices (Billing domain)
CREATE TABLE IF NOT EXISTS prices (
  id UUID PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  country_code CHAR(2),
  currency CHAR(3) NOT NULL,
  amount_minor BIGINT NOT NULL,
  billing_period VARCHAR(20) NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- subscriptions (Billing domain)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY,
  subject_type VARCHAR(30) NOT NULL,
  subject_id UUID NOT NULL,
  plan_id UUID NOT NULL REFERENCES plans(id),
  price_id UUID NOT NULL REFERENCES prices(id),
  state subscription_state_enum NOT NULL DEFAULT 'TRIAL',
  provider_ref VARCHAR(180),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ledger_entries (Billing domain - double-entry accounting)
CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY,
  journal_id UUID NOT NULL,
  account_code VARCHAR(80) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  amount_minor BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  reference_type VARCHAR(40) NOT NULL,
  reference_id UUID NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ledger_direction CHECK (direction IN ('DEBIT', 'CREDIT'))
);

-- payments (Billing domain)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  payer_type VARCHAR(30) NOT NULL,
  payer_id UUID NOT NULL,
  amount_minor BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  provider_payment_ref VARCHAR(180),
  state VARCHAR(30) NOT NULL DEFAULT 'CREATED',
  idempotency_key VARCHAR(120) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- notifications (Notifications domain)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_code VARCHAR(80) NOT NULL,
  privacy_mode VARCHAR(20) NOT NULL DEFAULT 'MINIMAL',
  channel VARCHAR(20) NOT NULL,
  payload_json JSONB NOT NULL,
  state VARCHAR(30) NOT NULL DEFAULT 'QUEUED',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- analytics_events (Analytics domain)
CREATE TABLE IF NOT EXISTS analytics_events (
  event_id UUID PRIMARY KEY,
  event_type VARCHAR(120) NOT NULL,
  subject_pseudonym UUID,
  session_id UUID,
  domain VARCHAR(40) NOT NULL,
  object_ref_hash VARCHAR(128),
  properties JSONB NOT NULL,
  consent_context JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  schema_version INTEGER NOT NULL DEFAULT 1
);

-- outcome_observations (Analytics domain)
CREATE TABLE IF NOT EXISTS outcome_observations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  outcome_type VARCHAR(80) NOT NULL,
  measurement_json JSONB NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  baseline_ref UUID,
  methodology_version VARCHAR(40) NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- metric_definitions (Analytics domain)
CREATE TABLE IF NOT EXISTS metric_definitions (
  id UUID PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(180) NOT NULL,
  definition TEXT NOT NULL,
  formula_sql_ref VARCHAR(255),
  privacy_class VARCHAR(40) NOT NULL,
  owner VARCHAR(100) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at TIMESTAMPTZ
);

-- audit_events (Audit domain - append only)
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY,
  actor_type VARCHAR(40) NOT NULL,
  actor_id UUID,
  action VARCHAR(120) NOT NULL,
  resource_type VARCHAR(80) NOT NULL,
  resource_id UUID,
  purpose VARCHAR(120) NOT NULL,
  authorization_basis JSONB NOT NULL,
  result VARCHAR(30) NOT NULL,
  request_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  integrity_hash CHAR(64) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_occurred ON audit_events(occurred_at);

-- break_glass_events (Audit domain)
CREATE TABLE IF NOT EXISTS break_glass_events (
  id UUID PRIMARY KEY,
  actor_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  reason_code VARCHAR(80) NOT NULL,
  justification TEXT NOT NULL,
  requested_scope TEXT[] NOT NULL,
  approved_scope TEXT[] NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  post_review_status VARCHAR(40) NOT NULL DEFAULT 'REVIEW_REQUIRED'
);

-- processing_activities (Privacy Governance domain)
CREATE TABLE IF NOT EXISTS processing_activities (
  id UUID PRIMARY KEY,
  code VARCHAR(80) UNIQUE NOT NULL,
  name VARCHAR(180) NOT NULL,
  purpose TEXT NOT NULL,
  data_categories TEXT[] NOT NULL,
  data_subjects TEXT[] NOT NULL,
  lawful_basis_json JSONB NOT NULL,
  processors UUID[] NOT NULL DEFAULT '{}',
  processing_locations TEXT[] NOT NULL,
  retention_policy_id UUID,
  risk_flags TEXT[] NOT NULL DEFAULT '{}',
  owner VARCHAR(100) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- dpia_assessments (Privacy Governance domain)
CREATE TABLE IF NOT EXISTS dpia_assessments (
  id UUID PRIMARY KEY,
  processing_activity_id UUID NOT NULL REFERENCES processing_activities(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  state dpia_state_enum NOT NULL DEFAULT 'DRAFT',
  necessity_proportionality JSONB NOT NULL,
  risk_register JSONB NOT NULL,
  residual_risk VARCHAR(30) NOT NULL,
  required_controls JSONB NOT NULL,
  reviewer_id UUID,
  approved_at TIMESTAMPTZ,
  review_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- privacy_rights_requests (Privacy Governance domain)
CREATE TABLE IF NOT EXISTS privacy_rights_requests (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type VARCHAR(50) NOT NULL,
  state VARCHAR(40) NOT NULL DEFAULT 'RECEIVED',
  jurisdiction CHAR(2) NOT NULL DEFAULT 'KE',
  scope_json JSONB NOT NULL,
  decision_reason TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- vendors (Privacy Governance domain)
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY,
  legal_name VARCHAR(200) NOT NULL,
  service_type VARCHAR(80) NOT NULL,
  countries TEXT[] NOT NULL,
  data_categories TEXT[] NOT NULL,
  subprocessors_json JSONB NOT NULL,
  dpa_evidence_id UUID,
  security_review_status VARCHAR(40) NOT NULL,
  privacy_review_status VARCHAR(40) NOT NULL,
  approved_until DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- jurisdictions (Regulatory Governance domain)
CREATE TABLE IF NOT EXISTS jurisdictions (
  id UUID PRIMARY KEY,
  country_code CHAR(2) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  profile_version INTEGER NOT NULL DEFAULT 1,
  state VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  review_due_at TIMESTAMPTZ
);

-- regulatory_sources (Regulatory Governance domain)
CREATE TABLE IF NOT EXISTS regulatory_sources (
  id UUID PRIMARY KEY,
  jurisdiction_id UUID NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  citation TEXT NOT NULL,
  authority VARCHAR(180) NOT NULL,
  source_url TEXT NOT NULL,
  effective_from DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  content_hash CHAR(64),
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- regulatory_requirements (Regulatory Governance domain)
CREATE TABLE IF NOT EXISTS regulatory_requirements (
  id UUID PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES regulatory_sources(id) ON DELETE CASCADE,
  code VARCHAR(100) UNIQUE NOT NULL,
  requirement_text TEXT NOT NULL,
  applies_when JSONB NOT NULL,
  required_evidence JSONB NOT NULL,
  severity VARCHAR(30) NOT NULL,
  owner_role VARCHAR(60) NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at TIMESTAMPTZ
);

-- regulatory_classifications (Regulatory Governance domain)
CREATE TABLE IF NOT EXISTS regulatory_classifications (
  id UUID PRIMARY KEY,
  feature_key VARCHAR(120) NOT NULL,
  jurisdiction_id UUID NOT NULL REFERENCES jurisdictions(id),
  state regulatory_review_state_enum NOT NULL DEFAULT 'NOT_ASSESSED',
  scope_statement TEXT NOT NULL,
  applicable_requirements UUID[] NOT NULL DEFAULT '{}',
  conditions_json JSONB NOT NULL DEFAULT '{}',
  legal_review_evidence_id UUID,
  reviewer_id UUID,
  approved_at TIMESTAMPTZ,
  review_due_at TIMESTAMPTZ,
  UNIQUE(feature_key, jurisdiction_id)
);

-- clinical_artifacts (Clinical Governance domain)
CREATE TABLE IF NOT EXISTS clinical_artifacts (
  id UUID PRIMARY KEY,
  artifact_type VARCHAR(60) NOT NULL,
  artifact_key VARCHAR(120) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  clinical_domain VARCHAR(80) NOT NULL,
  impact_class VARCHAR(10) NOT NULL, -- CR-0..CR-3
  evidence_level VARCHAR(40) NOT NULL,
  state clinical_artifact_state_enum NOT NULL DEFAULT 'DRAFT',
  owner VARCHAR(100) NOT NULL,
  review_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(artifact_key, version)
);

-- clinical_evidence (Clinical Governance domain)
CREATE TABLE IF NOT EXISTS clinical_evidence (
  id UUID PRIMARY KEY,
  artifact_id UUID REFERENCES clinical_artifacts(id) ON DELETE CASCADE,
  source_type VARCHAR(40) NOT NULL,
  citation TEXT NOT NULL,
  source_url TEXT,
  publication_date DATE,
  jurisdictions TEXT[] NOT NULL DEFAULT '{"KE"}',
  reviewer_summary TEXT NOT NULL,
  reviewed_by UUID NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_review_at TIMESTAMPTZ
);

-- clinical_reviews (Clinical Governance domain)
CREATE TABLE IF NOT EXISTS clinical_reviews (
  id UUID PRIMARY KEY,
  artifact_id UUID NOT NULL REFERENCES clinical_artifacts(id) ON DELETE CASCADE,
  review_type VARCHAR(40) NOT NULL,
  assigned_reviewer_id UUID NOT NULL,
  decision governance_decision_enum,
  required_changes JSONB NOT NULL DEFAULT '{}',
  evidence_refs UUID[] NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

-- clinical_incidents (Clinical Governance domain)
CREATE TABLE IF NOT EXISTS clinical_incidents (
  id UUID PRIMARY KEY,
  source_type VARCHAR(40) NOT NULL,
  source_id UUID,
  severity VARCHAR(20) NOT NULL,
  summary TEXT NOT NULL,
  state VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  owner_id UUID NOT NULL,
  root_cause_json JSONB,
  corrective_actions JSONB NOT NULL DEFAULT '{}',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- ai_systems (AI Safety Governance domain)
CREATE TABLE IF NOT EXISTS ai_systems (
  id UUID PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(180) NOT NULL,
  purpose TEXT NOT NULL,
  risk_class VARCHAR(10) NOT NULL, -- AI-R0..AI-R4
  data_access_categories TEXT[] NOT NULL DEFAULT '{}',
  tool_permissions TEXT[] NOT NULL DEFAULT '{}',
  jurisdictions TEXT[] NOT NULL DEFAULT '{"KE"}',
  state ai_system_state_enum NOT NULL DEFAULT 'DRAFT',
  owner VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ai_models (AI Safety Governance domain)
CREATE TABLE IF NOT EXISTS ai_models (
  id UUID PRIMARY KEY,
  provider_vendor_id UUID,
  provider_model_key VARCHAR(160) NOT NULL,
  capability_class TEXT[] NOT NULL,
  data_policy_snapshot JSONB NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ai_safety_policies (AI Safety Governance domain)
CREATE TABLE IF NOT EXISTS ai_safety_policies (
  id UUID PRIMARY KEY,
  code VARCHAR(100) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  policy_schema JSONB NOT NULL,
  human_policy_text TEXT NOT NULL,
  clinical_artifact_id UUID REFERENCES clinical_artifacts(id),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at TIMESTAMPTZ,
  UNIQUE(code, version)
);

-- prompt_versions (AI Safety Governance domain)
CREATE TABLE IF NOT EXISTS prompt_versions (
  id UUID PRIMARY KEY,
  prompt_key VARCHAR(100) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  layer VARCHAR(30) NOT NULL,
  template_text TEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  clinical_artifact_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(prompt_key, version)
);

-- ai_system_versions (AI Safety Governance domain)
CREATE TABLE IF NOT EXISTS ai_system_versions (
  id UUID PRIMARY KEY,
  ai_system_id UUID NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  model_id UUID NOT NULL REFERENCES ai_models(id),
  prompt_bundle_id UUID NOT NULL,
  safety_policy_id UUID NOT NULL REFERENCES ai_safety_policies(id),
  retrieval_policy_id UUID,
  tool_manifest JSONB NOT NULL DEFAULT '{}',
  state ai_system_state_enum NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ai_system_id, version)
);

-- ai_evaluation_runs (AI Safety Governance domain)
CREATE TABLE IF NOT EXISTS ai_evaluation_runs (
  id UUID PRIMARY KEY,
  ai_system_version_id UUID NOT NULL REFERENCES ai_system_versions(id) ON DELETE CASCADE,
  suite_version VARCHAR(60) NOT NULL,
  environment VARCHAR(30) NOT NULL,
  metrics_json JSONB NOT NULL,
  critical_failures JSONB NOT NULL,
  decision governance_decision_enum,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ai_incidents (AI Safety Governance domain)
CREATE TABLE IF NOT EXISTS ai_incidents (
  id UUID PRIMARY KEY,
  ai_system_version_id UUID NOT NULL REFERENCES ai_system_versions(id) ON DELETE CASCADE,
  incident_type VARCHAR(60) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  source_ref UUID,
  state VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  kill_switch_action VARCHAR(40) DEFAULT 'NONE',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- governance_work_items (Governance domain)
CREATE TABLE IF NOT EXISTS governance_work_items (
  id UUID PRIMARY KEY,
  feature_key VARCHAR(120) NOT NULL,
  review_type VARCHAR(50) NOT NULL,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  state VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  owner_role VARCHAR(60) NOT NULL,
  linked_review_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- governance_evidence (Governance domain)
CREATE TABLE IF NOT EXISTS governance_evidence (
  id UUID PRIMARY KEY,
  evidence_type VARCHAR(60) NOT NULL,
  object_storage_key TEXT,
  external_source_url TEXT,
  content_hash CHAR(64) NOT NULL,
  classification VARCHAR(40) NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- release_authorizations (Governance domain)
CREATE TABLE IF NOT EXISTS release_authorizations (
  id UUID PRIMARY KEY,
  release_id VARCHAR(120) UNIQUE NOT NULL,
  feature_keys TEXT[] NOT NULL,
  clinical_status VARCHAR(30) NOT NULL,
  dpia_status VARCHAR(30) NOT NULL,
  regulatory_status VARCHAR(30) NOT NULL,
  ai_safety_status VARCHAR(30) NOT NULL,
  security_status VARCHAR(30) NOT NULL,
  qa_status VARCHAR(30) NOT NULL,
  evidence_refs UUID[] NOT NULL DEFAULT '{}',
  authorized_by UUID[] NOT NULL DEFAULT '{}',
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- transactional_outbox (Platform event outbox)
CREATE TABLE IF NOT EXISTS transactional_outbox (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON transactional_outbox(status);
