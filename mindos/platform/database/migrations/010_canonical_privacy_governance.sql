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
CREATE TABLE IF NOT EXISTS processing_activities (
  id UUID PRIMARY KEY,
  code VARCHAR(120) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner_domain VARCHAR(120) NOT NULL DEFAULT 'privacy_governance',
  owner_id VARCHAR(120) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  data_subject_categories TEXT[] NOT NULL DEFAULT '{}',
  data_categories TEXT[] NOT NULL DEFAULT '{}',
  special_categories TEXT[] NOT NULL DEFAULT '{}',
  purposes TEXT[] NOT NULL DEFAULT '{}',
  lawful_basis TEXT[] NOT NULL DEFAULT '{}',
  consent_dependencies JSONB NOT NULL DEFAULT '{}',
  sources TEXT[] NOT NULL DEFAULT '{}',
  recipients TEXT[] NOT NULL DEFAULT '{}',
  processors TEXT[] NOT NULL DEFAULT '{}',
  storage_locations TEXT[] NOT NULL DEFAULT '{}',
  processing_locations TEXT[] NOT NULL DEFAULT '{}',
  transfer_locations TEXT[] NOT NULL DEFAULT '{}',
  retention_policy_refs TEXT[] NOT NULL DEFAULT '{}',
  automated_processing BOOLEAN NOT NULL DEFAULT FALSE,
  profiling BOOLEAN NOT NULL DEFAULT FALSE,
  ai_involvement BOOLEAN NOT NULL DEFAULT FALSE,
  clinical_relevance BOOLEAN NOT NULL DEFAULT FALSE,
  security_classification VARCHAR(50) NOT NULL DEFAULT 'CONFIDENTIAL',
  jurisdictions TEXT[] NOT NULL DEFAULT '{"KE"}',
  fingerprint VARCHAR(64) NOT NULL,
  governed_resource_id UUID,
  supersedes_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
CREATE TABLE IF NOT EXISTS dpia_assessments (
  id UUID PRIMARY KEY,
  dpia_code VARCHAR(120) UNIQUE NOT NULL,
  processing_activity_id UUID NOT NULL REFERENCES processing_activities(id) ON DELETE CASCADE,
  processing_activity_version INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  trigger_factors JSONB NOT NULL DEFAULT '[]',
  scope TEXT NOT NULL,
  purpose TEXT NOT NULL,
  necessity_assessment JSONB NOT NULL DEFAULT '{}',
  proportionality_assessment JSONB NOT NULL DEFAULT '{}',
  risk_summary JSONB NOT NULL DEFAULT '{}',
  residual_risk VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
  requested_by VARCHAR(120) NOT NULL,
  reviewer_id VARCHAR(120),
  decision VARCHAR(50),
  decision_reason TEXT,
  conditions TEXT[] NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dpia_assessments_code ON dpia_assessments(dpia_code);
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
DROP TABLE IF EXISTS dpia_assessments CASCADE;
DROP TABLE IF EXISTS data_transfer_assessments CASCADE;
DROP TABLE IF EXISTS privacy_data_flows CASCADE;
DROP TABLE IF EXISTS processor_relationships CASCADE;
DROP TABLE IF EXISTS privacy_processors CASCADE;
DROP TABLE IF EXISTS processing_activity_versions CASCADE;
DROP TABLE IF EXISTS processing_activities CASCADE;
