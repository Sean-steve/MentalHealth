-- Sprint 24: Clinical Operations & Human Escalation
-- Canonical rule: no human-review case may be assigned unless a real staffed capability is configured.

CREATE TABLE IF NOT EXISTS clinical_ops_capabilities (
  id UUID PRIMARY KEY,
  jurisdiction VARCHAR(16) NOT NULL,
  queue_key VARCHAR(80) NOT NULL,
  staffing_state VARCHAR(24) NOT NULL CHECK (staffing_state IN ('UNSTAFFED','STAFFED','PAUSED')),
  qualified_role_codes JSONB NOT NULL DEFAULT '[]',
  coverage_started_at TIMESTAMPTZ,
  coverage_ends_at TIMESTAMPTZ,
  acknowledgement_sla_minutes INTEGER CHECK (acknowledgement_sla_minutes IS NULL OR acknowledgement_sla_minutes > 0),
  resolution_sla_minutes INTEGER CHECK (resolution_sla_minutes IS NULL OR resolution_sla_minutes > 0),
  configured_by VARCHAR(160) NOT NULL,
  configured_at TIMESTAMPTZ NOT NULL,
  policy_version VARCHAR(80) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clinical_ops_capability_lookup
  ON clinical_ops_capabilities(jurisdiction, queue_key, staffing_state, configured_at DESC);

CREATE TABLE IF NOT EXISTS clinical_ops_escalations (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  risk_event_id VARCHAR(180) NOT NULL,
  risk_state VARCHAR(40) NOT NULL,
  level VARCHAR(8) NOT NULL CHECK(level IN ('L0','L1','L2','L3')),
  jurisdiction VARCHAR(16) NOT NULL,
  queue_key VARCHAR(80) NOT NULL,
  state VARCHAR(40) NOT NULL,
  reason_codes JSONB NOT NULL DEFAULT '[]',
  source_summary_reference VARCHAR(240),
  assigned_reviewer_id VARCHAR(160),
  assigned_reviewer_role VARCHAR(100),
  triaged_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  review_started_at TIMESTAMPTZ,
  action_required_at TIMESTAMPTZ,
  follow_up_started_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  resolution_summary_reference VARCHAR(240),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  policy_version VARCHAR(80) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clinical_ops_escalation_queue
  ON clinical_ops_escalations(jurisdiction, queue_key, state, created_at);

CREATE TABLE IF NOT EXISTS clinical_ops_follow_ups (
  id UUID PRIMARY KEY,
  escalation_id UUID NOT NULL REFERENCES clinical_ops_escalations(id) ON DELETE RESTRICT,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type VARCHAR(40) NOT NULL,
  responsible_actor_id VARCHAR(160),
  channel VARCHAR(60),
  scheduled_for TIMESTAMPTZ NOT NULL,
  status VARCHAR(24) NOT NULL,
  completed_at TIMESTAMPTZ,
  outcome_reference VARCHAR(240),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS clinical_ops_incidents (
  id UUID PRIMARY KEY,
  incident_type VARCHAR(120) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  state VARCHAR(40) NOT NULL,
  affected_component VARCHAR(160) NOT NULL,
  linked_escalation_id UUID REFERENCES clinical_ops_escalations(id) ON DELETE SET NULL,
  linked_risk_event_id VARCHAR(180),
  evidence_references JSONB NOT NULL DEFAULT '[]',
  model_version VARCHAR(120),
  safety_policy_version VARCHAR(120),
  release_version VARCHAR(120),
  corrective_action_references JSONB NOT NULL DEFAULT '[]',
  validation_evidence_references JSONB NOT NULL DEFAULT '[]',
  opened_at TIMESTAMPTZ NOT NULL,
  contained_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_by VARCHAR(160) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

-- DOWN --
DROP TABLE IF EXISTS clinical_ops_incidents CASCADE;
DROP TABLE IF EXISTS clinical_ops_follow_ups CASCADE;
DROP TABLE IF EXISTS clinical_ops_escalations CASCADE;
DROP TABLE IF EXISTS clinical_ops_capabilities CASCADE;
