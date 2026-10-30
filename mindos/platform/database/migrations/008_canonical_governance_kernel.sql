-- ==============================================================================
-- MINDOS CANONICAL MIGRATION: 008_canonical_governance_kernel.sql
-- ==============================================================================
-- Purpose: Formalize Governance Kernel persistence: GovernedResource registry,
--          GovernanceCase lifecycle, multi-domain GovernanceReviews, and
--          immutable ReleaseAuthorization gates.
-- Authority: Master Architecture Index Section 7, Volumes III, XIV, XV & Appendices B / C / Q
-- Sprint 9: Governance Kernel, Review Orchestration, Approval Workflows, Feature Risk Classification & Production Release Gates
-- Strategy: Additive expand phase (100% backwards compatible).
-- Rollback/Recovery: Handled via down block.
-- ==============================================================================

-- UP --

-- 1. Governed Resources Registry (Platform assets requiring governance controls)
CREATE TABLE IF NOT EXISTS governed_resources (
  id UUID PRIMARY KEY,
  resource_key VARCHAR(120) UNIQUE NOT NULL,
  resource_type VARCHAR(60) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner_id VARCHAR(120) NOT NULL,
  clinical_risk_class VARCHAR(20) NOT NULL DEFAULT 'CR-0',
  ai_risk_class VARCHAR(20) NOT NULL DEFAULT 'AI-R0',
  privacy_risk_class VARCHAR(20) NOT NULL DEFAULT 'LOW',
  regulatory_risk_class VARCHAR(40) NOT NULL DEFAULT 'EXEMPT',
  requires_clinical_review BOOLEAN NOT NULL DEFAULT FALSE,
  requires_dpia BOOLEAN NOT NULL DEFAULT FALSE,
  requires_regulatory_review BOOLEAN NOT NULL DEFAULT FALSE,
  requires_ai_safety_review BOOLEAN NOT NULL DEFAULT FALSE,
  requires_security_review BOOLEAN NOT NULL DEFAULT TRUE,
  requires_qa_review BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_governed_resources_type ON governed_resources(resource_type);
CREATE INDEX IF NOT EXISTS idx_governed_resources_owner ON governed_resources(owner_id);
CREATE INDEX IF NOT EXISTS idx_governed_resources_status ON governed_resources(status);

-- 2. Governance Cases (Review lifecycle for feature, release or asset)
CREATE TABLE IF NOT EXISTS governance_cases (
  id UUID PRIMARY KEY,
  case_number VARCHAR(80) UNIQUE NOT NULL,
  resource_id UUID NOT NULL REFERENCES governed_resources(id) ON DELETE CASCADE,
  release_id VARCHAR(120),
  state VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  initiator_id VARCHAR(120) NOT NULL,
  mandated_domains TEXT[] NOT NULL DEFAULT '{}',
  risk_assessment JSONB NOT NULL DEFAULT '{}',
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_governance_cases_resource ON governance_cases(resource_id);
CREATE INDEX IF NOT EXISTS idx_governance_cases_release ON governance_cases(release_id);
CREATE INDEX IF NOT EXISTS idx_governance_cases_state ON governance_cases(state);
CREATE INDEX IF NOT EXISTS idx_governance_cases_initiator ON governance_cases(initiator_id);

-- 3. Governance Domain Reviews (Independent review records for separation of duties)
CREATE TABLE IF NOT EXISTS governance_reviews (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES governance_cases(id) ON DELETE CASCADE,
  domain VARCHAR(50) NOT NULL,
  state VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  assigned_role VARCHAR(60) NOT NULL,
  reviewer_id VARCHAR(120),
  decision VARCHAR(40),
  conditions TEXT[] NOT NULL DEFAULT '{}',
  evidence_hashes TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_governance_reviews_case ON governance_reviews(case_id);
CREATE INDEX IF NOT EXISTS idx_governance_reviews_domain ON governance_reviews(domain);
CREATE INDEX IF NOT EXISTS idx_governance_reviews_decision ON governance_reviews(decision);
CREATE INDEX IF NOT EXISTS idx_governance_reviews_reviewer ON governance_reviews(reviewer_id);

-- 4. Release Authorizations Additive Columns
ALTER TABLE release_authorizations ADD COLUMN IF NOT EXISTS release_type VARCHAR(40) DEFAULT 'STANDARD';
ALTER TABLE release_authorizations ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'AUTHORIZED';
ALTER TABLE release_authorizations ADD COLUMN IF NOT EXISTS checksum_sha256 VARCHAR(64);
ALTER TABLE release_authorizations ADD COLUMN IF NOT EXISTS risk_summary JSONB DEFAULT '{}';
ALTER TABLE release_authorizations ADD COLUMN IF NOT EXISTS case_id UUID;

CREATE INDEX IF NOT EXISTS idx_release_authorizations_status ON release_authorizations(status);
CREATE INDEX IF NOT EXISTS idx_release_authorizations_release_id ON release_authorizations(release_id);

-- DOWN --
-- Rollback statements
DROP TABLE IF EXISTS governance_reviews;
DROP TABLE IF EXISTS governance_cases;
DROP TABLE IF EXISTS governed_resources;
