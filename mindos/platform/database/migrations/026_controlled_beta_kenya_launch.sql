-- Sprint 28: Controlled Beta & Kenya Launch Readiness

CREATE TABLE IF NOT EXISTS launch_programs (
  id UUID PRIMARY KEY,
  code VARCHAR(120) UNIQUE NOT NULL,
  release_id VARCHAR(160) NOT NULL,
  version VARCHAR(80) NOT NULL,
  build_sha VARCHAR(128) NOT NULL,
  jurisdiction CHAR(2) NOT NULL CHECK(jurisdiction='KE'),
  state VARCHAR(40) NOT NULL,
  owner_id VARCHAR(160) NOT NULL,
  feature_keys JSONB NOT NULL DEFAULT '[]',
  scope_json JSONB NOT NULL,
  beta_max_participants INTEGER NOT NULL CHECK(beta_max_participants > 0),
  limited_launch_max_participants INTEGER NOT NULL CHECK(limited_launch_max_participants >= beta_max_participants),
  required_external_authorities JSONB NOT NULL DEFAULT '[]',
  regulatory_scope_evidence_ref VARCHAR(255) NOT NULL,
  beta_starts_at TIMESTAMPTZ,
  beta_ends_at TIMESTAMPTZ,
  limited_launch_starts_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  paused_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_launch_programs_release_build ON launch_programs(release_id,build_sha,state);

CREATE TABLE IF NOT EXISTS launch_participants (
  id UUID PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES launch_programs(id) ON DELETE CASCADE,
  subject_ref_hash CHAR(64) NOT NULL,
  participant_type VARCHAR(24) NOT NULL CHECK(participant_type IN ('USER','PROFESSIONAL')),
  jurisdiction CHAR(2) NOT NULL CHECK(jurisdiction='KE'),
  state VARCHAR(20) NOT NULL CHECK(state IN ('INVITED','ENROLLED','WITHDRAWN','SUSPENDED')),
  invitation_ref VARCHAR(255) NOT NULL,
  consent_receipt_ref VARCHAR(255) NOT NULL,
  eligibility_evidence_refs JSONB NOT NULL DEFAULT '[]',
  enrolled_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  suspended_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(program_id,subject_ref_hash)
);
CREATE INDEX IF NOT EXISTS idx_launch_participants_program_state ON launch_participants(program_id,state);

CREATE TABLE IF NOT EXISTS launch_evidence_packages (
  id UUID PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES launch_programs(id) ON DELETE CASCADE,
  release_id VARCHAR(160) NOT NULL,
  build_sha VARCHAR(128) NOT NULL,
  items JSONB NOT NULL,
  manifest_hash CHAR(64) NOT NULL,
  generated_by VARCHAR(160) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_launch_evidence_packages_program ON launch_evidence_packages(program_id,generated_at DESC);

CREATE TABLE IF NOT EXISTS launch_monitoring_snapshots (
  id UUID PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES launch_programs(id) ON DELETE CASCADE,
  build_sha VARCHAR(128) NOT NULL,
  environment VARCHAR(20) NOT NULL CHECK(environment IN ('production','staging')),
  status VARCHAR(12) NOT NULL CHECK(status IN ('GREEN','AMBER','RED')),
  critical_launch_blockers INTEGER NOT NULL DEFAULT 0 CHECK(critical_launch_blockers >= 0),
  open_critical_incidents INTEGER NOT NULL DEFAULT 0 CHECK(open_critical_incidents >= 0),
  safety_resources_valid BOOLEAN NOT NULL,
  incident_response_ready BOOLEAN NOT NULL,
  rollback_ready BOOLEAN NOT NULL,
  database_healthy BOOLEAN NOT NULL,
  dr_ready BOOLEAN NOT NULL,
  privacy_lifecycle_clear BOOLEAN NOT NULL,
  notes_codes JSONB NOT NULL DEFAULT '[]',
  captured_by VARCHAR(160) NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_launch_monitoring_program ON launch_monitoring_snapshots(program_id,captured_at DESC);

CREATE TABLE IF NOT EXISTS launch_authorization_decisions (
  id UUID PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES launch_programs(id) ON DELETE CASCADE,
  build_sha VARCHAR(128) NOT NULL,
  decision_type VARCHAR(40) NOT NULL CHECK(decision_type IN ('CONTROLLED_BETA','LIMITED_KENYA_LAUNCH')),
  decision VARCHAR(40) NOT NULL CHECK(decision IN ('APPROVED','APPROVED_WITH_CONDITIONS','BLOCKED')),
  reviewer_id VARCHAR(160) NOT NULL,
  reviewer_role VARCHAR(80) NOT NULL CHECK(reviewer_role='RELEASE_AUTHORITY'),
  evidence_package_id UUID NOT NULL REFERENCES launch_evidence_packages(id) ON DELETE RESTRICT,
  conditions JSONB NOT NULL DEFAULT '[]',
  decided_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_launch_decisions_program ON launch_authorization_decisions(program_id,decided_at DESC);

CREATE TABLE IF NOT EXISTS launch_post_reviews (
  id UUID PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES launch_programs(id) ON DELETE CASCADE,
  build_sha VARCHAR(128) NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  window_ended_at TIMESTAMPTZ NOT NULL,
  incident_refs JSONB NOT NULL DEFAULT '[]',
  monitoring_snapshot_refs JSONB NOT NULL DEFAULT '[]',
  evidence_refs JSONB NOT NULL DEFAULT '[]',
  reviewer_id VARCHAR(160) NOT NULL,
  reviewer_role VARCHAR(80) NOT NULL CHECK(reviewer_role='RELEASE_AUTHORITY'),
  decision VARCHAR(48) NOT NULL CHECK(decision IN ('CONTINUE','HOLD','ROLLBACK','EXPAND_REQUIRES_NEW_AUTHORIZATION')),
  findings JSONB NOT NULL DEFAULT '[]',
  corrective_actions JSONB NOT NULL DEFAULT '[]',
  reviewed_at TIMESTAMPTZ NOT NULL
);

-- DOWN --
DROP TABLE IF EXISTS launch_post_reviews CASCADE;
DROP INDEX IF EXISTS idx_launch_decisions_program;
DROP TABLE IF EXISTS launch_authorization_decisions CASCADE;
DROP INDEX IF EXISTS idx_launch_monitoring_program;
DROP TABLE IF EXISTS launch_monitoring_snapshots CASCADE;
DROP INDEX IF EXISTS idx_launch_evidence_packages_program;
DROP TABLE IF EXISTS launch_evidence_packages CASCADE;
DROP INDEX IF EXISTS idx_launch_participants_program_state;
DROP TABLE IF EXISTS launch_participants CASCADE;
DROP INDEX IF EXISTS idx_launch_programs_release_build;
DROP TABLE IF EXISTS launch_programs CASCADE;
