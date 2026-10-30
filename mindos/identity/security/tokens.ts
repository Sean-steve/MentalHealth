/**
 * MindOS Token & Cryptographic Utility Engine
 * Authority: Volumes III, VIII & ADR-014
 * 
 * Invariants:
 * - High-entropy cryptographically random tokens (>= 256 bits).
 * - Single-use tokens (verification, password reset, refresh tokens) are hashed at rest via SHA-256.
 * - Access tokens are signed JWTs with strict validation (HMAC-SHA256, expiration, issuer, audience, security_version).
 * - Constant-time comparison for all hashes.
 */

import * as crypto from 'node:crypto';
import { ConfigurationManager } from '../../platform/configuration/index.js';
import { AccessTokenClaims } from '../types.js';
import { AuthenticationError } from '../../platform/errors/index.js';

export class TokenSecurity {
  public static readonly ACCESS_TOKEN_TTL_SECONDS = 900; // 15 minutes
  public static readonly REFRESH_TOKEN_TTL_DAYS = 30;    // 30 days
  public static readonly IDLE_TIMEOUT_DAYS = 7;          // 7 days inactivity
  public static readonly EMAIL_VERIFICATION_TTL_HOURS = 24; // 24 hours
  public static readonly PASSWORD_RESET_TTL_HOURS = 1;     // 1 hour

  private static base64UrlEncode(data: string | Buffer): string {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
    return buffer
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  private static base64UrlDecode(str: string): string {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf-8');
  }

  /**
   * Generates a high-entropy cryptographically secure random token (256-bit).
   */
  public static generateSecureToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * Hashes a token using SHA-256 for secure storage at rest.
   */
  public static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token.trim()).digest('hex');
  }

  /**
   * Verifies a raw token against a stored SHA-256 hash using constant-time comparison.
   */
  public static verifyTokenHash(token: string, storedHash: string): boolean {
    const computedHash = TokenSecurity.hashToken(token);
    const computedBuf = Buffer.from(computedHash, 'utf-8');
    const storedBuf = Buffer.from(storedHash, 'utf-8');

    if (computedBuf.length !== storedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(computedBuf, storedBuf);
  }

  /**
   * Generates a signed Access Token JWT (HS256).
   */
  public static createAccessToken(payload: {
    accountId: string;
    sessionId: string;
    securityVersion: number;
    email: string;
    ttlSeconds?: number;
  }): string {
    const config = ConfigurationManager.get();
    const secret = config.secrets?.jwtSecret || 'dev-insecure-jwt-secret-mindos-test-key-32b';

    const now = Math.floor(Date.now() / 1000);
    const ttl = payload.ttlSeconds || TokenSecurity.ACCESS_TOKEN_TTL_SECONDS;

    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };

    const claims: AccessTokenClaims = {
      sub: payload.accountId,
      sid: payload.sessionId,
      sec_ver: payload.securityVersion,
      email: payload.email,
      iat: now,
      exp: now + ttl,
      iss: 'mindos-identity',
      aud: 'mindos-platform'
    };

    const encodedHeader = TokenSecurity.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = TokenSecurity.base64UrlEncode(JSON.stringify(claims));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(signingInput);
    const signature = TokenSecurity.base64UrlEncode(hmac.digest());

    return `${signingInput}.${signature}`;
  }

  /**
   * Verifies and decodes an Access Token JWT.
   * Throws AuthenticationError if invalid or expired.
   */
  public static verifyAccessToken(token: string): AccessTokenClaims {
    if (!token || typeof token !== 'string') {
      throw new AuthenticationError('Missing or malformed authorization token.');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new AuthenticationError('Invalid JWT token structure.');
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const config = ConfigurationManager.get();
    const secret = config.secrets?.jwtSecret || 'dev-insecure-jwt-secret-mindos-test-key-32b';

    // Verify signature
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(signingInput);
    const expectedSignature = TokenSecurity.base64UrlEncode(hmac.digest());

    const sigBuf = Buffer.from(signature, 'utf-8');
    const expBuf = Buffer.from(expectedSignature, 'utf-8');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      throw new AuthenticationError('Invalid token signature.');
    }

    // Decode header
    try {
      const header = JSON.parse(TokenSecurity.base64UrlDecode(encodedHeader));
      if (header.alg !== 'HS256') {
        throw new AuthenticationError('Unsupported token algorithm.');
      }
    } catch {
      throw new AuthenticationError('Invalid token header encoding.');
    }

    // Decode and validate claims
    try {
      const claims: AccessTokenClaims = JSON.parse(TokenSecurity.base64UrlDecode(encodedPayload));
      const now = Math.floor(Date.now() / 1000);

      if (!claims.exp || now > claims.exp) {
        throw new AuthenticationError('Access token has expired.');
      }

      if (claims.iss !== 'mindos-identity' || claims.aud !== 'mindos-platform') {
        throw new AuthenticationError('Invalid token issuer or audience.');
      }

      if (!claims.sub || !claims.sid || claims.sec_ver === undefined) {
        throw new AuthenticationError('Token is missing required security claims.');
      }

      return claims;
    } catch (err) {
      if (err instanceof AuthenticationError) throw err;
      throw new AuthenticationError('Failed to parse access token claims.');
    }
  }
}
