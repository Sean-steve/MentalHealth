/**
 * MindOS Canonical Identity Rate Limiter & Abuse Guard
 * Authority: Volumes III, VIII & ADR-014
 * 
 * Invariants:
 * - Prevents credential stuffing, enumeration, and brute force.
 * - Enforces progressive backoff and temporary locks.
 * - Tracks failed attempts by normalized identifier hash and IP address.
 */

import { RateLimitError } from '../../platform/errors/index.js';

interface RateRecord {
  count: number;
  firstAttempt: number;
  lastAttempt: number;
  blockedUntil?: number;
}

export class IdentityRateLimiter {
  private static ipLimits: Map<string, RateRecord> = new Map();
  private static identifierLimits: Map<string, RateRecord> = new Map();
  private static resendLimits: Map<string, number> = new Map();

  // Rules
  public static readonly MAX_LOGIN_ATTEMPTS = 5;
  public static readonly LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 mins
  public static readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 mins
  public static readonly RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

  /**
   * Checks if an attempt is allowed for a given IP.
   */
  public static checkIpLimit(ip: string, maxRequests = 30, windowMs = 60 * 1000): void {
    if (!ip) return;
    const now = Date.now();
    const record = IdentityRateLimiter.ipLimits.get(ip) || {
      count: 0,
      firstAttempt: now,
      lastAttempt: now
    };

    if (record.blockedUntil && now < record.blockedUntil) {
      const waitSeconds = Math.ceil((record.blockedUntil - now) / 1000);
      throw new RateLimitError(`Too many requests from this address. Please try again in ${waitSeconds}s.`, {
        details: { retryAfter: waitSeconds },
        safeUserMessage: `Too many attempts. Please wait ${waitSeconds} seconds.`
      });
    }

    if (now - record.firstAttempt > windowMs) {
      record.count = 1;
      record.firstAttempt = now;
      record.lastAttempt = now;
      record.blockedUntil = undefined;
    } else {
      record.count += 1;
      record.lastAttempt = now;
      if (record.count > maxRequests) {
        record.blockedUntil = now + windowMs;
        const waitSeconds = Math.ceil(windowMs / 1000);
        throw new RateLimitError(`Rate limit exceeded for IP. Retry in ${waitSeconds}s.`, {
          details: { retryAfter: waitSeconds },
          safeUserMessage: `Rate limit exceeded. Please wait ${waitSeconds} seconds.`
        });
      }
    }

    IdentityRateLimiter.ipLimits.set(ip, record);
  }

  /**
   * Checks and records a login attempt for a normalized email identifier.
   */
  public static checkLoginAttempts(normalizedEmail: string): void {
    const key = normalizedEmail.trim().toLowerCase();
    const now = Date.now();
    const record = IdentityRateLimiter.identifierLimits.get(key);

    if (record && record.blockedUntil && now < record.blockedUntil) {
      const waitSeconds = Math.ceil((record.blockedUntil - now) / 1000);
      throw new RateLimitError(
        `Account temporarily locked due to excessive failed attempts. Try again in ${waitSeconds}s.`,
        {
          details: { retryAfter: waitSeconds },
          safeUserMessage: `Too many failed attempts. Account temporarily locked for ${waitSeconds} seconds.`
        }
      );
    }
  }

  /**
   * Records a failed login attempt for an identifier. Triggers lockout if threshold reached.
   */
  public static recordFailedLogin(normalizedEmail: string): { locked: boolean; remainingAttempts: number } {
    const key = normalizedEmail.trim().toLowerCase();
    const now = Date.now();
    const record = IdentityRateLimiter.identifierLimits.get(key) || {
      count: 0,
      firstAttempt: now,
      lastAttempt: now
    };

    if (now - record.firstAttempt > IdentityRateLimiter.LOGIN_WINDOW_MS) {
      record.count = 1;
      record.firstAttempt = now;
      record.lastAttempt = now;
      record.blockedUntil = undefined;
    } else {
      record.count += 1;
      record.lastAttempt = now;
    }

    let locked = false;
    if (record.count >= IdentityRateLimiter.MAX_LOGIN_ATTEMPTS) {
      record.blockedUntil = now + IdentityRateLimiter.LOCKOUT_DURATION_MS;
      locked = true;
    }

    IdentityRateLimiter.identifierLimits.set(key, record);
    return {
      locked,
      remainingAttempts: Math.max(0, IdentityRateLimiter.MAX_LOGIN_ATTEMPTS - record.count)
    };
  }

  /**
   * Clears failed login counter upon successful authentication.
   */
  public static recordSuccessfulLogin(normalizedEmail: string): void {
    const key = normalizedEmail.trim().toLowerCase();
    IdentityRateLimiter.identifierLimits.delete(key);
  }

  /**
   * Enforces cooldown on resending verification emails.
   */
  public static recordVerificationSend(normalizedEmail: string): void {
    const key = normalizedEmail.trim().toLowerCase();
    IdentityRateLimiter.resendLimits.set(key, Date.now());
  }

  public static checkResendCooldown(normalizedEmail: string): void {
    const key = normalizedEmail.trim().toLowerCase();
    const now = Date.now();
    const lastSent = IdentityRateLimiter.resendLimits.get(key);

    if (lastSent && now - lastSent < IdentityRateLimiter.RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((IdentityRateLimiter.RESEND_COOLDOWN_MS - (now - lastSent)) / 1000);
      throw new RateLimitError(`Verification email was recently sent. Please wait ${waitSeconds}s.`, {
        details: { retryAfter: waitSeconds },
        safeUserMessage: `Verification email recently sent. Please wait ${waitSeconds} seconds before requesting another.`
      });
    }

    IdentityRateLimiter.resendLimits.set(key, now);
  }

  public static resetForTesting(): void {
    IdentityRateLimiter.ipLimits.clear();
    IdentityRateLimiter.identifierLimits.clear();
    IdentityRateLimiter.resendLimits.clear();
  }
}
