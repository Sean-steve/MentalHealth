/**
 * MindOS Sprint 15: Canonical Clinical Assessments & Screening Engine Test Suite
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
 * 
 * Verifies:
 * 1. Instrument Registry, Governance Approval & Immutable Versioning
 * 2. Branching Logic, DSL Evaluation & DAG Cycle Detection
 * 3. Session Lifecycle, State Transitions & Incremental Autosave
 * 4. IDOR Prevention & Anti-leakage Controls
 * 5. Deterministic Scoring Engine & SHA-256 Non-Repudiable Calculation Hash
 * 6. Governed Non-Diagnostic Result Interpretation & Statutory Disclaimers
 * 7. Immediate Acute Safety Signals & Safety Kernel Integration (R-SAFE-001)
 * 8. Population Eligibility Gating (Age, Jurisdiction, Consent)
 * 9. Retake Minimum Interval Cooldown & Clinical Override Handling
 * 10. Result Invalidation, Auditing & Supersession
 * 11. AI Assistant Boundary & Sharing Restrictions
 * 12. Backward Compatibility with Legacy Assessment API
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  AssessmentService,
  AssessmentRegistry,
  AssessmentSessionService,
  AssessmentEligibilityService,
  AssessmentRetakeService,
  AssessmentScoringEngine,
  AssessmentInterpretationService,
  AssessmentSafetyKernelAdapter,
  ScoreHashCalculator,
  BranchingEvaluator,
  BranchingValidator,
  AssessmentResultSharingPort,
  AssessmentAIBoundaryPort,
  AssessmentPersistenceStore,
  AssessmentSessionState,
  AssessmentResultState,
  AssessmentVersionState,
  EligibilityStatus,
  InvalidationReason,
  QuestionType,
  ScoringType,
  AssessmentQuestion
} from '../mindos/assessments/index.js';

import {
  AssessmentNotAvailableError,
  AssessmentNotEligibleError,
  AssessmentConsentRequiredError,
  AssessmentSessionExpiredError,
  AssessmentAlreadyCompletedError,
  AssessmentResponseInvalidError,
  AssessmentIncompleteError,
  AssessmentResultInvalidatedError,
  AssessmentVersionRevokedError,
  AssessmentRetakeNotAllowedError,
  AssessmentBranchViolationError,
  AssessmentIdorViolationError,
  DomainInvariantError
} from '../mindos/platform/errors/index.js';

import {
  InMemorySafetyRepository,
  setSafetyRepository
} from '../mindos/safety/index.js';

describe('Sprint 15: Canonical Assessments & Screening Engine', () => {
  const TEST_USER_1 = 'usr_patient_001_uuid';
  const TEST_USER_2 = 'usr_patient_002_uuid';
  const CLINICIAN_ID = 'usr_clinician_001_uuid';

  beforeEach(() => {
    // Reset assessment store & re-seed canonical instruments
    AssessmentPersistenceStore.clearAll();
    AssessmentRegistry.initialize();

    // Reset safety kernel repository
    setSafetyRepository(new InMemorySafetyRepository());
  });

  describe('1. Instrument Registry, Versioning & Clinical Governance', () => {
    test('Canonical instruments (PHQ-9, GAD-7, WHO-5, C-SSRS) are registered with ACTIVE versions', () => {
      const available = AssessmentRegistry.listAvailableAssessments();
      const codes = available.map((a) => a.code);

      assert.ok(codes.includes('PHQ-9'), 'PHQ-9 must be registered');
      assert.ok(codes.includes('GAD-7'), 'GAD-7 must be registered');
      assert.ok(codes.includes('WHO-5'), 'WHO-5 must be registered');
      assert.ok(codes.includes('C-SSRS'), 'C-SSRS must be registered');

      const phq9Def = AssessmentRegistry.getDefinition('PHQ-9');
      assert.equal(phq9Def.status, 'ACTIVE');

      const activeVer = AssessmentRegistry.getActiveVersion(phq9Def.id);
      assert.equal(activeVer.version, 1);
      assert.equal(activeVer.status, AssessmentVersionState.ACTIVE);
      assert.ok(activeVer.clinical_artifact_version >= 1, 'Must have governed clinical artifact version');
    });

    test('Creating a new governed version (Version N+1) supersedes previous version', () => {
      const phq9Def = AssessmentRegistry.getDefinition('PHQ-9');
      const activeVer = AssessmentRegistry.getActiveVersion(phq9Def.id);

      const v2 = AssessmentRegistry.createNewVersion({
        definitionId: phq9Def.id,
        supersedesVersionId: activeVer.id,
        title: 'PHQ-9 Revised Clinical Edition',
        instructions: 'Updated instructions for 2027 screening.',
        clinicalArtifactVersion: 2
      });

      assert.equal(v2.version, 2);
      assert.equal(v2.status, AssessmentVersionState.DRAFT);
      assert.equal(v2.supersedes_id, activeVer.id);
    });

    test('Revoked or suspended versions reject session initiation', async () => {
      const gad7Def = AssessmentRegistry.getDefinition('GAD-7');
      const activeVer = AssessmentRegistry.getActiveVersion(gad7Def.id);

      // Simulate clinical governance suspension
      activeVer.status = AssessmentVersionState.SUSPENDED;
      AssessmentPersistenceStore.saveVersion(activeVer);

      assert.throws(
        () => AssessmentRegistry.getVersion(activeVer.id),
        AssessmentVersionRevokedError
      );
    });
  });

  describe('2. Branching Logic & DAG Cycle Detection', () => {
    test('Dynamic visibility evaluates conditional operators accurately', () => {
      const simpleRule = {
        operator: 'AND' as const,
        conditions: [{ question_code: 'Q2', operator: 'equals' as const, value: 'YES' }]
      };

      assert.equal(BranchingEvaluator.isVisible(simpleRule, { Q2: 'YES' }), true);
      assert.equal(BranchingEvaluator.isVisible(simpleRule, { Q2: 'NO' }), false);
      assert.equal(BranchingEvaluator.isVisible(simpleRule, {}), false);

      const numericRule = {
        operator: 'AND' as const,
        conditions: [{ question_code: 'AGE', operator: 'greater_than' as const, value: 18 }]
      };
      assert.equal(BranchingEvaluator.isVisible(numericRule, { AGE: 25 }), true);
      assert.equal(BranchingEvaluator.isVisible(numericRule, { AGE: 16 }), false);
    });

    test('BranchingValidator detects circular dependencies (Q1 -> Q2 -> Q1)', () => {
      const cyclicQuestions: AssessmentQuestion[] = [
        {
          id: 'q1',
          assessment_version_id: 'v1',
          question_code: 'Q1',
          position: 1,
          prompt: 'Question 1',
          question_type: QuestionType.BOOLEAN,
          required: true,
          response_schema: {},
          visibility_rule: {
            operator: 'AND',
            conditions: [{ question_code: 'Q2', operator: 'equals', value: true }]
          },
          created_at: new Date().toISOString()
        },
        {
          id: 'q2',
          assessment_version_id: 'v1',
          question_code: 'Q2',
          position: 2,
          prompt: 'Question 2',
          question_type: QuestionType.BOOLEAN,
          required: true,
          response_schema: {},
          visibility_rule: {
            operator: 'AND',
            conditions: [{ question_code: 'Q1', operator: 'equals', value: true }]
          },
          created_at: new Date().toISOString()
        }
      ];

      const validation = BranchingValidator.validate(cyclicQuestions);
      assert.equal(validation.valid, false);
      assert.ok(validation.issues.some((i) => i.code === 'CIRCULAR_DEPENDENCY'));
    });

    test('Recording a response to a hidden question throws AssessmentBranchViolationError', async () => {
      const sessionResult = await AssessmentSessionService.startSession({
        userId: TEST_USER_1,
        instrumentCode: 'C-SSRS',
        hasConsent: true
      });
      const sessionId = sessionResult.session.id;

      // In C-SSRS: CSSRS_Q3 is visible ONLY IF CSSRS_Q2 === "YES"
      // User answers CSSRS_Q2 as "NO"
      await AssessmentSessionService.recordResponses({
        sessionId,
        userId: TEST_USER_1,
        responses: [
          { question_code: 'CSSRS_Q1', value: 'NO' },
          { question_code: 'CSSRS_Q2', value: 'NO' }
        ]
      });

      // User attempts to answer CSSRS_Q3 which is hidden
      await assert.rejects(
        async () => {
          await AssessmentSessionService.recordResponses({
            sessionId,
            userId: TEST_USER_1,
            responses: [{ question_code: 'CSSRS_Q3', value: 'YES' }]
          });
        },
        AssessmentBranchViolationError
      );
    });
  });

  describe('3. Session Execution, Autosave & IDOR Enforcement', () => {
    test('Session lifecycle: start -> autosave -> progress update -> submission', async () => {
      const startResult = await AssessmentSessionService.startSession({
        userId: TEST_USER_1,
        instrumentCode: 'PHQ-9',
        hasConsent: true
      });

      const session = startResult.session;
      assert.equal(session.status, AssessmentSessionState.IN_PROGRESS);
      assert.equal(session.progress, 0);

      // Autosave batch 1 (3 questions)
      const saveResult1 = await AssessmentSessionService.recordResponses({
        sessionId: session.id,
        userId: TEST_USER_1,
        responses: [
          { question_code: 'PHQ9_Q1', value: 1 },
          { question_code: 'PHQ9_Q2', value: 2 },
          { question_code: 'PHQ9_Q3', value: 1 }
        ]
      });

      assert.equal(saveResult1.progress, 33.3);

      // Autosave batch 2 (remaining 6 questions)
      const saveResult2 = await AssessmentSessionService.recordResponses({
        sessionId: session.id,
        userId: TEST_USER_1,
        responses: [
          { question_code: 'PHQ9_Q4', value: 1 },
          { question_code: 'PHQ9_Q5', value: 0 },
          { question_code: 'PHQ9_Q6', value: 1 },
          { question_code: 'PHQ9_Q7', value: 1 },
          { question_code: 'PHQ9_Q8', value: 0 },
          { question_code: 'PHQ9_Q9', value: 0 }
        ]
      });

      assert.equal(saveResult2.progress, 100);

      // Submit session
      const result = await AssessmentSessionService.submitSession({
        sessionId: session.id,
        userId: TEST_USER_1
      });

      assert.equal(result.status, AssessmentResultState.VALID);
      assert.equal(result.raw_score, 7); // 1+2+1+1+0+1+1+0+0 = 7
      assert.equal(result.result_band, 'MILD');
    });

    test('IDOR protection: User cannot record responses or submit another user session', async () => {
      const startResult = await AssessmentSessionService.startSession({
        userId: TEST_USER_1,
        instrumentCode: 'PHQ-9',
        hasConsent: true
      });
      const sessionId = startResult.session.id;

      // User 2 attempts to record response on User 1's session
      await assert.rejects(
        async () => {
          await AssessmentSessionService.recordResponses({
            sessionId,
            userId: TEST_USER_2,
            responses: [{ question_code: 'PHQ9_Q1', value: 2 }]
          });
        },
        AssessmentIdorViolationError
      );

      // User 2 attempts to submit User 1's session
      await assert.rejects(
        async () => {
          await AssessmentSessionService.submitSession({
            sessionId,
            userId: TEST_USER_2
          });
        },
        AssessmentIdorViolationError
      );
    });

    test('Incomplete submission prevention: Throws AssessmentIncompleteError if required questions unanswered', async () => {
      const startResult = await AssessmentSessionService.startSession({
        userId: TEST_USER_1,
        instrumentCode: 'PHQ-9',
        hasConsent: true
      });
      const sessionId = startResult.session.id;

      // Answer only 1 question
      await AssessmentSessionService.recordResponses({
        sessionId,
        userId: TEST_USER_1,
        responses: [{ question_code: 'PHQ9_Q1', value: 2 }]
      });

      await assert.rejects(
        async () => {
          await AssessmentSessionService.submitSession({
            sessionId,
            userId: TEST_USER_1
          });
        },
        AssessmentIncompleteError
      );
    });

    test('Completed sessions are immutable and reject further modifications', async () => {
      const startResult = await AssessmentSessionService.startSession({
        userId: TEST_USER_1,
        instrumentCode: 'GAD-7',
        hasConsent: true
      });
      const sessionId = startResult.session.id;

      // Answer all 7 items with 0
      const responses = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
        question_code: `GAD7_Q${n}`,
        value: 0
      }));
      await AssessmentSessionService.recordResponses({ sessionId, userId: TEST_USER_1, responses });

      // Submit
      await AssessmentSessionService.submitSession({ sessionId, userId: TEST_USER_1 });

      // Attempt to modify after completion
      await assert.rejects(
        async () => {
          await AssessmentSessionService.recordResponses({
            sessionId,
            userId: TEST_USER_1,
            responses: [{ question_code: 'GAD7_Q1', value: 3 }]
          });
        },
        AssessmentAlreadyCompletedError
      );
    });
  });

  describe('4. Deterministic Scoring & Non-Repudiable Cryptographic Hash', () => {
    test('Calculates score and produces non-repudiable SHA-256 calculation hash', async () => {
      const startResult = await AssessmentSessionService.startSession({
        userId: TEST_USER_1,
        instrumentCode: 'PHQ-9',
        hasConsent: true
      });
      const sessionId = startResult.session.id;

      const responses = [
        { question_code: 'PHQ9_Q1', value: 2 },
        { question_code: 'PHQ9_Q2', value: 3 },
        { question_code: 'PHQ9_Q3', value: 2 },
        { question_code: 'PHQ9_Q4', value: 2 },
        { question_code: 'PHQ9_Q5', value: 1 },
        { question_code: 'PHQ9_Q6', value: 2 },
        { question_code: 'PHQ9_Q7', value: 1 },
        { question_code: 'PHQ9_Q8', value: 1 },
        { question_code: 'PHQ9_Q9', value: 0 }
      ]; // Sum = 14 -> Moderate Depression

      await AssessmentSessionService.recordResponses({ sessionId, userId: TEST_USER_1, responses });
      const result = await AssessmentSessionService.submitSession({ sessionId, userId: TEST_USER_1 });

      assert.equal(result.raw_score, 14);
      assert.equal(result.result_band, 'MODERATE');

      const scoreRecord = AssessmentPersistenceStore.getScoreForSession(sessionId);
      assert.ok(scoreRecord, 'Score record must exist');
      assert.equal(scoreRecord.raw_score, 14);
      assert.ok(scoreRecord.calculation_hash, 'Hash must exist');

      // Verify integrity
      const isAuthentic = AssessmentScoringEngine.verifyScoreIntegrity(scoreRecord);
      assert.equal(isAuthentic, true, 'Cryptographic hash must match calculation');

      // Tamper verification test
      const tamperedRecord = { ...scoreRecord, calculation_hash: 'tampered_invalid_hash' };
      const isTamperedAuthentic = AssessmentScoringEngine.verifyScoreIntegrity(tamperedRecord);
      assert.equal(isTamperedAuthentic, false, 'Tampered score must fail hash verification');
    });

    test('WHO-5 Normalized Percentage Scoring multiplies raw score by 4', async () => {
      const startResult = await AssessmentSessionService.startSession({
        userId: TEST_USER_1,
        instrumentCode: 'WHO-5',
        hasConsent: true
      });
      const sessionId = startResult.session.id;

      // 5 items, each score 4 (Raw total: 20 -> Percentage: 80%)
      const responses = [1, 2, 3, 4, 5].map((n) => ({
        question_code: `WHO5_Q${n}`,
        value: 4
      }));

      await AssessmentSessionService.recordResponses({ sessionId, userId: TEST_USER_1, responses });
      const result = await AssessmentSessionService.submitSession({ sessionId, userId: TEST_USER_1 });

      assert.equal(result.raw_score, 20);
      assert.equal(result.normalized_score, 80);
      assert.equal(result.result_band, 'SATISFACTORY_WELLBEING');
    });
  });

  describe('5. Governed Non-Diagnostic Interpretation & Limitations', () => {
    test('Interpretation enforces statutory non-diagnostic disclaimers and limitations', async () => {
      const startResult = await AssessmentSessionService.startSession({
        userId: TEST_USER_1,
        instrumentCode: 'PHQ-9',
        hasConsent: true
      });
      const sessionId = startResult.session.id;

      // All 3s (Severe Depression: 27)
      const responses = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
        question_code: `PHQ9_Q${n}`,
        value: 3
      }));

      await AssessmentSessionService.recordResponses({ sessionId, userId: TEST_USER_1, responses });
      const result = await AssessmentSessionService.submitSession({ sessionId, userId: TEST_USER_1 });

      assert.equal(result.raw_score, 27);
      assert.equal(result.result_band, 'SEVERE');

      // Disclaimers & limitations
      assert.ok(result.limitations.includes('NOT a medical or psychiatric diagnosis'), 'Must include non-diagnostic caveat');
      assert.ok(result.limitations.includes('licensed healthcare professional'), 'Must direct to professional');
    });
  });

  describe('6. Immediate Acute Safety Signals & Safety Kernel Integration (R-SAFE-001)', () => {
    test('Safety-critical answer on PHQ-9 Q9 immediately triggers Safety Kernel before session submission', async () => {
      const startResult = await AssessmentSessionService.startSession({
        userId: TEST_USER_1,
        instrumentCode: 'PHQ-9',
        hasConsent: true
      });
      const sessionId = startResult.session.id;

      // Answer Q1 with 0 (safe)
      const safeRecord = await AssessmentSessionService.recordResponses({
        sessionId,
        userId: TEST_USER_1,
        responses: [{ question_code: 'PHQ9_Q1', value: 0 }]
      });
      assert.equal(safeRecord.safetyAlert, undefined, 'Safe answer must not trigger safety alert');

      // Answer Q9 with 2 ("Thoughts that you would be better off dead... More than half the days")
      const acuteRecord = await AssessmentSessionService.recordResponses({
        sessionId,
        userId: TEST_USER_1,
        responses: [{ question_code: 'PHQ9_Q9', value: 2 }]
      });

      assert.ok(acuteRecord.safetyAlert, 'Must immediately trigger acute safety alert');
      assert.equal(acuteRecord.safetyAlert.triggered, true);
      assert.equal(acuteRecord.safetyAlert.signalCode, 'SIG_SUICIDAL_INTENT_ACTIVE');
      assert.equal(acuteRecord.safetyAlert.severity, 'CRITICAL');
      assert.ok(acuteRecord.safetyAlert.crisisResources && acuteRecord.safetyAlert.crisisResources.length > 0);

      // Verify Safety Kernel state was updated immediately
      const updatedRisk = await AssessmentSafetyKernelAdapter.getUserRiskState(TEST_USER_1);
      assert.ok(updatedRisk === 'CRITICAL' || updatedRisk === 'HIGH' || updatedRisk === 'URGENT', 'User risk state must elevate in Safety Kernel');
    });

    test('C-SSRS acute preparatory behavior (Q6) triggers CRITICAL safety signal', async () => {
      const startResult = await AssessmentSessionService.startSession({
        userId: TEST_USER_1,
        instrumentCode: 'C-SSRS',
        hasConsent: true
      });
      const sessionId = startResult.session.id;

      const recordResult = await AssessmentSessionService.recordResponses({
        sessionId,
        userId: TEST_USER_1,
        responses: [{ question_code: 'CSSRS_Q6', value: 'YES' }]
      });

      assert.ok(recordResult.safetyAlert);
      assert.equal(recordResult.safetyAlert.severity, 'CRITICAL');
      assert.equal(recordResult.safetyAlert.signalCode, 'SIG_SUICIDAL_BEHAVIOR_ACTIVE');
    });
  });

  describe('7. Eligibility Gating & Retake Cooldown', () => {
    test('Enforces age, jurisdiction, and consent requirements', async () => {
      // 1. Consent missing
      await assert.rejects(
        async () => {
          await AssessmentSessionService.startSession({
            userId: TEST_USER_1,
            instrumentCode: 'PHQ-9',
            hasConsent: false
          });
        },
        AssessmentConsentRequiredError
      );

      // 2. Underage subject (< 18)
      await assert.rejects(
        async () => {
          await AssessmentSessionService.startSession({
            userId: TEST_USER_1,
            instrumentCode: 'PHQ-9',
            userAge: 15,
            hasConsent: true
          });
        },
        AssessmentNotEligibleError
      );

      // 3. Unauthorized jurisdiction
      await assert.rejects(
        async () => {
          await AssessmentSessionService.startSession({
            userId: TEST_USER_1,
            instrumentCode: 'PHQ-9',
            jurisdiction: 'XX',
            hasConsent: true
          });
        },
        AssessmentNotEligibleError
      );
    });

    test('Enforces retake cooldown period (14 days for PHQ-9) unless early retake permitted', async () => {
      // Complete first assessment
      const start1 = await AssessmentSessionService.startSession({
        userId: TEST_USER_1,
        instrumentCode: 'PHQ-9',
        hasConsent: true
      });
      const responses = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ question_code: `PHQ9_Q${n}`, value: 0 }));
      await AssessmentSessionService.recordResponses({ sessionId: start1.session.id, userId: TEST_USER_1, responses });
      await AssessmentSessionService.submitSession({ sessionId: start1.session.id, userId: TEST_USER_1 });

      // Attempt to retake immediately without override
      await assert.rejects(
        async () => {
          await AssessmentSessionService.startSession({
            userId: TEST_USER_1,
            instrumentCode: 'PHQ-9',
            hasConsent: true,
            allowEarlyRetake: false
          });
        },
        AssessmentRetakeNotAllowedError
      );

      // Attempt retake with clinical override
      const start2 = await AssessmentSessionService.startSession({
        userId: TEST_USER_1,
        instrumentCode: 'PHQ-9',
        hasConsent: true,
        allowEarlyRetake: true,
        retakeReason: 'Clinical follow-up requested by Dr. Patel'
      });

      assert.ok(start2.session.id, 'Early retake with clinical justification must succeed');
    });
  });

  describe('8. Result Invalidation & Sharing Restrictions', () => {
    test('Clinical governance defect invalidates result and updates sharing port status', async () => {
      const start = await AssessmentSessionService.startSession({
        userId: TEST_USER_1,
        instrumentCode: 'PHQ-9',
        hasConsent: true
      });
      const responses = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ question_code: `PHQ9_Q${n}`, value: 1 }));
      await AssessmentSessionService.recordResponses({ sessionId: start.session.id, userId: TEST_USER_1, responses });
      const result = await AssessmentSessionService.submitSession({ sessionId: start.session.id, userId: TEST_USER_1 });

      // Before invalidation: Shareable
      const preShare = await AssessmentResultSharingPort.prepareResultForSharing({
        resultId: result.id,
        requestingActorId: CLINICIAN_ID,
        purpose: 'CLINICAL_CONSULTATION',
        hasPatientConsent: true
      });
      assert.equal(preShare.shareable, true);

      // Invalidate result due to defect
      const invalidated = await AssessmentSessionService.invalidateResult({
        resultId: result.id,
        actorId: CLINICIAN_ID,
        reason: InvalidationReason.SCORING_DEFECT,
        notes: 'Recalled version scoring model anomaly'
      });

      assert.equal(invalidated.status, AssessmentResultState.INVALIDATED);
      assert.equal(invalidated.invalidation_reason, InvalidationReason.SCORING_DEFECT);

      // After invalidation: Sharing port flags defect
      const postShare = await AssessmentResultSharingPort.prepareResultForSharing({
        resultId: result.id,
        requestingActorId: CLINICIAN_ID,
        purpose: 'CLINICAL_CONSULTATION',
        hasPatientConsent: true
      });
      assert.equal(postShare.shareable, false);
      assert.ok(postShare.disclaimer.includes('invalidated'));
    });
  });

  describe('9. AI Assistant Enclosure & Boundary Protection', () => {
    test('AI boundary port returns only summarized band and attaches non-diagnostic constraint directive', async () => {
      const start = await AssessmentSessionService.startSession({
        userId: TEST_USER_1,
        instrumentCode: 'GAD-7',
        hasConsent: true
      });
      const responses = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ question_code: `GAD7_Q${n}`, value: 1 }));
      await AssessmentSessionService.recordResponses({ sessionId: start.session.id, userId: TEST_USER_1, responses });
      await AssessmentSessionService.submitSession({ sessionId: start.session.id, userId: TEST_USER_1 });

      const aiContext = AssessmentAIBoundaryPort.getContextForAI(TEST_USER_1);
      assert.equal(aiContext.hasCompletedAssessments, true);
      assert.equal(aiContext.latestScreeningBand, 'MILD');
      assert.ok(aiContext.nonDiagnosticConstraint.includes('You must NEVER offer a clinical diagnosis'));
    });
  });

  describe('10. Legacy API Compatibility', () => {
    test('Existing AssessmentService methods (startSession, recordResponse, completeSession) operate seamlessly', async () => {
      const session = await AssessmentService.startSession(TEST_USER_2, 'PHQ-9');
      assert.ok(session.id);
      assert.equal(session.state, AssessmentSessionState.IN_PROGRESS);

      // Record responses using legacy signature
      await AssessmentService.recordResponse(session.id, 'q1', 1);
      await AssessmentService.recordResponse(session.id, 'q2', 1);
      await AssessmentService.recordResponse(session.id, 'q3', 1);
      await AssessmentService.recordResponse(session.id, 'q4', 1);
      await AssessmentService.recordResponse(session.id, 'q5', 1);
      await AssessmentService.recordResponse(session.id, 'q6', 1);
      await AssessmentService.recordResponse(session.id, 'q7', 1);
      await AssessmentService.recordResponse(session.id, 'q8', 1);
      await AssessmentService.recordResponse(session.id, 'q9', 0);

      const result = await AssessmentService.completeSession(session.id);
      assert.ok(result.id);
      assert.equal(result.raw_score, 8);
      assert.equal(result.result_band, 'MILD');

      const fetched = AssessmentService.getResult(session.id);
      assert.ok(fetched);
      assert.equal(fetched.raw_score, 8);
    });
  });
});
