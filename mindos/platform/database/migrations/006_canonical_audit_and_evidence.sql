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
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(60) NOT NULL,
  severity VARCHAR(40) NOT NULL,
  actor_reference VARCHAR(100),
  account_reference VARCHAR(100),
  source VARCHAR(80) NOT NULL DEFAULT 'SECURITY_MONITOR',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  correlation_id VARCHAR(80) NOT NULL,
  signal VARCHAR(100) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_events_occurred_at ON security_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_category ON security_events(category);
CREATE INDEX IF NOT EXISTS idx_security_events_account ON security_events(account_reference);
CREATE INDEX IF NOT EXISTS idx_security_events_correlation ON security_events(correlation_id);

-- 3. Governance Evidence Vault Table (Tamper-Resistant Metadata & Verification Hashing)
CREATE TABLE IF NOT EXISTS governance_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_type VARCHAR(60) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  domain VARCHAR(60) NOT NULL,
  related_resource_type VARCHAR(80) NOT NULL,
  related_resource_id VARCHAR(120) NOT NULL,
  version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  source VARCHAR(80) NOT NULL DEFAULT 'INTERNAL_REVIEW',
  created_by VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  classification VARCHAR(40) NOT NULL DEFAULT 'SENSITIVE',
  integrity_reference VARCHAR(64) NOT NULL,
  storage_reference VARCHAR(255),
  supersedes_id UUID,
  approved_by VARCHAR(80),
  approved_at TIMESTAMPTZ,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

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
DROP TABLE IF EXISTS governance_evidence;
DROP TABLE IF EXISTS security_events;
DROP TABLE IF EXISTS audit_records;
