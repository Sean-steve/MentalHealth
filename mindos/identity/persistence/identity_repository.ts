/**
 * MindOS Canonical Identity Repository
 * Authority: Volumes III, VIII & ADR-014/ADR-015
 * 
 * Provides atomic, transactional persistence for:
 * - Users / Accounts
 * - Identity Credentials (salted PBKDF2 hashes)
 * - Identity Sessions & Token Families
 * - Verification & Password Reset Challenges
 * - Authentication Attempts & Security Audit Events
 */

import { PostgresConnectionPool, DatabaseClient } from '../../platform/database/connection.js';
import { UUIDv7 } from '../../platform/database/uuid.js';
import {
  IdentityAccount,
  IdentityCredential,
  IdentitySession,
  VerificationChallenge,
  PasswordResetChallenge,
  AuthenticationAttempt,
  SecurityEvent
} from '../types.js';
import { AccountState } from '../../platform/shared/state_machines.js';

export class IdentityRepository {
  private static async getDb(client?: DatabaseClient): Promise<DatabaseClient> {
    if (client) return client;
    return PostgresConnectionPool.getClient();
  }

  // --- ACCOUNTS ---

  public static async createAccount(
    params: {
      id?: string;
      emailNormalized: string;
      accountState?: AccountState;
    },
    client?: DatabaseClient
  ): Promise<IdentityAccount> {
    const db = await this.getDb(client);
    const id = params.id || UUIDv7.generate();
    const state = params.accountState || AccountState.PENDING_VERIFICATION;
    const now = new Date().toISOString();

    const rows = await db.query<IdentityAccount>(
      `INSERT INTO users (
        id, email_normalized, account_state, email_verification_status,
        security_version, created_at, updated_at, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, params.emailNormalized, state, 'UNVERIFIED', 1, now, now, 1]
    );

    return rows[0];
  }

  public static async findAccountById(id: string, client?: DatabaseClient): Promise<IdentityAccount | null> {
    const db = await this.getDb(client);
    const rows = await db.query<IdentityAccount>(
      `SELECT * FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  public static async findAccountByEmail(emailNormalized: string, client?: DatabaseClient): Promise<IdentityAccount | null> {
    const db = await this.getDb(client);
    const rows = await db.query<IdentityAccount>(
      `SELECT * FROM users WHERE email_normalized = $1 LIMIT 1`,
      [emailNormalized]
    );
    return rows[0] || null;
  }

  public static async updateAccount(
    id: string,
    updates: Partial<IdentityAccount>,
    expectedVersion?: number,
    client?: DatabaseClient
  ): Promise<IdentityAccount> {
    const db = await this.getDb(client);
    const current = await this.findAccountById(id, db);
    if (!current) {
      throw new Error(`Account ${id} not found.`);
    }

    const versionCheck = expectedVersion !== undefined ? expectedVersion : current.version;
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'version' && val !== undefined) {
        setClauses.push(`${key} = $${idx++}`);
        params.push(val);
      }
    }

    params.push(id);
    const idParamIdx = idx++;
    params.push(versionCheck);
    const verParamIdx = idx++;

    const sql = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idParamIdx} AND version = $${verParamIdx} RETURNING *`;
    const rows = await db.query<IdentityAccount>(sql, params);
    return rows[0];
  }

  // --- CREDENTIALS ---

  public static async createCredential(
    params: {
      id?: string;
      accountId: string;
      passwordHash: string;
      salt: string;
      iterations: number;
    },
    client?: DatabaseClient
  ): Promise<IdentityCredential> {
    const db = await this.getDb(client);
    const id = params.id || UUIDv7.generate();
    const now = new Date().toISOString();

    const rows = await db.query<IdentityCredential>(
      `INSERT INTO identity_credentials (
        id, account_id, credential_type, hash_algorithm,
        password_hash, salt, hash_version, iterations, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        id,
        params.accountId,
        'PASSWORD',
        'PBKDF2_SHA512',
        params.passwordHash,
        params.salt,
        1,
        params.iterations,
        now,
        now
      ]
    );

    return rows[0];
  }

  public static async findCredentialByAccountId(accountId: string, client?: DatabaseClient): Promise<IdentityCredential | null> {
    const db = await this.getDb(client);
    const rows = await db.query<IdentityCredential>(
      `SELECT * FROM identity_credentials WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [accountId]
    );
    return rows[0] || null;
  }

  public static async updateCredential(
    id: string,
    params: {
      passwordHash: string;
      salt: string;
      iterations: number;
    },
    client?: DatabaseClient
  ): Promise<IdentityCredential> {
    const db = await this.getDb(client);
    const now = new Date().toISOString();

    const rows = await db.query<IdentityCredential>(
      `UPDATE identity_credentials SET password_hash = $1, salt = $2, iterations = $3, updated_at = $4 WHERE id = $5 RETURNING *`,
      [params.passwordHash, params.salt, params.iterations, now, id]
    );

    return rows[0];
  }

  // --- SESSIONS ---

  public static async createSession(
    session: {
      id?: string;
      accountId: string;
      tokenFamilyId: string;
      currentTokenHash: string;
      deviceLabel?: string;
      userAgent?: string;
      ipAddress?: string;
      expiresAt: string;
      idleExpiresAt: string;
      securityVersion: number;
    },
    client?: DatabaseClient
  ): Promise<IdentitySession> {
    const db = await this.getDb(client);
    const id = session.id || UUIDv7.generate();
    const now = new Date().toISOString();

    const rows = await db.query<IdentitySession>(
      `INSERT INTO identity_sessions (
        id, account_id, token_family_id, current_token_hash,
        device_label, user_agent, ip_address, session_status,
        expires_at, idle_expires_at, last_seen_at, security_version, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        id,
        session.accountId,
        session.tokenFamilyId,
        session.currentTokenHash,
        session.deviceLabel || 'Browser Session',
        session.userAgent || 'Unknown Agent',
        session.ipAddress || '127.0.0.1',
        'ACTIVE',
        session.expiresAt,
        session.idleExpiresAt,
        now,
        session.securityVersion,
        now
      ]
    );

    return rows[0];
  }

  public static async findSessionById(id: string, client?: DatabaseClient): Promise<IdentitySession | null> {
    const db = await this.getDb(client);
    const rows = await db.query<IdentitySession>(
      `SELECT * FROM identity_sessions WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  public static async findSessionByTokenHash(tokenHash: string, client?: DatabaseClient): Promise<IdentitySession | null> {
    const db = await this.getDb(client);
    const rows = await db.query<IdentitySession>(
      `SELECT * FROM identity_sessions WHERE current_token_hash = $1 LIMIT 1`,
      [tokenHash]
    );
    return rows[0] || null;
  }

  public static async listActiveSessionsForAccount(accountId: string, client?: DatabaseClient): Promise<IdentitySession[]> {
    const db = await this.getDb(client);
    return db.query<IdentitySession>(
      `SELECT * FROM identity_sessions WHERE account_id = $1 AND session_status = $2 ORDER BY created_at DESC`,
      [accountId, 'ACTIVE']
    );
  }

  public static async updateSession(
    id: string,
    updates: Partial<IdentitySession>,
    client?: DatabaseClient
  ): Promise<IdentitySession> {
    const db = await this.getDb(client);
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(updates)) {
      if (key !== 'id' && val !== undefined) {
        setClauses.push(`${key} = $${idx++}`);
        params.push(val);
      }
    }

    params.push(id);
    const sql = `UPDATE identity_sessions SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const rows = await db.query<IdentitySession>(sql, params);
    return rows[0];
  }

  public static async revokeAllSessionsForAccount(
    accountId: string,
    reason: string,
    client?: DatabaseClient
  ): Promise<void> {
    const db = await this.getDb(client);
    const now = new Date().toISOString();
    await db.query(
      `UPDATE identity_sessions SET session_status = $1, revoked_at = $2, revocation_reason = $3 WHERE account_id = $4`,
      ['REVOKED', now, reason, accountId]
    );
  }

  // --- VERIFICATION CHALLENGES ---

  public static async createVerificationChallenge(
    params: {
      id?: string;
      accountId: string;
      tokenHash: string;
      expiresAt: string;
    },
    client?: DatabaseClient
  ): Promise<VerificationChallenge> {
    const db = await this.getDb(client);
    const id = params.id || UUIDv7.generate();
    const now = new Date().toISOString();

    const rows = await db.query<VerificationChallenge>(
      `INSERT INTO verification_challenges (
        id, account_id, challenge_type, token_hash, expires_at, attempt_count, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, params.accountId, 'EMAIL_VERIFICATION', params.tokenHash, params.expiresAt, 0, now]
    );

    return rows[0];
  }

  public static async findVerificationChallengeByTokenHash(
    tokenHash: string,
    client?: DatabaseClient
  ): Promise<VerificationChallenge | null> {
    const db = await this.getDb(client);
    const rows = await db.query<VerificationChallenge>(
      `SELECT * FROM verification_challenges WHERE token_hash = $1 LIMIT 1`,
      [tokenHash]
    );
    return rows[0] || null;
  }

  public static async markVerificationChallengeUsed(
    id: string,
    client?: DatabaseClient
  ): Promise<void> {
    const db = await this.getDb(client);
    const now = new Date().toISOString();
    await db.query(
      `UPDATE verification_challenges SET used_at = $1 WHERE id = $2`,
      [now, id]
    );
  }

  // --- PASSWORD RESET CHALLENGES ---

  public static async createPasswordResetChallenge(
    params: {
      id?: string;
      accountId: string;
      tokenHash: string;
      expiresAt: string;
    },
    client?: DatabaseClient
  ): Promise<PasswordResetChallenge> {
    const db = await this.getDb(client);
    const id = params.id || UUIDv7.generate();
    const now = new Date().toISOString();

    const rows = await db.query<PasswordResetChallenge>(
      `INSERT INTO password_reset_challenges (
        id, account_id, token_hash, expires_at, attempt_count, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, params.accountId, params.tokenHash, params.expiresAt, 0, now]
    );

    return rows[0];
  }

  public static async findPasswordResetChallengeByTokenHash(
    tokenHash: string,
    client?: DatabaseClient
  ): Promise<PasswordResetChallenge | null> {
    const db = await this.getDb(client);
    const rows = await db.query<PasswordResetChallenge>(
      `SELECT * FROM password_reset_challenges WHERE token_hash = $1 LIMIT 1`,
      [tokenHash]
    );
    return rows[0] || null;
  }

  public static async markPasswordResetChallengeUsed(
    id: string,
    client?: DatabaseClient
  ): Promise<void> {
    const db = await this.getDb(client);
    const now = new Date().toISOString();
    await db.query(
      `UPDATE password_reset_challenges SET used_at = $1 WHERE id = $2`,
      [now, id]
    );
  }

  // --- ATTEMPTS & SECURITY EVENTS ---

  public static async recordAttempt(
    attempt: Partial<AuthenticationAttempt>,
    client?: DatabaseClient
  ): Promise<void> {
    const db = await this.getDb(client);
    const id = attempt.id || UUIDv7.generate();
    const now = attempt.occurred_at || new Date().toISOString();

    await db.query(
      `INSERT INTO authentication_attempts (
        id, identifier_hash, account_id, occurred_at, result, failure_category, ip_address, user_agent, correlation_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        attempt.identifier_hash || 'unknown',
        attempt.account_id || null,
        now,
        attempt.result || 'FAILURE',
        attempt.failure_category || null,
        attempt.ip_address || null,
        attempt.user_agent || null,
        attempt.correlation_id || null
      ]
    );
  }

  public static async recordSecurityEvent(
    event: Partial<SecurityEvent>,
    client?: DatabaseClient
  ): Promise<void> {
    const db = await this.getDb(client);
    const id = event.id || UUIDv7.generate();
    const now = event.occurred_at || new Date().toISOString();

    await db.query(
      `INSERT INTO security_events (
        id, account_id, event_type, severity, details, correlation_id, occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        event.account_id || null,
        event.event_type || 'UNKNOWN',
        event.severity || 'LOW',
        event.details ? JSON.stringify(event.details) : null,
        event.correlation_id || null,
        now
      ]
    );
  }
}
