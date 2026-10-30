/**
 * MindOS Canonical Consent Engine & Privacy Enforcement Test Suite (Sprint 6)
 * Authority: Master Architecture Index Section 14, Volume III, IV, VIII & Appendices B, C, D, E, F
 * ADR-006, ADR-016, ADR-019, ADR-020, ADR-021
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { v7 as uuidv7 } from 'uuid';
import { ConsentState, validateStateTransition } from '../mindos/platform/shared/state_machines.js';
import {
  ConsentService,
  CanonicalConsentService,
  ConsentDecisionService,
  ConsentRepository,
  CANONICAL_CONSENT_SEEDS,
  ConsentCode
} from '../mindos/consent/index.js';
import {
  PolicyEngine,
  RoleCode,
  CanonicalReasonCodes,
  CanonicalPurposes
} from '../mindos/platform/authorization/index.js';
import {
  ConsentRequiredError,
  ConsentAlreadyWithdrawnError,
  ConsentScopeInvalidError,
  ConsentRecipientInvalidError
} from '../mindos/platform/errors/index.js';
import { DatabaseManager } from '../mindos/platform/database/connection.js';

describe('MindOS Sprint 6: Canonical Consent Engine, Privacy Preferences & Policy Integration', () => {
  let consentService: CanonicalConsentService;
  let decisionService: ConsentDecisionService;
  let repo: ConsentRepository;

  beforeEach(() => {
    ConsentService.resetForTesting();
    consentService = ConsentService.getInstance();
    decisionService = ConsentService.getDecisionService();
    repo = consentService.getRepository();
    PolicyEngine.resetMetrics();
  });

  describe('1. Canonical Consent State Machine & Transitions', () => {
    test('Valid lifecycle transitions execute without error', () => {
      const grantId = uuidv7();
      // NOT_REQUESTED -> GRANTED
      assert.doesNotThrow(() => {
        validateStateTransition('ConsentState', ConsentState.NOT_REQUESTED, ConsentState.GRANTED, grantId);
      });

      // GRANTED -> WITHDRAWN
      assert.doesNotThrow(() => {
        validateStateTransition('ConsentState', ConsentState.GRANTED, ConsentState.WITHDRAWN, grantId);
      });

      // GRANTED -> SUPERSEDED
      assert.doesNotThrow(() => {
        validateStateTransition('ConsentState', ConsentState.GRANTED, ConsentState.SUPERSEDED, grantId);
      });

      // GRANTED -> EXPIRED
      assert.doesNotThrow(() => {
        validateStateTransition('ConsentState', ConsentState.GRANTED, ConsentState.EXPIRED, grantId);
      });

      // NOT_REQUESTED -> DECLINED
      assert.doesNotThrow(() => {
        validateStateTransition('ConsentState', ConsentState.NOT_REQUESTED, ConsentState.DECLINED, grantId);
      });
    });

    test('Invalid transitions are strictly rejected by state machine', () => {
      const grantId = uuidv7();
      // WITHDRAWN -> GRANTED is forbidden (immutable withdrawal)
      assert.throws(() => {
        validateStateTransition('ConsentState', ConsentState.WITHDRAWN, ConsentState.GRANTED, grantId);
      });

      // DECLINED -> WITHDRAWN is forbidden
      assert.throws(() => {
        validateStateTransition('ConsentState', ConsentState.DECLINED, ConsentState.WITHDRAWN, grantId);
      });

      // NOT_REQUESTED -> WITHDRAWN is forbidden
      assert.throws(() => {
        validateStateTransition('ConsentState', ConsentState.NOT_REQUESTED, ConsentState.WITHDRAWN, grantId);
      });
    });
  });

  describe('2. Canonical Consent Definitions & Policy Versioning', () => {
    test('Initializes with all 10 canonical consent definitions', () => {
      const defs = repo.listDefinitions();
      assert.equal(defs.length, 10);

      const codes = defs.map(d => d.code);
      assert.ok(codes.includes(ConsentCode.PLATFORM_TERMS));
      assert.ok(codes.includes(ConsentCode.PRIVACY_PROCESSING));
      assert.ok(codes.includes(ConsentCode.AI_PROCESSING));
      assert.ok(codes.includes(ConsentCode.AI_PERSONALIZATION));
      assert.ok(codes.includes(ConsentCode.PROFESSIONAL_DATA_SHARING));
      assert.ok(codes.includes(ConsentCode.RESEARCH));
      assert.ok(codes.includes(ConsentCode.MARKETING));
      assert.ok(codes.includes(ConsentCode.COMMUNITY_PARTICIPATION));
    });

    test('Material policy change supersedes grants and requires re-consent', async () => {
      const userId = `usr-test-${uuidv7().slice(0, 8)}`;
      
      // 1. Grant AI Processing under v1.0.0
      await consentService.grantConsent(userId, ConsentCode.AI_PROCESSING, {
        policyVersion: '1.0.0'
      });

      // Grant is active
      const activeGrant = repo.getActiveGrant(userId, ConsentCode.AI_PROCESSING);
      assert.ok(activeGrant);
      assert.equal(activeGrant.status, ConsentState.GRANTED);
      assert.equal(activeGrant.policy_version, '1.0.0');

      // 2. Publish material superseding version v2.0.0
      await consentService.supersedePolicyVersion({
        consentCode: ConsentCode.AI_PROCESSING,
        version: '2.0.0',
        title: 'MindOS AI Safety Framework v2',
        summary: 'Material modifications to model safety guidelines.',
        fullTextReference: '/legal/ai-v2.md',
        isMaterialChange: true,
        approvedBy: 'officer-legal-01'
      });

      // 3. Evaluation fails-closed because user has not re-consented to material change
      const evalResult = decisionService.evaluate({
        subjectId: userId,
        actorId: userId,
        resourceType: 'ai_session',
        purpose: 'AI_SUPPORT'
      });

      assert.equal(evalResult.allowed, false);
      assert.ok(evalResult.reason.includes('Material policy change requires re-consent'));

      // 4. User re-consents to v2.0.0
      await consentService.grantConsent(userId, ConsentCode.AI_PROCESSING, {
        policyVersion: '2.0.0'
      });

      const reEvalResult = decisionService.evaluate({
        subjectId: userId,
        actorId: userId,
        resourceType: 'ai_session',
        purpose: 'AI_SUPPORT'
      });

      assert.equal(reEvalResult.allowed, true);
    });
  });

  describe('3. Granular Scopes & Data Category Exclusions', () => {
    test('Personal journal scope is strictly denied when explicitly excluded', async () => {
      const patientId = `pt-${uuidv7().slice(0, 8)}`;
      const doctorId = `doc-${uuidv7().slice(0, 8)}`;

      // Grant professional sharing with journal explicitly set to false
      await consentService.grantConsent(patientId, ConsentCode.PROFESSIONAL_DATA_SHARING, {
        recipients: [{
          recipient_type: 'PROFESSIONAL',
          recipient_id: doctorId,
          recipient_name: 'Dr. Kimani',
          role: 'CLINICAL_PROFESSIONAL'
        }],
        scopes: [
          { target_type: 'assessment_summary', is_allowed: true },
          { target_type: 'journal', is_allowed: false }
        ]
      });

      // Doctor accessing assessment summary: ALLOWED
      const assessResult = decisionService.evaluate({
        subjectId: patientId,
        actorId: doctorId,
        resourceType: 'assessment_summary',
        purpose: CanonicalPurposes.CARE_DELIVERY,
        scope: 'assessment_summary',
        recipientId: doctorId
      });
      assert.equal(assessResult.allowed, true);

      // Doctor accessing private journal: DENIED
      const journalResult = decisionService.evaluate({
        subjectId: patientId,
        actorId: doctorId,
        resourceType: 'journal',
        purpose: CanonicalPurposes.CARE_DELIVERY,
        scope: 'journal',
        recipientId: doctorId
      });
      assert.equal(journalResult.allowed, false);
      assert.ok(journalResult.reason.includes('excluded from grant'));
    });
  });

  describe('4. Recipient-Bound Sharing & Expiry Enforcement', () => {
    test('Access is denied for unregistered recipients', async () => {
      const patientId = `pt-${uuidv7().slice(0, 8)}`;
      const authorizedDoctorId = `doc-auth-${uuidv7().slice(0, 8)}`;
      const unauthorizedDoctorId = `doc-unauth-${uuidv7().slice(0, 8)}`;

      await consentService.grantConsent(patientId, ConsentCode.PROFESSIONAL_DATA_SHARING, {
        recipients: [{
          recipient_type: 'PROFESSIONAL',
          recipient_id: authorizedDoctorId,
          recipient_name: 'Dr. Authorized',
          role: 'CLINICAL_PROFESSIONAL'
        }]
      });

      const allowedCheck = decisionService.evaluate({
        subjectId: patientId,
        actorId: authorizedDoctorId,
        resourceType: 'clinical_records',
        purpose: CanonicalPurposes.CARE_DELIVERY,
        recipientId: authorizedDoctorId
      });
      assert.equal(allowedCheck.allowed, true);

      const deniedCheck = decisionService.evaluate({
        subjectId: patientId,
        actorId: unauthorizedDoctorId,
        resourceType: 'clinical_records',
        purpose: CanonicalPurposes.CARE_DELIVERY,
        recipientId: unauthorizedDoctorId
      });
      assert.equal(deniedCheck.allowed, false);
      assert.ok(deniedCheck.reason.includes('Recipient is not authorized'));
    });

    test('Access is denied when grant has expired', async () => {
      const patientId = `pt-${uuidv7().slice(0, 8)}`;
      const doctorId = `doc-exp-${uuidv7().slice(0, 8)}`;

      // Grant in the past
      const pastDate = new Date(Date.now() - 1000 * 3600 * 24).toISOString();
      await consentService.grantConsent(patientId, ConsentCode.PROFESSIONAL_DATA_SHARING, {
        recipients: [{
          recipient_type: 'PROFESSIONAL',
          recipient_id: doctorId,
          recipient_name: 'Dr. Expired',
          role: 'CLINICAL_PROFESSIONAL'
        }],
        expiresAt: pastDate
      });

      const check = decisionService.evaluate({
        subjectId: patientId,
        actorId: doctorId,
        resourceType: 'clinical_records',
        purpose: CanonicalPurposes.CARE_DELIVERY,
        recipientId: doctorId
      });

      assert.equal(check.allowed, false);
      assert.ok(check.reason.includes('Consent grant has expired'));
    });
  });

  describe('5. Purpose Limitation Enforcement', () => {
    test('Denies access when requested purpose does not match consent definition', async () => {
      const userId = `usr-purp-${uuidv7().slice(0, 8)}`;

      await consentService.grantConsent(userId, ConsentCode.AI_PROCESSING);

      // AI_SUPPORT purpose: ALLOWED
      const validPurpose = decisionService.evaluate({
        subjectId: userId,
        actorId: userId,
        resourceType: 'chat_session',
        purpose: 'AI_SUPPORT'
      });
      assert.equal(validPurpose.allowed, true);

      // MARKETING purpose on AI data: DENIED
      const invalidPurpose = decisionService.evaluate({
        subjectId: userId,
        actorId: userId,
        resourceType: 'chat_session',
        purpose: 'MARKETING'
      });
      assert.equal(invalidPurpose.allowed, false);
      assert.ok(invalidPurpose.reason.includes('Purpose MARKETING not authorized'));
    });
  });

  describe('6. Full Integration with Authorization Kernel (PolicyEngine)', () => {
    test('Clinical records access fails without consent and succeeds with active grant', async () => {
      const patientId = `pt-kernel-${uuidv7().slice(0, 8)}`;
      const doctorId = `doc-kernel-${uuidv7().slice(0, 8)}`;

      // 1. Without consent: DENY
      const denyDecision = await PolicyEngine.evaluate({
        actor: {
          actor_id: doctorId,
          identity_account_id: doctorId,
          actor_type: RoleCode.VERIFIED_PROFESSIONAL,
          roles: [RoleCode.VERIFIED_PROFESSIONAL],
          scopes: ['clinical.read']
        },
        action: 'read',
        resource: {
          type: 'clinical_records',
          id: 'rec-101',
          ownerId: patientId
        },
        purpose: CanonicalPurposes.CARE_DELIVERY,
        context: {
          careRelationshipActive: true
        }
      });

      assert.equal(denyDecision.allowed, false);
      assert.equal(denyDecision.reason_code, CanonicalReasonCodes.AUTHZ_CONSENT_REQUIRED);

      // 2. Grant consent to this doctor
      await consentService.grantConsent(patientId, ConsentCode.PROFESSIONAL_DATA_SHARING, {
        recipients: [{
          recipient_type: 'PROFESSIONAL',
          recipient_id: doctorId,
          recipient_name: 'Dr. Kernel',
          role: 'CLINICAL_PROFESSIONAL'
        }]
      });

      // 3. With consent: ALLOW
      const allowDecision = await PolicyEngine.evaluate({
        actor: {
          actor_id: doctorId,
          identity_account_id: doctorId,
          actor_type: RoleCode.VERIFIED_PROFESSIONAL,
          roles: [RoleCode.VERIFIED_PROFESSIONAL],
          scopes: ['clinical.read']
        },
        action: 'read',
        resource: {
          type: 'clinical_records',
          id: 'rec-101',
          ownerId: patientId
        },
        purpose: CanonicalPurposes.CARE_DELIVERY,
        context: {
          careRelationshipActive: true
        }
      });

      assert.equal(allowDecision.allowed, true);
      assert.equal(allowDecision.reason_code, CanonicalReasonCodes.AUTHZ_ALLOWED);
    });

    test('Immediate revocation: withdrawing consent instantly turns subsequent authorization evaluation to DENY', async () => {
      const patientId = `pt-rev-${uuidv7().slice(0, 8)}`;
      const doctorId = `doc-rev-${uuidv7().slice(0, 8)}`;

      // Grant consent
      await consentService.grantConsent(patientId, ConsentCode.PROFESSIONAL_DATA_SHARING, {
        recipients: [{
          recipient_type: 'PROFESSIONAL',
          recipient_id: doctorId,
          recipient_name: 'Dr. Revoke Test',
          role: 'CLINICAL_PROFESSIONAL'
        }]
      });

      // Check allowed initially
      const initialDecision = await PolicyEngine.evaluate({
        actor: {
          actor_id: doctorId,
          identity_account_id: doctorId,
          actor_type: RoleCode.VERIFIED_PROFESSIONAL,
          roles: [RoleCode.VERIFIED_PROFESSIONAL],
          scopes: ['clinical.read']
        },
        action: 'read',
        resource: {
          type: 'clinical_records',
          id: 'rec-102',
          ownerId: patientId
        },
        purpose: CanonicalPurposes.CARE_DELIVERY,
        context: {
          careRelationshipActive: true
        }
      });
      assert.equal(initialDecision.allowed, true);

      // Patient withdraws consent
      await consentService.withdrawConsent(patientId, ConsentCode.PROFESSIONAL_DATA_SHARING, {
        reason: 'Patient revoked professional access'
      });

      // Immediately denied on next query
      const postRevokeDecision = await PolicyEngine.evaluate({
        actor: {
          actor_id: doctorId,
          identity_account_id: doctorId,
          actor_type: RoleCode.VERIFIED_PROFESSIONAL,
          roles: [RoleCode.VERIFIED_PROFESSIONAL],
          scopes: ['clinical.read']
        },
        action: 'read',
        resource: {
          type: 'clinical_records',
          id: 'rec-102',
          ownerId: patientId
        },
        purpose: CanonicalPurposes.CARE_DELIVERY,
        context: {
          careRelationshipActive: true
        }
      });

      assert.equal(postRevokeDecision.allowed, false);
      assert.equal(postRevokeDecision.reason_code, CanonicalReasonCodes.AUTHZ_CONSENT_REQUIRED);
    });
  });

  describe('7. Verifiable Consent Receipt & Immutability (ADR-006)', () => {
    test('Generates verifiable receipt with valid SHA-256 evidence hash', async () => {
      const userId = `usr-rcpt-${uuidv7().slice(0, 8)}`;
      await consentService.grantConsent(userId, ConsentCode.AI_PROCESSING, {
        evidenceContext: {
          ip: '197.237.100.1',
          userAgent: 'Mozilla/5.0 MindOS-Mobile/1.0',
          presentedCopySummary: 'Explicit prompt processing consent presented at onboarding'
        }
      });

      const receipt = consentService.generateConsentReceipt(userId, ConsentCode.AI_PROCESSING);
      assert.ok(receipt);
      assert.equal(receipt.subject_user_id, userId);
      assert.equal(receipt.consent_code, ConsentCode.AI_PROCESSING);
      assert.equal(receipt.status, ConsentState.GRANTED);
      assert.equal(receipt.jurisdiction, 'KE');
      assert.ok(receipt.evidence_hash && receipt.evidence_hash.length === 64);
      assert.equal(receipt.verified_authentic, true);
    });

    test('Withdrawal never destroys historical records; creates verifiable audit transition', async () => {
      const userId = `usr-hist-${uuidv7().slice(0, 8)}`;
      const grant = await consentService.grantConsent(userId, ConsentCode.RESEARCH);
      const originalGrantId = grant.id;

      // Withdraw consent
      const withdrawnGrant = await consentService.withdrawConsent(userId, ConsentCode.RESEARCH, {
        reason: 'Participant opted out'
      });

      assert.equal(withdrawnGrant.id, originalGrantId);
      assert.equal(withdrawnGrant.status, ConsentState.WITHDRAWN);
      assert.ok(withdrawnGrant.withdrawn_at);

      // Latest grant query reflects WITHDRAWN, but historical record still exists
      const latest = repo.getLatestGrant(userId, ConsentCode.RESEARCH);
      assert.ok(latest);
      assert.equal(latest.status, ConsentState.WITHDRAWN);
    });
  });
});
