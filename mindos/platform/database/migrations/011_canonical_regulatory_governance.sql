-- ==============================================================================
-- MINDOS CANONICAL MIGRATION: 011_canonical_regulatory_governance.sql
-- ==============================================================================
-- Purpose: Formalize Regulatory Governance persistence: Jurisdictions, Authorities,
--          Sources, Source Versions, Requirements, Requirement-Control mappings,
--          Controls, Classifications, Assessments, Gaps, Remediations, Approvals,
--          Impact Assessments, and Certification Requirements.
-- Authority: Master Architecture Index Section 7, Volumes III, XV & Appendices B / C / I
--            Kenya Data Protection Act 2019, Digital Health Act 2023, Health Act 2017
-- Sprint 12: Regulatory Governance Engine, Kenya Regulatory Control Matrix,
--            Applicability Classification, Compliance Obligations & Release Gates
-- Strategy: Additive expand phase (100% backwards compatible).
-- ==============================================================================

-- UP --

-- 1. Extend jurisdictions table with canonical fields
ALTER TABLE jurisdictions ADD COLUMN IF NOT EXISTS code VARCHAR(10);
ALTER TABLE jurisdictions ADD COLUMN IF NOT EXISTS region VARCHAR(60) DEFAULT 'AFRICA';
ALTER TABLE jurisdictions ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'ACTIVE';
ALTER TABLE jurisdictions ADD COLUMN IF NOT EXISTS default_language VARCHAR(10) DEFAULT 'en';
ALTER TABLE jurisdictions ADD COLUMN IF NOT EXISTS timezone_reference VARCHAR(60) DEFAULT 'Africa/Nairobi';
ALTER TABLE jurisdictions ADD COLUMN IF NOT EXISTS regulatory_profile_version VARCHAR(30) DEFAULT '1.0.0';
ALTER TABLE jurisdictions ADD COLUMN IF NOT EXISTS effective_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE jurisdictions ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ;
ALTER TABLE jurisdictions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 2. Regulatory Authorities Registry
CREATE TABLE IF NOT EXISTS regulatory_authorities (
  id UUID PRIMARY KEY,
  code VARCHAR(60) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  jurisdiction_code VARCHAR(10) NOT NULL DEFAULT 'KE',
  authority_type VARCHAR(60) NOT NULL,
  scope TEXT NOT NULL,
  official_reference TEXT NOT NULL,
  website_url TEXT,
  contact_details JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reg_authorities_jur ON regulatory_authorities(jurisdiction_code);
CREATE INDEX IF NOT EXISTS idx_reg_authorities_code ON regulatory_authorities(code);

-- 3. Extend regulatory_sources table
ALTER TABLE regulatory_sources ADD COLUMN IF NOT EXISTS source_code VARCHAR(60);
ALTER TABLE regulatory_sources ADD COLUMN IF NOT EXISTS jurisdiction_code VARCHAR(10) DEFAULT 'KE';
ALTER TABLE regulatory_sources ADD COLUMN IF NOT EXISTS authority_id UUID;
ALTER TABLE regulatory_sources ADD COLUMN IF NOT EXISTS source_type VARCHAR(60) DEFAULT 'ACT';
ALTER TABLE regulatory_sources ADD COLUMN IF NOT EXISTS official_reference TEXT;
ALTER TABLE regulatory_sources ADD COLUMN IF NOT EXISTS version VARCHAR(30) DEFAULT '1.0.0';
ALTER TABLE regulatory_sources ADD COLUMN IF NOT EXISTS publication_date DATE;
ALTER TABLE regulatory_sources ADD COLUMN IF NOT EXISTS effective_date DATE;
ALTER TABLE regulatory_sources ADD COLUMN IF NOT EXISTS supersedes_id UUID;
ALTER TABLE regulatory_sources ADD COLUMN IF NOT EXISTS retrieved_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE regulatory_sources ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE regulatory_sources ADD COLUMN IF NOT EXISTS classification VARCHAR(60) DEFAULT 'AUTHORITATIVE_OFFICIAL_SOURCE';
ALTER TABLE regulatory_sources ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE regulatory_sources ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_reg_sources_code ON regulatory_sources(source_code);
CREATE INDEX IF NOT EXISTS idx_reg_sources_jur ON regulatory_sources(jurisdiction_code);

-- 4. Regulatory Source Versions (Immutable snapshots for historical reproducibility)
CREATE TABLE IF NOT EXISTS regulatory_source_versions (
  id UUID PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES regulatory_sources(id) ON DELETE CASCADE,
  version VARCHAR(30) NOT NULL,
  publication_date DATE,
  effective_date DATE,
  content_text TEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  source_url TEXT,
  verified_by VARCHAR(120) NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_id, version)
);

CREATE INDEX IF NOT EXISTS idx_reg_src_versions_src ON regulatory_source_versions(source_id);

-- 5. Extend regulatory_requirements table
ALTER TABLE regulatory_requirements ADD COLUMN IF NOT EXISTS requirement_code VARCHAR(100);
ALTER TABLE regulatory_requirements ADD COLUMN IF NOT EXISTS source_version VARCHAR(30) DEFAULT '1.0.0';
ALTER TABLE regulatory_requirements ADD COLUMN IF NOT EXISTS jurisdiction_code VARCHAR(10) DEFAULT 'KE';
ALTER TABLE regulatory_requirements ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE regulatory_requirements ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE regulatory_requirements ADD COLUMN IF NOT EXISTS requirement_type VARCHAR(60) DEFAULT 'DATA_PROTECTION';
ALTER TABLE regulatory_requirements ADD COLUMN IF NOT EXISTS obligation_type VARCHAR(60) DEFAULT 'MANDATORY';
ALTER TABLE regulatory_requirements ADD COLUMN IF NOT EXISTS trigger_conditions JSONB DEFAULT '{}';
ALTER TABLE regulatory_requirements ADD COLUMN IF NOT EXISTS required_controls TEXT[] DEFAULT '{}';
ALTER TABLE regulatory_requirements ADD COLUMN IF NOT EXISTS evidence_requirements TEXT[] DEFAULT '{}';
ALTER TABLE regulatory_requirements ADD COLUMN IF NOT EXISTS effective_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE regulatory_requirements ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE regulatory_requirements ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'ACTIVE';
ALTER TABLE regulatory_requirements ADD COLUMN IF NOT EXISTS interpretation_status VARCHAR(60) DEFAULT 'CONFIRMED';
ALTER TABLE regulatory_requirements ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(120);
ALTER TABLE regulatory_requirements ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE regulatory_requirements ADD COLUMN IF NOT EXISTS supersedes_id UUID;
ALTER TABLE regulatory_requirements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE regulatory_requirements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_reg_req_code ON regulatory_requirements(requirement_code);
CREATE INDEX IF NOT EXISTS idx_reg_req_jur ON regulatory_requirements(jurisdiction_code);
CREATE INDEX IF NOT EXISTS idx_reg_req_type ON regulatory_requirements(requirement_type);

-- 6. Regulatory Controls Catalogue
CREATE TABLE IF NOT EXISTS regulatory_controls (
  id UUID PRIMARY KEY,
  control_code VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  control_domain VARCHAR(60) NOT NULL,
  jurisdiction_code VARCHAR(10) NOT NULL DEFAULT 'KE',
  control_type VARCHAR(60) NOT NULL DEFAULT 'TECHNICAL',
  implementation_owner VARCHAR(120) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  technical_enforcement TEXT NOT NULL,
  evidence_requirement TEXT NOT NULL,
  evidence_status VARCHAR(60) NOT NULL DEFAULT 'IMPLEMENTED_UNVERIFIED',
  last_verified_at TIMESTAMPTZ,
  verified_by VARCHAR(120),
  evidence_vault_ref VARCHAR(120),
  policy_version VARCHAR(30) NOT NULL DEFAULT '1.0.0',
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reg_controls_code ON regulatory_controls(control_code);
CREATE INDEX IF NOT EXISTS idx_reg_controls_domain ON regulatory_controls(control_domain);

-- 7. Requirement-to-Control Mappings
CREATE TABLE IF NOT EXISTS regulatory_requirement_controls (
  id UUID PRIMARY KEY,
  requirement_id UUID NOT NULL REFERENCES regulatory_requirements(id) ON DELETE CASCADE,
  control_id UUID NOT NULL REFERENCES regulatory_controls(id) ON DELETE CASCADE,
  relationship VARCHAR(60) NOT NULL DEFAULT 'IMPLEMENTS',
  mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  coverage VARCHAR(30) NOT NULL DEFAULT 'FULL',
  assessment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(requirement_id, control_id)
);

CREATE INDEX IF NOT EXISTS idx_req_ctl_req ON regulatory_requirement_controls(requirement_id);
CREATE INDEX IF NOT EXISTS idx_req_ctl_ctl ON regulatory_requirement_controls(control_id);

-- 8. Extend regulatory_classifications table
ALTER TABLE regulatory_classifications ADD COLUMN IF NOT EXISTS resource_id VARCHAR(120);
ALTER TABLE regulatory_classifications ADD COLUMN IF NOT EXISTS resource_version VARCHAR(30) DEFAULT '1.0.0';
ALTER TABLE regulatory_classifications ADD COLUMN IF NOT EXISTS jurisdiction_code VARCHAR(10) DEFAULT 'KE';
ALTER TABLE regulatory_classifications ADD COLUMN IF NOT EXISTS classification_type VARCHAR(60) DEFAULT 'DIGITAL_HEALTH_SERVICE';
ALTER TABLE regulatory_classifications ADD COLUMN IF NOT EXISTS classification VARCHAR(100) DEFAULT 'REGULATED_HEALTH_SYSTEM';
ALTER TABLE regulatory_classifications ADD COLUMN IF NOT EXISTS confidence NUMERIC(5, 2) DEFAULT 1.0;
ALTER TABLE regulatory_classifications ADD COLUMN IF NOT EXISTS review_required BOOLEAN DEFAULT TRUE;
ALTER TABLE regulatory_classifications ADD COLUMN IF NOT EXISTS reason_codes TEXT[] DEFAULT '{}';
ALTER TABLE regulatory_classifications ADD COLUMN IF NOT EXISTS policy_version VARCHAR(30) DEFAULT '1.0.0';
ALTER TABLE regulatory_classifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE regulatory_classifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_reg_class_resource ON regulatory_classifications(resource_id);

-- 9. Regulatory Assessments
CREATE TABLE IF NOT EXISTS regulatory_assessments (
  id UUID PRIMARY KEY,
  resource_id VARCHAR(120) NOT NULL,
  resource_version VARCHAR(30) NOT NULL DEFAULT '1.0.0',
  jurisdiction_code VARCHAR(10) NOT NULL DEFAULT 'KE',
  classification_id UUID NOT NULL,
  status VARCHAR(60) NOT NULL DEFAULT 'DRAFT',
  applicable_requirements TEXT[] NOT NULL DEFAULT '{}',
  control_assessment JSONB NOT NULL DEFAULT '{}',
  open_gaps_count INTEGER NOT NULL DEFAULT 0,
  reviewer_id VARCHAR(120),
  decision VARCHAR(60),
  decision_reason TEXT,
  conditions JSONB NOT NULL DEFAULT '[]',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reg_assess_res ON regulatory_assessments(resource_id);
CREATE INDEX IF NOT EXISTS idx_reg_assess_jur ON regulatory_assessments(jurisdiction_code);
CREATE INDEX IF NOT EXISTS idx_reg_assess_status ON regulatory_assessments(status);

-- 10. Regulatory Gaps & Remediations
CREATE TABLE IF NOT EXISTS regulatory_gaps (
  id UUID PRIMARY KEY,
  assessment_id UUID NOT NULL REFERENCES regulatory_assessments(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL,
  control_id UUID,
  gap_type VARCHAR(60) NOT NULL,
  severity VARCHAR(30) NOT NULL DEFAULT 'HIGH',
  description TEXT NOT NULL,
  remediation_required TEXT NOT NULL,
  owner VARCHAR(120) NOT NULL,
  status VARCHAR(60) NOT NULL DEFAULT 'OPEN',
  due_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verified_by VARCHAR(120),
  evidence_vault_ref VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reg_gaps_assess ON regulatory_gaps(assessment_id);
CREATE INDEX IF NOT EXISTS idx_reg_gaps_status ON regulatory_gaps(status);

-- 11. Regulatory Approvals (Immutable version-bound, jurisdiction-bound decision artifacts)
CREATE TABLE IF NOT EXISTS regulatory_approvals (
  id UUID PRIMARY KEY,
  resource_id VARCHAR(120) NOT NULL,
  resource_version VARCHAR(30) NOT NULL DEFAULT '1.0.0',
  jurisdiction_code VARCHAR(10) NOT NULL DEFAULT 'KE',
  assessment_id UUID NOT NULL,
  classification_id UUID NOT NULL,
  source_versions JSONB NOT NULL DEFAULT '{}',
  requirement_set TEXT[] NOT NULL DEFAULT '{}',
  control_evidence JSONB NOT NULL DEFAULT '{}',
  reviewer_id VARCHAR(120) NOT NULL,
  decision VARCHAR(60) NOT NULL DEFAULT 'APPROVED',
  conditions JSONB NOT NULL DEFAULT '[]',
  policy_version VARCHAR(30) NOT NULL DEFAULT '1.0.0',
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  revoked_by VARCHAR(120),
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  evidence_vault_ref VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(resource_id, resource_version, jurisdiction_code)
);

CREATE INDEX IF NOT EXISTS idx_reg_appr_res ON regulatory_approvals(resource_id);
CREATE INDEX IF NOT EXISTS idx_reg_appr_jur ON regulatory_approvals(jurisdiction_code);
CREATE INDEX IF NOT EXISTS idx_reg_appr_status ON regulatory_approvals(status);

-- 12. Regulatory Impact Assessments (Source Change Workflow)
CREATE TABLE IF NOT EXISTS regulatory_impact_assessments (
  id UUID PRIMARY KEY,
  source_change_id VARCHAR(120) NOT NULL,
  source_code VARCHAR(60) NOT NULL,
  old_version VARCHAR(30) NOT NULL,
  new_version VARCHAR(30) NOT NULL,
  jurisdiction_code VARCHAR(10) NOT NULL DEFAULT 'KE',
  affected_requirements TEXT[] NOT NULL DEFAULT '{}',
  affected_controls TEXT[] NOT NULL DEFAULT '{}',
  affected_processing_activities TEXT[] NOT NULL DEFAULT '{}',
  affected_clinical_artifacts TEXT[] NOT NULL DEFAULT '{}',
  affected_ai_systems TEXT[] NOT NULL DEFAULT '{}',
  affected_features TEXT[] NOT NULL DEFAULT '{}',
  affected_releases TEXT[] NOT NULL DEFAULT '{}',
  risk_level VARCHAR(30) NOT NULL DEFAULT 'HIGH',
  human_review_required BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(60) NOT NULL DEFAULT 'PENDING_REVIEW',
  assessed_by VARCHAR(120),
  assessed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Certification Requirements & External Regulatory Statuses
CREATE TABLE IF NOT EXISTS certification_requirements (
  id UUID PRIMARY KEY,
  authority_code VARCHAR(60) NOT NULL,
  certification_name VARCHAR(255) NOT NULL,
  jurisdiction_code VARCHAR(10) NOT NULL DEFAULT 'KE',
  applicable_to_resources TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(60) NOT NULL DEFAULT 'NOT_REQUIRED',
  verification_doc_ref VARCHAR(120),
  issued_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  verified_by VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS external_regulatory_statuses (
  id UUID PRIMARY KEY,
  authority_code VARCHAR(60) NOT NULL,
  jurisdiction_code VARCHAR(10) NOT NULL DEFAULT 'KE',
  registration_type VARCHAR(100) NOT NULL,
  registration_reference VARCHAR(120),
  status VARCHAR(60) NOT NULL DEFAULT 'REGISTERED',
  effective_date DATE,
  renewal_due_date DATE,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_by VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
