/**
 * MindOS Canonical Password Security Engine
 * Authority: Volumes III, VIII & ADR-014
 * 
 * Invariants:
 * - Minimum 10 characters, maximum 128 characters.
 * - PBKDF2 with SHA-512, 100,000 iterations, 32-byte cryptographically random salt.
 * - Constant-time comparison (crypto.timingSafeEqual) against timing attacks.
 * - Hash versioning to support future algorithm migrations.
 * - Passwords and salts are NEVER logged or exported to outbox/telemetry.
 */

import * as crypto from 'node:crypto';
import { ValidationError } from '../../platform/errors/index.js';

export interface PasswordHashResult {
  hash: string;
  salt: string;
  algorithm: 'PBKDF2_SHA512';
  iterations: number;
  hashVersion: number;
}

const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  'password1234!',
  '1234567890',
  'qwertyuiop',
  'admin12345',
  'letmein123',
  'welcome123',
  'iloveyou123'
]);

export class PasswordSecurity {
  public static readonly MIN_LENGTH = 12;
  public static readonly MAX_LENGTH = 128;
  public static readonly DEFAULT_ITERATIONS = 100000;
  public static readonly KEY_LENGTH = 64; // 512 bits
  public static readonly HASH_VERSION = 1;

  /**
   * Validates password against the canonical security policy.
   * Throws ValidationError if criteria are not met.
   */
  public static validatePolicy(password: string): void {
    if (typeof password !== 'string') {
      throw new ValidationError('Password must be a valid string.', {
        safeUserMessage: 'Password must be provided as a string.'
      });
    }

    if (password.length < PasswordSecurity.MIN_LENGTH) {
      throw new ValidationError(
        `Password must be at least ${PasswordSecurity.MIN_LENGTH} characters long.`,
        { safeUserMessage: `Password must contain at least ${PasswordSecurity.MIN_LENGTH} characters.` }
      );
    }

    if (password.length > PasswordSecurity.MAX_LENGTH) {
      throw new ValidationError(
        `Password must not exceed ${PasswordSecurity.MAX_LENGTH} characters.`,
        { safeUserMessage: `Password must be under ${PasswordSecurity.MAX_LENGTH} characters.` }
      );
    }

    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
      throw new ValidationError(
        'Password must contain an uppercase letter, a lowercase letter, a digit, and a special character.',
        {
          safeUserMessage:
            'Password must include uppercase, lowercase, a number, and a special character.'
        }
      );
    }

    const lower = password.toLowerCase().trim();
    if (COMMON_PASSWORDS.has(lower) || lower.startsWith('password')) {
      throw new ValidationError('Password is too common or easily guessable.', {
        safeUserMessage: 'This password is too common. Please choose a more unique phrase.'
      });
    }
  }

  /**
   * Hashes password using PBKDF2-SHA512 with a unique 32-byte salt.
   */
  public static hashPassword(password: string, iterations = PasswordSecurity.DEFAULT_ITERATIONS): PasswordHashResult {
    const salt = crypto.randomBytes(32).toString('hex');
    const derivedKey = crypto.pbkdf2Sync(
      password,
      salt,
      iterations,
      PasswordSecurity.KEY_LENGTH,
      'sha512'
    );

    return {
      hash: derivedKey.toString('hex'),
      salt,
      algorithm: 'PBKDF2_SHA512',
      iterations,
      hashVersion: PasswordSecurity.HASH_VERSION
    };
  }

  /**
   * Verifies password against stored hash using constant-time comparison.
   */
  public static verifyPassword(password: string, storedHash: string, salt: string, iterations = PasswordSecurity.DEFAULT_ITERATIONS): boolean {
    if (!password || !storedHash || !salt) {
      return false;
    }

    try {
      const derivedKey = crypto.pbkdf2Sync(
        password,
        salt,
        iterations,
        PasswordSecurity.KEY_LENGTH,
        'sha512'
      );

      const computedBuffer = Buffer.from(derivedKey.toString('hex'), 'utf-8');
      const storedBuffer = Buffer.from(storedHash, 'utf-8');

      if (computedBuffer.length !== storedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(computedBuffer, storedBuffer);
    } catch {
      return false;
    }
  }
}
