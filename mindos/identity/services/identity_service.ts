/**
 * MindOS Canonical Identity Service
 * Authority: Volumes III, VIII & ADR-014/ADR-015
 * 
 * Strict Bounded Context Rules:
 * - Owns: Accounts, credentials, authentication, sessions, challenges, rate limiting.
 * - Enforces zero leakage of passwords or sensitive credentials into logs/events.
 * - Does NOT own: Consent policies, clinical records, assessments, professional licenses.
 * - Guarantees transactional consistency and transactional outbox event emission.
 */

import { PostgresConnectionPool } from '../../platform/database/connection.js';
import { EventBus } from '../../platform/events/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { AccountState, validateStateTransition } from '../../platform/shared/state_machines.js';
import { generateUUIDv7, UUIDv7 } from '../../platform/database/uuid.js';
import { AuditService } from '../../platform/audit/index.js';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError
} from '../../platform/errors/index.js';
import { PasswordSecurity } from '../security/password.js';
import { TokenSecurity } from '../security/tokens.js';
import { IdentityRateLimiter } from '../security/rate_limiter.js';
import { IdentityRepository } from '../persistence/identity_repository.js';
import {
  IdentityAccount,
  IdentitySession,
  TokenPair,
  SessionSummary,
  UserEntity,
  AuthSessionEntity
} from '../types.js';
import {
  IdentityNotificationPort,
  DevIdentityNotificationAdapter
} from '../notifications/port.js';

export class IdentityService {
  private notificationPort: IdentityNotificationPort;

  constructor(notificationPort?: IdentityNotificationPort) {
    this.notificationPort = notificationPort || new DevIdentityNotificationAdapter();
  }

  public setNotificationPort(port: IdentityNotificationPort): void {
    this.notificationPort = port;
  }

  public getNotificationPort(): IdentityNotificationPort {
    return this.notificationPort;
  }

  /**
   * Normalizes an email address according to canonical standard (lowercase & trimmed).
   */
  public static normalizeEmail(email: string): string {
    if (!email || typeof email !== 'string') {
      throw new ValidationError('Email must be provided as a string.', {
        safeUserMessage: 'Please provide a valid email address.'
      });
    }

    const trimmed = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      throw new ValidationError('Invalid email format.', {
        safeUserMessage: 'Please provide a valid email address.'
      });
    }

    return trimmed;
  }

  /**
   * Registers a new identity account and credential.
   * State starts at PENDING_VERIFICATION.
   * Generates single-use email verification challenge.
   */
  public async register(params: {
    email: string;
    password: string;
    deviceLabel?: string;
    correlationId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ account: IdentityAccount; verificationToken: string }> {
    const normalizedEmail = IdentityService.normalizeEmail(params.email);

    if (params.ipAddress) {
      IdentityRateLimiter.checkIpLimit(params.ipAddress, 20, 60 * 1000);
    }

    // Check duplicate
    const existing = await IdentityRepository.findAccountByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictError('An account with this email already exists.', {
        safeUserMessage: 'An account with this email already exists.'
      });
    }

    // Validate password policy
    PasswordSecurity.validatePolicy(params.password);

    // Hash password
    const hashed = PasswordSecurity.hashPassword(params.password);

    // Generate verification token
    const rawVerificationToken = TokenSecurity.generateSecureToken();
    const tokenHash = TokenSecurity.hashToken(rawVerificationToken);
    const expiresAt = new Date(Date.now() + TokenSecurity.EMAIL_VERIFICATION_TTL_HOURS * 3600 * 1000).toISOString();

    const pool = PostgresConnectionPool;
    const client = await pool.getClient();

    let account: IdentityAccount;

    await client.transaction(async (txClient) => {
      // 1. Insert User Account
      account = await IdentityRepository.createAccount(
        {
          emailNormalized: normalizedEmail,
          accountState: AccountState.PENDING_VERIFICATION
        },
        txClient
      );

      // 2. Insert Credential
      await IdentityRepository.createCredential(
        {
          accountId: account.id,
          passwordHash: hashed.hash,
          salt: hashed.salt,
          iterations: hashed.iterations
        },
        txClient
      );

      // 3. Insert Verification Challenge
      await IdentityRepository.createVerificationChallenge(
        {
          accountId: account.id,
          tokenHash,
          expiresAt
        },
        txClient
      );

      // 4. Record DB outbox event
      const now = new Date().toISOString();
      await txClient.query(
        `INSERT INTO outbox_events (
          id, event_id, event_type, aggregate_type, aggregate_id, payload, headers, status, retry_count, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          UUIDv7.generate(),
          UUIDv7.generate(),
          'identity.account_registered',
          'account',
          account.id,
          JSON.stringify({
            accountId: account.id,
            email_normalized: normalizedEmail,
            state: AccountState.PENDING_VERIFICATION
          }),
          JSON.stringify({ correlationId: params.correlationId || 'N/A' }),
          'PENDING',
          0,
          now
        ]
      );
    });

    // Enqueue in Platform EventBus
    EventBus.enqueue(
      'identity.account_registered',
      'identity',
      account!.id,
      DataClassification.PERSONAL,
      {
        accountId: account!.id,
        email_normalized: normalizedEmail,
        state: AccountState.PENDING_VERIFICATION
      }
    );

    // Dispatch verification email (non-blocking)
    const verificationLink = `/verify-email?token=${rawVerificationToken}`;
    await this.notificationPort.sendVerificationEmail(
      normalizedEmail,
      rawVerificationToken,
      verificationLink
    );
    IdentityRateLimiter.recordVerificationSend(normalizedEmail);

    return {
      account: account!,
      verificationToken: rawVerificationToken
    };
  }

  /**
   * Verifies an email address using a single-use verification challenge token.
   * State transitions from PENDING_VERIFICATION -> ACTIVE.
   */
  public async verifyEmail(token: string, correlationId?: string): Promise<{ accountId: string; verified: boolean }> {
    if (!token || typeof token !== 'string') {
      throw new ValidationError('Verification token must be provided.');
    }

    const tokenHash = TokenSecurity.hashToken(token);
    const challenge = await IdentityRepository.findVerificationChallengeByTokenHash(tokenHash);

    if (!challenge) {
      throw new ValidationError('Invalid or expired verification token.', {
        safeUserMessage: 'This verification link is invalid or has expired.'
      });
    }

    if (challenge.used_at) {
      throw new ValidationError('Verification token has already been used.', {
        safeUserMessage: 'This email has already been verified.'
      });
    }

    if (new Date() > new Date(challenge.expires_at)) {
      throw new ValidationError('Verification token has expired.', {
        safeUserMessage: 'Your verification link has expired. Please request a new one.'
      });
    }

    const account = await IdentityRepository.findAccountById(challenge.account_id);
    if (!account) {
      throw new NotFoundError(`Associated account not found.`);
    }

    // State machine check
    validateStateTransition('AccountState', account.account_state, AccountState.ACTIVE, account.id);

    const client = await PostgresConnectionPool.getClient();
    await client.transaction(async (txClient) => {
      // Mark challenge used
      await IdentityRepository.markVerificationChallengeUsed(challenge.id, txClient);

      // Transition account
      await IdentityRepository.updateAccount(
        account.id,
        {
          account_state: AccountState.ACTIVE,
          email_verification_status: 'VERIFIED',
          email_verified_at: new Date().toISOString()
        },
        account.version,
        txClient
      );

      // Outbox event
      const now = new Date().toISOString();
      await txClient.query(
        `INSERT INTO outbox_events (
          id, event_id, event_type, aggregate_type, aggregate_id, payload, headers, status, retry_count, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          UUIDv7.generate(),
          UUIDv7.generate(),
          'identity.email_verified',
          'account',
          account.id,
          JSON.stringify({ accountId: account.id, email_normalized: account.email_normalized }),
          JSON.stringify({ correlationId: correlationId || 'N/A' }),
          'PENDING',
          0,
          now
        ]
      );
    });

    EventBus.enqueue(
      'identity.email_verified',
      'identity',
      account.id,
      DataClassification.PERSONAL,
      { accountId: account.id, email_normalized: account.email_normalized }
    );

    return { accountId: account.id, verified: true };
  }

  /**
   * Resends verification email with anti-enumeration protection and cooldown guard.
   */
  public async resendVerification(email: string, correlationId?: string): Promise<{ resent: boolean }> {
    const normalized = IdentityService.normalizeEmail(email);

    // Cooldown check
    IdentityRateLimiter.checkResendCooldown(normalized);

    const account = await IdentityRepository.findAccountByEmail(normalized);
    // Silent return if account does not exist or already verified (anti-enumeration)
    if (!account || account.account_state !== AccountState.PENDING_VERIFICATION) {
      return { resent: true };
    }

    const rawToken = TokenSecurity.generateSecureToken();
    const tokenHash = TokenSecurity.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + TokenSecurity.EMAIL_VERIFICATION_TTL_HOURS * 3600 * 1000).toISOString();

    await IdentityRepository.createVerificationChallenge({
      accountId: account.id,
      tokenHash,
      expiresAt
    });

    await this.notificationPort.sendVerificationEmail(
      normalized,
      rawToken,
      `/verify-email?token=${rawToken}`
    );

    return { resent: true };
  }

  /**
   * Authenticates identity credentials, enforces rate limits, logs audit attempts,
   * creates an authoritative session and returns access & refresh tokens.
   */
  public async authenticate(params: {
    email: string;
    password: string;
    deviceLabel?: string;
    ipAddress?: string;
    userAgent?: string;
    correlationId?: string;
  }): Promise<{ tokens: TokenPair; account: IdentityAccount }> {
    const normalized = IdentityService.normalizeEmail(params.email);
    const identifierHash = TokenSecurity.hashToken(normalized);

    if (params.ipAddress) {
      IdentityRateLimiter.checkIpLimit(params.ipAddress, 30, 60 * 1000);
    }
    IdentityRateLimiter.checkLoginAttempts(normalized);

    const account = await IdentityRepository.findAccountByEmail(normalized);

    if (!account) {
      // Constant-time mitigation
      PasswordSecurity.verifyPassword(params.password, 'dummy_hash', 'dummy_salt');
      IdentityRateLimiter.recordFailedLogin(normalized);

      await IdentityRepository.recordAttempt({
        identifier_hash: identifierHash,
        result: 'FAILURE',
        failure_category: 'ACCOUNT_NOT_FOUND',
        ip_address: params.ipAddress,
        user_agent: params.userAgent,
        correlation_id: params.correlationId
      });

      throw new AuthenticationError('Invalid credentials provided.', {
        safeUserMessage: 'Incorrect email or password.'
      });
    }

    // Check account state
    if (account.account_state === AccountState.LOCKED) {
      throw new AuthenticationError('Account is locked due to excessive failed attempts.', {
        safeUserMessage: 'Account is temporarily locked. Please reset your password or contact support.'
      });
    }

    if (account.account_state === AccountState.SUSPENDED) {
      throw new AuthenticationError('Account is suspended.', {
        safeUserMessage: 'Account is suspended. Please contact customer support.'
      });
    }

    if (account.account_state === AccountState.DELETED || account.account_state === AccountState.DELETION_PENDING) {
      throw new AuthenticationError('Account is closed or scheduled for deletion.', {
        safeUserMessage: 'This account is no longer available.'
      });
    }

    const credential = await IdentityRepository.findCredentialByAccountId(account.id);
    if (!credential) {
      throw new AuthenticationError('No credentials found for account.');
    }

    const isMatch = PasswordSecurity.verifyPassword(
      params.password,
      credential.password_hash,
      credential.salt,
      credential.iterations
    );

    if (!isMatch) {
      const { locked } = IdentityRateLimiter.recordFailedLogin(normalized);

      await IdentityRepository.recordAttempt({
        identifier_hash: identifierHash,
        account_id: account.id,
        result: 'FAILURE',
        failure_category: 'INVALID_PASSWORD',
        ip_address: params.ipAddress,
        user_agent: params.userAgent,
        correlation_id: params.correlationId
      });

      if (locked) {
        // Transition account to LOCKED
        try {
          validateStateTransition('AccountState', account.account_state, AccountState.LOCKED, account.id);
          await IdentityRepository.updateAccount(account.id, { account_state: AccountState.LOCKED }, account.version);
        } catch {
          // If transition fails, still protect account
        }

        await IdentityRepository.recordSecurityEvent({
          account_id: account.id,
          event_type: 'ACCOUNT_LOCKED_EXCESSIVE_FAILURES',
          severity: 'HIGH',
          details: { ip: params.ipAddress },
          correlation_id: params.correlationId
        });

        await this.notificationPort.sendSecurityAlert(
          normalized,
          'ACCOUNT_LOCKED',
          { ip: params.ipAddress }
        );
      }

      throw new AuthenticationError('Invalid credentials provided.', {
        safeUserMessage: 'Incorrect email or password.'
      });
    }

    // Success: Clear login backoff
    IdentityRateLimiter.recordSuccessfulLogin(normalized);

    // Create session
    const tokenFamilyId = UUIDv7.generate();
    const rawRefreshToken = TokenSecurity.generateSecureToken(32);
    const currentTokenHash = TokenSecurity.hashToken(rawRefreshToken);

    const now = Date.now();
    const expiresAt = new Date(now + TokenSecurity.REFRESH_TOKEN_TTL_DAYS * 86400 * 1000).toISOString();
    const idleExpiresAt = new Date(now + TokenSecurity.IDLE_TIMEOUT_DAYS * 86400 * 1000).toISOString();

    const session = await IdentityRepository.createSession({
      accountId: account.id,
      tokenFamilyId,
      currentTokenHash,
      deviceLabel: params.deviceLabel || 'Browser Session',
      userAgent: params.userAgent,
      ipAddress: params.ipAddress,
      expiresAt,
      idleExpiresAt,
      securityVersion: account.security_version
    });

    // Update last authenticated at
    const updatedAccount = await IdentityRepository.updateAccount(
      account.id,
      { last_authenticated_at: new Date().toISOString() },
      account.version
    );

    // Generate Access Token JWT
    const accessToken = TokenSecurity.createAccessToken({
      accountId: account.id,
      sessionId: session.id,
      securityVersion: account.security_version,
      email: account.email_normalized
    });

    // Record attempt
    await IdentityRepository.recordAttempt({
      identifier_hash: identifierHash,
      account_id: account.id,
      result: 'SUCCESS',
      ip_address: params.ipAddress,
      user_agent: params.userAgent,
      correlation_id: params.correlationId
    });

    // Event
    EventBus.enqueue(
      'identity.authenticated',
      'identity',
      account.id,
      DataClassification.PERSONAL,
      { accountId: account.id, sessionId: session.id }
    );

    return {
      tokens: {
        accessToken,
        refreshToken: rawRefreshToken,
        tokenType: 'Bearer',
        expiresIn: TokenSecurity.ACCESS_TOKEN_TTL_SECONDS,
        sessionId: session.id
      },
      account: updatedAccount
    };
  }

  /**
   * Refreshes an authentication session with refresh token rotation and token reuse detection.
   */
  public async refreshSession(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ tokens: TokenPair }> {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new AuthenticationError('Refresh token must be provided.');
    }

    const tokenHash = TokenSecurity.hashToken(refreshToken);
    const session = await IdentityRepository.findSessionByTokenHash(tokenHash);

    if (!session) {
      throw new AuthenticationError('Invalid refresh token.', {
        safeUserMessage: 'Session expired or invalid. Please sign in again.'
      });
    }

    // Token Reuse / Revocation Detection
    if (session.session_status === 'REVOKED' || session.session_status === 'EXPIRED' || session.session_status === 'ROTATED') {
      // Suspicious activity: revoke all sessions for this account!
      await IdentityRepository.revokeAllSessionsForAccount(
        session.account_id,
        'SUSPICIOUS_TOKEN_REUSE_DETECTED'
      );

      await IdentityRepository.recordSecurityEvent({
        account_id: session.account_id,
        event_type: 'TOKEN_REUSE_DETECTED',
        severity: 'CRITICAL',
        details: { sessionId: session.id, ip: ipAddress }
      });

      throw new AuthenticationError('Security violation: token reuse detected. All sessions revoked.', {
        safeUserMessage: 'Session terminated for security. Please sign in again.'
      });
    }

    // Expiry check
    const now = new Date();
    if (now > new Date(session.expires_at) || now > new Date(session.idle_expires_at)) {
      await IdentityRepository.updateSession(session.id, {
        session_status: 'EXPIRED'
      });
      throw new AuthenticationError('Session has expired.', {
        safeUserMessage: 'Your session has expired. Please sign in again.'
      });
    }

    // Verify account state
    const account = await IdentityRepository.findAccountById(session.account_id);
    if (!account || account.account_state === AccountState.LOCKED || account.account_state === AccountState.SUSPENDED) {
      throw new AuthenticationError('Account is not in an active state.');
    }

    // Token Rotation: Generate new refresh token
    const newRawRefreshToken = TokenSecurity.generateSecureToken(32);
    const newTokenHash = TokenSecurity.hashToken(newRawRefreshToken);

    const idleExpiresAt = new Date(Date.now() + TokenSecurity.IDLE_TIMEOUT_DAYS * 86400 * 1000).toISOString();
    const nowStr = new Date().toISOString();

    // Mark current session as ROTATED
    await IdentityRepository.updateSession(session.id, {
      session_status: 'ROTATED',
      revoked_at: nowStr,
      revocation_reason: 'ROTATED'
    });

    // Create a new session in the same token family with the new token hash
    const newSession = await IdentityRepository.createSession({
      accountId: account.id,
      tokenFamilyId: session.token_family_id,
      currentTokenHash: newTokenHash,
      deviceLabel: session.device_label,
      userAgent: userAgent || session.user_agent,
      ipAddress: ipAddress || session.ip_address,
      expiresAt: session.expires_at,
      idleExpiresAt,
      securityVersion: account.security_version
    });

    const accessToken = TokenSecurity.createAccessToken({
      accountId: account.id,
      sessionId: newSession.id,
      securityVersion: account.security_version,
      email: account.email_normalized
    });

    return {
      tokens: {
        accessToken,
        refreshToken: newRawRefreshToken,
        tokenType: 'Bearer',
        expiresIn: TokenSecurity.ACCESS_TOKEN_TTL_SECONDS,
        sessionId: newSession.id
      }
    };
  }

  /**
   * Logs out of a specific session.
   */
  public async logout(sessionId: string, accountId: string): Promise<void> {
    const session = await IdentityRepository.findSessionById(sessionId);
    if (!session || session.account_id !== accountId) {
      return;
    }

    await IdentityRepository.updateSession(sessionId, {
      session_status: 'REVOKED',
      revoked_at: new Date().toISOString(),
      revocation_reason: 'USER_LOGOUT'
    });

    EventBus.enqueue(
      'identity.session_revoked',
      'identity',
      accountId,
      DataClassification.INTERNAL,
      { sessionId, accountId, reason: 'USER_LOGOUT' }
    );
  }

  /**
   * Global logout: Revokes all sessions and increments security_version (invalidates access tokens).
   */
  public async logoutAll(accountId: string, reason = 'USER_INITIATED_REVOKE_ALL'): Promise<void> {
    const account = await IdentityRepository.findAccountById(accountId);
    if (!account) return;

    await IdentityRepository.revokeAllSessionsForAccount(accountId, reason);

    // Bump security version to immediately invalidate all stateless access tokens
    await IdentityRepository.updateAccount(
      accountId,
      { security_version: account.security_version + 1 },
      account.version
    );

    EventBus.enqueue(
      'identity.all_sessions_revoked',
      'identity',
      accountId,
      DataClassification.INTERNAL,
      { accountId, reason }
    );
  }

  /**
   * Requests a single-use password reset link. Anti-enumeration guaranteed.
   */
  public async requestPasswordReset(email: string, ipAddress?: string): Promise<{ requested: boolean }> {
    const normalized = IdentityService.normalizeEmail(email);

    if (ipAddress) {
      IdentityRateLimiter.checkIpLimit(ipAddress, 10, 60 * 1000);
    }

    const account = await IdentityRepository.findAccountByEmail(normalized);
    if (!account || account.account_state === AccountState.DELETED) {
      // Anti-enumeration: return true silently
      return { requested: true };
    }

    const rawToken = TokenSecurity.generateSecureToken();
    const tokenHash = TokenSecurity.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + TokenSecurity.PASSWORD_RESET_TTL_HOURS * 3600 * 1000).toISOString();

    await IdentityRepository.createPasswordResetChallenge({
      accountId: account.id,
      tokenHash,
      expiresAt
    });

    const resetLink = `/reset-password?token=${rawToken}`;
    await this.notificationPort.sendPasswordResetEmail(normalized, rawToken, resetLink);

    await IdentityRepository.recordSecurityEvent({
      account_id: account.id,
      event_type: 'PASSWORD_RESET_REQUESTED',
      severity: 'LOW',
      details: { ip: ipAddress }
    });

    return { requested: true };
  }

  /**
   * Executes a password reset using a challenge token.
   * If account was LOCKED, transitions back to ACTIVE.
   * Revokes all previous sessions and increments security version.
   */
  public async resetPassword(token: string, newPassword: string): Promise<{ reset: boolean }> {
    PasswordSecurity.validatePolicy(newPassword);

    const tokenHash = TokenSecurity.hashToken(token);
    const challenge = await IdentityRepository.findPasswordResetChallengeByTokenHash(tokenHash);

    if (!challenge) {
      throw new ValidationError('Invalid or expired password reset link.', {
        safeUserMessage: 'This password reset link is invalid or has expired.'
      });
    }

    if (challenge.used_at) {
      throw new ValidationError('Password reset link has already been used.', {
        safeUserMessage: 'This password reset link has already been used.'
      });
    }

    if (new Date() > new Date(challenge.expires_at)) {
      throw new ValidationError('Password reset link has expired.', {
        safeUserMessage: 'Your password reset link has expired. Please request a new one.'
      });
    }

    const account = await IdentityRepository.findAccountById(challenge.account_id);
    if (!account) {
      throw new NotFoundError('Account not found.');
    }

    const credential = await IdentityRepository.findCredentialByAccountId(account.id);
    if (!credential) {
      throw new NotFoundError('Credential not found.');
    }

    const hashed = PasswordSecurity.hashPassword(newPassword);

    const client = await PostgresConnectionPool.getClient();
    await client.transaction(async (txClient) => {
      // Mark challenge used
      await IdentityRepository.markPasswordResetChallengeUsed(challenge.id, txClient);

      // Update credential
      await IdentityRepository.updateCredential(
        credential.id,
        {
          passwordHash: hashed.hash,
          salt: hashed.salt,
          iterations: hashed.iterations
        },
        txClient
      );

      // Transition account if LOCKED
      const updates: Partial<IdentityAccount> = {
        security_version: account.security_version + 1
      };

      if (account.account_state === AccountState.LOCKED) {
        validateStateTransition('AccountState', account.account_state, AccountState.ACTIVE, account.id);
        updates.account_state = AccountState.ACTIVE;
      }

      await IdentityRepository.updateAccount(account.id, updates, account.version, txClient);

      // Revoke all existing sessions
      await IdentityRepository.revokeAllSessionsForAccount(account.id, 'PASSWORD_RESET', txClient);
    });

    // Reset rate limiter for this email
    IdentityRateLimiter.recordSuccessfulLogin(account.email_normalized);

    // Audit and notify
    await this.notificationPort.sendSecurityAlert(
      account.email_normalized,
      'PASSWORD_CHANGED',
      { method: 'RESET_CHALLENGE' }
    );

    EventBus.enqueue(
      'identity.password_reset',
      'identity',
      account.id,
      DataClassification.INTERNAL,
      { accountId: account.id }
    );

    return { reset: true };
  }

  /**
   * Authenticated password change flow.
   */
  public async changePassword(
    accountId: string,
    currentPass: string,
    newPass: string
  ): Promise<{ changed: boolean }> {
    const account = await IdentityRepository.findAccountById(accountId);
    if (!account) throw new NotFoundError('Account not found.');

    const credential = await IdentityRepository.findCredentialByAccountId(accountId);
    if (!credential) throw new NotFoundError('Credentials not found.');

    const isMatch = PasswordSecurity.verifyPassword(
      currentPass,
      credential.password_hash,
      credential.salt,
      credential.iterations
    );

    if (!isMatch) {
      throw new AuthenticationError('Current password is incorrect.', {
        safeUserMessage: 'The current password provided is incorrect.'
      });
    }

    PasswordSecurity.validatePolicy(newPass);
    const hashed = PasswordSecurity.hashPassword(newPass);

    await IdentityRepository.updateCredential(credential.id, {
      passwordHash: hashed.hash,
      salt: hashed.salt,
      iterations: hashed.iterations
    });

    // Invalidate old access tokens
    await IdentityRepository.updateAccount(
      account.id,
      { security_version: account.security_version + 1 },
      account.version
    );

    await this.notificationPort.sendSecurityAlert(
      account.email_normalized,
      'PASSWORD_CHANGED',
      { method: 'AUTHENTICATED_CHANGE' }
    );

    EventBus.enqueue(
      'identity.password_changed',
      'identity',
      accountId,
      DataClassification.INTERNAL,
      { accountId }
    );

    return { changed: true };
  }

  /**
   * Lists active sessions for an account.
   */
  public async listSessions(accountId: string, currentSessionId?: string): Promise<SessionSummary[]> {
    const sessions = await IdentityRepository.listActiveSessionsForAccount(accountId);
    return sessions.map((s) => ({
      id: s.id,
      deviceLabel: s.device_label || 'Browser Session',
      userAgent: s.user_agent,
      ipAddress: s.ip_address,
      sessionStatus: s.session_status,
      lastSeenAt: s.last_seen_at,
      createdAt: s.created_at,
      isCurrent: s.id === currentSessionId
    }));
  }

  /**
   * Retrieves account by ID.
   */
  public async getAccountById(id: string): Promise<IdentityAccount | null> {
    return IdentityRepository.findAccountById(id);
  }

  /**
   * Verifies access token and ensures session & account state are active.
   */
  public async validateTokenAndSession(token: string): Promise<{
    account: IdentityAccount;
    session: IdentitySession;
  }> {
    const claims = TokenSecurity.verifyAccessToken(token);

    const account = await IdentityRepository.findAccountById(claims.sub);
    if (!account) {
      throw new AuthenticationError('Account associated with token does not exist.');
    }

    // Security version check: if security_version does not match, token was revoked (e.g. password reset/logoutAll)
    if (account.security_version !== claims.sec_ver) {
      throw new AuthenticationError('Session invalidated by security event. Please sign in again.');
    }

    if (account.account_state === AccountState.LOCKED || account.account_state === AccountState.SUSPENDED) {
      throw new AuthenticationError('Account is not in an active state.');
    }

    const session = await IdentityRepository.findSessionById(claims.sid);
    if (!session || session.session_status !== 'ACTIVE') {
      throw new AuthenticationError('Session has been revoked or expired.');
    }

    const now = new Date();
    if (now > new Date(session.expires_at) || now > new Date(session.idle_expires_at)) {
      throw new AuthenticationError('Session has expired.');
    }

    return { account, session };
  }

  // =========================================================================
  // CANONICAL BACKWARD COMPATIBILITY / IN-MEMORY TEST HELPERS
  // =========================================================================

  private static users: Map<string, UserEntity> = new Map();
  private static sessions: Map<string, AuthSessionEntity> = new Map();

  public static async registerUser(email: string, countryCode = 'KE'): Promise<UserEntity> {
    const normalized = IdentityService.normalizeEmail(email);

    for (const u of IdentityService.users.values()) {
      if (u.email_normalized === normalized && u.account_state !== AccountState.DELETED) {
        throw new ValidationError('Email address already registered.', {
          safeUserMessage: 'An account with this email address already exists or verification is pending.'
        });
      }
    }

    const id = generateUUIDv7();
    const now = new Date().toISOString();
    const user: UserEntity = {
      id,
      email_normalized: normalized,
      account_state: AccountState.PENDING_VERIFICATION,
      email_verification_status: 'UNVERIFIED',
      security_version: 1,
      created_at: now,
      updated_at: now,
      version: 1
    };

    IdentityService.users.set(id, user);

    EventBus.enqueue(
      'identity.user_registered',
      'identity',
      id,
      DataClassification.PERSONAL,
      {
        user_id: id,
        occurred_at: now,
        country_code: countryCode
      }
    );

    AuditService.record({
      actor_type: 'USER',
      actor_id: id,
      action: 'IDENTITY.USER.REGISTERED',
      resource_type: 'users',
      resource_id: id,
      purpose: 'Account Registration',
      authorization_basis: { self_registration: true },
      result: 'ALLOWED'
    });

    return user;
  }

  public static async activateUser(userId: string): Promise<UserEntity> {
    const user = IdentityService.users.get(userId);
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    validateStateTransition('AccountState', user.account_state, AccountState.ACTIVE, user.id);
    user.account_state = AccountState.ACTIVE;
    user.email_verified_at = new Date().toISOString();
    user.email_verification_status = 'VERIFIED';
    user.updated_at = new Date().toISOString();
    user.version += 1;

    EventBus.enqueue(
      'identity.account_state_changed',
      'identity',
      user.id,
      DataClassification.SENSITIVE,
      {
        user_id: user.id,
        from_state: AccountState.PENDING_VERIFICATION,
        to_state: AccountState.ACTIVE,
        reason_code: 'EMAIL_VERIFIED'
      }
    );

    return user;
  }

  public static async createSession(userId: string, deviceLabel?: string): Promise<AuthSessionEntity> {
    const user = IdentityService.users.get(userId);
    if (!user || user.account_state !== AccountState.ACTIVE) {
      throw new AuthenticationError('Account is not in an active state.', { errorCode: 'AUTH_002' });
    }

    const sessionId = generateUUIDv7();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const session: AuthSessionEntity = {
      id: sessionId,
      user_id: userId,
      token_family_hash: `hash_${sessionId.substring(0, 8)}`,
      device_label: deviceLabel,
      expires_at: expiresAt,
      created_at: now
    };

    IdentityService.sessions.set(sessionId, session);
    return session;
  }

  public static async revokeSession(sessionId: string, reasonCode = 'USER_LOGOUT'): Promise<void> {
    const session = IdentityService.sessions.get(sessionId);
    if (!session || session.revoked_at) {
      return;
    }

    session.revoked_at = new Date().toISOString();

    EventBus.enqueue(
      'identity.session_revoked',
      'identity',
      session.user_id,
      DataClassification.SENSITIVE,
      {
        user_id: session.user_id,
        session_id: sessionId,
        reason_code: reasonCode
      }
    );
  }

  public static getUser(id: string): UserEntity | undefined {
    return IdentityService.users.get(id);
  }

  public static resetForTesting(): void {
    IdentityService.users.clear();
    IdentityService.sessions.clear();
    IdentityRateLimiter.resetForTesting();
  }
}
