/**
 * MindOS Assessment Audit Integration
 * Authority: Master Architecture Index Section 14, Volumes III, VIII
 * 
 * Invariant:
 * Raw health responses must NEVER be logged directly into unredacted audit trails.
 * Only structural events (session created, submitted, scored, invalidated) are logged.
 */

import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { logger } from '../../platform/observability/logger.js';

export class AssessmentAuditLogger {
  public static async logSessionStarted(params: {
    userId: string;
    sessionId: string;
    instrumentCode: string;
  }): Promise<void> {
    try {
      AuditService.record({
        actor_id: params.userId,
        actor_type: 'USER',
        action: 'ASSESSMENT.SESSION_START',
        resource_type: 'assessment_session',
        resource_id: params.sessionId,
        resource_classification: DataClassification.HEALTH_SENSITIVE,
        purpose: 'Clinical Screening',
        authorization_basis: { policy_reference: 'POL_ASSESSMENT_GOVERNANCE' },
        result: 'SUCCESS',
        metadata: {
          instrument_code: params.instrumentCode
        }
      });
    } catch (err) {
      logger.error('[AssessmentAudit] Failed to record session started audit', { error: err });
    }
  }

  public static async logSessionSubmitted(params: {
    userId: string;
    sessionId: string;
    resultId: string;
  }): Promise<void> {
    try {
      AuditService.record({
        actor_id: params.userId,
        actor_type: 'USER',
        action: 'ASSESSMENT.SESSION_SUBMIT',
        resource_type: 'assessment_session',
        resource_id: params.sessionId,
        resource_classification: DataClassification.HEALTH_SENSITIVE,
        purpose: 'Clinical Screening Evaluation',
        authorization_basis: { policy_reference: 'POL_ASSESSMENT_GOVERNANCE' },
        result: 'SUCCESS',
        metadata: {
          result_id: params.resultId
        }
      });
    } catch (err) {
      logger.error('[AssessmentAudit] Failed to record session submitted audit', { error: err });
    }
  }

  public static async logResultInvalidated(params: {
    actorId: string;
    resultId: string;
    reason: string;
  }): Promise<void> {
    try {
      AuditService.record({
        actor_id: params.actorId,
        actor_type: 'STAFF',
        action: 'ASSESSMENT.RESULT_INVALIDATED',
        resource_type: 'assessment_result',
        resource_id: params.resultId,
        resource_classification: DataClassification.CLINICAL_RECORD,
        purpose: 'Clinical Governance Defect Invalidation',
        authorization_basis: { policy_reference: 'POL_CLINICAL_GOVERNANCE_INVALIDATION' },
        result: 'SUCCESS',
        metadata: {
          invalidation_reason: params.reason
        }
      });
    } catch (err) {
      logger.error('[AssessmentAudit] Failed to record result invalidated audit', { error: err });
    }
  }
}
