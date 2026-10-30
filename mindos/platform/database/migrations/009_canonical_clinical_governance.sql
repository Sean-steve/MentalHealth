-- ==============================================================================
-- MINDOS CANONICAL MIGRATION: 009_canonical_clinical_governance.sql
-- ==============================================================================
-- Purpose: Formalize Clinical Governance persistence: ClinicalArtifacts,
--          versioning, ClinicalClaims, ClinicalEvidence metadata, claim-evidence
--          links, contraindications, clinical reviews, and immutable ClinicalApprovals.
-- Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
-- Sprint 10: Clinical Governance Engine, Clinical Artifact Lifecycle, Evidence Management,
--            Review Workflows & Clinical Release Authorization
-- Strategy: Additive expand phase (100% backwards compatible).
-- Rollback/Recovery: Handled via down block.
-- ==============================================================================

-- UP --

-- 1. Clinical Artifacts Registry (Master registry of governed clinical/clinically relevant assets)
CREATE TABLE IF NOT EXISTS clinical_artifacts (
  id UUID PRIMARY KEY,
  artifact_code VARCHAR(120) UNIQUE NOT NULL,
  artifact_type VARCHAR(60) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner_domain VARCHAR(120) NOT NULL DEFAULT 'clinical_governance',
  owner_id VARCHAR(120) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  intended_use TEXT NOT NULL,
  intended_population JSONB NOT NULL DEFAULT '{}',
  excluded_population JSONB NOT NULL DEFAULT '{}',
  clinical_risk_class VARCHAR(20) NOT NULL DEFAULT 'CR-0',
  risk_factors JSONB NOT NULL DEFAULT '{}',
  jurisdiction_scope TEXT[] NOT NULL DEFAULT '{"KE"}',
  data_classification VARCHAR(40) NOT NULL DEFAULT 'HEALTH_DATA',
  clinical_claim_level VARCHAR(40) NOT NULL DEFAULT 'INFORMATIONAL',
  governed_resource_id UUID,
  supersedes_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinical_artifacts_code ON clinical_artifacts(artifact_code);
CREATE INDEX IF NOT EXISTS idx_clinical_artifacts_type ON clinical_artifacts(artifact_type);
CREATE INDEX IF NOT EXISTS idx_clinical_artifacts_status ON clinical_artifacts(status);
CREATE INDEX IF NOT EXISTS idx_clinical_artifacts_risk ON clinical_artifacts(clinical_risk_class);
CREATE INDEX IF NOT EXISTS idx_clinical_artifacts_owner ON clinical_artifacts(owner_id);

-- 2. Clinical Artifact Versions (Immutable versioned releases of clinical specifications)
CREATE TABLE IF NOT EXISTS clinical_artifact_versions (
  id UUID PRIMARY KEY,
  artifact_id UUID NOT NULL REFERENCES clinical_artifacts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  content_hash VARCHAR(64) NOT NULL,
  specification JSONB NOT NULL DEFAULT '{}',
  intended_use TEXT NOT NULL,
  intended_population JSONB NOT NULL DEFAULT '{}',
  excluded_population JSONB NOT NULL DEFAULT '{}',
  clinical_risk_class VARCHAR(20) NOT NULL,
  risk_factors JSONB NOT NULL DEFAULT '{}',
  material_change_summary TEXT,
  is_material_change BOOLEAN NOT NULL DEFAULT FALSE,
  supersedes_version INTEGER,
  created_by VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_clinical_artifact_version UNIQUE(artifact_id, version)
);

CREATE INDEX IF NOT EXISTS idx_clinical_artifact_versions_artifact ON clinical_artifact_versions(artifact_id);
CREATE INDEX IF NOT EXISTS idx_clinical_artifact_versions_status ON clinical_artifact_versions(status);

-- 3. Clinical Claims (Specific clinical or therapeutic claims governed by evidence)
CREATE TABLE IF NOT EXISTS clinical_claims (
  id UUID PRIMARY KEY,
  artifact_id UUID NOT NULL REFERENCES clinical_artifacts(id) ON DELETE CASCADE,
  artifact_version INTEGER NOT NULL,
  claim_code VARCHAR(80) NOT NULL,
  claim_text TEXT NOT NULL,
  claim_type VARCHAR(50) NOT NULL,
  strength VARCHAR(40) NOT NULL,
  intended_population TEXT,
  context TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  supersedes_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinical_claims_artifact ON clinical_claims(artifact_id, artifact_version);
CREATE INDEX IF NOT EXISTS idx_clinical_claims_type ON clinical_claims(claim_type);
CREATE INDEX IF NOT EXISTS idx_clinical_claims_status ON clinical_claims(status);

-- 4. Clinical Evidence Metadata (Domain metadata for evidence records from Evidence Vault)
CREATE TABLE IF NOT EXISTS clinical_evidence_metadata (
  id UUID PRIMARY KEY,
  evidence_record_id VARCHAR(120),
  evidence_type VARCHAR(60) NOT NULL,
  title VARCHAR(255) NOT NULL,
  source VARCHAR(255) NOT NULL,
  citation TEXT NOT NULL,
  publication_date VARCHAR(40),
  population TEXT,
  methodology TEXT,
  sample_size INTEGER,
  outcomes TEXT,
  evidence_quality VARCHAR(40) NOT NULL DEFAULT 'MODERATE',
  quality_factors JSONB NOT NULL DEFAULT '{}',
  relevance VARCHAR(40) NOT NULL DEFAULT 'DIRECT',
  jurisdiction_applicability TEXT[] NOT NULL DEFAULT '{"KE"}',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  reviewed_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinical_evidence_type ON clinical_evidence_metadata(evidence_type);
CREATE INDEX IF NOT EXISTS idx_clinical_evidence_status ON clinical_evidence_metadata(status);
CREATE INDEX IF NOT EXISTS idx_clinical_evidence_quality ON clinical_evidence_metadata(evidence_quality);

-- 5. Claim-Evidence Links (Many-to-many relationship linking evidence to specific claims)
CREATE TABLE IF NOT EXISTS clinical_claim_evidence (
  id UUID PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES clinical_claims(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES clinical_evidence_metadata(id) ON DELETE CASCADE,
  relationship_type VARCHAR(40) NOT NULL DEFAULT 'SUPPORTS',
  support_strength VARCHAR(40) NOT NULL DEFAULT 'MODERATE',
  limitations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_clinical_claim_evidence UNIQUE(claim_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_clinical_claim_evidence_claim ON clinical_claim_evidence(claim_id);
CREATE INDEX IF NOT EXISTS idx_clinical_claim_evidence_evidence ON clinical_claim_evidence(evidence_id);

-- 6. Clinical Contraindications (Clinical boundaries, triggers, and mandated behaviors)
CREATE TABLE IF NOT EXISTS clinical_contraindications (
  id UUID PRIMARY KEY,
  artifact_id UUID NOT NULL REFERENCES clinical_artifacts(id) ON DELETE CASCADE,
  artifact_version INTEGER NOT NULL,
  condition_type VARCHAR(60) NOT NULL,
  population TEXT NOT NULL,
  trigger TEXT NOT NULL,
  severity VARCHAR(40) NOT NULL,
  required_behavior VARCHAR(80) NOT NULL,
  user_message_reference VARCHAR(120),
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinical_contraindications_artifact ON clinical_contraindications(artifact_id, artifact_version);
CREATE INDEX IF NOT EXISTS idx_clinical_contraindications_severity ON clinical_contraindications(severity);

-- 7. Clinical Reviews (Evaluations by eligible clinical reviewers)
CREATE TABLE IF NOT EXISTS clinical_reviews (
  id UUID PRIMARY KEY,
  artifact_id UUID NOT NULL REFERENCES clinical_artifacts(id) ON DELETE CASCADE,
  artifact_version INTEGER NOT NULL,
  governance_case_id UUID,
  governance_review_id UUID,
  reviewer_id VARCHAR(120) NOT NULL,
  review_level VARCHAR(60) NOT NULL,
  required_specialty VARCHAR(80),
  status VARCHAR(40) NOT NULL DEFAULT 'ASSIGNED',
  decision VARCHAR(40),
  checklist JSONB NOT NULL DEFAULT '{}',
  evidence_assessment JSONB NOT NULL DEFAULT '{}',
  risk_assessment JSONB NOT NULL DEFAULT '{}',
  claim_assessment JSONB NOT NULL DEFAULT '{}',
  limitations_assessment JSONB NOT NULL DEFAULT '{}',
  decision_reason TEXT,
  conditions TEXT[] NOT NULL DEFAULT '{}',
  policy_version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_clinical_reviews_artifact ON clinical_reviews(artifact_id, artifact_version);
CREATE INDEX IF NOT EXISTS idx_clinical_reviews_reviewer ON clinical_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_clinical_reviews_status ON clinical_reviews(status);
CREATE INDEX IF NOT EXISTS idx_clinical_reviews_decision ON clinical_reviews(decision);

-- 8. Clinical Approval Records (Immutable audit and enforcement tokens for approved versions)
CREATE TABLE IF NOT EXISTS clinical_approval_records (
  id UUID PRIMARY KEY,
  artifact_id UUID NOT NULL REFERENCES clinical_artifacts(id) ON DELETE CASCADE,
  artifact_version INTEGER NOT NULL,
  approval_code VARCHAR(80) UNIQUE NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  review_ids UUID[] NOT NULL DEFAULT '{}',
  approver_ids TEXT[] NOT NULL DEFAULT '{}',
  evidence_ids UUID[] NOT NULL DEFAULT '{}',
  claim_ids UUID[] NOT NULL DEFAULT '{}',
  conditions JSONB NOT NULL DEFAULT '[]',
  policy_version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  suspended_at TIMESTAMPTZ,
  suspension_reason TEXT,
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  governance_release_authorized BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_clinical_approvals_artifact ON clinical_approval_records(artifact_id, artifact_version);
CREATE INDEX IF NOT EXISTS idx_clinical_approvals_status ON clinical_approval_records(status);
CREATE INDEX IF NOT EXISTS idx_clinical_approvals_expiry ON clinical_approval_records(expires_at);

-- DOWN --
-- Rollback statements
DROP TABLE IF EXISTS clinical_approval_records;
DROP TABLE IF EXISTS clinical_reviews;
DROP TABLE IF EXISTS clinical_contraindications;
DROP TABLE IF EXISTS clinical_claim_evidence;
DROP TABLE IF EXISTS clinical_evidence_metadata;
DROP TABLE IF EXISTS clinical_claims;
DROP TABLE IF EXISTS clinical_artifact_versions;
DROP TABLE IF EXISTS clinical_artifacts;
