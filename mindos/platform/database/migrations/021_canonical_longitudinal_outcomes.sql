-- ==============================================================================
-- MINDOS CANONICAL MIGRATION: 021_canonical_longitudinal_outcomes.sql
-- Sprint 23: longitudinal clinical record, outcome measurement, comparability,
-- governed clinical-change rules, reviews, alerts and immutable snapshots.
-- IMPORTANT: no clinical thresholds or response deadlines are seeded here.
-- ==============================================================================

-- UP --

CREATE TABLE IF NOT EXISTS longitudinal_clinical_records (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(60) NOT NULL,
  jurisdiction VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  record_version INTEGER NOT NULL DEFAULT 1 CHECK(record_version > 0),
  UNIQUE(subject_user_id)
);

CREATE TABLE IF NOT EXISTS clinical_timeline_entries (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_type VARCHAR(160) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  source_domain VARCHAR(80) NOT NULL,
  source_type VARCHAR(100) NOT NULL,
  source_id VARCHAR(180) NOT NULL,
  provenance VARCHAR(80) NOT NULL,
  clinical_significance VARCHAR(40) NOT NULL,
  safety_significance VARCHAR(40) NOT NULL,
  summary_reference VARCHAR(240),
  visibility_scope VARCHAR(60) NOT NULL,
  care_relationship_id UUID REFERENCES care_relationships(id) ON DELETE SET NULL,
  care_plan_id UUID REFERENCES care_plans(id) ON DELETE SET NULL,
  is_invalidated BOOLEAN NOT NULL DEFAULT FALSE,
  invalidation_reason TEXT,
  invalidated_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(source_domain, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_clinical_timeline_subject_occurred
  ON clinical_timeline_entries(subject_user_id, occurred_at DESC, recorded_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_clinical_timeline_relationship
  ON clinical_timeline_entries(care_relationship_id, occurred_at DESC)
  WHERE care_relationship_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS clinical_observations (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  care_relationship_id UUID REFERENCES care_relationships(id) ON DELETE SET NULL,
  clinical_encounter_id UUID,
  observation_code VARCHAR(160) NOT NULL,
  observation_name VARCHAR(240) NOT NULL,
  value_json JSONB NOT NULL,
  unit VARCHAR(80),
  observed_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  recorded_by VARCHAR(160) NOT NULL,
  provenance VARCHAR(80) NOT NULL,
  clinical_significance VARCHAR(40) NOT NULL,
  is_invalidated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clinical_observations_subject_time
  ON clinical_observations(subject_user_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS outcome_measure_definitions (
  id VARCHAR(180) PRIMARY KEY,
  measure_code VARCHAR(160) NOT NULL UNIQUE,
  name VARCHAR(240) NOT NULL,
  description TEXT NOT NULL,
  measure_type VARCHAR(80) NOT NULL,
  unit VARCHAR(80) NOT NULL,
  value_type VARCHAR(60) NOT NULL,
  directionality VARCHAR(60) NOT NULL,
  population VARCHAR(120) NOT NULL,
  jurisdiction VARCHAR(16) NOT NULL,
  source_domain VARCHAR(80) NOT NULL,
  clinical_artifact_id VARCHAR(180),
  clinical_artifact_version VARCHAR(80),
  comparability_policy_id VARCHAR(180) NOT NULL,
  status VARCHAR(40) NOT NULL,
  min_value NUMERIC,
  max_value NUMERIC,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS outcome_comparability_policies (
  id VARCHAR(180) PRIMARY KEY,
  measure_code VARCHAR(160) NOT NULL UNIQUE,
  allowed_version_pairs JSONB NOT NULL DEFAULT '[]',
  unit_requirements JSONB NOT NULL DEFAULT '[]',
  population_constraints JSONB,
  maximum_gap_days INTEGER CHECK(maximum_gap_days IS NULL OR maximum_gap_days > 0),
  transformation_policy VARCHAR(240),
  status VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS outcome_alert_policies (
  id VARCHAR(180) NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  review_due_minutes JSONB NOT NULL,
  clinical_artifact_id VARCHAR(180) NOT NULL,
  clinical_artifact_version VARCHAR(80) NOT NULL,
  approval_state VARCHAR(40) NOT NULL,
  approved_by VARCHAR(160) NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(id,version)
);

CREATE TABLE IF NOT EXISTS outcome_clinical_change_rules (
  id VARCHAR(180) PRIMARY KEY,
  measure_code VARCHAR(160) NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  mcid NUMERIC,
  reliable_change_threshold NUMERIC,
  critical_worsening_threshold NUMERIC,
  critical_safety_threshold NUMERIC,
  safety_signal_code VARCHAR(160),
  target_min NUMERIC,
  target_max NUMERIC,
  clinical_artifact_id VARCHAR(180) NOT NULL,
  clinical_artifact_version VARCHAR(80) NOT NULL,
  approval_state VARCHAR(40) NOT NULL,
  approved_by VARCHAR(160) NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(measure_code, version),
  CHECK(target_min IS NULL OR target_max IS NULL OR target_min <= target_max)
);
CREATE INDEX IF NOT EXISTS idx_outcome_change_rules_active
  ON outcome_clinical_change_rules(measure_code, version DESC, effective_from DESC);

CREATE TABLE IF NOT EXISTS outcome_measurements (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  measure_definition_id VARCHAR(180) NOT NULL,
  measure_code VARCHAR(160) NOT NULL,
  value_json JSONB NOT NULL,
  unit VARCHAR(80) NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  source_type VARCHAR(100) NOT NULL,
  source_reference VARCHAR(240) NOT NULL,
  instrument_version VARCHAR(80),
  provenance VARCHAR(80) NOT NULL,
  validity_status VARCHAR(60) NOT NULL,
  invalidation_reason TEXT,
  invalidated_at TIMESTAMPTZ,
  care_relationship_id UUID REFERENCES care_relationships(id) ON DELETE SET NULL,
  care_plan_id UUID REFERENCES care_plans(id) ON DELETE SET NULL,
  care_goal_id UUID REFERENCES care_goals(id) ON DELETE SET NULL,
  clinical_encounter_id UUID,
  recorded_by VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(source_type, source_reference)
);
CREATE INDEX IF NOT EXISTS idx_outcome_measurements_subject_measure_time
  ON outcome_measurements(subject_user_id, measure_code, measured_at ASC, id);
CREATE INDEX IF NOT EXISTS idx_outcome_measurements_subject_validity
  ON outcome_measurements(subject_user_id, validity_status, measured_at DESC);

CREATE TABLE IF NOT EXISTS outcome_baselines (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  measure_code VARCHAR(160) NOT NULL,
  baseline_measurement_id UUID NOT NULL REFERENCES outcome_measurements(id) ON DELETE RESTRICT,
  baseline_value_json JSONB NOT NULL,
  baseline_type VARCHAR(60) NOT NULL,
  established_at TIMESTAMPTZ NOT NULL,
  established_by VARCHAR(160) NOT NULL,
  override_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outcome_baselines_subject_measure_time ON outcome_baselines(subject_user_id, measure_code, established_at DESC);

CREATE TABLE IF NOT EXISTS outcome_reviews (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  care_relationship_id UUID NOT NULL REFERENCES care_relationships(id) ON DELETE RESTRICT,
  care_plan_id UUID REFERENCES care_plans(id) ON DELETE SET NULL,
  review_type VARCHAR(80) NOT NULL,
  status VARCHAR(60) NOT NULL,
  reviewer_id VARCHAR(160),
  measurement_refs JSONB NOT NULL DEFAULT '[]',
  trend_refs JSONB NOT NULL DEFAULT '[]',
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  decision VARCHAR(80),
  reason_codes JSONB NOT NULL DEFAULT '[]',
  clinical_notes TEXT,
  recommended_actions JSONB NOT NULL DEFAULT '[]',
  snapshot_id UUID,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outcome_reviews_subject_status
  ON outcome_reviews(subject_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS outcome_alerts (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  care_relationship_id UUID REFERENCES care_relationships(id) ON DELETE SET NULL,
  alert_type VARCHAR(80) NOT NULL,
  severity VARCHAR(40) NOT NULL,
  measure_definition_id VARCHAR(180),
  measure_code VARCHAR(160),
  measurement_id UUID REFERENCES outcome_measurements(id) ON DELETE SET NULL,
  trend_id VARCHAR(180),
  status VARCHAR(60) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  review_due_at TIMESTAMPTZ NOT NULL,
  assigned_to VARCHAR(160),
  policy_version VARCHAR(80) NOT NULL,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(160)
);
CREATE INDEX IF NOT EXISTS idx_outcome_alerts_subject_status_due
  ON outcome_alerts(subject_user_id, status, review_due_at);

CREATE TABLE IF NOT EXISTS outcome_snapshots (
  id UUID PRIMARY KEY,
  review_id UUID NOT NULL REFERENCES outcome_reviews(id) ON DELETE RESTRICT,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  measure_states JSONB NOT NULL,
  trend_states JSONB NOT NULL,
  care_plan_version_id UUID,
  frozen_at TIMESTAMPTZ NOT NULL,
  hash VARCHAR(128) NOT NULL,
  UNIQUE(review_id)
);
ALTER TABLE outcome_reviews
  ADD CONSTRAINT fk_outcome_reviews_snapshot
  FOREIGN KEY (snapshot_id) REFERENCES outcome_snapshots(id)
  DEFERRABLE INITIALLY DEFERRED;

-- DOWN --
ALTER TABLE outcome_reviews DROP CONSTRAINT IF EXISTS fk_outcome_reviews_snapshot;
DROP TABLE IF EXISTS outcome_snapshots CASCADE;
DROP TABLE IF EXISTS outcome_alerts CASCADE;
DROP TABLE IF EXISTS outcome_reviews CASCADE;
DROP TABLE IF EXISTS outcome_baselines CASCADE;
DROP TABLE IF EXISTS outcome_measurements CASCADE;
DROP TABLE IF EXISTS outcome_clinical_change_rules CASCADE;
DROP TABLE IF EXISTS outcome_alert_policies CASCADE;
DROP TABLE IF EXISTS outcome_comparability_policies CASCADE;
DROP TABLE IF EXISTS outcome_measure_definitions CASCADE;
DROP TABLE IF EXISTS clinical_observations CASCADE;
DROP TABLE IF EXISTS clinical_timeline_entries CASCADE;
DROP TABLE IF EXISTS longitudinal_clinical_records CASCADE;
