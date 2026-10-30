-- ==============================================================================
-- MINDOS CANONICAL MIGRATION: 013_canonical_clinical_safety_kernel.sql
-- ==============================================================================
-- Purpose: Formalize Clinical Safety Kernel persistence:
--          Safety Signals, Risk Factors, Protective Factors, Canonical Risk States,
--          Safety Actions, Safety Escalations, Clinical Safety Reviews,
--          Safety Resources & Versions, Safety Incidents, and Break-Glass Sessions.
-- Authority: Master Architecture Index Section 6, Volumes I, V, IX, XV & Appendices B / C / G / J / P / Q
--            Clinical Safety Policy Catalogue (POL-SAFE-001, ART-SAFE-001)
--            Kenya Data Protection Act 2019, Digital Health Act 2023
-- Sprint 14: Clinical Safety Kernel, Risk-State Engine, Signal Detection,
--            Escalation, Crisis Response & Safety Action Orchestration
-- Strategy: Additive expand phase (100% backwards compatible).
-- ==============================================================================

-- UP --

-- 1. Safety Signals (Canonical signal taxonomy, source, provenance, and normalized evidence)
CREATE TABLE IF NOT EXISTS safety_signals (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signal_type VARCHAR(80) NOT NULL,
  signal_code VARCHAR(80) NOT NULL,
  source_type VARCHAR(60) NOT NULL,
  source_reference VARCHAR(255),
  provenance VARCHAR(60) NOT NULL,
  severity VARCHAR(30) NOT NULL,
  confidence VARCHAR(30) NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_evidence_reference VARCHAR(255),
  normalized_evidence JSONB NOT NULL DEFAULT '{}',
  jurisdiction VARCHAR(30) NOT NULL DEFAULT 'KE',
  status VARCHAR(40) NOT NULL DEFAULT 'DETECTED',
  dismissal_reason TEXT,
  dismissed_by UUID REFERENCES users(id),
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safety_signals_subject ON safety_signals(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_safety_signals_status ON safety_signals(status);
CREATE INDEX IF NOT EXISTS idx_safety_signals_severity ON safety_signals(severity);
CREATE INDEX IF NOT EXISTS idx_safety_signals_code ON safety_signals(signal_code);
CREATE INDEX IF NOT EXISTS idx_safety_signals_observed ON safety_signals(observed_at);

-- 2. Risk Factors
CREATE TABLE IF NOT EXISTS risk_factors (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  factor_type VARCHAR(80) NOT NULL,
  source_signal_id UUID REFERENCES safety_signals(id),
  severity VARCHAR(30) NOT NULL,
  confidence VARCHAR(30) NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  provenance VARCHAR(60) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_factors_subject ON risk_factors(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_risk_factors_status ON risk_factors(status);

-- 3. Protective Factors
CREATE TABLE IF NOT EXISTS protective_factors (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  factor_type VARCHAR(80) NOT NULL,
  source_reference VARCHAR(255),
  confidence VARCHAR(30) NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  provenance VARCHAR(60) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_protective_factors_subject ON protective_factors(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_protective_factors_status ON protective_factors(status);

-- 4. Canonical Risk States (One authoritative active state per subject)
CREATE TABLE IF NOT EXISTS risk_states (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level VARCHAR(40) NOT NULL DEFAULT 'UNKNOWN',
  state_version INTEGER NOT NULL DEFAULT 1,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  previous_state VARCHAR(40),
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  evidence_refs TEXT[] NOT NULL DEFAULT '{}',
  policy_version VARCHAR(60) NOT NULL DEFAULT '2.0.0-CLIN-SAFE',
  clinical_artifact_ref VARCHAR(120) DEFAULT 'ART-SAFE-001',
  source_summary JSONB NOT NULL DEFAULT '{}',
  last_reviewed_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  fresh_until TIMESTAMPTZ NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'CURRENT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_states_subject ON risk_states(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_risk_states_level ON risk_states(level);
CREATE INDEX IF NOT EXISTS idx_risk_states_fresh ON risk_states(fresh_until);
-- Invariant: Exactly one active current risk state per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_states_current_user ON risk_states(subject_user_id) WHERE status = 'CURRENT';

-- 5. Extend safety_actions table with Sprint 14 canonical attributes
ALTER TABLE safety_actions ADD COLUMN IF NOT EXISTS subject_user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE safety_actions ADD COLUMN IF NOT EXISTS risk_state_id UUID REFERENCES risk_states(id) ON DELETE SET NULL;
ALTER TABLE safety_actions ADD COLUMN IF NOT EXISTS priority VARCHAR(30) DEFAULT 'NORMAL';
ALTER TABLE safety_actions ADD COLUMN IF NOT EXISTS status VARCHAR(40) DEFAULT 'PENDING';
ALTER TABLE safety_actions ADD COLUMN IF NOT EXISTS required_by_policy BOOLEAN DEFAULT TRUE;
ALTER TABLE safety_actions ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE safety_actions ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE safety_actions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE safety_actions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE safety_actions ADD COLUMN IF NOT EXISTS assigned_actor_id UUID REFERENCES users(id);
ALTER TABLE safety_actions ADD COLUMN IF NOT EXISTS resource_reference VARCHAR(255);
ALTER TABLE safety_actions ADD COLUMN IF NOT EXISTS policy_version VARCHAR(60) DEFAULT '2.0.0-CLIN-SAFE';
ALTER TABLE safety_actions ADD COLUMN IF NOT EXISTS failure_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_safety_actions_subject ON safety_actions(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_safety_actions_state ON safety_actions(risk_state_id);
CREATE INDEX IF NOT EXISTS idx_safety_actions_status ON safety_actions(status);
CREATE INDEX IF NOT EXISTS idx_safety_actions_priority ON safety_actions(priority);

-- 6. Safety Escalations
CREATE TABLE IF NOT EXISTS safety_escalations (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  risk_state_id UUID REFERENCES risk_states(id) ON DELETE SET NULL,
  escalation_type VARCHAR(60) NOT NULL,
  priority VARCHAR(30) NOT NULL DEFAULT 'NORMAL',
  status VARCHAR(40) NOT NULL DEFAULT 'NEW',
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  assigned_team VARCHAR(80) NOT NULL DEFAULT 'CLINICAL_SAFETY',
  assigned_actor_id UUID REFERENCES users(id),
  escalation_target VARCHAR(255),
  outcome TEXT,
  policy_version VARCHAR(60) NOT NULL DEFAULT '2.0.0-CLIN-SAFE',
  sla_acknowledgement_due_at TIMESTAMPTZ NOT NULL,
  sla_resolution_due_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_safety_escalations_subject ON safety_escalations(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_safety_escalations_status ON safety_escalations(status);
CREATE INDEX IF NOT EXISTS idx_safety_escalations_priority ON safety_escalations(priority);
CREATE INDEX IF NOT EXISTS idx_safety_escalations_ack ON safety_escalations(acknowledged_at);
CREATE INDEX IF NOT EXISTS idx_safety_escalations_sla_ack ON safety_escalations(sla_acknowledgement_due_at);

-- 7. Safety Reviews (Human Reviewer decisions & provenance)
CREATE TABLE IF NOT EXISTS safety_reviews (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  escalation_id UUID REFERENCES safety_escalations(id) ON DELETE SET NULL,
  risk_state_id UUID REFERENCES risk_states(id) ON DELETE SET NULL,
  reviewer_id UUID NOT NULL REFERENCES users(id),
  reviewer_role VARCHAR(60) NOT NULL,
  qualification_reference VARCHAR(120),
  decision VARCHAR(60) NOT NULL,
  proposed_risk_level VARCHAR(40),
  rationale TEXT NOT NULL,
  evidence_refs TEXT[] NOT NULL DEFAULT '{}',
  clinical_artifact_ref VARCHAR(120) DEFAULT 'ART-SAFE-001',
  policy_version VARCHAR(60) NOT NULL DEFAULT '2.0.0-CLIN-SAFE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safety_reviews_subject ON safety_reviews(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_safety_reviews_reviewer ON safety_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_safety_reviews_escalation ON safety_reviews(escalation_id);

-- 8. Safety Resources (Canonical verified directory)
CREATE TABLE IF NOT EXISTS safety_resources (
  id UUID PRIMARY KEY,
  resource_code VARCHAR(80) UNIQUE NOT NULL,
  resource_type VARCHAR(60) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  jurisdiction VARCHAR(30) NOT NULL DEFAULT 'KE',
  region VARCHAR(80),
  contact_method VARCHAR(40) NOT NULL DEFAULT 'PHONE',
  phone VARCHAR(60),
  sms VARCHAR(60),
  web VARCHAR(255),
  physical_reference TEXT,
  availability_json JSONB NOT NULL DEFAULT '{}',
  languages TEXT[] NOT NULL DEFAULT '{"English", "Swahili"}',
  population TEXT[] NOT NULL DEFAULT '{"ALL"}',
  risk_applicability TEXT[] NOT NULL DEFAULT '{"SUICIDE_SELF_HARM"}',
  verification_status VARCHAR(40) NOT NULL DEFAULT 'VERIFIED',
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  source_reference VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safety_resources_code ON safety_resources(resource_code);
CREATE INDEX IF NOT EXISTS idx_safety_resources_jurisdiction ON safety_resources(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_safety_resources_type ON safety_resources(resource_type);
CREATE INDEX IF NOT EXISTS idx_safety_resources_status ON safety_resources(status);
CREATE INDEX IF NOT EXISTS idx_safety_resources_expires ON safety_resources(expires_at);

-- 9. Safety Resource Versions
CREATE TABLE IF NOT EXISTS safety_resource_versions (
  id UUID PRIMARY KEY,
  resource_id UUID NOT NULL REFERENCES safety_resources(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  snapshot_json JSONB NOT NULL,
  verified_by UUID NOT NULL REFERENCES users(id),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safety_resource_versions_res ON safety_resource_versions(resource_id);

-- 10. Safety Incidents (System-level failures)
CREATE TABLE IF NOT EXISTS safety_incidents (
  id UUID PRIMARY KEY,
  incident_type VARCHAR(80) NOT NULL,
  severity VARCHAR(30) NOT NULL,
  affected_component VARCHAR(120) NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  description_reference TEXT NOT NULL,
  governance_impact VARCHAR(80),
  release_action VARCHAR(80),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safety_incidents_type ON safety_incidents(incident_type);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_status ON safety_incidents(status);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_severity ON safety_incidents(severity);

-- 11. Safety Break-Glass Sessions
CREATE TABLE IF NOT EXISTS safety_break_glass_sessions (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES users(id),
  actor_role VARCHAR(60) NOT NULL,
  justification TEXT NOT NULL,
  purpose VARCHAR(60) NOT NULL DEFAULT 'SAFETY_RESPONSE',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  terminated_at TIMESTAMPTZ,
  post_review_required BOOLEAN NOT NULL DEFAULT TRUE,
  post_review_id UUID REFERENCES safety_reviews(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safety_break_glass_subject ON safety_break_glass_sessions(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_safety_break_glass_actor ON safety_break_glass_sessions(actor_id);
CREATE INDEX IF NOT EXISTS idx_safety_break_glass_expires ON safety_break_glass_sessions(expires_at);

-- DOWN --
-- Rollback statements (non-destructive for additive schema in production)
