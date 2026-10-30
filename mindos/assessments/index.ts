/**
 * MindOS Canonical Assessments & Screening Bounded Context
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
 * 
 * Owns:
 * - Assessment Definitions & Immutable Governed Versions
 * - Branching Logic (DSL & Cycle Detection)
 * - Session Execution & Progressive Autosave
 * - Non-repudiable Deterministic Scoring & Hash Verification
 * - Governed Non-diagnostic Result Interpretation
 * - Immediate Acute Safety Signal Dispatches via Safety Kernel
 * - Population Eligibility & Retake Policy Cooldowns
 * - Anti-leakage Audit Trails & Canonical Outbox Events
 */

import {
  AssessmentDefinition,
  AssessmentVersion,
  AssessmentSection,
  AssessmentQuestion,
  AssessmentOption,
  AssessmentSession,
  AssessmentResponse,
  AssessmentScore,
  AssessmentResult,
  AssessmentType,
  QuestionType,
  ScoringType,
  AssessmentSessionState,
  AssessmentResultState,
  AssessmentVersionState,
  EligibilityStatus,
  InvalidationReason
} from './domain/types.js';

import { AssessmentPersistenceStore } from './infrastructure/persistence.js';
import { AssessmentRegistry } from './registry/assessment_registry.js';
import { AssessmentEligibilityService } from './eligibility/service.js';
import { AssessmentRetakeService } from './retake/service.js';
import { AssessmentSessionService, StartSessionResult, RecordResponsesResult } from './sessions/session_service.js';
import { AssessmentScoringEngine } from './scoring/engine.js';
import { AssessmentInterpretationService } from './interpretation/service.js';
import { AssessmentSafetyKernelAdapter } from './safety/kernel_adapter.js';
import { ScoreHashCalculator } from './scoring/hash.js';
import { BranchingEvaluator } from './branching/dsl.js';
import { BranchingValidator } from './branching/validator.js';
import { AssessmentResultSharingPort } from './adapters/sharing_port.js';
import { AssessmentAIBoundaryPort } from './adapters/ai_boundary_port.js';
import { ValidationError, ConflictError } from '../platform/errors/index.js';

// Re-export all domain modules
export * from './domain/types.js';
export * from './infrastructure/persistence.js';
export * from './branching/dsl.js';
export * from './branching/validator.js';
export * from './scoring/hash.js';
export * from './scoring/engine.js';
export * from './interpretation/service.js';
export * from './safety/kernel_adapter.js';
export * from './eligibility/service.js';
export * from './retake/service.js';
export * from './responses/validator.js';
export * from './registry/assessment_registry.js';
export * from './registry/seed_instruments.js';
export * from './sessions/session_service.js';
export * from './adapters/sharing_port.js';
export * from './adapters/ai_boundary_port.js';

// Legacy compatibility interfaces
export interface AssessmentDefinitionEntity {
  id: string;
  code: string;
  name: string;
  assessment_kind: 'SELF_REFLECTION' | 'SCREENING';
  active_version_id?: string;
  created_at: string;
}

export interface AssessmentVersionEntity {
  id: string;
  assessment_id: string;
  version: number;
  question_schema: Array<{
    item_key: string;
    text: string;
    options: Array<{ label: string; score: number }>;
  }>;
  scoring_schema: {
    min_score: number;
    max_score: number;
    bands: Array<{ min: number; max: number; band_label: string; safe_guidance: string }>;
  };
  limitations: string;
  published_at: string;
}

export interface AssessmentSessionEntity {
  id: string;
  user_id: string;
  assessment_version_id: string;
  state: AssessmentSessionState;
  started_at: string;
  completed_at?: string;
  safety_event_id?: string;
  version: number;
}

export interface AssessmentResultEntity {
  id: string;
  session_id: string;
  raw_score: number;
  result_band: string;
  interpretation_version: string;
  computed_at: string;
}

/**
 * Unified Canonical Assessment Application Service
 */
export class AssessmentService {
  static {
    AssessmentRegistry.initialize();
  }

  public static seedCanonicalAssessments(): void {
    AssessmentRegistry.initialize();
  }

  /**
   * Starts an assessment session.
   * Supports both object-based Sprint 15 signature and legacy (userId, versionId) arguments.
   */
  public static async startSession(
    params: {
      userId: string;
      instrumentCode: string;
      userAge?: number;
      jurisdiction?: string;
      hasConsent?: boolean;
      allowEarlyRetake?: boolean;
      retakeReason?: string;
    }
  ): Promise<StartSessionResult>;
  public static async startSession(
    userId: string,
    versionOrCode?: string
  ): Promise<AssessmentSessionEntity>;
  public static async startSession(
    firstArg: string | {
      userId: string;
      instrumentCode: string;
      userAge?: number;
      jurisdiction?: string;
      hasConsent?: boolean;
      allowEarlyRetake?: boolean;
      retakeReason?: string;
    },
    secondArg?: string
  ): Promise<AssessmentSessionEntity | StartSessionResult> {
    AssessmentRegistry.initialize();

    if (typeof firstArg === 'object') {
      return AssessmentSessionService.startSession(firstArg);
    }

    const userId = firstArg;
    const versionOrCode = secondArg || 'PHQ-9';

    // Resolve code or version
    let instrumentCode = 'PHQ-9';
    const existingVersion = AssessmentPersistenceStore.getVersion(versionOrCode);
    if (existingVersion) {
      const def = AssessmentPersistenceStore.getDefinition(existingVersion.assessment_definition_id);
      if (def) instrumentCode = def.code;
    } else {
      const def = AssessmentPersistenceStore.getDefinition(versionOrCode);
      if (def) instrumentCode = def.code;
    }

    const sessionResult = await AssessmentSessionService.startSession({
      userId,
      instrumentCode,
      hasConsent: true
    });

    const s = sessionResult.session;
    return {
      id: s.id,
      user_id: s.subject_user_id,
      assessment_version_id: s.assessment_version_id,
      state: s.status,
      started_at: s.started_at,
      completed_at: s.completed_at,
      version: s.session_version
    };
  }

  /**
   * Records a response.
   * Supports legacy signature (sessionId, itemKey, score) and dispatches safety immediately.
   */
  public static async recordResponse(
    sessionId: string,
    itemKey: string,
    score: number
  ): Promise<void> {
    const session = AssessmentPersistenceStore.getSession(sessionId);
    if (!session) {
      throw new ValidationError('Assessment session not found');
    }

    // Map itemKey (e.g. 'q1' or 'q9') to canonical question_code if needed
    let questionCode = itemKey;
    if (itemKey === 'q1') questionCode = 'PHQ9_Q1';
    else if (itemKey === 'q2') questionCode = 'PHQ9_Q2';
    else if (itemKey === 'q3') questionCode = 'PHQ9_Q3';
    else if (itemKey === 'q4') questionCode = 'PHQ9_Q4';
    else if (itemKey === 'q5') questionCode = 'PHQ9_Q5';
    else if (itemKey === 'q6') questionCode = 'PHQ9_Q6';
    else if (itemKey === 'q7') questionCode = 'PHQ9_Q7';
    else if (itemKey === 'q8') questionCode = 'PHQ9_Q8';
    else if (itemKey === 'q9') questionCode = 'PHQ9_Q9';

    await AssessmentSessionService.recordResponses({
      sessionId,
      userId: session.subject_user_id,
      responses: [{ question_code: questionCode, value: score }]
    });
  }

  /**
   * Completes an assessment session and calculates result.
   */
  public static async completeSession(sessionId: string): Promise<AssessmentResultEntity> {
    const session = AssessmentPersistenceStore.getSession(sessionId);
    if (!session) {
      throw new ValidationError('Session not found');
    }

    const result = await AssessmentSessionService.submitSession({
      sessionId,
      userId: session.subject_user_id
    });

    return {
      id: result.id,
      session_id: result.session_id,
      raw_score: result.raw_score,
      result_band: result.result_band,
      interpretation_version: result.interpretation_model_version,
      computed_at: result.generated_at
    };
  }

  /**
   * Retrieves result by session ID.
   */
  public static getResult(sessionId: string): AssessmentResultEntity | undefined {
    const res = AssessmentPersistenceStore.getResultForSession(sessionId);
    if (!res) return undefined;
    return {
      id: res.id,
      session_id: res.session_id,
      raw_score: res.raw_score,
      result_band: res.result_band,
      interpretation_version: res.interpretation_model_version,
      computed_at: res.generated_at
    };
  }

  /**
   * Resets all storage for testing.
   */
  public static resetForTesting(): void {
    AssessmentPersistenceStore.clearAll();
    AssessmentRegistry.initialize();
  }
}
