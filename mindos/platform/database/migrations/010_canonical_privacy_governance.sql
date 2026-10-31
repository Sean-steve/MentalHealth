-- ==============================================================================
-- MINDOS CANONICAL MIGRATION: 010_canonical_privacy_governance.sql
-- ==============================================================================
-- Purpose: Formalize Privacy Governance persistence: ProcessingActivities,
--          versions, privacy data flows, processors, subprocessors, cross-border
--          transfers, DPIAs, privacy risks, privacy controls, risk-control links,
--          remediations, and immutable PrivacyApprovals.
-- Authority: Master Architecture Index Section 7, Volumes I, III, VIII, XV & Appendices B / C / Q
--            Kenya Data Protection Act 2019 & General Regulations 2021
-- Sprint 11: Privacy Governance Engine, Data Processing Registry, DPIA Workflow,
--            Data-Flow Governance & Privacy Release Controls
-- Strategy: Additive expand phase (100% backwards compatible).
-- Rollback/Recovery: Handled via down block.
-- ==============================================================================

-- UP --

-- 1. Processing Activities Master Registry
-- processing_activities is introduced in migration 001. Sprint 11 expands the
-- same canonical table and keeps legacy/new fields synchronized.
ALTER TABLE processing_activities
  ALTER COLUMN code TYPE VARCHAR(120),
  ALTER COLUMN name TYPE VARCHAR(255),
  ALTER COLUMN processors TYPE TEXT[] USING processors::text[];

ALTER TABLE processing_activities
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS owner_domain VARCHAR(120) NOT NULL DEFAULT 'privacy_governance',
  ADD COLUMN IF NOT EXISTS owner_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS data_subject_categories TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS special_categories TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS purposes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lawful_basis TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS consent_dependencies JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sources TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recipients TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS storage_locations TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS transfer_locations TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS retention_policy_refs TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS automated_processing BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS profiling BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_involvement BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS clinical_relevance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS security_classification VARCHAR(50) NOT NULL DEFAULT 'CONFIDENTIAL',
  ADD COLUMN IF NOT EXISTS jurisdictions TEXT[] NOT NULL DEFAULT '{"KE"}',
  ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(64),
  ADD COLUMN IF NOT EXISTS governed_resource_id UUID,
  ADD COLUMN IF NOT EXISTS supersedes_id UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE processing_activities
SET
  owner_id = COALESCE(owner_id, owner),
  data_subject_categories = CASE
    WHEN cardinality(data_subject_categories)=0 THEN data_subjects
    ELSE data_subject_categories
  END,
  purposes = CASE
    WHEN cardinality(purposes)=0 THEN ARRAY[purpose]
    ELSE purposes
  END,
  lawful_basis = CASE
    WHEN cardinality(lawful_basis)=0 THEN ARRAY[lawful_basis_json::text]
    ELSE lawful_basis
  END,
  storage_locations = CASE
    WHEN cardinality(storage_locations)=0 THEN processing_locations
    ELSE storage_locations
  END,
  retention_policy_refs = CASE
    WHEN cardinality(retention_policy_refs)=0 AND retention_policy_id IS NOT NULL
      THEN ARRAY[retention_policy_id::text]
    ELSE retention_policy_refs
  END,
  fingerprint = COALESCE(
    fingerprint,
    md5(code || ':' || COALESCE(version,1)::text) ||
    md5(name || ':' || updated_at::text)
  );

ALTER TABLE processing_activities
  ALTER COLUMN owner_id SET NOT NULL,
  ALTER COLUMN fingerprint SET NOT NULL;

CREATE OR REPLACE FUNCTION mindos_sync_processing_activity_compat()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.owner_id := COALESCE(NEW.owner_id, NEW.owner);
  NEW.owner := COALESCE(NEW.owner, NEW.owner_id);
  IF cardinality(COALESCE(NEW.data_subject_categories,'{}'))=0 THEN
    NEW.data_subject_categories := COALESCE(NEW.data_subjects,'{}');
  END IF;
  IF NEW.data_subjects IS NULL THEN
    NEW.data_subjects := COALESCE(NEW.data_subject_categories,'{}');
  END IF;
  IF cardinality(COALESCE(NEW.purposes,'{}'))=0 AND NEW.purpose IS NOT NULL THEN
    NEW.purposes := ARRAY[NEW.purpose];
  END IF;
  IF NEW.purpose IS NULL THEN
    NEW.purpose := COALESCE(array_to_string(NEW.purposes, '; '), 'Governed processing activity');
  END IF;
  IF cardinality(COALESCE(NEW.lawful_basis,'{}'))=0 AND NEW.lawful_basis_json IS NOT NULL THEN
    NEW.lawful_basis := ARRAY[NEW.lawful_basis_json::text];
  END IF;
  IF NEW.lawful_basis_json IS NULL THEN
    NEW.lawful_basis_json := to_jsonb(COALESCE(NEW.lawful_basis,'{}'));
  END IF;
  NEW.fingerprint := COALESCE(
    NEW.fingerprint,
    md5(NEW.code || ':' || COALESCE(NEW.version,1)::text) ||
    md5(NEW.name || ':' || COALESCE(NEW.updated_at,NOW())::text)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_processing_activity_compat ON processing_activities;
CREATE TRIGGER trg_sync_processing_activity_compat
BEFORE INSERT OR UPDATE ON processing_activities
FOR EACH ROW EXECUTE FUNCTION mindos_sync_processing_activity_compat();

CREATE INDEX IF NOT EXISTS idx_processing_activities_code ON processing_activities(code);
CREATE INDEX IF NOT EXISTS idx_processing_activities_status ON processing_activities(status);
CREATE INDEX IF NOT EXISTS idx_processing_activities_owner ON processing_activities(owner_id);
CREATE INDEX IF NOT EXISTS idx_processing_activities_domain ON processing_activities(owner_domain);

-- 2. Processing Activity Versions (Immutable specifications)
CREATE TABLE IF NOT EXISTS processing_activity_versions (
  id UUID PRIMARY KEY,
  processing_activity_id UUID NOT NULL REFERENCES processing_activities(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  fingerprint VARCHAR(64) NOT NULL,
  specification JSONB NOT NULL DEFAULT '{}',
  is_material_change BOOLEAN NOT NULL DEFAULT FALSE,
  material_change_summary TEXT,
  supersedes_version INTEGER,
  created_by VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_processing_activity_version UNIQUE(processing_activity_id, version)
);

CREATE INDEX IF NOT EXISTS idx_processing_act_versions_activity ON processing_activity_versions(processing_activity_id);
CREATE INDEX IF NOT EXISTS idx_processing_act_versions_status ON processing_activity_versions(status);

-- 3. Privacy Processors Registry (Vendors, Infrastructure & Subprocessors)
CREATE TABLE IF NOT EXISTS privacy_processors (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  processor_code VARCHAR(120) UNIQUE NOT NULL,
  processor_type VARCHAR(80) NOT NULL,
  service VARCHAR(255) NOT NULL,
  jurisdictions TEXT[] NOT NULL DEFAULT '{"KE"}',
  processing_locations TEXT[] NOT NULL DEFAULT '{"KE"}',
  data_categories TEXT[] NOT NULL DEFAULT '{}',
  approved_purposes TEXT[] NOT NULL DEFAULT '{}',
  contract_reference VARCHAR(120),
  security_review_reference VARCHAR(120),
  privacy_review_status VARCHAR(40) NOT NULL DEFAULT 'PENDING_REVIEW',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_privacy_processors_code ON privacy_processors(processor_code);
CREATE INDEX IF NOT EXISTS idx_privacy_processors_status ON privacy_processors(status);
CREATE INDEX IF NOT EXISTS idx_privacy_processors_type ON privacy_processors(processor_type);

-- 4. Processor Subprocessor Relationships
CREATE TABLE IF NOT EXISTS processor_relationships (
  id UUID PRIMARY KEY,
  parent_processor_id UUID NOT NULL REFERENCES privacy_processors(id) ON DELETE CASCADE,
  subprocessor_id UUID NOT NULL REFERENCES privacy_processors(id) ON DELETE CASCADE,
  role_description TEXT NOT NULL,
  approved_purposes TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Privacy Data Flows
CREATE TABLE IF NOT EXISTS privacy_data_flows (
  id UUID PRIMARY KEY,
  processing_activity_id UUID NOT NULL REFERENCES processing_activities(id) ON DELETE CASCADE,
  flow_code VARCHAR(120) NOT NULL,
  source_system VARCHAR(120) NOT NULL,
  source_domain VARCHAR(120) NOT NULL,
  data_categories TEXT[] NOT NULL DEFAULT '{}',
  destination_system VARCHAR(120) NOT NULL,
  destination_domain VARCHAR(120) NOT NULL,
  recipient_type VARCHAR(60) NOT NULL,
  processor_id UUID REFERENCES privacy_processors(id) ON DELETE SET NULL,
  purpose VARCHAR(120) NOT NULL,
  jurisdiction VARCHAR(40) NOT NULL DEFAULT 'KE',
  transfer_type VARCHAR(60) NOT NULL DEFAULT 'INTERNAL',
  encryption_requirement VARCHAR(80) NOT NULL DEFAULT 'TLS_1_3_AND_AES_256_GCM',
  retention_policy_ref VARCHAR(120),
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_privacy_data_flows_activity ON privacy_data_flows(processing_activity_id);
CREATE INDEX IF NOT EXISTS idx_privacy_data_flows_processor ON privacy_data_flows(processor_id);

-- 6. Cross-Border Data Transfer Assessments (KDPA Sections 48 & 49)
CREATE TABLE IF NOT EXISTS data_transfer_assessments (
  id UUID PRIMARY KEY,
  processing_activity_id UUID NOT NULL REFERENCES processing_activities(id) ON DELETE CASCADE,
  data_flow_id UUID REFERENCES privacy_data_flows(id) ON DELETE SET NULL,
  origin_jurisdiction VARCHAR(40) NOT NULL DEFAULT 'KE',
  destination_jurisdiction VARCHAR(40) NOT NULL,
  data_categories TEXT[] NOT NULL DEFAULT '{}',
  recipient VARCHAR(255) NOT NULL,
  processor_id UUID REFERENCES privacy_processors(id) ON DELETE SET NULL,
  transfer_basis VARCHAR(80) NOT NULL,
  safeguards TEXT[] NOT NULL DEFAULT '{}',
  risk_status VARCHAR(40) NOT NULL DEFAULT 'MODERATE',
  review_status VARCHAR(40) NOT NULL DEFAULT 'PENDING_REVIEW',
  reviewed_by VARCHAR(120),
  reviewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_transfer_act ON data_transfer_assessments(processing_activity_id);

-- 7. DPIA Assessments (Data Protection Impact Assessments)
-- dpia_assessments is introduced in migration 001. Expand it for Sprint 11.
ALTER TABLE dpia_assessments
  ALTER COLUMN reviewer_id TYPE VARCHAR(120) USING reviewer_id::text;

ALTER TABLE dpia_assessments
  ADD COLUMN IF NOT EXISTS dpia_code VARCHAR(120),
  ADD COLUMN IF NOT EXISTS processing_activity_version INTEGER,
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS trigger_factors JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS scope TEXT,
  ADD COLUMN IF NOT EXISTS purpose TEXT,
  ADD COLUMN IF NOT EXISTS necessity_assessment JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS proportionality_assessment JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS risk_summary JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS requested_by VARCHAR(120),
  ADD COLUMN IF NOT EXISTS decision VARCHAR(50),
  ADD COLUMN IF NOT EXISTS decision_reason TEXT,
  ADD COLUMN IF NOT EXISTS conditions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_review_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE dpia_assessments
SET
  dpia_code = COALESCE(dpia_code, 'DPIA-' || id::text),
  processing_activity_version = COALESCE(processing_activity_version, version),
  status = CASE
    WHEN status IS DISTINCT FROM 'DRAFT' THEN status
    WHEN state::text <> 'DRAFT' THEN state::text
    ELSE status
  END,
  scope = COALESCE(scope, 'Migrated legacy DPIA assessment'),
  purpose = COALESCE(purpose, 'Governed privacy impact assessment'),
  necessity_assessment = CASE
    WHEN necessity_assessment='{}'::jsonb
      THEN COALESCE(necessity_proportionality,'{}'::jsonb)
    ELSE necessity_assessment
  END,
  proportionality_assessment = CASE
    WHEN proportionality_assessment='{}'::jsonb
      THEN COALESCE(necessity_proportionality,'{}'::jsonb)
    ELSE proportionality_assessment
  END,
  risk_summary = CASE
    WHEN risk_summary='{}'::jsonb THEN COALESCE(risk_register,'{}'::jsonb)
    ELSE risk_summary
  END,
  requested_by = COALESCE(requested_by, reviewer_id, 'LEGACY_MIGRATION'),
  next_review_at = COALESCE(next_review_at, review_due_at),
  completed_at = COALESCE(completed_at, approved_at);

ALTER TABLE dpia_assessments
  ALTER COLUMN dpia_code SET NOT NULL,
  ALTER COLUMN processing_activity_version SET NOT NULL,
  ALTER COLUMN scope SET NOT NULL,
  ALTER COLUMN purpose SET NOT NULL,
  ALTER COLUMN requested_by SET NOT NULL;

CREATE OR REPLACE FUNCTION mindos_sync_dpia_compat()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.dpia_code := COALESCE(NEW.dpia_code, 'DPIA-' || NEW.id::text);
  NEW.processing_activity_version := COALESCE(NEW.processing_activity_version, NEW.version, 1);
  NEW.version := COALESCE(NEW.version, NEW.processing_activity_version, 1);
  NEW.scope := COALESCE(NEW.scope, 'Governed DPIA assessment');
  NEW.purpose := COALESCE(NEW.purpose, 'Governed privacy impact assessment');
  NEW.requested_by := COALESCE(NEW.requested_by, NEW.reviewer_id, 'LEGACY_MIGRATION');
  NEW.necessity_proportionality := COALESCE(
    NEW.necessity_proportionality,
    jsonb_build_object(
      'necessity', COALESCE(NEW.necessity_assessment,'{}'::jsonb),
      'proportionality', COALESCE(NEW.proportionality_assessment,'{}'::jsonb)
    )
  );
  NEW.risk_register := COALESCE(NEW.risk_register, NEW.risk_summary, '{}'::jsonb);
  NEW.required_controls := COALESCE(NEW.required_controls, '{}'::jsonb);
  IF TG_OP='INSERT' THEN
    IF NEW.status='DRAFT' AND NEW.state::text<>'DRAFT' THEN
      NEW.status := NEW.state::text;
    ELSIF NEW.status<>'DRAFT' THEN
      BEGIN
        NEW.state := NEW.status::dpia_state_enum;
      EXCEPTION WHEN invalid_text_representation THEN
        NULL;
      END;
    END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      BEGIN
        NEW.state := NEW.status::dpia_state_enum;
      EXCEPTION WHEN invalid_text_representation THEN
        NULL;
      END;
    ELSIF NEW.state IS DISTINCT FROM OLD.state THEN
      NEW.status := NEW.state::text;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_dpia_compat ON dpia_assessments;
CREATE TRIGGER trg_sync_dpia_compat
BEFORE INSERT OR UPDATE ON dpia_assessments
FOR EACH ROW EXECUTE FUNCTION mindos_sync_dpia_compat();

CREATE UNIQUE INDEX IF NOT EXISTS idx_dpia_assessments_code ON dpia_assessments(dpia_code);
CREATE INDEX IF NOT EXISTS idx_dpia_assessments_activity ON dpia_assessments(processing_activity_id, processing_activity_version);
CREATE INDEX IF NOT EXISTS idx_dpia_assessments_status ON dpia_assessments(status);
CREATE INDEX IF NOT EXISTS idx_dpia_assessments_reviewer ON dpia_assessments(reviewer_id);

-- 8. Privacy Risks Register
CREATE TABLE IF NOT EXISTS privacy_risks (
  id UUID PRIMARY KEY,
  dpia_id UUID NOT NULL REFERENCES dpia_assessments(id) ON DELETE CASCADE,
  risk_code VARCHAR(80) NOT NULL,
  threat_event TEXT NOT NULL,
  risk_dimension VARCHAR(80) NOT NULL,
  affected_data TEXT[] NOT NULL DEFAULT '{}',
  affected_subjects TEXT[] NOT NULL DEFAULT '{}',
  likelihood VARCHAR(20) NOT NULL,
  impact VARCHAR(20) NOT NULL,
  inherent_risk VARCHAR(20) NOT NULL,
  residual_likelihood VARCHAR(20) NOT NULL,
  residual_impact VARCHAR(20) NOT NULL,
  residual_risk VARCHAR(20) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'IDENTIFIED',
  owner VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_privacy_risks_dpia ON privacy_risks(dpia_id);
CREATE INDEX IF NOT EXISTS idx_privacy_risks_residual ON privacy_risks(residual_risk);

-- 9. Privacy Controls Catalogue
CREATE TABLE IF NOT EXISTS privacy_controls (
  id UUID PRIMARY KEY,
  code VARCHAR(80) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  control_type VARCHAR(60) NOT NULL,
  owner_domain VARCHAR(120) NOT NULL DEFAULT 'privacy_governance',
  implementation_reference VARCHAR(255),
  status VARCHAR(40) NOT NULL DEFAULT 'IMPLEMENTED',
  evidence_requirement VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_privacy_controls_code ON privacy_controls(code);
CREATE INDEX IF NOT EXISTS idx_privacy_controls_type ON privacy_controls(control_type);

-- 10. Privacy Risk-to-Control Linkages
CREATE TABLE IF NOT EXISTS privacy_risk_controls (
  id UUID PRIMARY KEY,
  risk_id UUID NOT NULL REFERENCES privacy_risks(id) ON DELETE CASCADE,
  control_id UUID NOT NULL REFERENCES privacy_controls(id) ON DELETE CASCADE,
  effectiveness VARCHAR(40) NOT NULL DEFAULT 'EFFECTIVE',
  evidence_id VARCHAR(120),
  assessment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_controls_risk ON privacy_risk_controls(risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_controls_control ON privacy_risk_controls(control_id);

-- 11. Privacy Remediations
CREATE TABLE IF NOT EXISTS privacy_remediations (
  id UUID PRIMARY KEY,
  dpia_id UUID NOT NULL REFERENCES dpia_assessments(id) ON DELETE CASCADE,
  risk_id UUID REFERENCES privacy_risks(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  owner VARCHAR(120) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  due_at TIMESTAMPTZ NOT NULL,
  evidence_required BOOLEAN NOT NULL DEFAULT TRUE,
  evidence_id VARCHAR(120),
  completed_at TIMESTAMPTZ,
  verified_by VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_privacy_remediations_dpia ON privacy_remediations(dpia_id);
CREATE INDEX IF NOT EXISTS idx_privacy_remediations_status ON privacy_remediations(status);

-- 12. Privacy Approvals (Cryptographically & policy bound release records)
CREATE TABLE IF NOT EXISTS privacy_approvals (
  id UUID PRIMARY KEY,
  processing_activity_id UUID NOT NULL REFERENCES processing_activities(id) ON DELETE CASCADE,
  processing_activity_version INTEGER NOT NULL,
  dpia_id UUID NOT NULL REFERENCES dpia_assessments(id) ON DELETE CASCADE,
  dpia_version INTEGER NOT NULL DEFAULT 1,
  fingerprint VARCHAR(64) NOT NULL,
  reviewer_id VARCHAR(120) NOT NULL,
  reviewer_role VARCHAR(120) NOT NULL,
  decision VARCHAR(50) NOT NULL,
  conditions TEXT[] NOT NULL DEFAULT '{}',
  policy_version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by VARCHAR(120),
  revocation_reason TEXT,
  evidence_vault_id VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_privacy_approval_version UNIQUE(processing_activity_id, processing_activity_version)
);

CREATE INDEX IF NOT EXISTS idx_privacy_approvals_activity ON privacy_approvals(processing_activity_id, processing_activity_version);
CREATE INDEX IF NOT EXISTS idx_privacy_approvals_status ON privacy_approvals(status);
CREATE INDEX IF NOT EXISTS idx_privacy_approvals_expiry ON privacy_approvals(expires_at);

-- 13. Retention Policy Linkages
CREATE TABLE IF NOT EXISTS privacy_retention_links (
  id UUID PRIMARY KEY,
  processing_activity_id UUID NOT NULL REFERENCES processing_activities(id) ON DELETE CASCADE,
  data_category VARCHAR(120) NOT NULL,
  purpose VARCHAR(120) NOT NULL,
  retention_policy_code VARCHAR(120) NOT NULL,
  action VARCHAR(60) NOT NULL,
  retention_period_days INTEGER NOT NULL,
  conflict_resolution_rule VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retention_links_activity ON privacy_retention_links(processing_activity_id);

-- DOWN --
DROP TABLE IF EXISTS privacy_retention_links CASCADE;
DROP TABLE IF EXISTS privacy_approvals CASCADE;
DROP TABLE IF EXISTS privacy_remediations CASCADE;
DROP TABLE IF EXISTS privacy_risk_controls CASCADE;
DROP TABLE IF EXISTS privacy_controls CASCADE;
DROP TABLE IF EXISTS privacy_risks CASCADE;
DROP TABLE IF EXISTS data_transfer_assessments CASCADE;

DROP TRIGGER IF EXISTS trg_sync_dpia_compat ON dpia_assessments;
DROP FUNCTION IF EXISTS mindos_sync_dpia_compat();
ALTER TABLE dpia_assessments
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS expires_at,
  DROP COLUMN IF EXISTS next_review_at,
  DROP COLUMN IF EXISTS completed_at,
  DROP COLUMN IF EXISTS submitted_at,
  DROP COLUMN IF EXISTS conditions,
  DROP COLUMN IF EXISTS decision_reason,
  DROP COLUMN IF EXISTS decision,
  DROP COLUMN IF EXISTS requested_by,
  DROP COLUMN IF EXISTS risk_summary,
  DROP COLUMN IF EXISTS proportionality_assessment,
  DROP COLUMN IF EXISTS necessity_assessment,
  DROP COLUMN IF EXISTS purpose,
  DROP COLUMN IF EXISTS scope,
  DROP COLUMN IF EXISTS trigger_factors,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS processing_activity_version,
  DROP COLUMN IF EXISTS dpia_code;
DROP TABLE IF EXISTS privacy_data_flows CASCADE;
DROP TABLE IF EXISTS processor_relationships CASCADE;
DROP TABLE IF EXISTS privacy_processors CASCADE;
DROP TABLE IF EXISTS processing_activity_versions CASCADE;

DROP TRIGGER IF EXISTS trg_sync_processing_activity_compat ON processing_activities;
DROP FUNCTION IF EXISTS mindos_sync_processing_activity_compat();
ALTER TABLE processing_activities
  DROP COLUMN IF EXISTS created_at,
  DROP COLUMN IF EXISTS supersedes_id,
  DROP COLUMN IF EXISTS governed_resource_id,
  DROP COLUMN IF EXISTS fingerprint,
  DROP COLUMN IF EXISTS jurisdictions,
  DROP COLUMN IF EXISTS security_classification,
  DROP COLUMN IF EXISTS clinical_relevance,
  DROP COLUMN IF EXISTS ai_involvement,
  DROP COLUMN IF EXISTS profiling,
  DROP COLUMN IF EXISTS automated_processing,
  DROP COLUMN IF EXISTS retention_policy_refs,
  DROP COLUMN IF EXISTS transfer_locations,
  DROP COLUMN IF EXISTS storage_locations,
  DROP COLUMN IF EXISTS recipients,
  DROP COLUMN IF EXISTS sources,
  DROP COLUMN IF EXISTS consent_dependencies,
  DROP COLUMN IF EXISTS lawful_basis,
  DROP COLUMN IF EXISTS purposes,
  DROP COLUMN IF EXISTS special_categories,
  DROP COLUMN IF EXISTS data_subject_categories,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS owner_id,
  DROP COLUMN IF EXISTS owner_domain,
  DROP COLUMN IF EXISTS description;
