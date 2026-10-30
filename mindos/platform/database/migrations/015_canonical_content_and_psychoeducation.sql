-- ==============================================================================
-- MINDOS CANONICAL MIGRATION: 015_canonical_content_and_psychoeducation.sql
-- ==============================================================================
-- Purpose: Formalize Governed Content & Psychoeducation Engine persistence:
--          Content Definitions, Immutable Content Versions, Content Blocks,
--          Taxonomies & Term Assignments, Localizations, Guided Exercises,
--          Exercise Steps & Sessions, Collections & Collection Items,
--          Content Progress, Bookmarks, Content Issues, and Governed Claims.
-- Authority: Master Architecture Index Section 8, Volumes I, III, XVI & Appendices B / C / Q
--            Clinical Safety Policy Catalogue (R-SAFE-001, R-SAFE-002, POL-SAFE-001)
--            Kenya Data Protection Act 2019, Digital Health Act 2023
-- Sprint 16: Content Registry, Editorial & Clinical Governance, Localization,
--            Guided Exercises, Collections, Search & Discovery, AI Retrieval Port
-- Strategy: Additive expand phase (100% backwards compatible).
-- ==============================================================================

-- UP --

-- 1. Content Definitions (Logical Content Records)
CREATE TABLE IF NOT EXISTS content_definitions (
  id UUID PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  content_type VARCHAR(60) NOT NULL,
  canonical_title VARCHAR(255) NOT NULL,
  description TEXT,
  owner_domain VARCHAR(80) NOT NULL DEFAULT 'content',
  owner_id VARCHAR(80) NOT NULL DEFAULT 'EDITORIAL_BOARD',
  primary_topic VARCHAR(80) NOT NULL,
  audience VARCHAR(60) NOT NULL DEFAULT 'GENERAL_ADULT',
  clinical_relevance VARCHAR(40) NOT NULL DEFAULT 'INFORMATIONAL',
  risk_classification VARCHAR(40) NOT NULL DEFAULT 'INFORMATIONAL',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  active_version_id UUID,
  default_locale VARCHAR(10) NOT NULL DEFAULT 'en-KE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_defs_code ON content_definitions(code);
CREATE INDEX IF NOT EXISTS idx_content_defs_type ON content_definitions(content_type);
CREATE INDEX IF NOT EXISTS idx_content_defs_topic ON content_definitions(primary_topic);
CREATE INDEX IF NOT EXISTS idx_content_defs_status ON content_definitions(status);

-- 2. Content Versions (Immutable Governed Content Versions)
CREATE TABLE IF NOT EXISTS content_versions (
  id UUID PRIMARY KEY,
  content_definition_id UUID NOT NULL REFERENCES content_definitions(id) ON DELETE CASCADE,
  version INT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  title VARCHAR(255) NOT NULL,
  summary TEXT,
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  locale VARCHAR(20) NOT NULL DEFAULT 'en-KE',
  jurisdiction VARCHAR(10) NOT NULL DEFAULT 'KE',
  audience VARCHAR(60) NOT NULL DEFAULT 'GENERAL_ADULT',
  body_structure JSONB NOT NULL DEFAULT '{"blocks": []}',
  estimated_reading_time_minutes INT NOT NULL DEFAULT 3,
  estimated_completion_time_minutes INT,
  clinical_artifact_id UUID,
  clinical_artifact_version INT,
  privacy_processing_reference VARCHAR(100),
  regulatory_reference VARCHAR(100),
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_by VARCHAR(100) NOT NULL DEFAULT 'content_author',
  supersedes_id UUID REFERENCES content_versions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_content_version UNIQUE (content_definition_id, version)
);

CREATE INDEX IF NOT EXISTS idx_content_versions_def ON content_versions(content_definition_id);
CREATE INDEX IF NOT EXISTS idx_content_versions_status ON content_versions(status);
CREATE INDEX IF NOT EXISTS idx_content_versions_clin_art ON content_versions(clinical_artifact_id);

-- 3. Content Blocks (Atomic structured content elements)
CREATE TABLE IF NOT EXISTS content_blocks (
  id UUID PRIMARY KEY,
  content_version_id UUID NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
  block_type VARCHAR(60) NOT NULL,
  position INT NOT NULL,
  structured_content JSONB NOT NULL DEFAULT '{}',
  accessibility_metadata JSONB NOT NULL DEFAULT '{}',
  clinical_significance VARCHAR(100),
  safety_significance VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_blocks_ver ON content_blocks(content_version_id, position);

-- 4. Content Taxonomies & Controlled Vocabularies
CREATE TABLE IF NOT EXISTS content_taxonomies (
  id UUID PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  taxonomy_type VARCHAR(60) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content_taxonomy_terms (
  id UUID PRIMARY KEY,
  taxonomy_id UUID NOT NULL REFERENCES content_taxonomies(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(255) NOT NULL,
  parent_term_id UUID REFERENCES content_taxonomy_terms(id),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_taxonomy_term_code UNIQUE (taxonomy_id, code)
);

CREATE INDEX IF NOT EXISTS idx_taxonomy_terms_tax ON content_taxonomy_terms(taxonomy_id);

-- 5. Content Term Assignments
CREATE TABLE IF NOT EXISTS content_term_assignments (
  id UUID PRIMARY KEY,
  content_definition_id UUID NOT NULL REFERENCES content_definitions(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES content_taxonomy_terms(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_content_term UNIQUE (content_definition_id, term_id)
);

CREATE INDEX IF NOT EXISTS idx_term_assignments_def ON content_term_assignments(content_definition_id);
CREATE INDEX IF NOT EXISTS idx_term_assignments_term ON content_term_assignments(term_id);

-- 6. Content Localizations
CREATE TABLE IF NOT EXISTS content_localizations (
  id UUID PRIMARY KEY,
  content_definition_id UUID NOT NULL REFERENCES content_definitions(id) ON DELETE CASCADE,
  source_version_id UUID NOT NULL REFERENCES content_versions(id),
  locale VARCHAR(20) NOT NULL,
  language VARCHAR(10) NOT NULL,
  jurisdiction VARCHAR(10) NOT NULL DEFAULT 'KE',
  localized_version INT NOT NULL DEFAULT 1,
  title VARCHAR(255) NOT NULL,
  summary TEXT,
  body_structure JSONB NOT NULL DEFAULT '{"blocks": []}',
  translation_method VARCHAR(40) NOT NULL DEFAULT 'HUMAN',
  review_status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  translator_reference VARCHAR(100),
  reviewer_reference VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_content_localization UNIQUE (content_definition_id, locale, localized_version)
);

CREATE INDEX IF NOT EXISTS idx_content_loc_def ON content_localizations(content_definition_id, locale);

-- 7. Guided Exercises
CREATE TABLE IF NOT EXISTS guided_exercises (
  id UUID PRIMARY KEY,
  content_definition_id UUID NOT NULL REFERENCES content_definitions(id) ON DELETE CASCADE,
  content_version_id UUID NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
  exercise_type VARCHAR(60) NOT NULL,
  goal VARCHAR(255) NOT NULL,
  estimated_duration_seconds INT NOT NULL DEFAULT 300,
  steps JSONB NOT NULL DEFAULT '[]',
  eligibility_policy JSONB NOT NULL DEFAULT '{}',
  safety_policy JSONB NOT NULL DEFAULT '{}',
  completion_policy JSONB NOT NULL DEFAULT '{}',
  clinical_artifact_reference VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guided_exercises_def ON guided_exercises(content_definition_id);
CREATE INDEX IF NOT EXISTS idx_guided_exercises_ver ON guided_exercises(content_version_id);

-- 8. Guided Exercise Sessions
CREATE TABLE IF NOT EXISTS exercise_sessions (
  id UUID PRIMARY KEY,
  subject_user_id VARCHAR(100) NOT NULL,
  exercise_id UUID NOT NULL REFERENCES guided_exercises(id) ON DELETE CASCADE,
  content_version_id UUID NOT NULL REFERENCES content_versions(id),
  status VARCHAR(40) NOT NULL DEFAULT 'CREATED',
  current_step INT NOT NULL DEFAULT 0,
  progress_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  responses JSONB NOT NULL DEFAULT '[]',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  abandoned_at TIMESTAMPTZ,
  context_reference JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exercise_sessions_user ON exercise_sessions(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_exercise_sessions_status ON exercise_sessions(status);

-- 9. Content Collections
CREATE TABLE IF NOT EXISTS content_collections (
  id UUID PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  collection_type VARCHAR(60) NOT NULL DEFAULT 'CURATED',
  ordering_mode VARCHAR(40) NOT NULL DEFAULT 'FREE_ORDER',
  audience VARCHAR(60) NOT NULL DEFAULT 'GENERAL_ADULT',
  jurisdiction VARCHAR(10) NOT NULL DEFAULT 'KE',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content_collection_items (
  id UUID PRIMARY KEY,
  collection_id UUID NOT NULL REFERENCES content_collections(id) ON DELETE CASCADE,
  content_definition_id UUID NOT NULL REFERENCES content_definitions(id) ON DELETE CASCADE,
  position INT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT true,
  prerequisite_rule JSONB NOT NULL DEFAULT '{}',
  availability_rule JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_collection_item UNIQUE (collection_id, content_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_items_coll ON content_collection_items(collection_id, position);

-- 10. Content Progress & History
CREATE TABLE IF NOT EXISTS content_progress (
  id UUID PRIMARY KEY,
  subject_user_id VARCHAR(100) NOT NULL,
  content_definition_id UUID NOT NULL REFERENCES content_definitions(id) ON DELETE CASCADE,
  content_version_id UUID NOT NULL REFERENCES content_versions(id),
  status VARCHAR(40) NOT NULL DEFAULT 'NOT_STARTED',
  progress_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  last_position INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_content_progress UNIQUE (subject_user_id, content_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_content_progress_user ON content_progress(subject_user_id);

-- 11. Content Bookmarks
CREATE TABLE IF NOT EXISTS content_bookmarks (
  id UUID PRIMARY KEY,
  subject_user_id VARCHAR(100) NOT NULL,
  content_definition_id UUID NOT NULL REFERENCES content_definitions(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_bookmark UNIQUE (subject_user_id, content_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_content_bookmarks_user ON content_bookmarks(subject_user_id);

-- 12. Content Issues
CREATE TABLE IF NOT EXISTS content_issues (
  id UUID PRIMARY KEY,
  content_version_id UUID NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
  issue_type VARCHAR(60) NOT NULL,
  severity VARCHAR(40) NOT NULL DEFAULT 'MEDIUM',
  reported_by VARCHAR(100) NOT NULL,
  source VARCHAR(40) NOT NULL DEFAULT 'USER_FEEDBACK',
  description TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'REPORTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_content_issues_ver ON content_issues(content_version_id);
CREATE INDEX IF NOT EXISTS idx_content_issues_status ON content_issues(status);

-- 13. Content Claims & Governed Evidence Linkage
CREATE TABLE IF NOT EXISTS content_claims (
  id UUID PRIMARY KEY,
  content_version_id UUID NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
  claim_text TEXT NOT NULL,
  claim_type VARCHAR(60) NOT NULL,
  strength_of_evidence VARCHAR(40) NOT NULL,
  clinical_artifact_id UUID,
  evidence_references JSONB NOT NULL DEFAULT '[]',
  non_diagnostic_limitation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_claims_ver ON content_claims(content_version_id);
