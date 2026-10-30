/**
 * MindOS Identity Domain Types & Contracts
 * Authority: Volumes III, VIII & Appendices B, C, D, E, F & ADR-014/ADR-015
 * 
 * Strict boundary rules:
 * - Owns: Account, credential, session, verification, authentication attempt, security event
 * - Does NOT own: Health data, clinical records, assessments, consent semantics, professional verification
 */

import { AccountState } from '../platform/shared/state_machines.js';

export type EmailVerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED';
export type CredentialType = 'PASSWORD';
export type HashAlgorithm = 'PBKDF2_SHA512';
export type SessionStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'ROTATED';
export type ChallengeType = 'EMAIL_VERIFICATION';
export type AuthAttemptResult = 'SUCCESS' | 'FAILURE';
export type SecurityEventSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface IdentityAccount {
  id: string; // UUIDv7
  email_normalized: string;
  account_state: AccountState;
  email_verification_status: EmailVerificationStatus;
  email_verified_at?: string | null;
  security_version: number;
  last_authenticated_at?: string | null;
  created_at: string;
  updated_at: string;
  deletion_requested_at?: string | null;
  version: number;
}

// Backward compatibility alias
export type UserEntity = IdentityAccount;

export interface IdentityCredential {
  id: string; // UUIDv7
  account_id: string;
  credential_type: CredentialType;
  hash_algorithm: HashAlgorithm;
  password_hash: string;
  salt: string;
  hash_version: number;
  iterations: number;
  created_at: string;
  updated_at: string;
}

export interface IdentitySession {
  id: string; // UUIDv7
  account_id: string;
  token_family_id: string;
  current_token_hash: string;
  device_label?: string;
  user_agent?: string;
  ip_address?: string;
  session_status: SessionStatus;
  expires_at: string;      // Absolute timeout
  idle_expires_at: string; // Inactivity timeout
  last_seen_at: string;
  revoked_at?: string | null;
  revocation_reason?: string | null;
  security_version: number;
  created_at: string;
}

// Backward compatibility alias
export interface AuthSessionEntity {
  id: string;
  user_id: string;
  token_family_hash: string;
  device_label?: string;
  ip_risk_metadata?: Record<string, unknown>;
  expires_at: string;
  revoked_at?: string;
  created_at: string;
}

export interface VerificationChallenge {
  id: string; // UUIDv7
  account_id: string;
  challenge_type: ChallengeType;
  token_hash: string;
  expires_at: string;
  used_at?: string | null;
  attempt_count: number;
  created_at: string;
}

export interface PasswordResetChallenge {
  id: string; // UUIDv7
  account_id: string;
  token_hash: string;
  expires_at: string;
  used_at?: string | null;
  attempt_count: number;
  created_at: string;
}

export interface AuthenticationAttempt {
  id: string; // UUIDv7
  identifier_hash: string;
  account_id?: string | null;
  occurred_at: string;
  result: AuthAttemptResult;
  failure_category?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  correlation_id?: string | null;
}

export interface SecurityEvent {
  id: string; // UUIDv7
  account_id?: string | null;
  event_type: string;
  severity: SecurityEventSeverity;
  details?: Record<string, unknown>;
  correlation_id?: string | null;
  occurred_at: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number; // in seconds (e.g. 900 for 15 min)
  sessionId: string;
}

export interface AccessTokenClaims {
  sub: string;           // Account ID
  sid: string;           // Session ID
  sec_ver: number;       // Security Version
  email: string;         // Normalized email
  iat: number;           // Issued at epoch seconds
  exp: number;           // Expiry epoch seconds
  iss: string;           // 'mindos-identity'
  aud: string;           // 'mindos-platform'
}

export { AccountState };

export interface AuthenticatedUserContext {
  id?: string;
  accountId: string;
  email: string;
  accountState: AccountState;
  securityVersion: number;
  sessionId: string;
  emailVerified: boolean;
  roles?: string[];
  role?: string;
  permissions?: string[];
  jurisdiction?: string;
  [key: string]: unknown;
}

export interface SessionSummary {
  id: string;
  deviceLabel: string;
  userAgent?: string;
  ipAddress?: string;
  sessionStatus: SessionStatus;
  lastSeenAt: string;
  createdAt: string;
  isCurrent: boolean;
}
