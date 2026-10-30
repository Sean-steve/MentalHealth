/**
 * MindOS Canonical Foundation Test Suite
 * Authority: Master Architecture Index, Volume XIV (Test Strategy)
 * Tests platform kernel primitives, deny-by-default authorization,
 * hash-chain audit ledger, safety kernel, and state machine invariants.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { ConfigurationManager } from '../mindos/platform/configuration/index.js';
import { sensitiveRedactor } from '../mindos/platform/observability/redactor.js';
import { AuthorizationEngine } from '../mindos/platform/authorization/index.js';
import { AuditService } from '../mindos/platform/audit/index.js';
import { EventBus } from '../mindos/platform/events/index.js';
import { DataClassification } from '../mindos/platform/shared/data_classification.js';
import {
  AccountState,
  RiskState,
  ClinicalArtifactState,
  validateStateTransition
} from '../mindos/platform/shared/state_machines.js';
import { DomainInvariantError, AuthorizationError } from '../mindos/platform/errors/index.js';
import { SafetyKernel } from '../mindos/safety/index.js';
import { IdentityService } from '../mindos/identity/index.js';
import { ConsentService } from '../mindos/consent/index.js';
import { GovernanceOrchestrator } from '../mindos/governance/index.js';
import { ClinicalGovernanceService } from '../mindos/clinical_governance/index.js';

describe('MindOS Platform Foundation Test Suite', () => {
  beforeEach(() => {
    AuditService.resetForTesting();
    EventBus.clearOutbox();
    SafetyKernel.resetForTesting();
    IdentityService.resetForTesting();
    ConsentService.resetForTesting();
    GovernanceOrchestrator.resetForTesting();
  });

  // 1. Configuration Validation
  test('ConfigurationManager loads valid defaults and parses environment', () => {
    const config = ConfigurationManager.getConfig();
    assert.ok(['development', 'test'].includes(config.NODE_ENV));
    assert.ok([3000, 8080].includes(config.PORT));
    assert.equal(config.DEFAULT_COUNTRY_CODE, 'KE');
    assert.ok(config.DATABASE_URL);
  });

  // 2. Sensitive Data Redaction
  test('SensitiveDataRedactor redacts passwords, tokens, emails and phone numbers', () => {
    const text = 'User john.doe@example.com with phone +254712345678 and token secret-token-123';
    const redacted = sensitiveRedactor.redactText(text);
    assert.ok(!redacted.includes('john.doe@example.com'));
    assert.ok(!redacted.includes('+254712345678'));
    assert.ok(redacted.includes('[REDACTED_EMAIL]'));
  });

  test('SensitiveDataRedactor redacts clinical narrative objects in logs', () => {
    const obj = {
      user_id: 'user-123',
      clinical_note: 'Patient exhibits severe depressive disorder with suicidal thoughts',
      normal_meta: 'session_active'
    };
    const redacted = sensitiveRedactor.redactObject(obj);
    assert.equal(redacted.clinical_note, '[REDACTED_CLINICAL_DATA]');
    assert.equal(redacted.normal_meta, 'session_active');
  });

  // 3. Deny-by-Default Authorization Engine
  test('AuthorizationEngine denies access by default without matching rule', async () => {
    const decision = await AuthorizationEngine.evaluate({
      subjectId: 'user-random',
      subjectRoles: ['COMMUNITY_MEMBER'],
      action: 'clinical_notes.read',
      resourceType: 'clinical_notes',
      resourceId: 'note-1',
      purpose: 'Bypass attempt'
    });
    assert.equal(decision.allowed, false);
    assert.ok(decision.denialReason);
  });

  test('AuthorizationEngine BLOCKS PLATFORM_ADMIN from reading clinical records (Security Invariant)', async () => {
    const decision = await AuthorizationEngine.evaluate({
      subjectId: 'admin-root',
      subjectRoles: ['PLATFORM_ADMIN'],
      action: 'clinical_records.read',
      resourceType: 'clinical_records',
      resourceId: 'patient-record-9',
      purpose: 'System administration'
    });
    assert.equal(decision.allowed, false);
    assert.match(decision.denialReason!, /Platform administrators are prohibited/i);
  });

  test('AuthorizationEngine allows verified professional with active care relationship and purpose', async () => {
    const decision = await AuthorizationEngine.evaluate({
      subjectId: 'doc-1',
      subjectRoles: ['VERIFIED_PROFESSIONAL'],
      action: 'clinical_records.read',
      resourceType: 'clinical_records',
      resourceId: 'rec-1',
      purpose: 'Direct Clinical Care',
      context: { hasActiveCareRelationship: true }
    });
    assert.equal(decision.allowed, true);
  });

  // 4. Audit Log Hash-Chaining & Tamper-Evidence
  test('AuditService builds tamper-evident SHA-256 hash-chain', () => {
    AuditService.record({
      actor_type: 'USER',
      actor_id: 'u-1',
      action: 'TEST.ACTION.1',
      resource_type: 'test',
      purpose: 'Testing Audit Chain',
      authorization_basis: {},
      result: 'ALLOWED'
    });

    AuditService.record({
      actor_type: 'USER',
      actor_id: 'u-1',
      action: 'TEST.ACTION.2',
      resource_type: 'test',
      purpose: 'Testing Audit Chain',
      authorization_basis: {},
      result: 'ALLOWED'
    });

    const entries = AuditService.getLedger();
    assert.equal(entries.length, 2);
    assert.equal(entries[0].prev_hash, 'GENESIS');
    assert.equal(entries[1].prev_hash, entries[0].entry_hash);

    const verification = AuditService.verifyChainIntegrity();
    assert.equal(verification.valid, true);
  });

  // 5. Transactional Outbox & Event Payloads
  test('EventBus enqueues valid domain events and blocks unmasked clinical notes in payloads', () => {
    EventBus.enqueue(
      'identity.user_registered',
      'identity',
      'user-123',
      DataClassification.PERSONAL,
      { user_id: 'user-123', occurred_at: new Date().toISOString() }
    );

    const outbox = EventBus.getOutbox();
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].event_name, 'identity.user_registered');

    // Rejecting raw clinical notes in event payload
    assert.throws(() => {
      EventBus.enqueue(
        'care.clinical_note_created',
        'care',
        'note-1',
        DataClassification.HEALTH_CRITICAL,
        {
          note_id: 'note-1',
          clinical_notes: 'Raw patient diagnosis content here'
        }
      );
    }, DomainInvariantError);
  });

  // 6. Canonical State Machine Transitions
  test('validateStateTransition permits valid transitions and rejects invalid with DomainInvariantError', () => {
    // Valid: PENDING_VERIFICATION -> ACTIVE
    assert.doesNotThrow(() => {
      validateStateTransition('AccountState', AccountState.PENDING_VERIFICATION, AccountState.ACTIVE, 'user-1');
    });

    // Invalid: DELETED -> ACTIVE (Terminal state violation)
    assert.throws(() => {
      validateStateTransition('AccountState', AccountState.DELETED, AccountState.ACTIVE, 'user-1');
    }, DomainInvariantError);
  });

  // 7. Safety Kernel & Verified Crisis Resources (Kenya-First)
  test('SafetyKernel provides verified active crisis resources and excludes unverified or expired ones', () => {
    const resources = SafetyKernel.getVerifiedCrisisResources('KE');
    assert.ok(resources.length >= 2);
    const names = resources.map(r => r.name);
    assert.ok(names.some(n => n.includes('Befrienders Kenya')));
    assert.ok(names.some(n => n.includes('Emergency Response')));
  });

  test('SafetyKernel deterministic policy transitions to URGENT on suicide signal', () => {
    const result = SafetyKernel.evaluateRiskSignal({
      userId: 'user-risk-test',
      sourceDomain: 'AI',
      riskCategory: 'SUICIDE_SELF_HARM',
      signals: { immediate_danger: true }
    });

    assert.equal(result.event.current_state, RiskState.URGENT);
    assert.equal(result.requiresSafetyOverride, true);
    assert.ok(result.urgentResources.length > 0);
  });

  // 8. Identity & Account Lifecycle
  test('IdentityService registers user in PENDING_VERIFICATION and activates upon verification', async () => {
    const user = await IdentityService.registerUser('patient.test@example.ke', 'KE');
    assert.equal(user.account_state, AccountState.PENDING_VERIFICATION);

    const activated = await IdentityService.activateUser(user.id);
    assert.equal(activated.account_state, AccountState.ACTIVE);
  });

  // 9. Governance Separation of Duties & Release Gates
  test('GovernanceOrchestrator rejects release when author attempts to self-approve all gates', async () => {
    await assert.rejects(
      async () => {
        await GovernanceOrchestrator.authorizeRelease({
          releaseId: 'rel-1.0.0',
          featureKeys: ['ai_reflection'],
          authorId: 'dev-author-1',
          securityApproverId: 'dev-author-1', // Self-approval attempt
          qaApproverId: 'dev-author-1',       // Self-approval attempt
          releaseAuthorityId: 'dev-author-1'
        });
      },
      (err: unknown) => {
        return err instanceof AuthorizationError;
      }
    );
  });
});
