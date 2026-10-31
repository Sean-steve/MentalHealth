-- Sprint 25: Analytics, Measurement & Outcome Intelligence
-- Canonical pipeline: minimized events -> versioned metric registry -> governed aggregates -> dashboards.

CREATE TABLE IF NOT EXISTS analytics_metric_versions (
  id UUID PRIMARY KEY,
  code VARCHAR(100) NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  name VARCHAR(180) NOT NULL,
  definition TEXT NOT NULL,
  domain VARCHAR(60) NOT NULL,
  cadence VARCHAR(40) NOT NULL,
  governance_note TEXT NOT NULL,
  owner VARCHAR(120) NOT NULL,
  source_refs JSONB NOT NULL DEFAULT '[]',
  classification VARCHAR(40) NOT NULL,
  evidence_level VARCHAR(24) NOT NULL CHECK(evidence_level IN ('DESCRIPTIVE','CORRELATIONAL','COMPARATIVE','CAUSAL')),
  min_cohort_size INTEGER NOT NULL CHECK(min_cohort_size > 0),
  effective_from TIMESTAMPTZ NOT NULL,
  retired_at TIMESTAMPTZ,
  UNIQUE(code,version)
);
CREATE INDEX IF NOT EXISTS idx_analytics_metric_versions_active
  ON analytics_metric_versions(code,effective_from DESC);

CREATE TABLE IF NOT EXISTS analytics_metric_aggregates (
  id UUID PRIMARY KEY,
  idempotency_key CHAR(64) UNIQUE NOT NULL,
  metric_code VARCHAR(100) NOT NULL,
  metric_version INTEGER NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  dimensions JSONB NOT NULL DEFAULT '{}',
  numerator NUMERIC,
  denominator NUMERIC,
  value NUMERIC,
  cohort_count INTEGER NOT NULL CHECK(cohort_count >= 0),
  suppressed BOOLEAN NOT NULL DEFAULT FALSE,
  suppression_reason VARCHAR(160),
  evidence_level VARCHAR(24) NOT NULL CHECK(evidence_level IN ('DESCRIPTIVE','CORRELATIONAL','COMPARATIVE','CAUSAL')),
  computed_at TIMESTAMPTZ NOT NULL,
  source_snapshot_ref VARCHAR(255),
  FOREIGN KEY(metric_code,metric_version) REFERENCES analytics_metric_versions(code,version) ON DELETE RESTRICT,
  CHECK(window_end > window_start),
  CHECK((suppressed = FALSE) OR value IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_analytics_metric_aggregates_lookup
  ON analytics_metric_aggregates(metric_code,metric_version,window_end DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_type_time
  ON analytics_events(event_type,occurred_at);

-- DOWN --
DROP INDEX IF EXISTS idx_analytics_events_type_time;
DROP TABLE IF EXISTS analytics_metric_aggregates CASCADE;
DROP TABLE IF EXISTS analytics_metric_versions CASCADE;
