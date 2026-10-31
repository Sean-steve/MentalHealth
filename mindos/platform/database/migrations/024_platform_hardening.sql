-- Sprint 26: Platform Hardening
-- Privacy lifecycle completion, reliability recovery targets and tested restore evidence.

CREATE TABLE IF NOT EXISTS privacy_lifecycle_jobs (
  id UUID PRIMARY KEY,
  subject_ref_hash CHAR(64) NOT NULL,
  request_type VARCHAR(48) NOT NULL CHECK(request_type IN ('ERASURE','ANONYMIZATION','CONSENT_WITHDRAWAL_RESTRICTION')),
  state VARCHAR(24) NOT NULL CHECK(state IN ('REQUESTED','IN_PROGRESS','BLOCKED','FAILED','COMPLETE')),
  target_stores JSONB NOT NULL,
  reason_code VARCHAR(120) NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  failure_reason VARCHAR(180)
);
CREATE INDEX IF NOT EXISTS idx_privacy_lifecycle_jobs_state
  ON privacy_lifecycle_jobs(state,requested_at DESC);

CREATE TABLE IF NOT EXISTS privacy_lifecycle_receipts (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES privacy_lifecycle_jobs(id) ON DELETE CASCADE,
  store_key VARCHAR(40) NOT NULL CHECK(store_key IN ('PRIMARY_DB','OBJECT_STORAGE','VECTOR_STORE','SEARCH_INDEX','ANALYTICS','CACHE')),
  status VARCHAR(24) NOT NULL CHECK(status IN ('ACKNOWLEDGED','BLOCKED','FAILED')),
  evidence_ref VARCHAR(255) NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL,
  detail_code VARCHAR(160),
  UNIQUE(job_id,store_key)
);

CREATE TABLE IF NOT EXISTS reliability_recovery_targets (
  id UUID PRIMARY KEY,
  service_key VARCHAR(120) UNIQUE NOT NULL,
  criticality VARCHAR(40) NOT NULL CHECK(criticality IN ('SAFETY','DATA_INTEGRITY','PRIVACY_SECURITY','IDENTITY_CORE','CARE','AI_COMMUNITY','ANALYTICS_EXPERIMENTS')),
  rpo_seconds INTEGER NOT NULL CHECK(rpo_seconds >= 0),
  rto_seconds INTEGER NOT NULL CHECK(rto_seconds > 0),
  configured_by VARCHAR(160) NOT NULL,
  configured_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS dr_restore_evidence (
  id UUID PRIMARY KEY,
  service_key VARCHAR(120) NOT NULL REFERENCES reliability_recovery_targets(service_key) ON DELETE RESTRICT,
  backup_created_at TIMESTAMPTZ NOT NULL,
  restore_started_at TIMESTAMPTZ NOT NULL,
  restore_completed_at TIMESTAMPTZ NOT NULL,
  measured_rpo_seconds INTEGER NOT NULL CHECK(measured_rpo_seconds >= 0),
  measured_rto_seconds INTEGER NOT NULL CHECK(measured_rto_seconds >= 0),
  integrity_passed BOOLEAN NOT NULL,
  migration_compatible BOOLEAN NOT NULL,
  backup_artifact_hash CHAR(64) NOT NULL,
  evidence_json JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(12) NOT NULL CHECK(status IN ('PASS','FAIL')),
  created_at TIMESTAMPTZ NOT NULL,
  CHECK(restore_started_at >= backup_created_at),
  CHECK(restore_completed_at >= restore_started_at)
);
CREATE INDEX IF NOT EXISTS idx_dr_restore_evidence_service
  ON dr_restore_evidence(service_key,created_at DESC);

-- DOWN --
DROP INDEX IF EXISTS idx_dr_restore_evidence_service;
DROP TABLE IF EXISTS dr_restore_evidence CASCADE;
DROP TABLE IF EXISTS reliability_recovery_targets CASCADE;
DROP TABLE IF EXISTS privacy_lifecycle_receipts CASCADE;
DROP INDEX IF EXISTS idx_privacy_lifecycle_jobs_state;
DROP TABLE IF EXISTS privacy_lifecycle_jobs CASCADE;
