/**
 * MindOS Assessment Session Lifecycle & Execution Service
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV
 * 
 * Enforces:
 * 1. Version Pinning: In-progress sessions remain pinned to their initial assessment version.
 * 2. IDOR Prevention: Strict ownership validation on all session operations.
 * 3. Immediate Acute Safety Signals: Immediate evaluation & dispatch to Safety Kernel.
 * 4. Immutability: Once submitted, session & responses are strictly locked.
 */

import crypto from 'crypto';
import {
  AssessmentSession,
  AssessmentResponse,
  AssessmentResult,
  AssessmentSessionState,
  AssessmentResultState,
  InvalidationReason
} from '../domain/types.js';
import { AssessmentPersistenceStore } from '../infrastructure/persistence.js';
import { AssessmentRegistry } from '../registry/assessment_registry.js';
import { AssessmentEligibilityService } from '../eligibility/service.js';
import { AssessmentRetakeService } from '../retake/service.js';
import { BranchingEvaluator } from '../branching/dsl.js';
import { AssessmentResponseValidator } from '../responses/validator.js';
import { AssessmentSafetyKernelAdapter, AssessmentSafetyEvaluationResult } from '../safety/kernel_adapter.js';
import { AssessmentScoringEngine } from '../scoring/engine.js';
import { AssessmentInterpretationService } from '../interpretation/service.js';
import { AssessmentOutboxDispatcher } from '../infrastructure/outbox_integration.js';
import { AssessmentAuditLogger } from '../infrastructure/audit_integration.js';
import {
  AssessmentSessionNotFoundError,
  AssessmentAlreadyCompletedError,
  AssessmentSessionExpiredError,
  AssessmentIncompleteError,
  AssessmentIdorViolationError,
  AssessmentNotEligibleError,
  AssessmentConsentRequiredError,
  AssessmentRetakeNotAllowedError,
  AssessmentResultInvalidatedError
} from '../../platform/errors/index.js';
import { logger } from '../../platform/observability/logger.js';

export interface StartSessionResult {
  session: AssessmentSession;
  instrumentTitle: string;
  totalQuestions: number;
  initialQuestions: Array<{
    code: string;
    prompt: string;
    helpText?: string;
    type: string;
    required: boolean;
    options?: Array<{ code: string; label: string; position: number }>;
  }>;
}

export interface RecordResponsesResult {
  sessionId: string;
  progress: number;
  safetyAlert?: AssessmentSafetyEvaluationResult;
}

export class AssessmentSessionService {
  /**
   * Starts a new assessment session with eligibility, retake, and consent gating.
   */
  public static async startSession(params: {
    userId: string;
    instrumentCode: string;
    userAge?: number;
    jurisdiction?: string;
    hasConsent?: boolean;
    allowEarlyRetake?: boolean;
    retakeReason?: string;
  }): Promise<StartSessionResult> {
    const {
      userId,
      instrumentCode,
      userAge = 25,
      jurisdiction = 'KE',
      hasConsent = true,
      allowEarlyRetake = false,
      retakeReason
    } = params;

    const definition = AssessmentRegistry.getDefinition(instrumentCode);
    const version = AssessmentRegistry.getActiveVersion(definition.id);
    const eligibilityPolicy = AssessmentPersistenceStore.getEligibilityPolicy(definition.id);
    const retakePolicy = AssessmentPersistenceStore.getRetakePolicy(definition.id);

    // 1. Gating: Eligibility
    const eligibility = await AssessmentEligibilityService.evaluateEligibility({
      userId,
      userAge,
      userJurisdiction: jurisdiction,
      hasConsent,
      definition,
      version,
      policy: eligibilityPolicy
    });

    if (eligibility.reasons.includes('CONSENT_REQUIRED')) {
      throw new AssessmentConsentRequiredError(
        `Informed consent is required before starting assessment ${instrumentCode}.`
      );
    }

    if (!eligibility.eligible) {
      throw new AssessmentNotEligibleError(
        `Subject is not eligible for ${instrumentCode}: ${eligibility.reasons.join(', ')}`
      );
    }

    // 2. Gating: Retake cooldown
    const pastResults = AssessmentPersistenceStore.listResultsForUserAndDefinition(userId, definition.id);
    const lastResult = pastResults[0];
    const retakeEval = AssessmentRetakeService.evaluateRetake({
      policy: retakePolicy,
      lastResultTimestamp: lastResult?.generated_at,
      overrideRequested: allowEarlyRetake,
      overrideReason: retakeReason
    });

    if (!retakeEval.allowed) {
      throw new AssessmentRetakeNotAllowedError(
        `Retake not allowed. Please wait ${retakeEval.cooldownRemainingDays} more day(s) before retaking ${instrumentCode}. Next eligible date: ${retakeEval.nextEligibleDate}.`
      );
    }

    // 3. Resume existing unexpired active session if available
    const existingSession = AssessmentPersistenceStore.findActiveSessionForUser(userId, definition.id);
    if (existingSession) {
      logger.info(`[AssessmentSession] Resuming active session ${existingSession.id} for user ${userId}`);
      return this.formatSessionStart(existingSession, version.title);
    }

    // 4. Create new session (TTL: 24 hours)
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const session: AssessmentSession = {
      id: sessionId,
      assessment_definition_id: definition.id,
      assessment_version_id: version.id,
      subject_user_id: userId,
      status: AssessmentSessionState.IN_PROGRESS,
      started_at: now,
      last_activity_at: now,
      progress: 0.0,
      eligibility_snapshot: {
        userAge,
        jurisdiction,
        eligibilityStatus: eligibility.status,
        retakeCheckedAt: now
      },
      consent_snapshot_reference: hasConsent ? 'CONSENT_CLINICAL_SCREENING_ACTIVE' : undefined,
      session_version: 1,
      expires_at: expiresAt,
      created_at: now,
      updated_at: now
    };

    AssessmentPersistenceStore.saveSession(session);

    // Event & Audit
    await AssessmentOutboxDispatcher.emitAssessmentStarted({
      sessionId,
      userId,
      definitionId: definition.id,
      versionId: version.id,
      instrumentCode: definition.code
    });

    await AssessmentAuditLogger.logSessionStarted({
      userId,
      sessionId,
      instrumentCode: definition.code
    });

    return this.formatSessionStart(session, version.title);
  }

  /**
   * Records responses incrementally (autosave) with immediate acute safety evaluation.
   */
  public static async recordResponses(params: {
    sessionId: string;
    userId: string;
    responses: Array<{ question_code: string; value: unknown }>;
    jurisdiction?: string;
  }): Promise<RecordResponsesResult> {
    const { sessionId, userId, responses, jurisdiction = 'KE' } = params;

    const session = AssessmentPersistenceStore.getSession(sessionId);
    if (!session) {
      throw new AssessmentSessionNotFoundError(`Assessment session ${sessionId} not found.`);
    }

    // IDOR Check
    if (session.subject_user_id !== userId) {
      throw new AssessmentIdorViolationError(`Unauthorized access to assessment session ${sessionId}.`);
    }

    // Lifecycle Checks
    if (session.status === AssessmentSessionState.COMPLETED || session.status === AssessmentSessionState.SUBMITTED) {
      throw new AssessmentAlreadyCompletedError(`Cannot modify completed assessment session ${sessionId}.`);
    }
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      session.status = AssessmentSessionState.EXPIRED;
      AssessmentPersistenceStore.saveSession(session);
      throw new AssessmentSessionExpiredError(`Assessment session ${sessionId} has expired.`);
    }

    const { version, questions, safetyRules } = AssessmentRegistry.getInstrumentForExecution(session.assessment_version_id);
    const definition = AssessmentPersistenceStore.getDefinition(session.assessment_definition_id);
    const instrumentCode = definition?.code || 'ASSESSMENT';

    // Existing responses map
    const currentResponses = AssessmentPersistenceStore.getResponses(sessionId);
    const responsesByCode: Record<string, unknown> = {};
    for (const r of currentResponses) {
      if (r.question_code) responsesByCode[r.question_code] = r.response_value;
    }

    let acuteSafetyAlert: AssessmentSafetyEvaluationResult | undefined;

    // Process submitted response updates
    for (const item of responses) {
      const q = questions.find((ques) => ques.question_code === item.question_code);
      if (!q) continue;

      // Check branch visibility
      const isVisible = BranchingEvaluator.isVisible(q.visibility_rule, responsesByCode);

      // Validate response value
      AssessmentResponseValidator.validateResponse({
        question: q,
        value: item.value,
        isVisible
      });

      // Update response in memory store
      const responseRecord: AssessmentResponse = {
        id: crypto.randomUUID(),
        session_id: sessionId,
        question_id: q.id,
        question_code: q.question_code,
        response_value: item.value,
        answered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source: 'USER_DIRECT',
        validation_status: 'VALID'
      };

      AssessmentPersistenceStore.saveResponse(responseRecord);
      responsesByCode[q.question_code] = item.value;

      // IMMEDIATE SAFETY SIGNAL CHECK (R-SAFE-001)
      const safetyResult = await AssessmentSafetyKernelAdapter.evaluateAndDispatch({
        userId,
        sessionId,
        instrumentCode,
        question: q,
        response: responseRecord,
        safetyRules,
        jurisdiction
      });

      if (safetyResult.triggered) {
        acuteSafetyAlert = safetyResult;
      }
    }

    // Calculate progress: answered visible questions / total visible questions
    let totalVisible = 0;
    let answeredVisible = 0;
    for (const q of questions) {
      const isVis = BranchingEvaluator.isVisible(q.visibility_rule, responsesByCode);
      if (isVis) {
        totalVisible++;
        if (responsesByCode[q.question_code] !== undefined && responsesByCode[q.question_code] !== null && responsesByCode[q.question_code] !== '') {
          answeredVisible++;
        }
      }
    }

    const progress = totalVisible > 0 ? Math.round((answeredVisible / totalVisible) * 1000) / 10 : 0;

    session.progress = progress;
    session.last_activity_at = new Date().toISOString();
    session.session_version += 1;
    AssessmentPersistenceStore.saveSession(session);

    return {
      sessionId,
      progress,
      safetyAlert: acuteSafetyAlert
    };
  }

  /**
   * Submits session for deterministic scoring and immutable result creation.
   */
  public static async submitSession(params: {
    sessionId: string;
    userId: string;
  }): Promise<AssessmentResult> {
    const { sessionId, userId } = params;

    const session = AssessmentPersistenceStore.getSession(sessionId);
    if (!session) {
      throw new AssessmentSessionNotFoundError(`Assessment session ${sessionId} not found.`);
    }

    // IDOR Check
    if (session.subject_user_id !== userId) {
      throw new AssessmentIdorViolationError(`Unauthorized submission of assessment session ${sessionId}.`);
    }

    if (session.status === AssessmentSessionState.COMPLETED) {
      const existing = AssessmentPersistenceStore.getResultForSession(sessionId);
      if (existing) return existing;
      throw new AssessmentAlreadyCompletedError(`Assessment session ${sessionId} has already been completed.`);
    }

    const { version, questions, scoringModel, interpretationModel, scoreBands } =
      AssessmentRegistry.getInstrumentForExecution(session.assessment_version_id);
    const definition = AssessmentPersistenceStore.getDefinition(session.assessment_definition_id);
    const instrumentCode = definition?.code || 'ASSESSMENT';

    // Verify all required visible questions are answered
    const responses = AssessmentPersistenceStore.getResponses(sessionId);
    const respMap: Record<string, unknown> = {};
    for (const r of responses) {
      if (r.question_code) respMap[r.question_code] = r.response_value;
    }

    const missingRequired: string[] = [];
    for (const q of questions) {
      const isVis = BranchingEvaluator.isVisible(q.visibility_rule, respMap);
      if (isVis && q.required) {
        const val = respMap[q.question_code];
        if (val === undefined || val === null || val === '') {
          missingRequired.push(q.question_code);
        }
      }
    }

    if (missingRequired.length > 0) {
      throw new AssessmentIncompleteError(
        `Cannot submit assessment. Unanswered required questions: ${missingRequired.join(', ')}`
      );
    }

    // Lock session state: IN_PROGRESS -> SUBMITTED -> SCORING -> COMPLETED
    session.status = AssessmentSessionState.SUBMITTED;
    session.submitted_at = new Date().toISOString();
    session.progress = 100.0;
    AssessmentPersistenceStore.saveSession(session);

    // Scoring Engine
    session.status = AssessmentSessionState.SCORING;
    const computedScore = AssessmentScoringEngine.scoreSession({
      sessionId,
      questions,
      responses,
      scoringModel
    });
    AssessmentPersistenceStore.saveScore(computedScore);

    // Interpretation Engine
    const interpretation = AssessmentInterpretationService.interpret({
      score: computedScore,
      bands: scoreBands,
      model: interpretationModel,
      instrumentCode
    });

    // Create Result
    const now = new Date().toISOString();
    const validUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days validity

    const result: AssessmentResult = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      assessment_definition_id: session.assessment_definition_id,
      assessment_version_id: session.assessment_version_id,
      score_id: computedScore.id,
      interpretation_model_version: interpretationModel.version,
      result_code: interpretation.resultCode,
      result_band: interpretation.resultBand,
      summary_text: interpretation.summaryText,
      limitations: interpretation.limitations,
      clinical_artifact_reference: version.clinical_artifact_version ? `art-${instrumentCode.toLowerCase()}-v${version.clinical_artifact_version}` : undefined,
      raw_score: computedScore.raw_score,
      normalized_score: computedScore.normalized_score,
      subscores: computedScore.subscores,
      valid_from: now,
      valid_until: validUntil,
      status: AssessmentResultState.VALID,
      generated_at: now
    };

    AssessmentPersistenceStore.saveResult(result);

    // Finalize session
    session.status = AssessmentSessionState.COMPLETED;
    session.completed_at = now;
    session.updated_at = now;
    session.session_version += 1;
    AssessmentPersistenceStore.saveSession(session);

    // Outbox & Audit
    await AssessmentOutboxDispatcher.emitAssessmentCompleted({
      sessionId,
      resultId: result.id,
      userId,
      definitionId: session.assessment_definition_id,
      versionId: session.assessment_version_id,
      score: computedScore.raw_score,
      bandCode: result.result_band
    });

    await AssessmentAuditLogger.logSessionSubmitted({
      userId,
      sessionId,
      resultId: result.id
    });

    return result;
  }

  /**
   * Retrieves single assessment result with IDOR ownership validation.
   */
  public static async getResult(params: {
    resultId: string;
    userId: string;
    isClinician?: boolean;
  }): Promise<AssessmentResult> {
    const { resultId, userId, isClinician = false } = params;

    const result = AssessmentPersistenceStore.getResult(resultId);
    if (!result) {
      throw new AssessmentSessionNotFoundError(`Assessment result ${resultId} not found.`);
    }

    const session = AssessmentPersistenceStore.getSession(result.session_id);
    if (!session) {
      throw new AssessmentSessionNotFoundError(`Session for result ${resultId} not found.`);
    }

    // Ownership check
    if (!isClinician && session.subject_user_id !== userId) {
      throw new AssessmentIdorViolationError(`Access denied for assessment result ${resultId}.`);
    }

    return result;
  }

  /**
   * Invalidates a completed assessment result (Clinical Governance Action).
   */
  public static async invalidateResult(params: {
    resultId: string;
    actorId: string;
    reason: InvalidationReason;
    notes?: string;
  }): Promise<AssessmentResult> {
    const { resultId, actorId, reason } = params;

    const result = AssessmentPersistenceStore.getResult(resultId);
    if (!result) {
      throw new AssessmentSessionNotFoundError(`Assessment result ${resultId} not found.`);
    }

    if (result.status === AssessmentResultState.INVALIDATED) {
      return result;
    }

    result.status = AssessmentResultState.INVALIDATED;
    result.invalidation_reason = reason;
    result.invalidated_by = actorId;
    result.invalidated_at = new Date().toISOString();

    AssessmentPersistenceStore.saveResult(result);

    await AssessmentOutboxDispatcher.emitResultInvalidated({
      resultId,
      sessionId: result.session_id,
      reason,
      invalidatedBy: actorId
    });

    await AssessmentAuditLogger.logResultInvalidated({
      actorId,
      resultId,
      reason
    });

    return result;
  }

  private static formatSessionStart(session: AssessmentSession, title: string): StartSessionResult {
    const { questions } = AssessmentRegistry.getInstrumentForExecution(session.assessment_version_id);

    return {
      session,
      instrumentTitle: title,
      totalQuestions: questions.length,
      initialQuestions: questions.map((q) => ({
        code: q.question_code,
        prompt: q.prompt,
        helpText: q.help_text,
        type: q.question_type,
        required: q.required,
        options: q.options?.map((o) => ({
          code: o.option_code,
          label: o.label,
          position: o.position
        }))
      }))
    };
  }
}
