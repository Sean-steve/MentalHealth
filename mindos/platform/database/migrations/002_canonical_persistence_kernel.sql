-- ==============================================================================
-- MINDOS CANONICAL MIGRATION: 002_canonical_persistence_kernel.sql
-- ==============================================================================
-- Purpose: Formalize transactional outbox, idempotency storage, retention
--          policy registry, and data lifecycle tracking.
-- Affected Domains: Platform / Persistence Kernel / Governance / Security
-- Forward Strategy: Additive expand phase (fully backwards compatible).
-- Data Migration Strategy: No schema rewrites; backwards-compatible additive tables.
-- Rollback/Recovery: DROP TABLE statements provided in rollback block.
-- Zero-Downtime: No table-level locking or destructive column mutations.
-- ==============================================================================

-- 1. Canonical Transactional Outbox Table (Section 15 & 16)
CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY,
  event_type VARCHAR(120) NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  aggregate_type VARCHAR(80) NOT NULL,
  aggregate_id VARCHAR(80) NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_pending ON outbox_events(status, occurred_at);
CREATE INDEX IF NOT EXISTS idx_outbox_events_aggregate ON outbox_events(aggregate_type, aggregate_id);

-- 2. Canonical Idempotency Keys Table (Section 46)
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY,
  idempotency_key VARCHAR(128) NOT NULL,
  scope VARCHAR(80) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  response_status INTEGER,
  response_body JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'STARTED',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_idempotency_keys_scope_key UNIQUE(scope, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires ON idempotency_keys(expires_at);

-- 3. Canonical Retention Policies Table (Section 33)
CREATE TABLE IF NOT EXISTS retention_policies (
  id UUID PRIMARY KEY,
  data_type VARCHAR(80) NOT NULL,
  domain VARCHAR(80) NOT NULL,
  retention_period_days INTEGER NOT NULL,
  retention_action VARCHAR(40) NOT NULL,
  legal_basis TEXT NOT NULL,
  jurisdiction VARCHAR(20) NOT NULL DEFAULT 'KE',
  version INTEGER NOT NULL DEFAULT 1,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description TEXT,
  CONSTRAINT uq_retention_policies_domain_type UNIQUE(domain, data_type)
);

-- 4. Data Lifecycle State & Legal Hold Logs (Section 34)
CREATE TABLE IF NOT EXISTS data_lifecycle_logs (
  id UUID PRIMARY KEY,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID NOT NULL,
  current_state VARCHAR(40) NOT NULL,
  retention_policy_id UUID REFERENCES retention_policies(id) ON DELETE RESTRICT,
  legal_hold_reason TEXT,
  legal_hold_placed_by UUID,
  scheduled_deletion_at TIMESTAMPTZ,
  transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_logs_entity ON data_lifecycle_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_logs_state ON data_lifecycle_logs(current_state);

-- ==============================================================================
-- DOWN --
-- ==============================================================================
DROP TABLE IF EXISTS data_lifecycle_logs;
DROP TABLE IF EXISTS retention_policies;
DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS outbox_events;
