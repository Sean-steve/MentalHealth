/**
 * MindOS Guided Exercise Execution Engine
 * Authority: Master Architecture Index Section 8, Volumes III, XV, XVI
 * Clinical Safety Policy Catalogue: R-SAFE-001, R-SAFE-002, POL-SAFE-001
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import {
  GuidedExercise,
  ExerciseSession,
  ExerciseResponse,
  ExerciseSessionState,
  ContentProgressState,
  ContentProgress
} from '../domain/types.js';
import { ContentPersistenceStore } from '../infrastructure/persistence.ts';
import { ContentInvariants } from '../domain/invariants.ts';
import { ContentSafetyAdapter, SafetySignalResult } from '../infrastructure/safety_integration.ts';
import { ContentAuditLogger } from '../infrastructure/audit_integration.ts';
import { ContentOutboxDispatcher } from '../infrastructure/outbox_integration.ts';
import {
  ContentNotFoundError,
  ContentExerciseInvalidStateError,
  ContentIdorViolationError,
  DomainInvariantError
} from '../../platform/errors/index.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';
import { CrisisResourceEntity } from '../../safety/index.js';

export interface StartExerciseSessionInput {
  userId: string;
  exerciseId: string;
  userAge?: number;
  userJurisdiction?: string;
  contextReference?: Record<string, unknown>;
}

export interface SubmitStepResponseInput {
  sessionId: string;
  userId: string;
  stepPosition: number;
  inputValue?: string;
  durationSpentSeconds?: number;
}

export interface StepSubmissionResult {
  session: ExerciseSession;
  nextStepIndex?: number;
  isComplete: boolean;
  safetyAlertTriggered?: boolean;
  safetyOverride?: {
    requiresOverride: boolean;
    urgentResources: CrisisResourceEntity[];
  };
}

export class GuidedExerciseEngine {
  /**
   * Starts a new guided exercise session.
   */
  public static async startSession(input: StartExerciseSessionInput): Promise<ExerciseSession> {
    const exercise = ContentPersistenceStore.getExercise(input.exerciseId);
    if (!exercise) {
      throw new ContentNotFoundError(`Guided exercise '${input.exerciseId}' not found`);
    }

    // Evaluate active safety state
    const activeRiskState = ContentSafetyAdapter.getUserRiskState(input.userId);

    // Invariant: Population eligibility gating
    ContentInvariants.validateExerciseEligibility({
      exercise,
      userAge: input.userAge,
      userJurisdiction: input.userJurisdiction,
      currentRiskState: activeRiskState
    });

    const sessionId = generateUUIDv7();
    const now = new Date().toISOString();

    const session: ExerciseSession = {
      id: sessionId,
      subject_user_id: input.userId,
      exercise_id: exercise.id,
      content_version_id: exercise.content_version_id,
      status: ExerciseSessionState.IN_PROGRESS,
      current_step: 0,
      progress_percentage: 0.0,
      responses: [],
      started_at: now,
      last_activity_at: now,
      context_reference: input.contextReference || {},
      created_at: now,
      updated_at: now
    };

    ContentPersistenceStore.saveSession(session);

    // Update user content progress
    const progress: ContentProgress = {
      id: generateUUIDv7(),
      subject_user_id: input.userId,
      content_definition_id: exercise.content_definition_id,
      content_version_id: exercise.content_version_id,
      status: ContentProgressState.IN_PROGRESS,
      progress_percentage: 0.0,
      last_position: 0,
      started_at: now,
      last_viewed_at: now,
      created_at: now,
      updated_at: now
    };
    ContentPersistenceStore.saveProgress(progress);

    await ContentAuditLogger.logExerciseSessionStarted({
      userId: input.userId,
      sessionId,
      exerciseId: exercise.id
    });

    return session;
  }

  /**
   * Submits a step response and advances session progress.
   */
  public static async submitStep(input: SubmitStepResponseInput): Promise<StepSubmissionResult> {
    const session = ContentPersistenceStore.getSession(input.sessionId);
    if (!session) {
      throw new ContentNotFoundError(`Exercise session '${input.sessionId}' not found`);
    }

    // IDOR check: caller must match session subject
    if (session.subject_user_id !== input.userId) {
      throw new ContentIdorViolationError('Access to exercise session forbidden for this user');
    }

    if (session.status !== ExerciseSessionState.IN_PROGRESS) {
      throw new ContentExerciseInvalidStateError(
        `Cannot submit step for session in state '${session.status}'`
      );
    }

    const exercise = ContentPersistenceStore.getExercise(session.exercise_id);
    if (!exercise) {
      throw new ContentNotFoundError(`Guided exercise '${session.exercise_id}' not found`);
    }

    const currentStep = exercise.steps[input.stepPosition];
    if (!currentStep) {
      throw new ContentExerciseInvalidStateError(`Invalid step position '${input.stepPosition}'`);
    }

    let safetyAlert = false;
    let safetyResult: SafetySignalResult | undefined;

    // Safety Invariant: Scan user input for acute crisis / distress signals
    if (input.inputValue && ContentInvariants.scanForAcuteCrisisSignals(input.inputValue)) {
      safetyAlert = true;
      safetyResult = ContentSafetyAdapter.handleAcuteDistressSignal({
        userId: input.userId,
        sessionId: session.id,
        detectedKeyword: 'CRISIS_EXPRESSION',
        rawText: input.inputValue
      });
    }

    const now = new Date().toISOString();
    const responseRecord: ExerciseResponse = {
      step_id: currentStep.id,
      position: input.stepPosition,
      input_value: input.inputValue,
      duration_spent_seconds: input.durationSpentSeconds,
      timestamp: now,
      safety_signal_flag: safetyAlert
    };

    session.responses.push(responseRecord);
    session.last_activity_at = now;
    session.updated_at = now;

    const totalSteps = exercise.steps.length;
    const nextStepIndex = input.stepPosition + 1;
    const isComplete = nextStepIndex >= totalSteps;

    session.progress_percentage = Math.min(100.0, Math.round(((nextStepIndex) / totalSteps) * 100));

    if (isComplete) {
      validateStateTransition('ExerciseSessionState', session.status, ExerciseSessionState.COMPLETED, session.id, input.userId);
      session.status = ExerciseSessionState.COMPLETED;
      session.completed_at = now;
      session.current_step = totalSteps;

      // Update user content progress
      const progress = ContentPersistenceStore.getProgress(input.userId, exercise.content_definition_id) || {
        id: generateUUIDv7(),
        subject_user_id: input.userId,
        content_definition_id: exercise.content_definition_id,
        content_version_id: exercise.content_version_id,
        status: ContentProgressState.COMPLETED,
        progress_percentage: 100.0,
        last_position: totalSteps,
        started_at: session.started_at,
        last_viewed_at: now,
        completed_at: now,
        created_at: now,
        updated_at: now
      };

      progress.status = ContentProgressState.COMPLETED;
      progress.progress_percentage = 100.0;
      progress.last_position = totalSteps;
      progress.completed_at = now;
      progress.last_viewed_at = now;
      ContentPersistenceStore.saveProgress(progress);

      await ContentAuditLogger.logExerciseSessionCompleted({
        userId: input.userId,
        sessionId: session.id,
        exerciseId: exercise.id,
        completionPercentage: 100.0
      });

      await ContentOutboxDispatcher.emitContentCompleted({
        userId: input.userId,
        contentDefinitionId: exercise.content_definition_id,
        contentVersionId: exercise.content_version_id,
        exerciseSessionId: session.id
      });
    } else {
      session.current_step = nextStepIndex;
    }

    ContentPersistenceStore.saveSession(session);

    return {
      session,
      nextStepIndex: isComplete ? undefined : nextStepIndex,
      isComplete,
      safetyAlertTriggered: safetyAlert,
      safetyOverride: safetyResult ? {
        requiresOverride: safetyResult.requiresSafetyOverride,
        urgentResources: safetyResult.urgentResources
      } : undefined
    };
  }

  /**
   * Abandons an active exercise session.
   */
  public static async abandonSession(sessionId: string, userId: string): Promise<ExerciseSession> {
    const session = ContentPersistenceStore.getSession(sessionId);
    if (!session) {
      throw new ContentNotFoundError(`Exercise session '${sessionId}' not found`);
    }

    if (session.subject_user_id !== userId) {
      throw new ContentIdorViolationError('Access to exercise session forbidden for this user');
    }

    validateStateTransition('ExerciseSessionState', session.status, ExerciseSessionState.ABANDONED, session.id, userId);
    session.status = ExerciseSessionState.ABANDONED;
    session.abandoned_at = new Date().toISOString();
    session.updated_at = new Date().toISOString();
    ContentPersistenceStore.saveSession(session);
    return session;
  }
}
