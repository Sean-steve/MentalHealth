-- ==============================================================================
-- MINDOS CANONICAL MIGRATION: 020_canonical_care_plans_tasks_messaging.sql
-- Sprint 22 reconciliation: structured Care Plans, Clinical Tasks and
-- relationship-scoped Professional Messaging.
-- Additive expand migration. Existing Sprint 21 care/clinical tables remain
-- authoritative until their dedicated production reconciliation migration lands.
-- ==============================================================================

-- UP --

CREATE TABLE IF NOT EXISTS care_plans (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  care_relationship_id UUID NOT NULL REFERENCES care_relationships(id) ON DELETE RESTRICT,
  primary_professional_id UUID NOT NULL REFERENCES professional_profiles(id) ON DELETE RESTRICT,
  care_team_id UUID,
  plan_type VARCHAR(80) NOT NULL,
  status VARCHAR(60) NOT NULL,
  current_version_id UUID,
  started_at TIMESTAMPTZ NOT NULL,
  target_end_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  terminated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_care_plans_subject_status ON care_plans(subject_user_id, status);
CREATE INDEX IF NOT EXISTS idx_care_plans_relationship_status ON care_plans(care_relationship_id, status);

CREATE TABLE IF NOT EXISTS care_plan_versions (
  id UUID PRIMARY KEY,
  care_plan_id UUID NOT NULL REFERENCES care_plans(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status VARCHAR(60) NOT NULL,
  summary TEXT NOT NULL,
  review_frequency_days INTEGER NOT NULL CHECK (review_frequency_days > 0),
  next_review_due TIMESTAMPTZ NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ,
  authored_by UUID NOT NULL REFERENCES professional_profiles(id) ON DELETE RESTRICT,
  approved_by UUID,
  acknowledged_by_user BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  supersedes_id UUID REFERENCES care_plan_versions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(care_plan_id, version)
);
ALTER TABLE care_plans
  ADD CONSTRAINT fk_care_plans_current_version
  FOREIGN KEY (current_version_id) REFERENCES care_plan_versions(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS care_goals (
  id UUID PRIMARY KEY,
  care_plan_version_id UUID NOT NULL REFERENCES care_plan_versions(id) ON DELETE CASCADE,
  goal_code VARCHAR(120),
  goal_type VARCHAR(80) NOT NULL,
  title VARCHAR(240) NOT NULL,
  description_reference VARCHAR(240),
  priority VARCHAR(40) NOT NULL,
  target_type VARCHAR(80),
  target_value JSONB,
  baseline_reference VARCHAR(240),
  status VARCHAR(60) NOT NULL,
  provenance VARCHAR(60),
  started_at TIMESTAMPTZ,
  target_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_care_goals_plan_status ON care_goals(care_plan_version_id, status);

CREATE TABLE IF NOT EXISTS care_goal_reviews (
  id UUID PRIMARY KEY,
  goal_id UUID NOT NULL REFERENCES care_goals(id) ON DELETE CASCADE,
  reviewed_by UUID NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL,
  status_before VARCHAR(60) NOT NULL,
  status_after VARCHAR(60) NOT NULL,
  evidence_refs JSONB NOT NULL DEFAULT '[]',
  reason_codes JSONB NOT NULL DEFAULT '[]',
  notes_reference VARCHAR(240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS care_interventions (
  id UUID PRIMARY KEY,
  care_plan_version_id UUID NOT NULL REFERENCES care_plan_versions(id) ON DELETE CASCADE,
  intervention_type VARCHAR(80) NOT NULL,
  reference_type VARCHAR(80),
  reference_id VARCHAR(160),
  frequency JSONB,
  duration JSONB,
  schedule_reference VARCHAR(240),
  responsible_actor_type VARCHAR(60),
  responsible_actor_id VARCHAR(160),
  status VARCHAR(60) NOT NULL,
  clinical_artifact_reference VARCHAR(240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS care_plan_reviews (
  id UUID PRIMARY KEY,
  care_plan_id UUID NOT NULL REFERENCES care_plans(id) ON DELETE CASCADE,
  care_plan_version_id UUID NOT NULL REFERENCES care_plan_versions(id) ON DELETE RESTRICT,
  review_type VARCHAR(80) NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  reviewer_id UUID NOT NULL,
  outcome VARCHAR(80),
  goal_reviews JSONB NOT NULL DEFAULT '[]',
  recommended_changes JSONB NOT NULL DEFAULT '[]',
  new_version_id UUID REFERENCES care_plan_versions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_care_plan_reviews_due ON care_plan_reviews(scheduled_for, completed_at);

CREATE TABLE IF NOT EXISTS content_assignments (
  id UUID PRIMARY KEY,
  care_plan_id UUID NOT NULL REFERENCES care_plans(id) ON DELETE CASCADE,
  care_plan_version_id UUID NOT NULL REFERENCES care_plan_versions(id) ON DELETE RESTRICT,
  intervention_id UUID REFERENCES care_interventions(id) ON DELETE SET NULL,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_by UUID NOT NULL,
  content_id VARCHAR(160) NOT NULL,
  content_version INTEGER NOT NULL,
  status VARCHAR(60) NOT NULL,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assessment_assignments (
  id UUID PRIMARY KEY,
  care_plan_id UUID NOT NULL REFERENCES care_plans(id) ON DELETE CASCADE,
  care_plan_version_id UUID NOT NULL REFERENCES care_plan_versions(id) ON DELETE RESTRICT,
  intervention_id UUID REFERENCES care_interventions(id) ON DELETE SET NULL,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_by UUID NOT NULL,
  instrument_type VARCHAR(120) NOT NULL,
  instrument_version VARCHAR(120),
  assignment_purpose VARCHAR(160) NOT NULL,
  due_window JSONB NOT NULL,
  status VARCHAR(60) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinical_tasks (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  care_relationship_id UUID NOT NULL REFERENCES care_relationships(id) ON DELETE RESTRICT,
  care_plan_id UUID REFERENCES care_plans(id) ON DELETE CASCADE,
  care_goal_id UUID REFERENCES care_goals(id) ON DELETE SET NULL,
  task_type VARCHAR(80) NOT NULL,
  assigned_to_type VARCHAR(60) NOT NULL,
  assigned_to_id VARCHAR(160) NOT NULL,
  status VARCHAR(60) NOT NULL,
  priority VARCHAR(40) NOT NULL,
  title VARCHAR(240) NOT NULL,
  instruction_reference VARCHAR(240) NOT NULL,
  due_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  recurrence_rule TEXT,
  source_type VARCHAR(80) NOT NULL,
  source_reference VARCHAR(240) NOT NULL,
  completion_authority VARCHAR(60) NOT NULL,
  owner_domain VARCHAR(80),
  policy_version VARCHAR(80) NOT NULL,
  idempotency_key VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),+  UNIQUE(idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_clinical_tasks_subject_status_due ON clinical_tasks(subject_user_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_clinical_tasks_assignee_status_due ON clinical_tasks(assigned_to_type, assigned_to_id, status, due_at);

CREATE TABLE IF NOT EXISTS clinical_task_dependencies (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES clinical_tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES clinical_tasks(id) ON DELETE CASCADE,
  dependency_type VARCHAR(60) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (task_id <> depends_on_task_id),
  UNIQUE(task_id, depends_on_task_id)
);

CREATE TABLE IF NOT EXISTS clinical_task_evidence (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES clinical_tasks(id) ON DELETE CASCADE,
  evidence_type VARCHAR(60) NOT NULL,
  evidence_reference VARCHAR(240) NOT NULL,
  recorded_by VARCHAR(160) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS professional_message_threads (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  care_relationship_id UUID NOT NULL REFERENCES care_relationships(id) ON DELETE RESTRICT,
  thread_type VARCHAR(80) NOT NULL,
  purpose VARCHAR(120) NOT NULL,
  status VARCHAR(60) NOT NULL,
  created_by VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  response_expectation_reference VARCHAR(240) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_prof_message_threads_relationship_status ON professional_message_threads(care_relationship_id, status);
CREATE INDEX IF NOT EXISTS idx_prof_message_threads_subject_status ON professional_message_threads(subject_user_id, status);

CREATE TABLE IF NOT EXISTS professional_thread_participants (
  id UUID PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES professional_message_threads(id) ON DELETE CASCADE,
  actor_type VARCHAR(60) NOT NULL,
  actor_id VARCHAR(160) NOT NULL,
  participant_role VARCHAR(80) NOT NULL,
  status VARCHAR(60) NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL,
  left_at TIMESTAMPTZ,
  access_scope JSONB NOT NULL DEFAULT '[]',
  UNIQUE(thread_id, actor_id)
);

CREATE TABLE IF NOT EXISTS professional_messages (
  id UUID PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES professional_message_threads(id) ON DELETE CASCADE,
  sender_type VARCHAR(60) NOT NULL,
  sender_id VARCHAR(160) NOT NULL,
  message_type VARCHAR(80) NOT NULL,
  content_reference VARCHAR(240) NOT NULL,
  status VARCHAR(40) NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  reply_to_message_id UUID REFERENCES professional_messages(id) ON DELETE SET NULL,
  clinical_significance VARCHAR(60) NOT NULL,
  safety_monitoring_status VARCHAR(80) NOT NULL,
  safety_reference VARCHAR(240),
  idempotency_key VARCHAR(160) NOT NULL,
  UNIQUE(thread_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_prof_messages_thread_sent ON professional_messages(thread_id, sent_at, id);

CREATE TABLE IF NOT EXISTS professional_message_attachments (
  id UUID PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES professional_message_threads(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES professional_messages(id) ON DELETE CASCADE,
  evidence_reference VARCHAR(240) NOT NULL,
  mime_type VARCHAR(160) NOT NULL,
  size_bytes BIGINT NOT NULL CHECK(size_bytes >= 0),
  scan_status VARCHAR(40) NOT NULL,
  data_classification VARCHAR(60) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DOWN --
DROP TABLE IF EXISTS professional_message_attachments CASCADE;
DROP TABLE IF EXISTS professional_messages CASCADE;
DROP TABLE IF EXISTS professional_thread_participants CASCADE;
DROP TABLE IF EXISTS professional_message_threads CASCADE;
DROP TABLE IF EXISTS clinical_task_evidence CASCADE;
DROP TABLE IF EXISTS clinical_task_dependencies CASCADE;
DROP TABLE IF EXISTS clinical_tasks CASCADE;
DROP TABLE IF EXISTS assessment_assignments CASCADE;
DROP TABLE IF EXISTS content_assignments CASCADE;
DROP TABLE IF EXISTS care_plan_reviews CASCADE;
DROP TABLE IF EXISTS care_interventions CASCADE;
DROP TABLE IF EXISTS care_goal_reviews CASCADE;
DROP TABLE IF EXISTS care_goals CASCADE;
ALTER TABLE care_plans DROP CONSTRAINT IF EXISTS fk_care_plans_current_version;
DROP TABLE IF EXISTS care_plan_versions CASCADE;
DROP TABLE IF EXISTS care_plans CASCADE;