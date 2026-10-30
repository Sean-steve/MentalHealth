-- ==============================================================================
-- MINDOS CANONICAL MIGRATION: 012_canonical_ai_safety_governance.sql
-- ==============================================================================
-- Purpose: Formalize AI Safety Governance persistence:
--          AI Systems, AI Configurations, AI Models, AI Prompts & Prompt Versions,
--          AI Tools & Toolsets, AI Data Access Policies, AI Memory Policies,
--          AI Output Policies, AI Safety Policies, AI Evaluation Suites & Datasets,
--          AI Evaluation Runs, AI Red-Team Campaigns & Findings, AI Safety Reviews,
--          AI Approvals, and AI Incidents.
-- Authority: Master Architecture Index Section 7, Volumes I, III, IV, XV & Appendices B / C / H / Q
--            Kenya Data Protection Act 2019, Digital Health Act 2023
-- Sprint 13: AI System Registry, Model/Prompt Governance, Safety Evaluations,
--            Red-Team Controls, Human Oversight & AI Release Authorization
-- Strategy: Additive expand phase (100% backwards compatible).
-- Rollback/Recovery: Handled via down block.
-- ==============================================================================

-- UP --

-- 1. Extend ai_systems table with canonical Sprint 13 attributes
ALTER TABLE ai_systems ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE ai_systems ADD COLUMN IF NOT EXISTS system_type VARCHAR(60) DEFAULT 'CONVERSATIONAL_SUPPORT';
ALTER TABLE ai_systems ADD COLUMN IF NOT EXISTS owner_domain VARCHAR(60) DEFAULT 'clinical';
ALTER TABLE ai_systems ADD COLUMN IF NOT EXISTS user_population TEXT[] DEFAULT '{"ADULTS_18_PLUS"}';
ALTER TABLE ai_systems ADD COLUMN IF NOT EXISTS clinical_relevance BOOLEAN DEFAULT FALSE;
ALTER TABLE ai_systems ADD COLUMN IF NOT EXISTS safety_relevance BOOLEAN DEFAULT TRUE;
ALTER TABLE ai_systems ADD COLUMN IF NOT EXISTS current_configuration_version VARCHAR(30);
ALTER TABLE ai_systems ADD COLUMN IF NOT EXISTS supersedes_id UUID REFERENCES ai_systems(id);
ALTER TABLE ai_systems ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ai_systems_code ON ai_systems(code);
CREATE INDEX IF NOT EXISTS idx_ai_systems_type ON ai_systems(system_type);
CREATE INDEX IF NOT EXISTS idx_ai_systems_risk ON ai_systems(risk_class);
CREATE INDEX IF NOT EXISTS idx_ai_systems_state ON ai_systems(state);

-- 2. Extend ai_models table with provider reference and canonical attributes
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS provider_id UUID;
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS model_code VARCHAR(120);
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS version VARCHAR(60) DEFAULT '1.0.0';
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS model_family VARCHAR(60) DEFAULT 'TRANSFORMER';
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS capabilities TEXT[] DEFAULT '{"TEXT_GENERATION"}';
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS limitations TEXT[] DEFAULT '{}';
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS context_window INTEGER DEFAULT 8192;
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS tool_support BOOLEAN DEFAULT TRUE;
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS structured_output_support BOOLEAN DEFAULT TRUE;
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS deployment_region VARCHAR(60) DEFAULT 'AFRICA_KE';
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS first_approved_at TIMESTAMPTZ;
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ;
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_ai_models_code ON ai_models(model_code);
CREATE INDEX IF NOT EXISTS idx_ai_models_provider ON ai_models(provider_id);
CREATE INDEX IF NOT EXISTS idx_ai_models_status ON ai_models(status);

-- 3. AI Prompts & Prompt Versions
CREATE TABLE IF NOT EXISTS ai_prompts (
  id UUID PRIMARY KEY,
  prompt_code VARCHAR(120) UNIQUE NOT NULL,
  ai_system_id UUID REFERENCES ai_systems(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  prompt_type VARCHAR(60) NOT NULL,
  clinical_classification VARCHAR(60) DEFAULT 'NON_CLINICAL',
  safety_classification VARCHAR(60) DEFAULT 'STANDARD',
  owner_id VARCHAR(120) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_prompts_code ON ai_prompts(prompt_code);
CREATE INDEX IF NOT EXISTS idx_ai_prompts_system ON ai_prompts(ai_system_id);

CREATE TABLE IF NOT EXISTS ai_prompt_versions (
  id UUID PRIMARY KEY,
  prompt_id UUID NOT NULL REFERENCES ai_prompts(id) ON DELETE CASCADE,
  prompt_code VARCHAR(120) NOT NULL,
  version INTEGER NOT NULL,
  content_text TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  supersedes_id UUID REFERENCES ai_prompt_versions(id),
  UNIQUE(prompt_code, version)
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_prompt ON ai_prompt_versions(prompt_id);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_hash ON ai_prompt_versions(content_hash);

-- 4. AI Tools Registry
CREATE TABLE IF NOT EXISTS ai_tools (
  id UUID PRIMARY KEY,
  code VARCHAR(120) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  capability VARCHAR(120) NOT NULL,
  risk_class VARCHAR(20) NOT NULL DEFAULT 'LOW',
  category VARCHAR(60) NOT NULL DEFAULT 'READ_ONLY',
  required_authorization TEXT[] NOT NULL DEFAULT '{}',
  required_purpose VARCHAR(120) NOT NULL,
  required_consent TEXT[] NOT NULL DEFAULT '{}',
  input_schema JSONB NOT NULL DEFAULT '{}',
  output_schema JSONB NOT NULL DEFAULT '{}',
  side_effect_type VARCHAR(60) NOT NULL DEFAULT 'NONE',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  version VARCHAR(30) NOT NULL DEFAULT '1.0.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_tools_code ON ai_tools(code);
CREATE INDEX IF NOT EXISTS idx_ai_tools_category ON ai_tools(category);
CREATE INDEX IF NOT EXISTS idx_ai_tools_risk ON ai_tools(risk_class);

-- 5. AI Policy Framework (Data Access, Memory, Output, Safety)
CREATE TABLE IF NOT EXISTS ai_data_access_policies (
  id UUID PRIMARY KEY,
  ai_system_id UUID NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  allowed_data_categories TEXT[] NOT NULL DEFAULT '{}',
  prohibited_data_categories TEXT[] NOT NULL DEFAULT '{}',
  purpose VARCHAR(120) NOT NULL,
  maximum_scope VARCHAR(120) NOT NULL DEFAULT 'MINIMUM_NECESSARY',
  consent_requirements TEXT[] NOT NULL DEFAULT '{}',
  relationship_requirements TEXT[] NOT NULL DEFAULT '{}',
  retention_behavior VARCHAR(120) NOT NULL DEFAULT 'TRANSIENT_SESSION_ONLY',
  provider_transfer_policy VARCHAR(120) NOT NULL DEFAULT 'EU_US_KE_APPROVED',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ai_system_id, version)
);

CREATE TABLE IF NOT EXISTS ai_memory_policies (
  id UUID PRIMARY KEY,
  ai_system_id UUID NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  memory_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_memory_categories TEXT[] NOT NULL DEFAULT '{}',
  prohibited_memory_categories TEXT[] NOT NULL DEFAULT '{}',
  write_conditions TEXT[] NOT NULL DEFAULT '{}',
  read_conditions TEXT[] NOT NULL DEFAULT '{}',
  consent_requirement VARCHAR(60) NOT NULL DEFAULT 'AI_MEMORY',
  retention_policy VARCHAR(120) NOT NULL DEFAULT '30_DAYS_EPHEMERAL',
  user_visibility BOOLEAN NOT NULL DEFAULT TRUE,
  user_editability BOOLEAN NOT NULL DEFAULT TRUE,
  user_deletion_behavior VARCHAR(120) NOT NULL DEFAULT 'IMMEDIATE_HARD_DELETE',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ai_system_id, version)
);

CREATE TABLE IF NOT EXISTS ai_output_policies (
  id UUID PRIMARY KEY,
  ai_system_id UUID NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  allowed_output_classes TEXT[] NOT NULL DEFAULT '{}',
  prohibited_output_classes TEXT[] NOT NULL DEFAULT '{}',
  required_disclaimers TEXT[] NOT NULL DEFAULT '{}',
  clinical_claim_boundaries TEXT[] NOT NULL DEFAULT '{}',
  safety_response_requirements TEXT[] NOT NULL DEFAULT '{}',
  professional_referral_rules TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ai_system_id, version)
);

-- 6. AI Configurations (Governed Holistic Bundles)
CREATE TABLE IF NOT EXISTS ai_configurations (
  id UUID PRIMARY KEY,
  ai_system_id UUID NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  version VARCHAR(30) NOT NULL,
  provider_id UUID,
  model_id UUID NOT NULL REFERENCES ai_models(id),
  model_version VARCHAR(60) NOT NULL,
  prompt_versions JSONB NOT NULL DEFAULT '{}',
  prompt_hashes JSONB NOT NULL DEFAULT '{}',
  toolset_codes TEXT[] NOT NULL DEFAULT '{}',
  toolset_version VARCHAR(30) NOT NULL DEFAULT '1.0.0',
  data_access_policy_version INTEGER NOT NULL DEFAULT 1,
  memory_policy_version INTEGER NOT NULL DEFAULT 1,
  safety_policy_version INTEGER NOT NULL DEFAULT 1,
  output_policy_version INTEGER NOT NULL DEFAULT 1,
  sampling_controls JSONB NOT NULL DEFAULT '{"temperature": 0.2, "top_p": 0.95}',
  jurisdiction VARCHAR(10) NOT NULL DEFAULT 'KE',
  population VARCHAR(60) NOT NULL DEFAULT 'ADULTS_18_PLUS',
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  configuration_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  supersedes_id UUID REFERENCES ai_configurations(id),
  UNIQUE(ai_system_id, version),
  UNIQUE(configuration_hash)
);

CREATE INDEX IF NOT EXISTS idx_ai_configurations_system ON ai_configurations(ai_system_id);
CREATE INDEX IF NOT EXISTS idx_ai_configurations_hash ON ai_configurations(configuration_hash);
CREATE INDEX IF NOT EXISTS idx_ai_configurations_status ON ai_configurations(status);

-- 7. AI Evaluation Datasets & Evaluation Suites
CREATE TABLE IF NOT EXISTS ai_evaluation_datasets (
  id UUID PRIMARY KEY,
  code VARCHAR(120) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(30) NOT NULL,
  purpose TEXT NOT NULL,
  scenario_categories TEXT[] NOT NULL DEFAULT '{}',
  data_source_type VARCHAR(60) NOT NULL DEFAULT 'SYNTHETIC',
  synthetic_or_real VARCHAR(60) NOT NULL DEFAULT 'SYNTHETIC',
  classification VARCHAR(60) NOT NULL DEFAULT 'CONFIDENTIAL',
  population_coverage TEXT[] NOT NULL DEFAULT '{"ADULTS_18_PLUS"}',
  jurisdiction VARCHAR(10) NOT NULL DEFAULT 'KE',
  consent_privacy_reference VARCHAR(120),
  test_cases_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(code, version)
);

CREATE TABLE IF NOT EXISTS ai_evaluation_suites (
  id UUID PRIMARY KEY,
  code VARCHAR(120) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(30) NOT NULL,
  evaluation_type VARCHAR(60) NOT NULL,
  dataset_id UUID REFERENCES ai_evaluation_datasets(id),
  threshold_policy_id VARCHAR(120) NOT NULL DEFAULT 'STANDARD_PASS_GATE',
  critical_failure_tolerance INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(code, version)
);

-- 8. Extend ai_evaluation_runs table
ALTER TABLE ai_evaluation_runs ADD COLUMN IF NOT EXISTS ai_system_id UUID REFERENCES ai_systems(id);
ALTER TABLE ai_evaluation_runs ADD COLUMN IF NOT EXISTS configuration_version VARCHAR(30);
ALTER TABLE ai_evaluation_runs ADD COLUMN IF NOT EXISTS configuration_hash VARCHAR(64);
ALTER TABLE ai_evaluation_runs ADD COLUMN IF NOT EXISTS evaluation_type VARCHAR(60) DEFAULT 'SAFETY';
ALTER TABLE ai_evaluation_runs ADD COLUMN IF NOT EXISTS dataset_version VARCHAR(30);
ALTER TABLE ai_evaluation_runs ADD COLUMN IF NOT EXISTS status VARCHAR(40) DEFAULT 'COMPLETED';
ALTER TABLE ai_evaluation_runs ADD COLUMN IF NOT EXISTS threshold_policy_version VARCHAR(60) DEFAULT '1.0.0';
ALTER TABLE ai_evaluation_runs ADD COLUMN IF NOT EXISTS evidence_id UUID;
ALTER TABLE ai_evaluation_runs ADD COLUMN IF NOT EXISTS evidence_hash VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_ai_eval_runs_config_hash ON ai_evaluation_runs(configuration_hash);
CREATE INDEX IF NOT EXISTS idx_ai_eval_runs_type ON ai_evaluation_runs(evaluation_type);

-- 9. Red-Team Adversarial Campaigns & Findings
CREATE TABLE IF NOT EXISTS ai_red_team_campaigns (
  id UUID PRIMARY KEY,
  ai_system_id UUID NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  configuration_version VARCHAR(30) NOT NULL,
  configuration_hash VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  scope TEXT[] NOT NULL DEFAULT '{}',
  scenario_categories TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(40) NOT NULL DEFAULT 'PLANNED',
  owner VARCHAR(120) NOT NULL,
  reviewers TEXT[] NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  findings_summary JSONB NOT NULL DEFAULT '{"total_findings": 0, "critical": 0, "high": 0, "medium": 0, "low": 0, "open_findings": 0}',
  decision VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  evidence_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_red_team_system ON ai_red_team_campaigns(ai_system_id);
CREATE INDEX IF NOT EXISTS idx_ai_red_team_config ON ai_red_team_campaigns(configuration_hash);

CREATE TABLE IF NOT EXISTS ai_red_team_findings (
  id UUID PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES ai_red_team_campaigns(id) ON DELETE CASCADE,
  category VARCHAR(60) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  scenario_description TEXT NOT NULL,
  reproduction_steps TEXT NOT NULL,
  affected_policy VARCHAR(120) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  remediation_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_red_team_findings_camp ON ai_red_team_findings(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ai_red_team_findings_sev ON ai_red_team_findings(severity);
CREATE INDEX IF NOT EXISTS idx_ai_red_team_findings_stat ON ai_red_team_findings(status);

-- 10. AI Safety Reviews & Formal AI Approvals
CREATE TABLE IF NOT EXISTS ai_safety_reviews (
  id UUID PRIMARY KEY,
  ai_system_id UUID NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  configuration_version VARCHAR(30) NOT NULL,
  configuration_hash VARCHAR(64) NOT NULL,
  governance_case_id UUID REFERENCES governance_cases(id),
  reviewer_id VARCHAR(120) NOT NULL,
  reviewer_role VARCHAR(60) NOT NULL,
  risk_assessment JSONB NOT NULL DEFAULT '{}',
  evaluation_assessment JSONB NOT NULL DEFAULT '{}',
  red_team_assessment JSONB NOT NULL DEFAULT '{}',
  clinical_boundary_assessment JSONB NOT NULL DEFAULT '{}',
  privacy_assessment JSONB NOT NULL DEFAULT '{}',
  tool_assessment JSONB NOT NULL DEFAULT '{}',
  decision VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  decision_reason TEXT,
  conditions JSONB NOT NULL DEFAULT '[]',
  policy_version VARCHAR(30) NOT NULL DEFAULT '1.0.0',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_safety_reviews_system ON ai_safety_reviews(ai_system_id);
CREATE INDEX IF NOT EXISTS idx_ai_safety_reviews_config ON ai_safety_reviews(configuration_hash);
CREATE INDEX IF NOT EXISTS idx_ai_safety_reviews_case ON ai_safety_reviews(governance_case_id);

CREATE TABLE IF NOT EXISTS ai_approvals (
  id UUID PRIMARY KEY,
  ai_system_id UUID NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  configuration_version VARCHAR(30) NOT NULL,
  configuration_hash VARCHAR(64) NOT NULL,
  provider_id UUID,
  model_version VARCHAR(60) NOT NULL,
  prompt_versions JSONB NOT NULL DEFAULT '{}',
  toolset_version VARCHAR(30) NOT NULL DEFAULT '1.0.0',
  data_access_policy_version INTEGER NOT NULL DEFAULT 1,
  memory_policy_version INTEGER NOT NULL DEFAULT 1,
  safety_policy_version INTEGER NOT NULL DEFAULT 1,
  evaluation_suite_ids TEXT[] NOT NULL DEFAULT '{}',
  dataset_versions JSONB NOT NULL DEFAULT '{}',
  red_team_campaign_ids TEXT[] NOT NULL DEFAULT '{}',
  jurisdiction VARCHAR(10) NOT NULL DEFAULT 'KE',
  population VARCHAR(60) NOT NULL DEFAULT 'ADULTS_18_PLUS',
  conditions JSONB NOT NULL DEFAULT '[]',
  reviewer_id VARCHAR(120) NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  revoked_by VARCHAR(120),
  UNIQUE(configuration_hash, jurisdiction, population)
);

CREATE INDEX IF NOT EXISTS idx_ai_approvals_system ON ai_approvals(ai_system_id);
CREATE INDEX IF NOT EXISTS idx_ai_approvals_hash ON ai_approvals(configuration_hash);
CREATE INDEX IF NOT EXISTS idx_ai_approvals_status ON ai_approvals(status);
CREATE INDEX IF NOT EXISTS idx_ai_approvals_expiry ON ai_approvals(expires_at);

-- 11. Extend ai_incidents table
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS ai_system_id UUID REFERENCES ai_systems(id);
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS configuration_version VARCHAR(30);
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS source VARCHAR(60) DEFAULT 'RUNTIME_MONITOR';
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS description_reference TEXT;
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS detected_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS owner VARCHAR(120);
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS safety_impact TEXT;
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS clinical_impact TEXT;
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS privacy_impact TEXT;
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS security_impact TEXT;
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS regulatory_impact TEXT;
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS release_action VARCHAR(60) DEFAULT 'NONE';
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ai_incidents_system ON ai_incidents(ai_system_id);
CREATE INDEX IF NOT EXISTS idx_ai_incidents_type ON ai_incidents(incident_type);
CREATE INDEX IF NOT EXISTS idx_ai_incidents_severity ON ai_incidents(severity);

-- DOWN --
DROP TABLE IF EXISTS ai_approvals CASCADE;
DROP TABLE IF EXISTS ai_safety_reviews CASCADE;
DROP TABLE IF EXISTS ai_red_team_findings CASCADE;
DROP TABLE IF EXISTS ai_red_team_campaigns CASCADE;
DROP TABLE IF EXISTS ai_evaluation_suites CASCADE;
DROP TABLE IF EXISTS ai_evaluation_datasets CASCADE;
DROP TABLE IF EXISTS ai_configurations CASCADE;
DROP TABLE IF EXISTS ai_output_policies CASCADE;
DROP TABLE IF EXISTS ai_memory_policies CASCADE;
DROP TABLE IF EXISTS ai_data_access_policies CASCADE;
DROP TABLE IF EXISTS ai_tools CASCADE;
DROP TABLE IF EXISTS ai_prompt_versions CASCADE;
DROP TABLE IF EXISTS ai_prompts CASCADE;
