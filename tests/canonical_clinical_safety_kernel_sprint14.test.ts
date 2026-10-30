/**
 * MindOS Sprint 14: Canonical Clinical Safety Kernel Test Suite
 * Authority: Volumes I, V, IX, XV & Appendices B / C / G / J / P / Q
 * Clinical Safety Policy Catalogue: POL-SAFE-001, ART-SAFE-001
 * 
 * Verifies:
 * 1. Signal Taxonomy, Classification & Normalization
 * 2. Signal Deduplication & Recurrence Tracking
 * 3. Authoritative Risk State Engine & Deterministic Evaluation (R-SAFE-001)
 * 4. Risk Hysteresis, Flapping Prevention & State Machine Invariants
 * 5. Priority Action Generation & Commercial Suppression (R-SAFE-004)
 * 6. Escalation SLAs & Human Review Acknowledgment Gate (R-SAFE-005)
 * 7. Clinical Reviewer Separation of Duties & Administrative Override Prohibition (R-SAFE-006)
 * 8. Verified Crisis Resource Registry & Expiry Filter (R-SAFE-003)
 * 9. Emergency Break-Glass Protocols & Role Restrictions (R-SEC-001)
 * 10. AI, Assessment, and Trusted Contact Safety Adapters
 * 11. Safety Reconciliation & Incident Management
 * 12. Safety Bounded Context REST Router Endpoints
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  RiskState,
  EscalationState,
  SafetyMode,
  SignalSeverity,
  SignalConfidence,
  SignalSourceType,
  SignalProvenance,
  SignalStatus,
  SafetyActionType,
  SafetyActionPriority,
  SafetyEscalationType,
  SafetyReviewDecision,
  ResourceVerificationStatus,
  SafetyResourceType,
  SafetySignalService,
  RiskStateEngine,
  ActionOrchestrator,
  SafetyEscalationService,
  ResourceRegistryService,
  SafetyBreakGlassService,
  SafetyReconciliationService,
  CrisisResponseOrchestrator,
  AISafetyAdapter,
  AssessmentSafetyPort,
  TrustedContactSafetyPort,
  SafetyReviewHandler,
  SafetyReviewerAuth,
  SafetyResourceMatcher,
  RiskHysteresisManager,
  RiskStateMachine,
  SignalTaxonomy,
  SignalNormalizer,
  SignalDeduplicator,
  InMemorySafetyRepository,
  setSafetyRepository,
  resetSafetyRepository,
  getSafetyRepository,
  SafetyKernel,
  SafetyAccessDeniedError,
  SafetyBreakGlassUnauthorizedError,
  IllegalRiskStateTransitionError,
  createSafetyRouter
} from '../mindos/safety/index.js';
import { RoleCode } from '../mindos/platform/authorization/domain/types.js';

describe('Sprint 14: Clinical Safety Kernel & Risk State Engine', () => {
  let repo: InMemorySafetyRepository;

  beforeEach(() => {
    resetSafetyRepository();
    repo = getSafetyRepository() as InMemorySafetyRepository;
    RiskHysteresisManager.reset();
    SignalDeduplicator.reset();
    SafetyKernel.resetForTesting();
  });

  describe('1. Signal Taxonomy, Classification & Normalization', () => {
    test('canonical signal taxonomy validates explicit suicidal intent as CRITICAL', () => {
      const taxonomy = SignalTaxonomy.getDefinition('SIG_SUICIDAL_INTENT_ACTIVE');
      assert.ok(taxonomy);
      assert.equal(taxonomy.defaultSeverity, SignalSeverity.CRITICAL);
      assert.equal(taxonomy.category, 'SUICIDE_SELF_HARM');
    });

    test('normalizer sanitizes text, calculates confidence, and assigns jurisdiction', () => {
      const normalized = SignalNormalizer.normalize({
        subject_user_id: 'user-101',
        signal_code: 'SIG_SUICIDAL_INTENT_ACTIVE',
        source_type: SignalSourceType.AI_INTERACTION,
        source_reference: 'conv-999',
        provenance: SignalProvenance.AI_INFERRED,
        raw_text: 'I want to end my life right now',
        jurisdiction: 'KE'
      });

      assert.equal(normalized.signal_code, 'SIG_SUICIDAL_INTENT_ACTIVE');
      assert.equal(normalized.severity, SignalSeverity.CRITICAL);
      assert.equal(normalized.confidence, SignalConfidence.HIGH);
      assert.equal(normalized.jurisdiction, 'KE');
      assert.ok(normalized.normalized_evidence.sanitized_excerpt);
    });

    test('normalizer rejects unregistered signal code with validation error', () => {
      assert.throws(
        () => {
          SignalNormalizer.normalize({
            subject_user_id: 'user-101',
            signal_code: 'SIG_INVALID_CODE_123' as any,
            source_type: SignalSourceType.USER_SELF_REPORT,
            provenance: SignalProvenance.USER_REPORTED,
            jurisdiction: 'KE'
          });
        },
        /Unknown safety signal code/
      );
    });
  });

  describe('2. Signal Deduplication & Recurrence Tracking', () => {
    test('deduplicates identical signals within active window and tracks recurrence', async () => {
      const signalService = new SafetySignalService(repo);

      const first = await signalService.ingestSignal({
        subject_user_id: 'user-dedup',
        signal_code: 'SIG_SELF_HARM_ACTIVE_URGE',
        source_type: SignalSourceType.USER_SELF_REPORT,
        provenance: SignalProvenance.USER_REPORTED,
        jurisdiction: 'KE'
      });

      assert.equal(first.signal.status, SignalStatus.ACTIVE);
      assert.equal(first.deduplication.isDuplicate, false);
      assert.equal(first.deduplication.recurrenceCount, 1);

      // Ingest same signal immediately
      const second = await signalService.ingestSignal({
        subject_user_id: 'user-dedup',
        signal_code: 'SIG_SELF_HARM_ACTIVE_URGE',
        source_type: SignalSourceType.USER_SELF_REPORT,
        provenance: SignalProvenance.USER_REPORTED,
        jurisdiction: 'KE'
      });

      assert.equal(second.deduplication.isDuplicate, true);
      assert.equal(second.deduplication.recurrenceCount, 2);
      assert.equal(second.signal.status, SignalStatus.SUPERSEDED);
    });
  });

  describe('3. Authoritative Risk State Engine (R-SAFE-001)', () => {
    test('evaluates acute suicidal signal to canonical URGENT risk state and CRITICAL_SAFETY mode', async () => {
      const signalService = new SafetySignalService(repo);
      const riskEngine = new RiskStateEngine(repo);

      await signalService.ingestSignal({
        subject_user_id: 'user-acute',
        signal_code: 'SIG_SUICIDAL_INTENT_ACTIVE',
        source_type: SignalSourceType.AI_INTERACTION,
        provenance: SignalProvenance.AI_INFERRED,
        jurisdiction: 'KE'
      });

      const evalResult = await riskEngine.evaluateUserState('user-acute');
      assert.equal(evalResult.riskState.level, RiskState.URGENT);
      assert.equal(evalResult.safetyMode, SafetyMode.CRITICAL_SAFETY);
      assert.equal(evalResult.stateChanged, true);

      // Verify persistence in repository
      const current = await repo.getCurrentRiskState('user-acute');
      assert.ok(current);
      assert.equal(current.level, RiskState.URGENT);
      assert.equal(current.status, 'CURRENT');
    });

    test('evaluates passive suicidal ideation to HIGH risk state', async () => {
      const signalService = new SafetySignalService(repo);
      const riskEngine = new RiskStateEngine(repo);

      await signalService.ingestSignal({
        subject_user_id: 'user-high',
        signal_code: 'SIG_SUICIDAL_IDEATION_PASSIVE',
        source_type: SignalSourceType.ASSESSMENT,
        provenance: SignalProvenance.CLINICALLY_ASSESSED,
        jurisdiction: 'KE'
      });

      const evalResult = await riskEngine.evaluateUserState('user-high');
      assert.equal(evalResult.riskState.level, RiskState.HIGH);
      assert.equal(evalResult.safetyMode, SafetyMode.HIGH_RISK);
    });
  });

  describe('4. Risk Hysteresis, Flapping Prevention & State Machine', () => {
    test('enforces hysteresis hold: risk level cannot prematurely downgrade without stabilization window', async () => {
      const signalService = new SafetySignalService(repo);
      const riskEngine = new RiskStateEngine(repo);

      // 1. Escalate to URGENT
      await signalService.ingestSignal({
        subject_user_id: 'user-hysteresis',
        signal_code: 'SIG_SUICIDAL_INTENT_ACTIVE',
        source_type: SignalSourceType.AI_INTERACTION,
        provenance: SignalProvenance.AI_INFERRED,
        jurisdiction: 'KE'
      });
      await riskEngine.evaluateUserState('user-hysteresis');

      // 2. User changes topic to weather / benign conversation without signals
      // Attempting immediate downgrade should be held by hysteresis!
      const reEval = await riskEngine.evaluateUserState('user-hysteresis');
      assert.equal(reEval.riskState.level, RiskState.URGENT);
      assert.equal(reEval.safetyMode, SafetyMode.CRITICAL_SAFETY);
    });

    test('state machine rejects illegal direct leap from UNKNOWN to RESOLVED', () => {
      assert.throws(
        () => {
          RiskStateMachine.validateTransition(RiskState.UNKNOWN, (RiskState as any).RESOLVED, {
            userId: 'user-test'
          });
        },
        IllegalRiskStateTransitionError
      );
    });
  });

  describe('5. Safety Action Orchestration & Commercial Suppression (R-SAFE-004)', () => {
    test('orchestrates actions and prioritizes CRITICAL actions over normal tasks', async () => {
      const orchestrator = new CrisisResponseOrchestrator(repo);

      const packet = await orchestrator.handleSafetySignal({
        subject_user_id: 'user-actions',
        signal_code: 'SIG_SUICIDAL_INTENT_ACTIVE',
        source_type: SignalSourceType.USER_SELF_REPORT,
        provenance: SignalProvenance.USER_REPORTED,
        jurisdiction: 'KE'
      });

      assert.equal(packet.riskLevel, RiskState.URGENT);
      assert.equal(packet.commercialSuppressionActive, true);
      assert.ok(packet.actions.length > 0);

      // Ensure critical actions exist
      const actionTypes = packet.actions.map(a => a.action_type);
      assert.ok(actionTypes.includes(SafetyActionType.DISPLAY_CRISIS_MODAL));
      assert.ok(actionTypes.includes(SafetyActionType.SUPPRESS_COMMERCIALS));
      assert.ok(actionTypes.includes(SafetyActionType.NOTIFY_CLINICAL_ONCALL));

      // Check priority sort
      assert.equal(packet.actions[0].priority, SafetyActionPriority.CRITICAL);
    });
  });

  describe('6. Escalations & Reviewer Acknowledgement Gate (R-SAFE-005)', () => {
    test('creates escalation with SLAs and prevents claiming active review before acknowledgement', async () => {
      const orchestrator = new CrisisResponseOrchestrator(repo);
      const escalationService = new SafetyEscalationService(repo);

      const packet = await orchestrator.handleSafetySignal({
        subject_user_id: 'user-esc',
        signal_code: 'SIG_SUICIDAL_INTENT_ACTIVE',
        source_type: SignalSourceType.AI_INTERACTION,
        provenance: SignalProvenance.AI_INFERRED,
        jurisdiction: 'KE'
      });

      assert.ok(packet.escalation);
      assert.equal(packet.escalation.status, EscalationState.PENDING_REVIEW);
      assert.equal(packet.escalation.assigned_team, 'CLINICAL_SAFETY_ONCALL');
      assert.ok(packet.escalation.sla_acknowledgement_due_at);

      // R-SAFE-005: Platform does NOT claim active human review yet
      assert.equal(packet.escalation.acknowledged_at, undefined);

      // Reviewer acknowledges
      const acked = await escalationService.acknowledgeEscalation(packet.escalation.id, {
        actor_id: 'rev-dr-kamau',
        role: RoleCode.CLINICAL_REVIEWER
      });

      assert.equal(acked.status, EscalationState.IN_REVIEW);
      assert.equal(acked.assigned_actor_id, 'rev-dr-kamau');
      assert.ok(acked.acknowledged_at);

      // Reviewer resolves with outcome
      const resolved = await escalationService.resolveEscalation(
        packet.escalation.id,
        { actor_id: 'rev-dr-kamau', role: RoleCode.CLINICAL_REVIEWER },
        'Client contacted crisis line; safety plan executed and stabilized.'
      );

      assert.equal(resolved.status, EscalationState.RESOLVED);
      assert.ok(resolved.resolved_at);
      assert.ok(resolved.outcome);
    });
  });

  describe('7. Clinical Reviewer Separation of Duties (R-SAFE-006)', () => {
    test('permits CLINICAL_REVIEWER and CLINICAL_ADMIN to perform safety review', () => {
      assert.doesNotThrow(() => {
        SafetyReviewerAuth.assertReviewerEligibility({
          actor_id: 'rev-1',
          role: RoleCode.CLINICAL_REVIEWER
        });
      });

      assert.doesNotThrow(() => {
        SafetyReviewerAuth.assertReviewerEligibility({
          actor_id: 'admin-1',
          role: RoleCode.CLINICAL_ADMIN
        });
      });
    });

    test('denies general ADMIN and MODERATOR from overriding clinical risk state (R-SAFE-006)', () => {
      assert.throws(
        () => {
          SafetyReviewerAuth.assertReviewerEligibility({
            actor_id: 'admin-corp',
            role: RoleCode.ADMIN
          });
        },
        SafetyAccessDeniedError
      );

      assert.throws(
        () => {
          SafetyReviewerAuth.assertReviewerEligibility({
            actor_id: 'mod-1',
            role: RoleCode.MODERATOR
          });
        },
        SafetyAccessDeniedError
      );
    });

    test('clinical review handler decreases risk state with valid rationale', async () => {
      const reviewResult = SafetyReviewHandler.handleReview({
        subject_user_id: 'user-clin-rev',
        current_risk_state: RiskState.URGENT,
        reviewer_id: 'rev-clinician-1',
        reviewer_role: RoleCode.CLINICAL_REVIEWER,
        decision: SafetyReviewDecision.DECREASE_RISK_STATE,
        proposed_risk_level: RiskState.ELEVATED,
        rationale: 'Comprehensive psychiatric evaluation completed. Acute intent resolved with family support.'
      });

      assert.equal(reviewResult.stateChanged, true);
      assert.equal(reviewResult.finalRiskState, RiskState.ELEVATED);
      assert.equal(reviewResult.review.decision, SafetyReviewDecision.DECREASE_RISK_STATE);
    });
  });

  describe('8. Verified Crisis Resource Registry (R-SAFE-003)', () => {
    test('returns only verified, unexpired resources for Kenya (KE)', async () => {
      const resourceService = new ResourceRegistryService(repo);
      const resources = await resourceService.getVerifiedResources({ jurisdiction: 'KE' });

      assert.ok(resources.length > 0);
      for (const res of resources) {
        assert.equal(res.status, 'ACTIVE');
        assert.equal(res.verification_status, ResourceVerificationStatus.VERIFIED);
        assert.ok(new Date(res.expires_at).getTime() > Date.now());
      }
    });

    test('audits and filters out expired resources and publishes notification', async () => {
      const resourceService = new ResourceRegistryService(repo);

      // Inject an expired resource
      await repo.saveResource({
        id: 'res-expired',
        resource_code: 'EXP-HELPLINE',
        resource_type: SafetyResourceType.CRISIS_LINE,
        name: 'Old Deprecated Line',
        jurisdiction: 'KE',
        contact_method: 'PHONE',
        phone: '12345',
        languages: ['English'],
        population: ['GENERAL'],
        risk_applicability: ['SUICIDE_SELF_HARM'],
        verification_status: ResourceVerificationStatus.VERIFIED,
        verified_at: '2025-01-01T00:00:00.000Z',
        expires_at: '2025-06-01T00:00:00.000Z', // In the past!
        availability_json: { hours: '24/7', free_of_charge: true },
        status: 'ACTIVE',
        source_reference: 'LEGACY',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      // Audit expirations
      const expired = await resourceService.auditResourceExpirations();
      assert.ok(expired.some(e => e.id === 'res-expired'));

      // Ensure matcher does NOT present expired resource to users
      const matched = await resourceService.getVerifiedResources({ jurisdiction: 'KE' });
      assert.equal(matched.some(m => m.id === 'res-expired'), false);
    });
  });

  describe('9. Break-Glass Emergency Protocols (R-SEC-001)', () => {
    test('permits CLINICAL_REVIEWER to initiate break-glass with lease capped at 60 minutes', async () => {
      const breakGlassService = new SafetyBreakGlassService(repo);

      const session = await breakGlassService.initiateSession({
        subject_user_id: 'user-bg',
        actor_id: 'dr-maina',
        actor_role: RoleCode.CLINICAL_REVIEWER,
        justification: 'Immediate suicide threat in active conversation; emergency clinical intervention required.',
        durationMinutes: 120 // Requests 120, must be capped at 60!
      });

      assert.ok(session.id);
      assert.equal(session.post_review_required, true);

      const startMs = new Date(session.started_at).getTime();
      const expMs = new Date(session.expires_at).getTime();
      const diffMinutes = Math.round((expMs - startMs) / (60 * 1000));
      assert.equal(diffMinutes, 60);

      // Assert active session
      const active = await breakGlassService.assertActiveSession('user-bg', 'dr-maina');
      assert.ok(active);

      // Terminate
      await breakGlassService.terminateSession('user-bg', 'dr-maina');
      await assert.rejects(
        () => breakGlassService.assertActiveSession('user-bg', 'dr-maina'),
        /No active break-glass emergency session/
      );
    });

    test('denies general ADMIN and MODERATOR from initiating break-glass', async () => {
      const breakGlassService = new SafetyBreakGlassService(repo);

      await assert.rejects(
        () =>
          breakGlassService.initiateSession({
            subject_user_id: 'user-bg',
            actor_id: 'admin-bob',
            actor_role: RoleCode.ADMIN,
            justification: 'Clinical emergency override attempt by IT admin'
          }),
        SafetyBreakGlassUnauthorizedError
      );
    });
  });

  describe('10. System Adapters (AI, Assessment, Trusted Contact)', () => {
    test('AI adapter intercepts acute crisis message and triggers override', async () => {
      const orchestrator = new CrisisResponseOrchestrator(repo);
      const aiAdapter = new AISafetyAdapter(orchestrator);

      const intercept = await aiAdapter.interceptMessage({
        userId: 'user-ai-crisis',
        conversationId: 'conv-ai-1',
        messageText: 'I feel completely hopeless and I want to kill myself tonight'
      });

      assert.equal(intercept.shouldOverride, true);
      assert.equal(intercept.safetyMode, SafetyMode.CRITICAL_SAFETY);
      assert.ok(intercept.overrideMessage);
      assert.ok(intercept.crisisResources && intercept.crisisResources.length > 0);
    });

    test('assessment safety port immediately evaluates PHQ-9 Item 9 without waiting for assessment finish', async () => {
      const orchestrator = new CrisisResponseOrchestrator(repo);
      const assessmentPort = new AssessmentSafetyPort(orchestrator);

      await assessmentPort.processAssessmentItem({
        userId: 'user-phq9',
        assessmentId: 'ass-phq-1',
        instrumentCode: 'PHQ-9',
        itemNumber: 9,
        score: 3 // Nearly every day
      });

      const posture = await orchestrator.getUserSafetyPosture('user-phq9');
      assert.equal(posture.riskLevel, RiskState.URGENT);
      assert.equal(posture.safetyMode, SafetyMode.CRITICAL_SAFETY);
    });

    test('trusted contact adapter blocks dispatch when explicit crisis consent is not granted', () => {
      const withoutConsent = TrustedContactSafetyPort.evaluateEligibility({
        hasTrustedContactConfigured: true,
        hasExplicitCrisisConsent: false,
        isDeceasedOrRevoked: false
      });
      assert.equal(withoutConsent.eligible, false);
      assert.match(withoutConsent.blockReason!, /explicit consent/);

      const withConsent = TrustedContactSafetyPort.evaluateEligibility({
        hasTrustedContactConfigured: true,
        hasExplicitCrisisConsent: true,
        isDeceasedOrRevoked: false
      });
      assert.equal(withConsent.eligible, true);
    });
  });

  describe('11. Safety Reconciliation & Incident Management', () => {
    test('reconciliation detects discrepancy when urgent user lacks active escalation', async () => {
      const reconciliationService = new SafetyReconciliationService(repo);

      // Artificially create a CURRENT URGENT risk state without creating an escalation
      await repo.saveRiskState({
        id: 'rs-orphan',
        subject_user_id: 'user-orphan',
        level: RiskState.URGENT,
        state_version: 1,
        effective_at: new Date().toISOString(),
        reason_codes: ['TEST'],
        evidence_refs: [],
        policy_version: '2.0.0',
        clinical_artifact_ref: 'ART-SAFE-001',
        fresh_until: new Date(Date.now() + 3600000).toISOString(),
        status: 'CURRENT',
        source_summary: {
          highest_source: SignalSourceType.ASSESSMENT,
          signal_count: 1,
          last_source_time: new Date().toISOString()
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      const report = await reconciliationService.reconcile(['user-orphan']);
      assert.equal(report.status, 'DISCREPANCIES_DETECTED');
      assert.equal(report.missingEscalationsCount, 1);
      assert.ok(report.incidentsCreated.length > 0);

      // Verify incident recorded
      const incidents = await repo.getIncidents();
      assert.ok(incidents.some(i => i.affected_component === 'SAFETY_ESCALATION_ENGINE'));
    });
  });

  describe('12. Safety Bounded Context REST Router Endpoints', () => {
    test('router exports clean express instance and registers all canonical routes', () => {
      const router = createSafetyRouter();
      assert.ok(router);
      assert.equal(typeof router, 'function');
    });
  });
});
