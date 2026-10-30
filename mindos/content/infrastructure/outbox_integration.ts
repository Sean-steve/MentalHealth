/**
 * MindOS Content Canonical Event Dispatcher & Outbox Integration
 * Authority: Master Architecture Index Section 12, Appendix E
 * 
 * Canonical Events:
 * - content.published
 * - content.suspended
 * - content.retired
 * - content.version_superseded
 * - content.completed
 * - content.issue_reported
 */

import { EventBus } from '../../platform/events/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { EventPriority } from '../../platform/events/types.js';
import { logger } from '../../platform/observability/logger.js';

export class ContentOutboxDispatcher {
  public static async emitContentPublished(params: {
    contentDefinitionId: string;
    contentVersionId: string;
    versionNumber: number;
    code: string;
    clinicalArtifactId?: string;
  }): Promise<void> {
    try {
      EventBus.enqueue(
        'content.published',
        'content.publishing_service',
        params.contentVersionId,
        DataClassification.PUBLIC,
        {
          content_definition_id: params.contentDefinitionId,
          content_version_id: params.contentVersionId,
          version: params.versionNumber,
          code: params.code,
          clinical_artifact_id: params.clinicalArtifactId,
          published_at: new Date().toISOString()
        },
        { priority: EventPriority.HIGH }
      );
    } catch (err) {
      logger.error('[ContentOutbox] Error enqueuing content.published event', { error: err });
    }
  }

  public static async emitContentSuspended(params: {
    contentDefinitionId: string;
    contentVersionId: string;
    reason: string;
  }): Promise<void> {
    try {
      EventBus.enqueue(
        'content.suspended',
        'content.publishing_service',
        params.contentVersionId,
        DataClassification.INTERNAL,
        {
          content_definition_id: params.contentDefinitionId,
          content_version_id: params.contentVersionId,
          reason: params.reason,
          suspended_at: new Date().toISOString()
        },
        { priority: EventPriority.CRITICAL }
      );
    } catch (err) {
      logger.error('[ContentOutbox] Error enqueuing content.suspended event', { error: err });
    }
  }

  public static async emitContentRetired(params: {
    contentDefinitionId: string;
    contentVersionId?: string;
    reason?: string;
  }): Promise<void> {
    try {
      EventBus.enqueue(
        'content.retired',
        'content.publishing_service',
        params.contentVersionId || params.contentDefinitionId,
        DataClassification.INTERNAL,
        {
          content_definition_id: params.contentDefinitionId,
          content_version_id: params.contentVersionId,
          reason: params.reason,
          retired_at: new Date().toISOString()
        },
        { priority: EventPriority.HIGH }
      );
    } catch (err) {
      logger.error('[ContentOutbox] Error enqueuing content.retired event', { error: err });
    }
  }

  public static async emitContentVersionSuperseded(params: {
    oldVersionId: string;
    newVersionId: string;
    contentDefinitionId: string;
  }): Promise<void> {
    try {
      EventBus.enqueue(
        'content.version_superseded',
        'content.publishing_service',
        params.oldVersionId,
        DataClassification.INTERNAL,
        {
          content_definition_id: params.contentDefinitionId,
          old_version_id: params.oldVersionId,
          new_version_id: params.newVersionId,
          superseded_at: new Date().toISOString()
        },
        { priority: EventPriority.NORMAL }
      );
    } catch (err) {
      logger.error('[ContentOutbox] Error enqueuing content.version_superseded event', { error: err });
    }
  }

  public static async emitContentCompleted(params: {
    userId: string;
    contentDefinitionId: string;
    contentVersionId: string;
    exerciseSessionId?: string;
  }): Promise<void> {
    try {
      EventBus.enqueue(
        'content.completed',
        'content.delivery_service',
        params.contentVersionId,
        DataClassification.HEALTH_SENSITIVE,
        {
          subject_user_id: params.userId,
          content_definition_id: params.contentDefinitionId,
          content_version_id: params.contentVersionId,
          exercise_session_id: params.exerciseSessionId,
          completed_at: new Date().toISOString()
        },
        { priority: EventPriority.NORMAL }
      );
    } catch (err) {
      logger.error('[ContentOutbox] Error enqueuing content.completed event', { error: err });
    }
  }

  public static async emitContentIssueReported(params: {
    issueId: string;
    contentVersionId: string;
    issueType: string;
    severity: string;
  }): Promise<void> {
    try {
      EventBus.enqueue(
        'content.issue_reported',
        'content.feedback_service',
        params.issueId,
        DataClassification.INTERNAL,
        {
          issue_id: params.issueId,
          content_version_id: params.contentVersionId,
          issue_type: params.issueType,
          severity: params.severity,
          reported_at: new Date().toISOString()
        },
        { priority: EventPriority.HIGH }
      );
    } catch (err) {
      logger.error('[ContentOutbox] Error enqueuing content.issue_reported event', { error: err });
    }
  }
}
