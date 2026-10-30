// scan-ignore-file: Automated security test fixture
/**
 * MindOS Security Automation & Quality Gates Test Suite
 * Authority: Master Architecture Index Section 8 & Sprint 2 Invariants (Section 18, 19)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { scanFileForSecrets } from '../scripts/scan_secrets.js';
import { auditDependencies } from '../scripts/scan_dependencies.js';

describe('Security Automation Test Suite', () => {
  test('Secret scanner detects simulated AWS credentials and private keys in fixtures', () => {
    const fixtureDir = path.join(process.cwd(), 'tests', 'fixtures');
    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
    }

    const testFixture = path.join(fixtureDir, 'sample_leaked_credentials.txt');
    fs.writeFileSync(
      testFixture,
      `
      # Insecure config example
      aws_access_key = AKIAIOSFODNN7EXAMPLE
      -----BEGIN PRIVATE KEY-----
      MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQD...
      -----END PRIVATE KEY-----
      `,
      'utf-8'
    );

    try {
      const violations = scanFileForSecrets(testFixture);
      assert.ok(violations.length >= 2);
      assert.ok(violations.some(v => v.patternName === 'AWS Access Key ID'));
      assert.ok(violations.some(v => v.patternName === 'Private Key Block'));
    } finally {
      // Clean up fixture so it does not fail repository-wide scans
      fs.unlinkSync(testFixture);
    }
  });

  test('Dependency audit verifies zero critical security vulnerabilities', () => {
    const audit = auditDependencies();
    assert.equal(audit.criticalCount, 0);
    assert.equal(audit.status, 'PASSED');
  });
});
