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
-- clinical_artifacts is introduced by migration 001. Sprint 10 expands it
-- additively and keeps the legacy columns synchronized for compatibility.
ALTER TABLE clinical_artifacts
  ADD COLUMN IF NOT EXISTS artifact_code VARCHAR(120),
  ADD COLUMN IF NOT EXISTS name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS owner_domain VARCHAR(120) NOT NULL DEFAULT 'clinical_governance',
  ADD COLUMN IF NOT EXISTS owner_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS intended_use TEXT,
  ADD COLUMN IF NOT EXISTS intended_population JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS excluded_population JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS clinical_risk_class VARCHAR(20),
  ADD COLUMN IF NOT EXISTS risk_factors JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS jurisdiction_scope TEXT[] NOT NULL DEFAULT '{"KE"}',
  ADD COLUMN IF NOT EXISTS data_classification VARCHAR(40) NOT NULL DEFAULT 'HEALTH_DATA',
  ADD COLUMN IF NOT EXISTS clinical_claim_level VARCHAR(40) NOT NULL DEFAULT 'INFORMATIONAL',
  ADD COLUMN IF NOT EXISTS governed_resource_id UUID,
  ADD COLUMN IF NOT EXISTS supersedes_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE clinical_artifacts
SET
  artifact_code = COALESCE(artifact_code, artifact_key),
  name = COALESCE(name, artifact_key),
  owner_domain = COALESCE(owner_domain, clinical_domain, 'clinical_governance'),
  owner_id = COALESCE(owner_id, owner),
  status = COALESCE(status, state::text, 'DRAFT'),
  intended_use = COALESCE(intended_use, artifact_key, artifact_type),
  clinical_risk_class = COALESCE(clinical_risk_class, impact_class, 'CR-0')
WHERE
  artifact_code IS NULL OR name IS NULL OR owner_id IS NULL OR
  intended_use IS NULL OR clinical_risk_class IS NULL;

ALTER TABLE clinical_artifacts
  ALTER COLUMN artifact_code SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN owner_id SET NOT NULL,
  ALTER COLUMN intended_use SET NOT NULL,
  ALTER COLUMN clinical_risk_class SET NOT NULL,
  ALTER COLUMN artifact_key DROP NOT NULL,
  ALTER COLUMN clinical_domain DROP NOT NULL,
  ALTER COLUMN impact_class DROP NOT NULL,
  ALTER COLUMN evidence_level DROP NOT NULL,
  ALTER COLUMN owner DROP NOT NULL;

CREATE OR REPLACE FUNCTION mindos_sync_clinical_artifact_compat()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.artifact_code := COALESCE(NEW.artifact_code, NEW.artifact_key);
  NEW.artifact_key := COALESCE(NEW.artifact_key, NEW.artifact_code);
  NEW.name := COALESCE(NEW.name, NEW.artifact_code, NEW.artifact_key);
  NEW.owner_domain := COALESCE(NEW.owner_domain, NEW.clinical_domain, 'clinical_governance');
  NEW.clinical_domain := COALESCE(NEW.clinical_domain, NEW.owner_domain);
  NEW.owner_id := COALESCE(NEW.owner_id, NEW.owner);
  NEW.owner := COALESCE(NEW.owner, NEW.owner_id);
  NEW.clinical_risk_class := COALESCE(NEW.clinical_risk_class, NEW.impact_class, 'CR-0');
  NEW.impact_class := COALESCE(NEW.impact_class, NEW.clinical_risk_class);
  NEW.evidence_level := COALESCE(NEW.evidence_level, 'GOVERNED');
  NEW.intended_use := COALESCE(NEW.intended_use, NEW.artifact_code, NEW.artifact_key);

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'DRAFT' AND NEW.state::text <> 'DRAFT' THEN
      NEW.status := NEW.state::text;
    ELSIF NEW.status <> 'DRAFT' THEN
      BEGIN
        NEW.state := NEW.status::clinical_artifact_state_enum;
      EXCEPTION WHEN invalid_text_representation THEN
        NULL;
      END;
    END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      BEGIN
        NEW.state := NEW.status::clinical_artifact_state_enum;
      EXCEPTION WHEN invalid_text_representation THEN
        NULL;
      END;
    ELSIF NEW.state IS DISTINCT FROM OLD.state THEN
      NEW.status := NEW.state::text;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_clinical_artifact_compat ON clinical_artifacts;
CREATE TRIGGER trg_sync_clinical_artifact_compat
BEFORE INSERT OR UPDATE ON clinical_artifacts
FOR EACH ROW EXECUTE FUNCTION mindos_sync_clinical_artifact_compat();

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinical_artifacts_code ON clinical_artifacts(artifact_code);
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
-- clinical_reviews is introduced in migration 001. Expand it for the Sprint-10
-- review workflow without replacing historical rows.
ALTER TABLE clinical_reviews
  ADD COLUMN IF NOT EXISTS artifact_version INTEGER,
  ADD COLUMN IF NOT EXISTS governance_case_id UUID,
  ADD COLUMN IF NOT EXISTS governance_review_id UUID,
  ADD COLUMN IF NOT EXISTS reviewer_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS review_level VARCHAR(60),
  ADD COLUMN IF NOT EXISTS required_specialty VARCHAR(80),
  ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'ASSIGNED',
  ADD COLUMN IF NOT EXISTS checklist JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS evidence_assessment JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS risk_assessment JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS claim_assessment JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS limitations_assessment JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS decision_reason TEXT,
  ADD COLUMN IF NOT EXISTS conditions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS policy_version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

UPDATE clinical_reviews r
SET
  artifact_version = COALESCE(r.artifact_version, a.version),
  reviewer_id = COALESCE(r.reviewer_id, r.assigned_reviewer_id::text),
  review_level = COALESCE(r.review_level, r.review_type),
  status = CASE
    WHEN r.status IS NOT NULL THEN r.status
    WHEN r.decided_at IS NOT NULL THEN 'COMPLETED'
    ELSE 'ASSIGNED'
  END,
  completed_at = COALESCE(r.completed_at, r.decided_at)
FROM clinical_artifacts a
WHERE a.id = r.artifact_id
  AND (r.artifact_version IS NULL OR r.reviewer_id IS NULL OR r.review_level IS NULL);

ALTER TABLE clinical_reviews
  ALTER COLUMN artifact_version SET NOT NULL,
  ALTER COLUMN reviewer_id SET NOT NULL,
  ALTER COLUMN review_level SET NOT NULL,
  ALTER COLUMN review_type SET DEFAULT 'STANDARD_CLINICAL_REVIEW',
  ALTER COLUMN assigned_reviewer_id DROP NOT NULL,
  ALTER COLUMN decision TYPE VARCHAR(40) USING decision::text;

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
DROP TABLE IF EXISTS clinical_contraindications;
DROP TABLE IF EXISTS clinical_claim_evidence;
DROP TABLE IF EXISTS clinical_evidence_metadata;
DROP TABLE IF EXISTS clinical_claims;
DROP TABLE IF EXISTS clinical_artifact_versions;

DROP TRIGGER IF EXISTS trg_sync_clinical_artifact_compat ON clinical_artifacts;
DROP FUNCTION IF EXISTS mindos_sync_clinical_artifact_compat();

ALTER TABLE clinical_reviews
  DROP COLUMN IF EXISTS completed_at,
  DROP COLUMN IF EXISTS policy_version,
  DROP COLUMN IF EXISTS conditions,
  DROP COLUMN IF EXISTS decision_reason,
  DROP COLUMN IF EXISTS limitations_assessment,
  DROP COLUMN IF EXISTS claim_assessment,
  DROP COLUMN IF EXISTS risk_assessment,
  DROP COLUMN IF EXISTS evidence_assessment,
  DROP COLUMN IF EXISTS checklist,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS required_specialty,
  DROP COLUMN IF EXISTS review_level,
  DROP COLUMN IF EXISTS reviewer_id,
  DROP COLUMN IF EXISTS governance_review_id,
  DROP COLUMN IF EXISTS governance_case_id,
  DROP COLUMN IF EXISTS artifact_version;

ALTER TABLE clinical_artifacts
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS supersedes_id,
  DROP COLUMN IF EXISTS governed_resource_id,
  DROP COLUMN IF EXISTS clinical_claim_level,
  DROP COLUMN IF EXISTS data_classification,
  DROP COLUMN IF EXISTS jurisdiction_scope,
  DROP COLUMN IF EXISTS risk_factors,
  DROP COLUMN IF EXISTS clinical_risk_class,
  DROP COLUMN IF EXISTS excluded_population,
  DROP COLUMN IF EXISTS intended_population,
  DROP COLUMN IF EXISTS intended_use,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS owner_id,
  DROP COLUMN IF EXISTS owner_domain,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS name,
  DROP COLUMN IF EXISTS artifact_code;
