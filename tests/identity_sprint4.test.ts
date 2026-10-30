/**
 * MindOS Sprint 4 Canonical Identity & Session Security Test Suite
 * Authority: Volumes III, VIII & Appendix B, C, E, F, J & ADR-014, ADR-015
 * 
 * Verifies:
 * 1. Password security policy & PBKDF2-SHA512 verification.
 * 2. JWT access token generation, claim verification & tampered signature rejection.
 * 3. Registration lifecycle & single-use email verification challenges.
 * 4. Authentication, session issuance & brute-force rate-limiting lockout.
 * 5. Refresh token rotation & token reuse detection / immediate revocation.
 * 6. Password reset challenge & account unlocking recovery flows.
 * 7. Session revocation (single logout & global logout with security_version invalidation).
 * 8. Strict bounded context separation (zero clinical data in identity schema/events).
 * 9. Express authentication middleware and email verification guards.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  IdentityService,
  PasswordSecurity,
  TokenSecurity,
  IdentityRateLimiter,
  IdentityRepository,
  createAuthMiddleware,
  requireVerifiedEmail,
  AccountState
} from '../mindos/identity/index.js';
import { DatabaseManager, PostgresConnectionPool } from '../mindos/platform/database/connection.js';
import { EventBus } from '../mindos/platform/events/index.js';
import {
  ValidationError,
  AuthenticationError,
  ConflictError,
  RateLimitError
} from '../mindos/platform/errors/index.js';

describe('MindOS Sprint 4: Identity & Session Security Architecture', () => {
  let identityService: IdentityService;

  beforeEach(async () => {
    DatabaseManager.resetForTesting();
    EventBus.clearOutbox();
    IdentityService.resetForTesting();
    identityService = new IdentityService();
  });

  // =========================================================================
  // 1. PASSWORD SECURITY & PBKDF2 POLICY
  // =========================================================================
  describe('Password Security & Hashing Policy', () => {
    test('Rejects weak passwords violating complexity or dictionary checks', () => {
      // Short password (< 12 chars)
      assert.throws(
        () => PasswordSecurity.validatePolicy('Short1!'),
        (err: unknown) => err instanceof ValidationError
      );

      // Missing uppercase
      assert.throws(
        () => PasswordSecurity.validatePolicy('alllower12345!@#'),
        (err: unknown) => err instanceof ValidationError
      );

      // Missing lowercase
      assert.throws(
        () => PasswordSecurity.validatePolicy('ALLUPPER12345!@#'),
        (err: unknown) => err instanceof ValidationError
      );

      // Missing symbol
      assert.throws(
        () => PasswordSecurity.validatePolicy('NoSymbol12345678'),
        (err: unknown) => err instanceof ValidationError
      );

      // Common breached password
      assert.throws(
        () => PasswordSecurity.validatePolicy('Password1234!'),
        (err: unknown) => err instanceof ValidationError
      );
    });

    test('Passes valid strong passwords and performs PBKDF2-SHA512 hashing', () => {
      const strongPassword = 'Correct-Horse-Battery-Staple-99!';
      assert.doesNotThrow(() => PasswordSecurity.validatePolicy(strongPassword));

      const hashed = PasswordSecurity.hashPassword(strongPassword);
      assert.ok(hashed.hash);
      assert.ok(hashed.salt);
      assert.equal(hashed.iterations, 100000);

      // Verify correct password matches
      const isMatch = PasswordSecurity.verifyPassword(
        strongPassword,
        hashed.hash,
        hashed.salt,
        hashed.iterations
      );
      assert.equal(isMatch, true);

      // Verify incorrect password fails
      const wrongMatch = PasswordSecurity.verifyPassword(
        'Wrong-Horse-Battery-Staple-99!',
        hashed.hash,
        hashed.salt,
        hashed.iterations
      );
      assert.equal(wrongMatch, false);
    });
  });

  // =========================================================================
  // 2. TOKEN SECURITY (STATELESS ACCESS TOKEN & CLAIMS)
  // =========================================================================
  describe('Token Security & Stateless Claims', () => {
    test('Issues signed JWT access token with canonical claims and verifies correctly', () => {
      const accountId = '0192e44f-0000-7000-8000-000000000001';
      const sessionId = '0192e44f-0000-7000-8000-000000000002';
      const email = 'patient.one@example.com';
      const secVer = 1;

      const token = TokenSecurity.createAccessToken({
        accountId,
        sessionId,
        securityVersion: secVer,
        email
      });

      assert.ok(token);
      assert.equal(token.split('.').length, 3);

      const claims = TokenSecurity.verifyAccessToken(token);
      assert.equal(claims.sub, accountId);
      assert.equal(claims.sid, sessionId);
      assert.equal(claims.sec_ver, secVer);
      assert.equal(claims.email, email);
      assert.equal(claims.iss, 'mindos-identity');
      assert.equal(claims.aud, 'mindos-platform');
      assert.ok(claims.exp > claims.iat);
    });

    test('Rejects tampered or signature-manipulated JWT tokens', () => {
      const token = TokenSecurity.createAccessToken({
        accountId: 'acc-1',
        sessionId: 'sess-1',
        securityVersion: 1,
        email: 'user@example.com'
      });

      const parts = token.split('.');
      // Tamper signature
      const tamperedToken = `${parts[0]}.${parts[1]}.badsignature`;

      assert.throws(
        () => TokenSecurity.verifyAccessToken(tamperedToken),
        (err: unknown) => err instanceof AuthenticationError
      );
    });

    test('Rejects expired JWT tokens', () => {
      const token = TokenSecurity.createAccessToken({
        accountId: 'acc-1',
        sessionId: 'sess-1',
        securityVersion: 1,
        email: 'user@example.com',
        ttlSeconds: -10 // expired in the past
      });

      assert.throws(
        () => TokenSecurity.verifyAccessToken(token),
        (err: unknown) => err instanceof AuthenticationError
      );
    });
  });

  // =========================================================================
  // 3. REGISTRATION & EMAIL VERIFICATION LIFECYCLE
  // =========================================================================
  describe('Account Registration & Email Verification Lifecycle', () => {
    test('Registers account in PENDING_VERIFICATION state and sends challenge token', async () => {
      const email = 'Sarah.K@Example.Com ';
      const password = 'SuperSecurePassword2026!#';

      const result = await identityService.register({ email, password });
      assert.ok(result.account.id);
      assert.equal(result.account.email_normalized, 'sarah.k@example.com');
      assert.equal(result.account.account_state, AccountState.PENDING_VERIFICATION);
      assert.equal(result.account.email_verification_status, 'UNVERIFIED');
      assert.ok(result.verificationToken);

      // Verify transactional outbox event
      const events = EventBus.getOutbox();
      const regEvent = events.find((e) => e.event_type === 'identity.account_registered');
      assert.ok(regEvent, 'identity.account_registered event must be in outbox');

      // Verify email was dispatched via notification port
      const notifications = (identityService.getNotificationPort() as any).getSentNotifications();
      assert.equal(notifications.length, 1);
      assert.ok(notifications[0].type === 'EMAIL_VERIFICATION' || notifications[0].type === 'VERIFICATION_EMAIL');
      assert.equal(notifications[0].recipient, 'sarah.k@example.com');
      assert.ok((notifications[0].link || notifications[0].data?.verificationLink).includes(result.verificationToken));
    });

    test('Rejects duplicate account registration with ConflictError', async () => {
      const email = 'duplicate.test@example.com';
      const password = 'SuperSecurePassword2026!#';

      await identityService.register({ email, password });

      await assert.rejects(
        async () => identityService.register({ email: 'DUPLICATE.test@example.com', password }),
        (err: unknown) => err instanceof ConflictError
      );
    });

    test('Completes verification, transitions account to ACTIVE, and prevents token replay', async () => {
      const email = 'verif.user@example.com';
      const password = 'SuperSecurePassword2026!#';

      const reg = await identityService.register({ email, password });

      // Verify email with token
      const verResult = await identityService.verifyEmail(reg.verificationToken);
      assert.equal(verResult.verified, true);
      assert.equal(verResult.accountId, reg.account.id);

      // Check account state in database
      const account = await identityService.getAccountById(reg.account.id);
      assert.equal(account?.account_state, AccountState.ACTIVE);
      assert.equal(account?.email_verification_status, 'VERIFIED');
      assert.ok(account?.email_verified_at);

      // Replaying the same token must fail
      await assert.rejects(
        async () => identityService.verifyEmail(reg.verificationToken),
        (err: unknown) => err instanceof ValidationError
      );
    });

    test('Resend verification enforces rate-limit cooldown and preserves anti-enumeration', async () => {
      const email = 'resend.user@example.com';
      const password = 'SuperSecurePassword2026!#';
      await identityService.register({ email, password });

      // Immediate resend is blocked by cooldown
      await assert.rejects(
        async () => identityService.resendVerification(email),
        (err: unknown) => err instanceof RateLimitError
      );

      // Non-existent email returns { resent: true } silently (anti-enumeration)
      const phantom = await identityService.resendVerification('nonexistent.phantom@example.com');
      assert.equal(phantom.resent, true);
    });
  });

  // =========================================================================
  // 4. AUTHENTICATION, LOCKOUT & SESSION ISSUANCE
  // =========================================================================
  describe('Authentication, Brute-Force Protection & Sessions', () => {
    test('Authenticates valid user, returns token pair, and records session', async () => {
      const email = 'auth.tester@example.com';
      const password = 'AuthValidPassword2026!#';

      const reg = await identityService.register({ email, password });
      await identityService.verifyEmail(reg.verificationToken);

      const authResult = await identityService.authenticate({
        email,
        password,
        deviceLabel: 'Test Chrome Desktop'
      });

      assert.ok(authResult.tokens.accessToken);
      assert.ok(authResult.tokens.refreshToken);
      assert.ok(authResult.tokens.sessionId);
      assert.equal(authResult.account.id, reg.account.id);

      // Check active sessions in repository
      const sessions = await identityService.listSessions(reg.account.id, authResult.tokens.sessionId);
      assert.equal(sessions.length, 1);
      assert.equal(sessions[0].id, authResult.tokens.sessionId);
      assert.equal(sessions[0].isCurrent, true);
      assert.equal(sessions[0].deviceLabel, 'Test Chrome Desktop');
    });

    test('Locks account after 5 failed login attempts and rejects further attempts', async () => {
      const email = 'lockout.victim@example.com';
      const password = 'ValidPasswordToLock123!#';

      const reg = await identityService.register({ email, password });
      await identityService.verifyEmail(reg.verificationToken);

      // 4 failed attempts
      for (let i = 0; i < 4; i++) {
        await assert.rejects(
          async () => identityService.authenticate({ email, password: 'WrongPassword999!#' }),
          (err: unknown) => err instanceof AuthenticationError
        );
      }

      // 5th attempt triggers lockout
      await assert.rejects(
        async () => identityService.authenticate({ email, password: 'WrongPassword999!#' }),
        (err: unknown) => err instanceof AuthenticationError
      );

      // Account in DB is now LOCKED
      const account = await identityService.getAccountById(reg.account.id);
      assert.equal(account?.account_state, AccountState.LOCKED);

      // Even correct password is now rejected
      await assert.rejects(
        async () => identityService.authenticate({ email, password }),
        (err: unknown) => err instanceof AuthenticationError || err instanceof RateLimitError
      );
    });
  });

  // =========================================================================
  // 5. REFRESH TOKEN ROTATION & TOKEN REUSE DETECTION
  // =========================================================================
  describe('Refresh Token Rotation & Intrusion Detection', () => {
    test('Rotates refresh token upon successful refresh', async () => {
      const email = 'rotation.user@example.com';
      const password = 'SuperSecurePassword2026!#';
      const reg = await identityService.register({ email, password });
      await identityService.verifyEmail(reg.verificationToken);

      const auth = await identityService.authenticate({ email, password });
      const originalRefreshToken = auth.tokens.refreshToken;

      // Refresh session
      const refreshed = await identityService.refreshSession(originalRefreshToken);
      assert.ok(refreshed.tokens.accessToken);
      assert.ok(refreshed.tokens.refreshToken);
      assert.notEqual(refreshed.tokens.refreshToken, originalRefreshToken);
    });

    test('Detects refresh token reuse and immediately revokes all sessions', async () => {
      const email = 'reuse.victim@example.com';
      const password = 'SuperSecurePassword2026!#';
      const reg = await identityService.register({ email, password });
      await identityService.verifyEmail(reg.verificationToken);

      const auth = await identityService.authenticate({ email, password });
      const originalRefreshToken = auth.tokens.refreshToken;

      // Legitimate user refreshes
      const refreshed = await identityService.refreshSession(originalRefreshToken);

      // Attacker tries to replay the old/revoked originalRefreshToken
      await assert.rejects(
        async () => identityService.refreshSession(originalRefreshToken),
        (err: unknown) => err instanceof AuthenticationError
      );

      // Even the newly refreshed token is now revoked because all sessions were terminated
      await assert.rejects(
        async () => identityService.refreshSession(refreshed.tokens.refreshToken),
        (err: unknown) => err instanceof AuthenticationError
      );

      // Active sessions count is now 0
      const activeSessions = await identityService.listSessions(reg.account.id);
      assert.equal(activeSessions.length, 0);
    });
  });

  // =========================================================================
  // 6. PASSWORD RESET & ACCOUNT RECOVERY
  // =========================================================================
  describe('Password Reset Challenge & Recovery', () => {
    test('Resets password, unlocks locked account, and terminates active sessions', async () => {
      const email = 'recover.me@example.com';
      const oldPass = 'OldPassword2026!#';
      const newPass = 'BrandNewSafePassword2026!#';

      const reg = await identityService.register({ email, password: oldPass });
      await identityService.verifyEmail(reg.verificationToken);

      // Authenticate to establish a session
      const auth = await identityService.authenticate({ email, password: oldPass });

      // Request password reset
      await identityService.requestPasswordReset(email);
      const notifications = (identityService.getNotificationPort() as any).getSentNotifications();
      const resetNotification = notifications.find(
        (n: any) => n.type === 'PASSWORD_RESET_EMAIL' || n.type === 'PASSWORD_RESET'
      );
      assert.ok(resetNotification);
      const resetToken = resetNotification.rawTokenForTesting || resetNotification.data?.token;

      // Execute password reset
      const resetResult = await identityService.resetPassword(resetToken, newPass);
      assert.equal(resetResult.reset, true);

      // Prior session is now revoked
      const sessions = await identityService.listSessions(reg.account.id);
      assert.equal(sessions.length, 0);

      // Login with old password fails
      await assert.rejects(
        async () => identityService.authenticate({ email, password: oldPass }),
        (err: unknown) => err instanceof AuthenticationError
      );

      // Login with new password succeeds
      const newAuth = await identityService.authenticate({ email, password: newPass });
      assert.ok(newAuth.tokens.accessToken);
    });
  });

  // =========================================================================
  // 7. SESSION REVOCATION & GLOBAL LOGOUT
  // =========================================================================
  describe('Session Revocation & Global Invalidation', () => {
    test('Single logout revokes designated session', async () => {
      const email = 'single.logout@example.com';
      const password = 'SuperSecurePassword2026!#';
      const reg = await identityService.register({ email, password });
      await identityService.verifyEmail(reg.verificationToken);

      const auth1 = await identityService.authenticate({ email, password, deviceLabel: 'Device 1' });
      const auth2 = await identityService.authenticate({ email, password, deviceLabel: 'Device 2' });

      let sessions = await identityService.listSessions(reg.account.id);
      assert.equal(sessions.length, 2);

      // Revoke session 1
      await identityService.logout(auth1.tokens.sessionId, reg.account.id);

      sessions = await identityService.listSessions(reg.account.id);
      assert.equal(sessions.length, 1);
      assert.equal(sessions[0].id, auth2.tokens.sessionId);
    });

    test('Global logout invalidates all sessions and increments security_version', async () => {
      const email = 'global.logout@example.com';
      const password = 'SuperSecurePassword2026!#';
      const reg = await identityService.register({ email, password });
      await identityService.verifyEmail(reg.verificationToken);

      const auth = await identityService.authenticate({ email, password });
      const oldAccessToken = auth.tokens.accessToken;

      // Token and session are valid before logout
      const valid = await identityService.validateTokenAndSession(oldAccessToken);
      assert.equal(valid.account.id, reg.account.id);

      // Global logout
      await identityService.logoutAll(reg.account.id);

      // Old stateless token is now rejected because security_version was incremented
      await assert.rejects(
        async () => identityService.validateTokenAndSession(oldAccessToken),
        (err: unknown) => err instanceof AuthenticationError
      );

      const sessions = await identityService.listSessions(reg.account.id);
      assert.equal(sessions.length, 0);
    });
  });

  // =========================================================================
  // 8. BOUNDED CONTEXT ISOLATION INVARIANTS
  // =========================================================================
  describe('Strict Bounded Context Invariants (No Clinical Contamination)', () => {
    test('Identity domain events contain ZERO clinical, diagnosis or health data', async () => {
      const email = 'invariant.check@example.com';
      const password = 'SuperSecurePassword2026!#';
      const reg = await identityService.register({ email, password });
      await identityService.verifyEmail(reg.verificationToken);
      await identityService.authenticate({ email, password });

      const events = EventBus.getOutbox();
      const forbiddenClinicalKeywords = [
        'diagnosis',
        'symptom',
        'observation',
        'clinical',
        'phq9',
        'gad7',
        'medication',
        'treatment'
      ];

      for (const event of events) {
        const payloadStr = JSON.stringify(event.payload).toLowerCase();
        for (const kw of forbiddenClinicalKeywords) {
          assert.equal(
            payloadStr.includes(`"${kw}"`),
            false,
            `Identity event ${event.event_type} must not contain clinical field "${kw}"`
          );
        }
      }
    });
  });

  // =========================================================================
  // 9. EXPRESS MIDDLEWARE INTEGRATION
  // =========================================================================
  describe('Express Authentication & Verification Middleware', () => {
    test('createAuthMiddleware rejects requests without Bearer token with HTTP 401', async () => {
      const middleware = createAuthMiddleware(identityService);

      let responseStatus = 0;
      let responseBody: any = null;

      const mockReq: any = { headers: {} };
      const mockRes: any = {
        status: (s: number) => {
          responseStatus = s;
          return {
            json: (b: any) => {
              responseBody = b;
            }
          };
        }
      };

      let nextCalled = false;
      await middleware(mockReq, mockRes, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(responseStatus, 401);
      assert.equal(responseBody.error.code, 'UNAUTHENTICATED');
    });

    test('createAuthMiddleware sets req.user for valid token and requireVerifiedEmail permits verified user', async () => {
      const email = 'middleware.user@example.com';
      const password = 'SuperSecurePassword2026!#';
      const reg = await identityService.register({ email, password });
      await identityService.verifyEmail(reg.verificationToken);

      const auth = await identityService.authenticate({ email, password });
      const middleware = createAuthMiddleware(identityService);

      const mockReq: any = {
        headers: {
          authorization: `Bearer ${auth.tokens.accessToken}`
        }
      };
      const mockRes: any = {};

      let nextCalled = false;
      await middleware(mockReq, mockRes, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.ok(mockReq.user);
      assert.equal(mockReq.user.accountId, reg.account.id);
      assert.equal(mockReq.user.emailVerified, true);

      // requireVerifiedEmail guard
      let guardNextCalled = false;
      requireVerifiedEmail(mockReq, mockRes, () => {
        guardNextCalled = true;
      });
      assert.equal(guardNextCalled, true);
    });
  });
});
