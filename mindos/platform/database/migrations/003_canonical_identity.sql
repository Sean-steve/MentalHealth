-- Migration: 003_canonical_identity.sql
-- Expand -> Migrate/Backfill -> Switch -> Contract
-- Authority: Volume III, Section 9, Master Architecture Index, Appendix B & ADR-014/ADR-015

-- UP --
-- 1. Extend users table with identity security version and last authentication timestamp
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_authenticated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_status VARCHAR(40) NOT NULL DEFAULT 'UNVERIFIED';

-- 2. Credentials table (Append-only / versioned credentials with salt and algorithm)
CREATE TABLE IF NOT EXISTS identity_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_type VARCHAR(40) NOT NULL DEFAULT 'PASSWORD',
  hash_algorithm VARCHAR(60) NOT NULL DEFAULT 'PBKDF2_SHA512',
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  hash_version INTEGER NOT NULL DEFAULT 1,
  iterations INTEGER NOT NULL DEFAULT 100000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_identity_credentials_account ON identity_credentials(account_id);

-- 3. Identity Sessions (Server-authoritative session state & refresh token family)
CREATE TABLE IF NOT EXISTS identity_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_family_id UUID NOT NULL,
  current_token_hash VARCHAR(128) NOT NULL,
  device_label VARCHAR(120),
  user_agent VARCHAR(255),
  ip_address VARCHAR(64),
  session_status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  expires_at TIMESTAMPTZ NOT NULL,
  idle_expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ,
  revocation_reason VARCHAR(100),
  security_version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_identity_sessions_account ON identity_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_identity_sessions_token_family ON identity_sessions(token_family_id);
CREATE INDEX IF NOT EXISTS idx_identity_sessions_status ON identity_sessions(session_status);

-- 4. Verification Challenges (Email verification tokens, hashed at rest)
CREATE TABLE IF NOT EXISTS verification_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_type VARCHAR(40) NOT NULL DEFAULT 'EMAIL_VERIFICATION',
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verification_challenges_account ON verification_challenges(account_id);
CREATE INDEX IF NOT EXISTS idx_verification_challenges_token ON verification_challenges(token_hash);

-- 5. Password Reset Challenges (Single-use, high-entropy, hashed at rest)
CREATE TABLE IF NOT EXISTS password_reset_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_challenges_account ON password_reset_challenges(account_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_challenges_token ON password_reset_challenges(token_hash);

-- 6. Authentication Attempts (Brute force & audit defense)
CREATE TABLE IF NOT EXISTS authentication_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier_hash VARCHAR(128) NOT NULL,
  account_id UUID REFERENCES users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  result VARCHAR(40) NOT NULL,
  failure_category VARCHAR(60),
  ip_address VARCHAR(64),
  user_agent VARCHAR(255),
  correlation_id VARCHAR(128)
);

CREATE INDEX IF NOT EXISTS idx_auth_attempts_identifier ON authentication_attempts(identifier_hash);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_occurred ON authentication_attempts(occurred_at);

-- 7. Security Events (Append-only account security logs)
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(60) NOT NULL,
  severity VARCHAR(40) NOT NULL DEFAULT 'LOW',
  details JSONB,
  correlation_id VARCHAR(128),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_events_account ON security_events(account_id);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);

-- DOWN --
DROP TABLE IF EXISTS security_events CASCADE;
DROP TABLE IF EXISTS authentication_attempts CASCADE;
DROP TABLE IF EXISTS password_reset_challenges CASCADE;
DROP TABLE IF EXISTS verification_challenges CASCADE;
DROP TABLE IF EXISTS identity_sessions CASCADE;
DROP TABLE IF EXISTS identity_credentials CASCADE;
