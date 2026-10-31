-- ==============================================================================
-- MINDOS CANONICAL MIGRATION: 014_canonical_assessments_and_screening.sql
-- ==============================================================================
-- Purpose: Formalize Clinical Assessment & Screening Engine persistence:
--          Assessment Definitions, Immutable Assessment Versions, Sections,
--          Questions, Options, Eligibility Policies, Retake Policies,
--          Assessment Sessions, Responses, Deterministic Scoring Models,
--          Scores, Interpretation Models, Score Bands, Results, and Safety Rules.
-- Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
--            Clinical Safety Policy Catalogue (R-SAFE-001, POL-SAFE-001)
--            Kenya Data Protection Act 2019, Digital Health Act 2023
-- Sprint 15: Assessment Registry, Instrument Versioning, Session Execution,
--            Scoring, Interpretation, Clinical Governance & Safety Integration
-- Strategy: Additive expand phase (100% backwards compatible).
-- ==============================================================================

-- UP --

-- 1. Assessment Definitions (Logical Instruments)
CREATE TABLE IF NOT EXISTS assessment_definitions (
  id UUID PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  assessment_type VARCHAR(60) NOT NULL,
  owner_domain VARCHAR(80) NOT NULL DEFAULT 'clinical',
  owner VARCHAR(80) NOT NULL DEFAULT 'CLINICAL_COMMITTEE',
  clinical_artifact_id UUID,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  default_language VARCHAR(10) NOT NULL DEFAULT 'en',
  retake_policy_id UUID,
  eligibility_policy_id UUID,
  active_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Legacy Sprint-1 compatibility: expand the original assessment_definitions table
-- in place instead of assuming CREATE TABLE IF NOT EXISTS upgrades its shape.
ALTER TABLE assessment_definitions
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS assessment_type VARCHAR(60),
  ADD COLUMN IF NOT EXISTS owner_domain VARCHAR(80) NOT NULL DEFAULT 'clinical',
  ADD COLUMN IF NOT EXISTS owner VARCHAR(80) NOT NULL DEFAULT 'CLINICAL_COMMITTEE',
  ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS default_language VARCHAR(10) NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS retake_policy_id UUID,
  ADD COLUMN IF NOT EXISTS eligibility_policy_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE assessment_definitions
SET assessment_type = COALESCE(assessment_type, assessment_kind, 'SCREENING')
WHERE assessment_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_assessment_defs_code ON assessment_definitions(code);
CREATE INDEX IF NOT EXISTS idx_assessment_defs_status ON assessment_definitions(status);

-- 2. Assessment Versions (Immutable Governed Versions)
CREATE TABLE IF NOT EXISTS assessment_versions (
  id UUID PRIMARY KEY,
  assessment_definition_id UUID NOT NULL REFERENCES assessment_definitions(id) ON DELETE CASCADE,
  version INT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  clinical_artifact_version INT NOT NULL DEFAULT 1,
  title VARCHAR(255) NOT NULL,
  instructions TEXT,
  population JSONB NOT NULL DEFAULT '{"min_age": 18, "max_age": 120}',
  jurisdictions JSONB NOT NULL DEFAULT '["KE"]',
  estimated_duration_minutes INT NOT NULL DEFAULT 5,
  scoring_model_version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  interpretation_model_version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  supersedes_id UUID REFERENCES assessment_versions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_assessment_version UNIQUE (assessment_definition_id, version)
);


-- Expand/backfill the legacy Sprint-1 assessment_versions shape.
ALTER TABLE assessment_versions
  ADD COLUMN IF NOT EXISTS assessment_definition_id UUID,
  ADD COLUMN IF NOT EXISTS clinical_artifact_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS instructions TEXT,
  ADD COLUMN IF NOT EXISTS population JSONB NOT NULL DEFAULT '{"min_age": 18, "max_age": 120}',
  ADD COLUMN IF NOT EXISTS jurisdictions JSONB NOT NULL DEFAULT '["KE"]',
  ADD COLUMN IF NOT EXISTS estimated_duration_minutes INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS scoring_model_version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS interpretation_model_version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS supersedes_id UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE assessment_versions
SET assessment_definition_id = COALESCE(assessment_definition_id, assessment_id),
    title = COALESCE(title, 'Legacy assessment version ' || version::text)
WHERE assessment_definition_id IS NULL OR title IS NULL;
ALTER TABLE assessment_versions
  ALTER COLUMN assessment_definition_id SET NOT NULL,
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN assessment_id DROP NOT NULL,
  ALTER COLUMN question_schema DROP NOT NULL,
  ALTER COLUMN scoring_schema DROP NOT NULL,
  ALTER COLUMN interpretation_schema DROP NOT NULL,
  ALTER COLUMN limitations DROP NOT NULL;


CREATE INDEX IF NOT EXISTS idx_assessment_versions_def ON assessment_versions(assessment_definition_id);
CREATE INDEX IF NOT EXISTS idx_assessment_versions_status ON assessment_versions(status);

-- 3. Assessment Sections (Structural hierarchy)
CREATE TABLE IF NOT EXISTS assessment_sections (
  id UUID PRIMARY KEY,
  assessment_version_id UUID NOT NULL REFERENCES assessment_versions(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  position INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_section_code UNIQUE (assessment_version_id, code)
);

CREATE INDEX IF NOT EXISTS idx_assessment_sections_version ON assessment_sections(assessment_version_id);

-- 4. Assessment Questions (Governed items)
CREATE TABLE IF NOT EXISTS assessment_questions (
  id UUID PRIMARY KEY,
  assessment_version_id UUID NOT NULL REFERENCES assessment_versions(id) ON DELETE CASCADE,
  section_id UUID REFERENCES assessment_sections(id),
  question_code VARCHAR(80) NOT NULL,
  position INT NOT NULL,
  prompt TEXT NOT NULL,
  help_text TEXT,
  question_type VARCHAR(40) NOT NULL,
  required BOOLEAN NOT NULL DEFAULT true,
  response_schema JSONB NOT NULL DEFAULT '{}',
  clinical_significance VARCHAR(80),
  safety_significance VARCHAR(80),
  scoring_key_reference VARCHAR(80),
  visibility_rule JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_question_code UNIQUE (assessment_version_id, question_code)
);

CREATE INDEX IF NOT EXISTS idx_assessment_questions_version ON assessment_questions(assessment_version_id);
CREATE INDEX IF NOT EXISTS idx_assessment_questions_pos ON assessment_questions(assessment_version_id, position);

-- 5. Assessment Options (Governed choices)
CREATE TABLE IF NOT EXISTS assessment_options (
  id UUID PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
  option_code VARCHAR(80) NOT NULL,
  label VARCHAR(255) NOT NULL,
  position INT NOT NULL,
  score_value NUMERIC(10,2),
  safety_trigger_reference VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_option_code UNIQUE (question_id, option_code)
);

CREATE INDEX IF NOT EXISTS idx_assessment_options_question ON assessment_options(question_id);

-- 6. Assessment Eligibility Policies
CREATE TABLE IF NOT EXISTS assessment_eligibility_policies (
  id UUID PRIMARY KEY,
  assessment_definition_id UUID NOT NULL REFERENCES assessment_definitions(id) ON DELETE CASCADE,
  min_age INT NOT NULL DEFAULT 18,
  max_age INT NOT NULL DEFAULT 120,
  allowed_jurisdictions JSONB NOT NULL DEFAULT '["KE"]',
  required_consents JSONB NOT NULL DEFAULT '["CONSENT_CLINICAL_SCREENING"]',
  excluded_risk_states JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_eligibility_def ON assessment_eligibility_policies(assessment_definition_id);

-- 7. Assessment Retake Policies
CREATE TABLE IF NOT EXISTS assessment_retake_policies (
  id UUID PRIMARY KEY,
  assessment_definition_id UUID NOT NULL REFERENCES assessment_definitions(id) ON DELETE CASCADE,
  minimum_interval_days INT NOT NULL DEFAULT 14,
  recommended_interval_days INT NOT NULL DEFAULT 14,
  max_frequency_per_year INT,
  allow_early_retake BOOLEAN NOT NULL DEFAULT false,
  early_retake_conditions JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_retake_def ON assessment_retake_policies(assessment_definition_id);

-- 8. Assessment Sessions (One execution attempt)
CREATE TABLE IF NOT EXISTS assessment_sessions (
  id UUID PRIMARY KEY,
  assessment_definition_id UUID NOT NULL REFERENCES assessment_definitions(id),
  assessment_version_id UUID NOT NULL REFERENCES assessment_versions(id),
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(40) NOT NULL DEFAULT 'CREATED',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  abandoned_at TIMESTAMPTZ,
  current_section VARCHAR(80),
  current_question VARCHAR(80),
  progress NUMERIC(5,2) NOT NULL DEFAULT 0.0,
  eligibility_snapshot JSONB NOT NULL DEFAULT '{}',
  consent_snapshot_reference VARCHAR(255),
  session_version INT NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Expand/backfill the legacy Sprint-1 assessment_sessions shape.
ALTER TABLE assessment_sessions
  ADD COLUMN IF NOT EXISTS assessment_definition_id UUID,
  ADD COLUMN IF NOT EXISTS subject_user_id UUID,
  ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'CREATED',
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_section VARCHAR(80),
  ADD COLUMN IF NOT EXISTS current_question VARCHAR(80),
  ADD COLUMN IF NOT EXISTS progress NUMERIC(5,2) NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS eligibility_snapshot JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS consent_snapshot_reference VARCHAR(255),
  ADD COLUMN IF NOT EXISTS session_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE assessment_sessions s
SET subject_user_id = COALESCE(s.subject_user_id, s.user_id),
    assessment_definition_id = COALESCE(s.assessment_definition_id, v.assessment_definition_id),
    status = COALESCE(s.status, s.state::text),
    expires_at = COALESCE(s.expires_at, s.started_at + INTERVAL '24 hours')
FROM assessment_versions v
WHERE s.assessment_version_id = v.id
  AND (s.subject_user_id IS NULL OR s.assessment_definition_id IS NULL OR s.expires_at IS NULL);
ALTER TABLE assessment_sessions
  ALTER COLUMN subject_user_id SET NOT NULL,
  ALTER COLUMN assessment_definition_id SET NOT NULL,
  ALTER COLUMN expires_at SET NOT NULL,
  ALTER COLUMN user_id DROP NOT NULL;


CREATE INDEX IF NOT EXISTS idx_assessment_sessions_subject ON assessment_sessions(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_status ON assessment_sessions(status);
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_version ON assessment_sessions(assessment_version_id);

-- 9. Assessment Responses (Health-sensitive validated answers)
CREATE TABLE IF NOT EXISTS assessment_responses (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES assessment_questions(id),
  response_value JSONB NOT NULL,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR(40) NOT NULL DEFAULT 'USER_DIRECT',
  validation_status VARCHAR(40) NOT NULL DEFAULT 'VALID',
  CONSTRAINT uq_session_question UNIQUE (session_id, question_id)
);


-- Expand the legacy Sprint-1 response shape. Legacy-only required columns are
-- relaxed so new canonical writers do not have to fabricate obsolete values.
ALTER TABLE assessment_responses
  ADD COLUMN IF NOT EXISTS question_id UUID,
  ADD COLUMN IF NOT EXISTS response_value JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS validation_status VARCHAR(40) NOT NULL DEFAULT 'VALID';
UPDATE assessment_responses
SET response_value = COALESCE(response_value, answer_json)
WHERE response_value IS NULL;
ALTER TABLE assessment_responses
  ALTER COLUMN item_key DROP NOT NULL,
  ALTER COLUMN answer_json DROP NOT NULL;


CREATE INDEX IF NOT EXISTS idx_assessment_responses_session ON assessment_responses(session_id);

-- 10. Assessment Scoring Models (Deterministic algorithms)
CREATE TABLE IF NOT EXISTS assessment_scoring_models (
  id UUID PRIMARY KEY,
  assessment_version_id UUID NOT NULL REFERENCES assessment_versions(id) ON DELETE CASCADE,
  version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  scoring_type VARCHAR(60) NOT NULL DEFAULT 'SUM',
  algorithm_reference VARCHAR(120) NOT NULL,
  configuration JSONB NOT NULL DEFAULT '{}',
  clinical_artifact_reference VARCHAR(120),
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_scoring_models_version ON assessment_scoring_models(assessment_version_id);

-- 11. Assessment Scores (Deterministic score computation)
CREATE TABLE IF NOT EXISTS assessment_scores (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  scoring_model_version VARCHAR(40) NOT NULL,
  raw_score NUMERIC(10,2) NOT NULL,
  normalized_score NUMERIC(10,2),
  subscores JSONB NOT NULL DEFAULT '{}',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  calculation_hash VARCHAR(64) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'COMPUTED'
);

CREATE INDEX IF NOT EXISTS idx_assessment_scores_session ON assessment_scores(session_id);

-- 12. Assessment Interpretation Models
CREATE TABLE IF NOT EXISTS assessment_interpretation_models (
  id UUID PRIMARY KEY,
  assessment_version_id UUID NOT NULL REFERENCES assessment_versions(id) ON DELETE CASCADE,
  version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  interpretation_rules JSONB NOT NULL DEFAULT '[]',
  clinical_artifact_reference VARCHAR(120),
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_interpretation_models_ver ON assessment_interpretation_models(assessment_version_id);

-- 13. Assessment Score Bands (Clinically approved score boundaries)
CREATE TABLE IF NOT EXISTS assessment_score_bands (
  id UUID PRIMARY KEY,
  interpretation_model_id UUID NOT NULL REFERENCES assessment_interpretation_models(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  minimum NUMERIC(10,2) NOT NULL,
  maximum NUMERIC(10,2) NOT NULL,
  label VARCHAR(255) NOT NULL,
  user_message TEXT NOT NULL,
  professional_message TEXT,
  clinical_significance VARCHAR(120) NOT NULL,
  safety_behavior_reference VARCHAR(120),
  position INT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_assessment_score_bands_model ON assessment_score_bands(interpretation_model_id);

-- 14. Assessment Results (Immutable outcome)
CREATE TABLE IF NOT EXISTS assessment_results (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  assessment_definition_id UUID NOT NULL REFERENCES assessment_definitions(id),
  assessment_version_id UUID NOT NULL REFERENCES assessment_versions(id),
  score_id UUID NOT NULL REFERENCES assessment_scores(id),
  interpretation_model_version VARCHAR(40) NOT NULL,
  result_code VARCHAR(80) NOT NULL,
  result_band VARCHAR(120) NOT NULL,
  summary_text TEXT NOT NULL,
  limitations TEXT NOT NULL,
  clinical_artifact_reference VARCHAR(120),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  status VARCHAR(40) NOT NULL DEFAULT 'VALID',
  invalidation_reason VARCHAR(80),
  invalidated_by UUID REFERENCES users(id),
  invalidated_at TIMESTAMPTZ,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Expand/backfill the legacy Sprint-1 assessment_results shape.
ALTER TABLE assessment_results
  ADD COLUMN IF NOT EXISTS assessment_definition_id UUID,
  ADD COLUMN IF NOT EXISTS assessment_version_id UUID,
  ADD COLUMN IF NOT EXISTS score_id UUID,
  ADD COLUMN IF NOT EXISTS interpretation_model_version VARCHAR(40),
  ADD COLUMN IF NOT EXISTS result_code VARCHAR(80),
  ADD COLUMN IF NOT EXISTS summary_text TEXT,
  ADD COLUMN IF NOT EXISTS limitations TEXT,
  ADD COLUMN IF NOT EXISTS clinical_artifact_reference VARCHAR(120),
  ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'VALID',
  ADD COLUMN IF NOT EXISTS invalidated_by UUID,
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE assessment_results r
SET assessment_definition_id = COALESCE(r.assessment_definition_id, s.assessment_definition_id),
    assessment_version_id = COALESCE(r.assessment_version_id, s.assessment_version_id),
    interpretation_model_version = COALESCE(r.interpretation_model_version, r.interpretation_version),
    result_code = COALESCE(r.result_code, r.result_band, 'LEGACY_RESULT'),
    summary_text = COALESCE(r.summary_text, 'Legacy assessment result'),
    limitations = COALESCE(r.limitations, 'Legacy result imported before canonical Sprint-15 schema.')
FROM assessment_sessions s
WHERE r.session_id = s.id;
ALTER TABLE assessment_results
  ALTER COLUMN raw_score_json DROP NOT NULL,
  ALTER COLUMN interpretation_version DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assessment_results_session ON assessment_results(session_id);
CREATE INDEX IF NOT EXISTS idx_assessment_results_def ON assessment_results(assessment_definition_id);
CREATE INDEX IF NOT EXISTS idx_assessment_results_status ON assessment_results(status);

-- 15. Assessment Safety Rules (Direct item safety triggers)
CREATE TABLE IF NOT EXISTS assessment_safety_rules (
  id UUID PRIMARY KEY,
  assessment_version_id UUID NOT NULL REFERENCES assessment_versions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES assessment_questions(id),
  condition JSONB NOT NULL,
  signal_code VARCHAR(80) NOT NULL,
  severity VARCHAR(30) NOT NULL,
  confidence VARCHAR(30) NOT NULL,
  clinical_policy_reference VARCHAR(120) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_safety_rules_ver ON assessment_safety_rules(assessment_version_id);
CREATE INDEX IF NOT EXISTS idx_assessment_safety_rules_q ON assessment_safety_rules(question_id);
