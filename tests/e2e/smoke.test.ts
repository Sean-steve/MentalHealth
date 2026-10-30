/**
 * MindOS E2E Build, Health & Artifact Smoke Test Suite
 * Authority: Master Architecture Index Section 7 & Sprint 2 Quality Gates (Section 25, 30)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateBuildMetadata } from '../../scripts/build_metadata.js';
import { generateSbom } from '../../scripts/generate_sbom.js';
import { HealthService } from '../../mindos/platform/observability/health.js';
import { FeatureFlagService } from '../../mindos/platform/features/index.js';

describe('MindOS E2E & Release Artifact Smoke Test Suite', () => {
  test('Generates deterministic build metadata manifest', () => {
    const meta = generateBuildMetadata();
    assert.equal(meta.name, 'MindOS');
    assert.ok(meta.version);
    assert.ok(meta.releaseId);
    assert.ok(meta.commitSha);
    assert.ok(meta.buildTimestamp);
    assert.equal(meta.deterministic, true);
    assert.equal(meta.complianceBaseline.kenyaDha, 'DHA-REG-KE-2026');
  });

  test('Generates valid CycloneDX 1.5 Software Bill of Materials (SBOM)', () => {
    const sbom = generateSbom();
    assert.equal(sbom.bomFormat, 'CycloneDX');
    assert.equal(sbom.specVersion, '1.5');
    assert.ok(sbom.serialNumber.startsWith('urn:uuid:mindos-sbom-'));
    assert.ok(sbom.components.length > 0);

    const reactComp = sbom.components.find(c => c.name === 'react');
    assert.ok(reactComp, 'SBOM contains React component');
    assert.equal(reactComp.scope, 'required');
  });

  test('Health service reports operational readiness', async () => {
    const health = await HealthService.check('test');
    assert.equal(health.liveness.status, 'UP');
    assert.equal(health.readiness.status, 'READY');
    assert.equal(health.readiness.checks.database, true);
    assert.equal(health.readiness.checks.safety_policy, true);
  });

  test('Feature flags API model provides complete audit info', () => {
    const allFlags = FeatureFlagService.listAll();
    assert.ok(allFlags.length >= 4);
    for (const flag of allFlags) {
      assert.ok(flag.key);
      assert.ok(flag.owner);
      assert.ok(flag.createdAt);
      assert.ok(flag.reviewDate);
      assert.equal(typeof flag.enabled, 'boolean');
      assert.equal(typeof flag.isKilled, 'boolean');
    }
  });
});
