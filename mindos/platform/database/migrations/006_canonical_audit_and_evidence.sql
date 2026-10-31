-- Migration: 006_canonical_audit_and_evidence.sql
-- Expand -> Migrate/Backfill -> Switch -> Contract
-- Authority: Master Architecture Index Section 14, Volume III, VIII, X, Appendix B, M, Q
-- ADR-022, ADR-023, ADR-024, ADR-025
-- Sprint 7: Canonical Audit Trail, Governance Evidence Vault, Security Logging & Accountability Architecture

-- UP --
-- 1. Canonical Audit Records Table (Append-Oriented, Tamper-Evident SHA-256 Hash Chain)
CREATE TABLE IF NOT EXISTS audit_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  actor_id VARCHAR(80) NOT NULL,
  actor_type VARCHAR(60) NOT NULL,
  action VARCHAR(60) NOT NULL,
  resource_type VARCHAR(80) NOT NULL,
  resource_id VARCHAR(120),
  resource_classification VARCHAR(40) NOT NULL,
  purpose VARCHAR(150) NOT NULL,
  authorization_basis_json TEXT NOT NULL DEFAULT '{}',
  policy_reference VARCHAR(120),
  consent_reference VARCHAR(120),
  governance_reference VARCHAR(120),
  result VARCHAR(40) NOT NULL,
  reason_code VARCHAR(80) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  correlation_id VARCHAR(80) NOT NULL,
  request_id VARCHAR(80) NOT NULL,
  session_id VARCHAR(80),
  source VARCHAR(80) NOT NULL DEFAULT 'SYSTEM',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  prev_hash VARCHAR(64) NOT NULL,
  integrity_hash VARCHAR(64) NOT NULL,
  is_break_glass BOOLEAN NOT NULL DEFAULT false,
  supersedes_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_records_occurred_at ON audit_records(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_records_actor ON audit_records(actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_records_resource ON audit_records(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_records_action ON audit_records(action);
CREATE INDEX IF NOT EXISTS idx_audit_records_result ON audit_records(result);
CREATE INDEX IF NOT EXISTS idx_audit_records_correlation ON audit_records(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_records_classification ON audit_records(resource_classification);

-- 2. Security Events Table (Operational Security Logging Separation)
-- security_events is first introduced by migration 003 for identity/account
-- security logging. Sprint 7 expands that same canonical table additively.
ALTER TABLE security_events
  ADD COLUMN IF NOT EXISTS category VARCHAR(60),
  ADD COLUMN IF NOT EXISTS actor_reference VARCHAR(100),
  ADD COLUMN IF NOT EXISTS account_reference VARCHAR(100),
  ADD COLUMN IF NOT EXISTS source VARCHAR(80) NOT NULL DEFAULT 'SECURITY_MONITOR',
  ADD COLUMN IF NOT EXISTS signal VARCHAR(100),
  ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS metadata_json TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE security_events
SET
  category = COALESCE(category, event_type, 'ACCOUNT_SECURITY'),
  signal = COALESCE(signal, event_type, 'UNKNOWN_SECURITY_EVENT'),
  account_reference = COALESCE(account_reference, account_id::text)
WHERE category IS NULL OR signal IS NULL OR account_reference IS NULL;

ALTER TABLE security_events
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN signal SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_events_occurred_at ON security_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_category ON security_events(category);
CREATE INDEX IF NOT EXISTS idx_security_events_account_reference ON security_events(account_reference);
CREATE INDEX IF NOT EXISTS idx_security_events_correlation ON security_events(correlation_id);

-- 3. Governance Evidence Vault Table (Tamper-Resistant Metadata & Verification Hashing)
-- governance_evidence is introduced in migration 001. Sprint 7 expands that
-- canonical record additively instead of redefining it with CREATE IF NOT EXISTS.
ALTER TABLE governance_evidence
  ADD COLUMN IF NOT EXISTS title VARCHAR(200),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS domain VARCHAR(60),
  ADD COLUMN IF NOT EXISTS related_resource_type VARCHAR(80),
  ADD COLUMN IF NOT EXISTS related_resource_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS source VARCHAR(80) NOT NULL DEFAULT 'INTERNAL_REVIEW',
  ADD COLUMN IF NOT EXISTS integrity_reference VARCHAR(64),
  ADD COLUMN IF NOT EXISTS storage_reference VARCHAR(255),
  ADD COLUMN IF NOT EXISTS supersedes_id UUID,
  ADD COLUMN IF NOT EXISTS approved_by VARCHAR(80),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata_json TEXT NOT NULL DEFAULT '{}';

UPDATE governance_evidence
SET
  title = COALESCE(title, evidence_type),
  description = COALESCE(description, 'Legacy governance evidence record'),
  domain = COALESCE(domain, 'GOVERNANCE'),
  related_resource_type = COALESCE(related_resource_type, 'LEGACY_EVIDENCE'),
  related_resource_id = COALESCE(related_resource_id, id::text),
  integrity_reference = COALESCE(integrity_reference, content_hash),
  storage_reference = COALESCE(storage_reference, object_storage_key)
WHERE
  title IS NULL OR description IS NULL OR domain IS NULL OR
  related_resource_type IS NULL OR related_resource_id IS NULL OR
  integrity_reference IS NULL;

ALTER TABLE governance_evidence
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN description SET NOT NULL,
  ALTER COLUMN domain SET NOT NULL,
  ALTER COLUMN related_resource_type SET NOT NULL,
  ALTER COLUMN related_resource_id SET NOT NULL,
  ALTER COLUMN integrity_reference SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_governance_evidence_type ON governance_evidence(evidence_type);
CREATE INDEX IF NOT EXISTS idx_governance_evidence_resource ON governance_evidence(related_resource_type, related_resource_id);
CREATE INDEX IF NOT EXISTS idx_governance_evidence_status ON governance_evidence(status);
CREATE INDEX IF NOT EXISTS idx_governance_evidence_domain ON governance_evidence(domain);

-- 4. Evidence Links Table (Multi-Target Contextual Traceability)
CREATE TABLE IF NOT EXISTS evidence_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID NOT NULL REFERENCES governance_evidence(id) ON DELETE CASCADE,
  target_type VARCHAR(60) NOT NULL,
  target_id VARCHAR(120) NOT NULL,
  relationship_type VARCHAR(60) NOT NULL DEFAULT 'SUPPORTS',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_evidence_links_evidence ON evidence_links(evidence_id);
CREATE INDEX IF NOT EXISTS idx_evidence_links_target ON evidence_links(target_type, target_id);

-- 5. Evidence Attachments Table (Private Storage Manifest with Checksums)
CREATE TABLE IF NOT EXISTS evidence_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID NOT NULL REFERENCES governance_evidence(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  storage_uri VARCHAR(500) NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  hash_algorithm VARCHAR(30) NOT NULL DEFAULT 'SHA-256',
  uploaded_by VARCHAR(80) NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scan_status VARCHAR(40) NOT NULL DEFAULT 'CLEAN'
);

CREATE INDEX IF NOT EXISTS idx_evidence_attachments_evidence ON evidence_attachments(evidence_id);
CREATE INDEX IF NOT EXISTS idx_evidence_attachments_hash ON evidence_attachments(content_hash);

-- 6. Audit Policy Registry Table
CREATE TABLE IF NOT EXISTS audit_policy_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_classification VARCHAR(40) NOT NULL,
  action VARCHAR(60) NOT NULL,
  audit_required BOOLEAN NOT NULL DEFAULT true,
  audit_denial_required BOOLEAN NOT NULL DEFAULT true,
  failure_mode VARCHAR(40) NOT NULL DEFAULT 'FAIL_CLOSED',
  retention_policy VARCHAR(60) NOT NULL DEFAULT '7_YEARS_LEGAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(resource_classification, action)
);

-- DOWN --
DROP TABLE IF EXISTS audit_policy_registry;
DROP TABLE IF EXISTS evidence_attachments;
DROP TABLE IF EXISTS evidence_links;
ALTER TABLE governance_evidence
  DROP COLUMN IF EXISTS metadata_json,
  DROP COLUMN IF EXISTS approved_at,
  DROP COLUMN IF EXISTS approved_by,
  DROP COLUMN IF EXISTS supersedes_id,
  DROP COLUMN IF EXISTS storage_reference,
  DROP COLUMN IF EXISTS integrity_reference,
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS related_resource_id,
  DROP COLUMN IF EXISTS related_resource_type,
  DROP COLUMN IF EXISTS domain,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS title;

ALTER TABLE security_events
  DROP COLUMN IF EXISTS created_at,
  DROP COLUMN IF EXISTS metadata_json,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS signal,
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS account_reference,
  DROP COLUMN IF EXISTS actor_reference,
  DROP COLUMN IF EXISTS category;

DROP TABLE IF EXISTS audit_records;
