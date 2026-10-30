/**
 * MindOS Feature Flags & Safety Kill-Switch Test Suite
 * Authority: Master Architecture Index Section 6 & Volume V (ADR-003, ADR-010)
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FeatureFlagService } from '../mindos/platform/features/index.js';
import { AuditService } from '../mindos/platform/audit/index.js';

describe('Feature Flags & Emergency Kill-Switch Test Suite', () => {
  beforeEach(() => {
    FeatureFlagService.resetForTesting();
    AuditService.resetForTesting();
  });

  test('Evaluates canonical default feature flags properly', () => {
    // Safety deterministic override is enabled by default
    const safetyOverride = FeatureFlagService.isEnabled('safety.deterministic_override');
    assert.equal(safetyOverride, true);

    // e-Prescriptions is disabled by default in early sprints
    const ePrescriptions = FeatureFlagService.isEnabled('telehealth.kenya_e_prescriptions');
    assert.equal(ePrescriptions, false);
  });

  test('Respects environment restrictions for feature rollout', () => {
    // e-Prescriptions allowed in local/dev/test/staging, but not production
    const allowedInDev = FeatureFlagService.isEnabled('telehealth.kenya_e_prescriptions', { environment: 'development' });
    assert.equal(allowedInDev, false); // default is false

    FeatureFlagService.setOverride('telehealth.kenya_e_prescriptions', true);
    const overriddenInDev = FeatureFlagService.isEnabled('telehealth.kenya_e_prescriptions', { environment: 'development' });
    assert.equal(overriddenInDev, true);

    const overriddenInProd = FeatureFlagService.isEnabled('telehealth.kenya_e_prescriptions', { environment: 'production' });
    assert.equal(overriddenInProd, false); // Environment constraint prevents activation in prod
  });

  test('Emergency Kill-Switch instantly deactivates flag and writes audit record', () => {
    const flagKey = 'ai.companion_generative_responses';
    assert.equal(FeatureFlagService.isEnabled(flagKey), true);

    // Trigger emergency kill
    FeatureFlagService.triggerEmergencyKill(
      flagKey,
      'Safety Kernel detected hallucinated prescription guidance',
      'clinical-safety-officer-01'
    );

    // Verify flag is now killed
    assert.equal(FeatureFlagService.isEnabled(flagKey), false);

    // Verify cryptographic audit record was written
    const ledger = AuditService.getLedger();
    const killRecord = ledger.find(e => e.action === 'FEATURE_FLAG.EMERGENCY_KILL');
    assert.ok(killRecord);
    assert.equal(killRecord.resource_id, flagKey);
    assert.equal(killRecord.actor_id, 'clinical-safety-officer-01');
  });

  test('Restoring a killed flag returns it to active state', () => {
    const flagKey = 'ai.companion_generative_responses';
    FeatureFlagService.triggerEmergencyKill(flagKey, 'Routine Drill', 'sec-ops');
    assert.equal(FeatureFlagService.isEnabled(flagKey), false);

    FeatureFlagService.restoreFlag(flagKey, 'sec-ops-lead');
    assert.equal(FeatureFlagService.isEnabled(flagKey), true);
  });
});
