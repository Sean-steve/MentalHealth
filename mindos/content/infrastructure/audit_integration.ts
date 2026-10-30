/**
 * MindOS Content Audit Integration
 * Authority: Master Architecture Index Section 14, Volumes III, VIII
 * 
 * Invariants:
 * 1. Raw user reflections or subjective comments must not leak into unredacted audit trails.
 * 2. All editorial and clinical state transitions must be immutably recorded in the tamper-evident audit ledger.
 */

import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { logger } from '../../platform/observability/logger.js';

export class ContentAuditLogger {
  public static async logPublication(params: {
    actorId: string;
    contentDefinitionId: string;
    contentVersionId: string;
    versionNumber: number;
    clinicalArtifactId?: string;
  }): Promise<void> {
    try {
      AuditService.record({
        actor_id: params.actorId,
        actor_type: 'STAFF',
        action: 'CONTENT.VERSION_PUBLISHED',
        resource_type: 'content_version',
        resource_id: params.contentVersionId,
        resource_classification: DataClassification.PUBLIC,
        purpose: 'Publish Psychoeducational Content',
        authorization_basis: { policy_reference: 'POL_CONTENT_EDITORIAL_GOVERNANCE' },
        result: 'SUCCESS',
        metadata: {
          content_definition_id: params.contentDefinitionId,
          version: params.versionNumber,
          clinical_artifact_id: params.clinicalArtifactId
        }
      });
    } catch (err) {
      logger.error('[ContentAudit] Failed to log publication', { error: err });
    }
  }

  public static async logSuspension(params: {
    actorId: string;
    contentVersionId: string;
    reason: string;
  }): Promise<void> {
    try {
      AuditService.record({
        actor_id: params.actorId,
        actor_type: 'STAFF',
        action: 'CONTENT.VERSION_SUSPENDED',
        resource_type: 'content_version',
        resource_id: params.contentVersionId,
        resource_classification: DataClassification.INTERNAL,
        purpose: 'Suspend Content for Clinical Safety or Policy Review',
        authorization_basis: { reason: params.reason },
        result: 'SUCCESS',
        metadata: { reason: params.reason }
      });
    } catch (err) {
      logger.error('[ContentAudit] Failed to log suspension', { error: err });
    }
  }

  public static async logExerciseSessionStarted(params: {
    userId: string;
    sessionId: string;
    exerciseId: string;
  }): Promise<void> {
    try {
      AuditService.record({
        actor_id: params.userId,
        actor_type: 'USER',
        action: 'CONTENT.EXERCISE_SESSION_START',
        resource_type: 'exercise_session',
        resource_id: params.sessionId,
        resource_classification: DataClassification.HEALTH_SENSITIVE,
        purpose: 'Guided Exercise Execution',
        authorization_basis: { policy_reference: 'POL_GUIDED_EXERCISE' },
        result: 'SUCCESS',
        metadata: { exercise_id: params.exerciseId }
      });
    } catch (err) {
      logger.error('[ContentAudit] Failed to log exercise session start', { error: err });
    }
  }

  public static async logExerciseSessionCompleted(params: {
    userId: string;
    sessionId: string;
    exerciseId: string;
    completionPercentage: number;
  }): Promise<void> {
    try {
      AuditService.record({
        actor_id: params.userId,
        actor_type: 'USER',
        action: 'CONTENT.EXERCISE_SESSION_COMPLETE',
        resource_type: 'exercise_session',
        resource_id: params.sessionId,
        resource_classification: DataClassification.HEALTH_SENSITIVE,
        purpose: 'Guided Exercise Execution',
        authorization_basis: { policy_reference: 'POL_GUIDED_EXERCISE' },
        result: 'SUCCESS',
        metadata: {
          exercise_id: params.exerciseId,
          completion_percentage: params.completionPercentage
        }
      });
    } catch (err) {
      logger.error('[ContentAudit] Failed to log exercise session completion', { error: err });
    }
  }

  public static async logIssueReported(params: {
    reporterId: string;
    issueId: string;
    contentVersionId: string;
    issueType: string;
    severity: string;
  }): Promise<void> {
    try {
      AuditService.record({
        actor_id: params.reporterId,
        actor_type: 'USER',
        action: 'CONTENT.ISSUE_REPORTED',
        resource_type: 'content_issue',
        resource_id: params.issueId,
        resource_classification: DataClassification.INTERNAL,
        purpose: 'Quality & Clinical Feedback Reporting',
        authorization_basis: { policy_reference: 'POL_CONTENT_QUALITY' },
        result: 'SUCCESS',
        metadata: {
          content_version_id: params.contentVersionId,
          issue_type: params.issueType,
          severity: params.severity
        }
      });
    } catch (err) {
      logger.error('[ContentAudit] Failed to log issue report', { error: err });
    }
  }
}
