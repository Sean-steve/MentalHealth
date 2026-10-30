-- ==============================================================================
-- MINDOS CANONICAL MIGRATION: 007_canonical_domain_events_and_outbox.sql
-- ==============================================================================
-- Purpose: Formalize transactional outbox canonical schema, consumer idempotency
--          registry (processed_events), and dead-letter quarantine storage.
-- Authority: Master Architecture Index Section 12, Volume IX & Appendix E & ADR-021
-- Sprint 8: Canonical Domain Event Architecture, Transactional Outbox, Message Delivery & Workers
-- Strategy: Additive expand phase (100% backwards compatible).
-- Rollback/Recovery: DROP TABLE statements provided in rollback block.
-- ==============================================================================

-- UP --
-- 1. Canonical Transactional Outbox Table Columns (Additive Expand)
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS event_id UUID;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS classification VARCHAR(40) DEFAULT 'INTERNAL';
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(80);
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(120);
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS causation_id VARCHAR(120);
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'NORMAL';

CREATE INDEX IF NOT EXISTS idx_outbox_events_priority_available ON outbox_events(priority, available_at, status);
CREATE INDEX IF NOT EXISTS idx_outbox_events_correlation ON outbox_events(correlation_id);

-- 2. Canonical Processed Events Table (Consumer Idempotency Registry)
CREATE TABLE IF NOT EXISTS processed_events (
  id UUID PRIMARY KEY,
  consumer_id VARCHAR(120) NOT NULL,
  event_id UUID NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result VARCHAR(40) NOT NULL DEFAULT 'SUCCESS',
  error_details TEXT,
  CONSTRAINT uq_processed_events_consumer_event UNIQUE (consumer_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_processed_events_consumer ON processed_events(consumer_id, processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_processed_events_event_id ON processed_events(event_id);

-- 3. Canonical Dead Letter Events Table (Quarantine Storage)
CREATE TABLE IF NOT EXISTS dead_letter_events (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  consumer_id VARCHAR(120) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  failure_code VARCHAR(80) NOT NULL,
  error_message TEXT,
  dead_lettered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution_action VARCHAR(40),
  resolution_reason TEXT,
  resolved_by UUID,
  payload_summary JSONB,
  correlation_id VARCHAR(120)
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_events_consumer ON dead_letter_events(consumer_id, dead_lettered_at DESC);
CREATE INDEX IF NOT EXISTS idx_dead_letter_events_resolved ON dead_letter_events(resolved_at);

-- DOWN --
DROP TABLE IF EXISTS dead_letter_events;
DROP TABLE IF EXISTS processed_events;
