-- ==============================================================================
-- MINDOS PHASE B29: Full Backend Persistence & Local Certification
-- Durable runtime stores for domains that previously defaulted to in-memory state.
-- Additive only. Clinical workspace payloads are envelope-encrypted at application level.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Reconcile the canonical transactional-outbox runtime contract with the
-- additive schema established by migrations 002/007.
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE outbox_events SET retry_count = attempt_count WHERE retry_count = 0 AND attempt_count > 0;

CREATE TABLE IF NOT EXISTS professional_runtime_entities (
  entity_type VARCHAR(60) NOT NULL,
  entity_id VARCHAR(180) NOT NULL,
  key_1 VARCHAR(220),
  key_2 VARCHAR(260),
  status VARCHAR(80),
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(entity_type,entity_id)
);
CREATE INDEX IF NOT EXISTS idx_prof_runtime_key1 ON professional_runtime_entities(entity_type,key_1);
CREATE INDEX IF NOT EXISTS idx_prof_runtime_key2 ON professional_runtime_entities(entity_type,key_2);
CREATE INDEX IF NOT EXISTS idx_prof_runtime_status ON professional_runtime_entities(entity_type,status);

CREATE TABLE IF NOT EXISTS availability_runtime_entities (
  entity_type VARCHAR(60) NOT NULL,
  entity_id VARCHAR(180) NOT NULL,
  provider_id VARCHAR(180),
  service_offering_id VARCHAR(180),
  idempotency_key VARCHAR(220),
  source_reference VARCHAR(220),
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  status VARCHAR(80),
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(entity_type,entity_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_availability_hold_idempotency
  ON availability_runtime_entities(idempotency_key)
  WHERE entity_type='HOLD' AND idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_availability_runtime_provider
  ON availability_runtime_entities(entity_type,provider_id,start_at,end_at,status);
CREATE INDEX IF NOT EXISTS idx_availability_runtime_source
  ON availability_runtime_entities(entity_type,source_reference);

CREATE TABLE IF NOT EXISTS appointment_runtime_entities (
  entity_type VARCHAR(60) NOT NULL,
  entity_id VARCHAR(180) NOT NULL,
  provider_id VARCHAR(180),
  subject_user_id VARCHAR(180),
  appointment_id VARCHAR(180),
  service_offering_id VARCHAR(180),
  idempotency_key VARCHAR(220),
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status VARCHAR(80),
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(entity_type,entity_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointment_runtime_idempotency
  ON appointment_runtime_entities(idempotency_key)
  WHERE entity_type='APPOINTMENT' AND idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointment_runtime_provider
  ON appointment_runtime_entities(entity_type,provider_id,start_at,end_at,status);
CREATE INDEX IF NOT EXISTS idx_appointment_runtime_subject
  ON appointment_runtime_entities(entity_type,subject_user_id,start_at);
CREATE INDEX IF NOT EXISTS idx_appointment_runtime_parent
  ON appointment_runtime_entities(entity_type,appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_runtime_schedule
  ON appointment_runtime_entities(entity_type,scheduled_for,status);

ALTER TABLE appointment_runtime_entities
  ADD CONSTRAINT appointment_runtime_provider_overlap_excl
  EXCLUDE USING gist (
    provider_id WITH =,
    tstzrange(start_at,end_at,'[)') WITH &&
  )
  WHERE (
    entity_type='APPOINTMENT'
    AND provider_id IS NOT NULL
    AND start_at IS NOT NULL
    AND end_at IS NOT NULL
    AND status IN ('CONFIRMED','HELD','CHECKED_IN','IN_PROGRESS')
  );

CREATE TABLE IF NOT EXISTS care_relationship_runtime_entities (
  entity_type VARCHAR(60) NOT NULL,
  entity_id VARCHAR(180) NOT NULL,
  relationship_id VARCHAR(180),
  subject_user_id VARCHAR(180),
  provider_id VARCHAR(180),
  professional_id VARCHAR(180),
  status VARCHAR(80),
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(entity_type,entity_id)
);
CREATE INDEX IF NOT EXISTS idx_care_runtime_relationship
  ON care_relationship_runtime_entities(entity_type,relationship_id,status);
CREATE INDEX IF NOT EXISTS idx_care_runtime_subject
  ON care_relationship_runtime_entities(entity_type,subject_user_id,status);
CREATE INDEX IF NOT EXISTS idx_care_runtime_provider
  ON care_relationship_runtime_entities(entity_type,provider_id,status);
CREATE INDEX IF NOT EXISTS idx_care_runtime_professional
  ON care_relationship_runtime_entities(entity_type,professional_id,status);

CREATE TABLE IF NOT EXISTS clinical_workspace_runtime_entities (
  entity_type VARCHAR(60) NOT NULL,
  entity_id VARCHAR(180) NOT NULL,
  care_relationship_id VARCHAR(180),
  encounter_id VARCHAR(180),
  subject_user_id VARCHAR(180),
  professional_id VARCHAR(180),
  status VARCHAR(80),
  payload_ciphertext TEXT NOT NULL,
  integrity_hash CHAR(64) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(entity_type,entity_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_runtime_relationship
  ON clinical_workspace_runtime_entities(entity_type,care_relationship_id,status);
CREATE INDEX IF NOT EXISTS idx_workspace_runtime_encounter
  ON clinical_workspace_runtime_entities(entity_type,encounter_id);
CREATE INDEX IF NOT EXISTS idx_workspace_runtime_professional
  ON clinical_workspace_runtime_entities(entity_type,professional_id,status);


CREATE TABLE IF NOT EXISTS b29_mutable_state (
  domain VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(220) NOT NULL,
  owner_id VARCHAR(220),
  parent_id VARCHAR(220),
  status VARCHAR(80),
  payload_ciphertext TEXT NOT NULL,
  integrity_hash CHAR(64) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(domain,entity_type,entity_id)
);
CREATE INDEX IF NOT EXISTS idx_b29_mutable_owner
  ON b29_mutable_state(domain,entity_type,owner_id,status);
CREATE INDEX IF NOT EXISTS idx_b29_mutable_parent
  ON b29_mutable_state(domain,entity_type,parent_id,status);

CREATE TABLE IF NOT EXISTS local_certification_runs (
  id UUID PRIMARY KEY,
  build_sha VARCHAR(128) NOT NULL,
  migration_count INTEGER NOT NULL,
  postgres_domains JSONB NOT NULL,
  golden_path JSONB NOT NULL,
  safety_resource_mode VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK(status IN ('PASS','FAIL')),
  evidence JSONB NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DOWN --
DROP TABLE IF EXISTS local_certification_runs CASCADE;
DROP TABLE IF EXISTS b29_mutable_state CASCADE;
DROP TABLE IF EXISTS clinical_workspace_runtime_entities CASCADE;
DROP TABLE IF EXISTS care_relationship_runtime_entities CASCADE;
DROP TABLE IF EXISTS appointment_runtime_entities CASCADE;
DROP TABLE IF EXISTS availability_runtime_entities CASCADE;
DROP TABLE IF EXISTS professional_runtime_entities CASCADE;
