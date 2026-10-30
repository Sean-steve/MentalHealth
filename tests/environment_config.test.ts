// scan-ignore-file: Automated test suite using synthetic mock credentials
/**
 * MindOS Environment & Typed Configuration Test Suite
 * Authority: Master Architecture Index Section 6 & Appendix M (ADR-001, ADR-004)
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigurationManager } from '../mindos/platform/configuration/index.js';

describe('Environment & Configuration Fail-Fast Test Suite', () => {
  beforeEach(() => {
    ConfigurationManager.resetForTesting();
  });

  test('Loads valid development configuration across all 13 groups', () => {
    const config = ConfigurationManager.load({
      MINDOS_ENV: 'development',
      PORT: '3000',
      DATABASE_URL: 'postgresql://mindos_user:mindos_pass@localhost:5432/mindos_db'
    });

    assert.equal(config.env, 'development');
    assert.equal(config.port, 3000);
    assert.ok(config.grouped);

    // Verify groups exist
    const groups = config.grouped;
    assert.equal(groups.APP.environment, 'development');
    assert.equal(groups.DATABASE.poolMin, 2);
    assert.equal(groups.CACHE.ttlSeconds, 300);
    assert.equal(groups.QUEUE.retryLimit, 3);
    assert.equal(groups.STORAGE.region, 'af-south-1');
    assert.equal(groups.AUTH.mfaRequiredForProfessionals, true);
    assert.equal(groups.SECURITY.csrfEnabled, true);
    assert.equal(groups.GOVERNANCE.safetyPolicyVersion, '2.0.0');
  });

  test('Refuses invalid MINDOS_ENV with critical error', () => {
    assert.throws(
      () => {
        ConfigurationManager.load({ MINDOS_ENV: 'hacked_env' as any });
      },
      /CONFIG_CRITICAL_ERROR/
    );
  });

  test('Fail-fast: Rejects DEBUG=true in production', () => {
    assert.throws(
      () => {
        ConfigurationManager.load({
          MINDOS_ENV: 'production',
          DEBUG: 'true',
          DATABASE_URL: 'postgresql://prod_user:super_secret_pw@db.internal.mindos.ke:5432/prod',
          JWT_SECRET: 'a-very-secure-random-production-secret-key-32-chars',
          SESSION_SECRET: 'another-very-secure-random-production-secret-32-chars',
          ENCRYPTION_KMS_KEY_REF: 'kms://projects/prod/cryptoKeys/app-key'
        });
      },
      /Debug mode MUST NOT be enabled in staging or production/
    );
  });

  test('Fail-fast: Rejects dev-insecure JWT secret in production', () => {
    assert.throws(
      () => {
        ConfigurationManager.load({
          MINDOS_ENV: 'production',
          DATABASE_URL: 'postgresql://prod_user:super_secret_pw@db.internal.mindos.ke:5432/prod',
          JWT_SECRET: 'dev-insecure-jwt-secret-min-32-chars-long-standard',
          SESSION_SECRET: 'another-very-secure-random-production-secret-32-chars',
          ENCRYPTION_KMS_KEY_REF: 'kms://projects/prod/cryptoKeys/app-key'
        });
      },
      /JWT secret must be at least 32 high-entropy characters/
    );
  });

  test('Fail-fast: Rejects localhost DATABASE_URL in production', () => {
    assert.throws(
      () => {
        ConfigurationManager.load({
          MINDOS_ENV: 'production',
          DATABASE_URL: 'postgresql://mindos_user:mindos_pass@localhost:5432/mindos_db',
          JWT_SECRET: 'valid-high-entropy-jwt-secret-for-mindos-production',
          SESSION_SECRET: 'valid-high-entropy-session-secret-for-mindos-production',
          ENCRYPTION_KMS_KEY_REF: 'kms://projects/prod/cryptoKeys/app-key'
        });
      },
      /Production\/Staging requires a managed, non-localhost PostgreSQL connection string/
    );
  });

  test('Fail-fast: Rejects wildcard CORS origin in production', () => {
    assert.throws(
      () => {
        ConfigurationManager.load({
          MINDOS_ENV: 'production',
          DATABASE_URL: 'postgresql://prod_user:super_secret_pw@db.internal.mindos.ke:5432/prod',
          JWT_SECRET: 'valid-high-entropy-jwt-secret-for-mindos-production',
          SESSION_SECRET: 'valid-high-entropy-session-secret-for-mindos-production',
          ENCRYPTION_KMS_KEY_REF: 'kms://projects/prod/cryptoKeys/app-key',
          CORS_ALLOWED_ORIGINS: 'https://mindos.co.ke,*'
        });
      },
      /Production CORS origin cannot contain wildcard/
    );
  });
});
