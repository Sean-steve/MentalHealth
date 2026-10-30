/**
 * MindOS Assessment Canonical Event Dispatcher & Outbox Integration
 * Authority: Master Architecture Index Section 12, Appendix E
 * 
 * Events:
 * - assessment.started
 * - assessment.completed
 * - assessment.result_invalidated
 */

import { EventBus } from '../../platform/events/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { EventPriority } from '../../platform/events/types.js';
import { logger } from '../../platform/observability/logger.js';

export class AssessmentOutboxDispatcher {
  public static async emitAssessmentStarted(params: {
    sessionId: string;
    userId: string;
    definitionId: string;
    versionId: string;
    instrumentCode: string;
  }): Promise<void> {
    try {
      EventBus.enqueue(
        'assessment.started',
        'assessments.session_service',
        params.sessionId,
        DataClassification.HEALTH_SENSITIVE,
        {
          session_id: params.sessionId,
          subject_user_id: params.userId,
          assessment_definition_id: params.definitionId,
          assessment_version_id: params.versionId,
          instrument_code: params.instrumentCode,
          started_at: new Date().toISOString()
        },
        { priority: EventPriority.NORMAL }
      );
    } catch (err) {
      logger.error('[AssessmentOutbox] Error enqueuing assessment.started event', { error: err });
    }
  }

  public static async emitAssessmentCompleted(params: {
    sessionId: string;
    resultId: string;
    userId: string;
    definitionId: string;
    versionId: string;
    score: number;
    bandCode: string;
  }): Promise<void> {
    try {
      EventBus.enqueue(
        'assessment.completed',
        'assessments.session_service',
        params.sessionId,
        DataClassification.HEALTH_SENSITIVE,
        {
          session_id: params.sessionId,
          result_id: params.resultId,
          subject_user_id: params.userId,
          assessment_definition_id: params.definitionId,
          assessment_version_id: params.versionId,
          raw_score: params.score,
          result_band: params.bandCode,
          completed_at: new Date().toISOString()
        },
        { priority: EventPriority.HIGH }
      );
    } catch (err) {
      logger.error('[AssessmentOutbox] Error enqueuing assessment.completed event', { error: err });
    }
  }

  public static async emitResultInvalidated(params: {
    resultId: string;
    sessionId: string;
    reason: string;
    invalidatedBy: string;
  }): Promise<void> {
    try {
      EventBus.enqueue(
        'assessment.result_invalidated',
        'assessments.result_service',
        params.resultId,
        DataClassification.HEALTH_SENSITIVE,
        {
          result_id: params.resultId,
          session_id: params.sessionId,
          reason: params.reason,
          invalidated_by: params.invalidatedBy,
          invalidated_at: new Date().toISOString()
        },
        { priority: EventPriority.HIGH }
      );
    } catch (err) {
      logger.error('[AssessmentOutbox] Error enqueuing assessment.result_invalidated event', { error: err });
    }
  }
}
