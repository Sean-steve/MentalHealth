// scan-ignore-file: Automated test suite using synthetic credentials
/**
 * MindOS Database Safety & Migration Invariants Test Suite
 * Authority: Master Architecture Index Section 9 & Volume III (ADR-005)
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SeedManager } from '../mindos/platform/database/seeds.js';
import { MigrationSafetyAnalyzer } from '../mindos/platform/database/migration_safety.js';
import { ConfigurationManager } from '../mindos/platform/configuration/index.js';

describe('Database Safety & Migration Invariant Test Suite', () => {
  beforeEach(() => {
    ConfigurationManager.resetForTesting();
  });

  test('SeedManager refuses to run in production or staging', async () => {
    // Set up mock production config
    ConfigurationManager.load({
      MINDOS_ENV: 'production',
      DATABASE_URL: 'postgresql://prod_user:super_secret_pw@db.internal.mindos.ke:5432/prod',
      JWT_SECRET: 'valid-high-entropy-jwt-secret-for-mindos-production',
      SESSION_SECRET: 'valid-high-entropy-session-secret-for-mindos-production',
      ENCRYPTION_KMS_KEY_REF: 'kms://projects/prod/cryptoKeys/app-key'
    });

    await assert.rejects(
      async () => {
        await SeedManager.seed();
      },
      /DATABASE_SECURITY_VIOLATION/
    );
  });

  test('SeedManager executes successfully in development environment', async () => {
    ConfigurationManager.load({
      MINDOS_ENV: 'development',
      DATABASE_URL: 'postgresql://mindos_user:mindos_pass@localhost:5432/mindos_db'
    });

    const result = await SeedManager.seed();
    assert.equal(result.environment, 'development');
    assert.ok(result.usersCreated > 0);
    assert.ok(result.professionalsCreated > 0);
    assert.ok(result.crisisFacilitiesCreated > 0);
  });

  test('MigrationSafetyAnalyzer approves canonical migration baseline', () => {
    const analysis = MigrationSafetyAnalyzer.analyzeMigrations();
    assert.equal(analysis.valid, true);
    assert.equal(analysis.sequenceOrdered, true);
    assert.equal(analysis.hasHighOrCriticalRisks, false);
    assert.ok(analysis.totalMigrations >= 1);
  });

  test('MigrationSafetyAnalyzer flags destructive DROP TABLE and TRUNCATE statements', () => {
    const dangerousSql = `
      -- Risky migration
      DROP TABLE user_identities;
      TRUNCATE TABLE audit_log;
      ALTER TABLE clinical_records DROP COLUMN notes;
    `;

    const risks = MigrationSafetyAnalyzer.inspectSql(dangerousSql, 'dangerous_sample.sql');
    assert.equal(risks.length, 3);
    
    const dropTable = risks.find(r => r.operation === 'DROP_TABLE');
    assert.ok(dropTable);
    assert.equal(dropTable.severity, 'CRITICAL');

    const truncate = risks.find(r => r.operation === 'TRUNCATE');
    assert.ok(truncate);
    assert.equal(truncate.severity, 'CRITICAL');

    const dropCol = risks.find(r => r.operation === 'DROP_COLUMN');
    assert.ok(dropCol);
    assert.equal(dropCol.severity, 'HIGH');
  });
});
