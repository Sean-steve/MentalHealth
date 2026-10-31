-- Sprint 27: Validation & Release Assurance
-- Exact-build validation evidence, human attestations and release-readiness certification.

CREATE TABLE IF NOT EXISTS validation_release_candidates (
  id UUID PRIMARY KEY,
  release_id VARCHAR(160) UNIQUE NOT NULL,
  version VARCHAR(80) NOT NULL,
  build_sha VARCHAR(128) NOT NULL,
  environment VARCHAR(20) NOT NULL CHECK(environment IN ('staging','production')),
  risk_class CHAR(1) NOT NULL CHECK(risk_class IN ('A','B','C','D')),
  required_gates JSONB NOT NULL,
  initiator_id VARCHAR(160) NOT NULL,
  feature_keys JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(32) NOT NULL CHECK(status IN ('OPEN','BLOCKED','READY_FOR_HUMAN_REVIEW','CERTIFIED','SUPERSEDED')),
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_validation_release_candidates_build
  ON validation_release_candidates(build_sha,status);

CREATE TABLE IF NOT EXISTS validation_evidence (
  id UUID PRIMARY KEY,
  release_id VARCHAR(160) NOT NULL REFERENCES validation_release_candidates(release_id) ON DELETE CASCADE,
  build_sha VARCHAR(128) NOT NULL,
  gate VARCHAR(40) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK(status IN ('PASS','FAIL','NOT_RUN')),
  evidence_type VARCHAR(120) NOT NULL,
  evidence_hash CHAR(64) NOT NULL,
  source VARCHAR(180) NOT NULL,
  tool_version VARCHAR(80),
  summary_json JSONB NOT NULL DEFAULT '{}',
  critical_findings INTEGER NOT NULL DEFAULT 0 CHECK(critical_findings >= 0),
  high_findings INTEGER NOT NULL DEFAULT 0 CHECK(high_findings >= 0),
  executed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_validation_evidence_release_gate
  ON validation_evidence(release_id,build_sha,gate,executed_at DESC);

CREATE TABLE IF NOT EXISTS validation_attestations (
  id UUID PRIMARY KEY,
  release_id VARCHAR(160) NOT NULL REFERENCES validation_release_candidates(release_id) ON DELETE CASCADE,
  build_sha VARCHAR(128) NOT NULL,
  gate VARCHAR(40) NOT NULL,
  reviewer_id VARCHAR(160) NOT NULL,
  reviewer_role VARCHAR(80) NOT NULL,
  decision VARCHAR(40) NOT NULL CHECK(decision IN ('APPROVED','APPROVED_WITH_CONDITIONS','BLOCKED')),
  conditions JSONB NOT NULL DEFAULT '[]',
  evidence_refs JSONB NOT NULL DEFAULT '[]',
  attested_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_validation_attestations_release_gate
  ON validation_attestations(release_id,build_sha,gate,attested_at DESC);

CREATE TABLE IF NOT EXISTS validation_release_certifications (
  id UUID PRIMARY KEY,
  release_id VARCHAR(160) UNIQUE NOT NULL REFERENCES validation_release_candidates(release_id) ON DELETE RESTRICT,
  build_sha VARCHAR(128) NOT NULL,
  risk_class CHAR(1) NOT NULL CHECK(risk_class IN ('A','B','C','D')),
  decision VARCHAR(20) NOT NULL CHECK(decision IN ('CERTIFIED','BLOCKED')),
  blocking_reasons JSONB NOT NULL DEFAULT '[]',
  gate_status JSONB NOT NULL,
  evidence_refs JSONB NOT NULL DEFAULT '[]',
  attestation_ids JSONB NOT NULL DEFAULT '[]',
  certified_by VARCHAR(160),
  certified_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ
);

-- DOWN --
DROP TABLE IF EXISTS validation_release_certifications CASCADE;
DROP INDEX IF EXISTS idx_validation_attestations_release_gate;
DROP TABLE IF EXISTS validation_attestations CASCADE;
DROP INDEX IF EXISTS idx_validation_evidence_release_gate;
DROP TABLE IF EXISTS validation_evidence CASCADE;
DROP INDEX IF EXISTS idx_validation_release_candidates_build;
DROP TABLE IF EXISTS validation_release_candidates CASCADE;
