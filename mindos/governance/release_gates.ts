/**
 * MindOS Release Gate Service
 * Authority: Master Architecture Index Section 7 & Volume V (ADR-010, ADR-014)
 * Sprint 9: CI/CD Deployment Verification, Cryptographic Gate Checking & Emergency Revocation
 */

import { GovernanceRepository } from './persistence.js';
import { GovernanceDecisionEngine } from './decision_engine.js';
import {
  ReleaseAuthorizationStatus,
  ReleaseGateEvaluationResult,
  GovernanceDomain
} from './types.js';
import { GovernanceDecision } from '../platform/shared/state_machines.js';
import { DataClassification } from '../platform/shared/data_classification.js';
import { AuditService } from '../platform/audit/index.js';
import { EventBus } from '../platform/events/index.js';
import { ValidationError, GovernanceBlockedError } from '../platform/errors/index.js';
import { FeatureFlagService } from '../platform/features/index.js';
import { logger } from '../platform/observability/logger.js';

export class ReleaseGateService {
  /**
   * Evaluates deployment readiness for CI/CD pipeline or runtime activation.
   * Enforces fail-closed governance invariant across staging and production.
   */
  public static async evaluateGate(params: {
    releaseId: string;
    environment: string;
    featureKey?: string;
  }): Promise<ReleaseGateEvaluationResult> {
    const auth = await GovernanceRepository.findReleaseAuthorization(params.releaseId);

    // If an authorization exists, inspect its current status
    if (auth) {
      if (auth.status === ReleaseAuthorizationStatus.REVOKED) {
        return {
          release_id: params.releaseId,
          environment: params.environment,
          verdict: 'DENIED',
          can_activate: false,
          blocking_reasons: [`Release "${params.releaseId}" was REVOKED: ${auth.revocation_reason || 'Unknown reason'}`],
          domain_evaluations: {} as any,
          separation_of_duties_valid: false,
          unresolved_incidents_count: 0,
          evaluated_at: new Date().toISOString()
        };
      }

      // Check if environment matches
      if (auth.environment !== params.environment && auth.environment !== 'all' && auth.environment !== 'production') {
        return {
          release_id: params.releaseId,
          environment: params.environment,
          verdict: 'DENIED',
          can_activate: false,
          blocking_reasons: [
            `Authorization is for environment "${auth.environment}", but evaluated for "${params.environment}".`
          ],
          domain_evaluations: {} as any,
          separation_of_duties_valid: true,
          unresolved_incidents_count: 0,
          evaluated_at: new Date().toISOString()
        };
      }
    }

    // Lookup case for this release if any
    let caseEntity = auth?.case_id ? await GovernanceRepository.findCase(auth.case_id) : undefined;
    if (!caseEntity && params.featureKey) {
      const resource = await GovernanceRepository.findResourceByKey(params.featureKey);
      if (resource) {
        caseEntity = await GovernanceRepository.findCaseByResource(resource.id);
      }
    }

    if (!caseEntity) {
      // If there is an authorization and it was APPROVED, return ALLOWED
      if (auth && auth.state === GovernanceDecision.APPROVED) {
        return {
          release_id: params.releaseId,
          environment: params.environment,
          verdict: 'ALLOWED',
          can_activate: true,
          blocking_reasons: [],
          domain_evaluations: {} as any,
          separation_of_duties_valid: auth.approvers.length >= (params.environment === 'production' ? 2 : 1),
          unresolved_incidents_count: 0,
          evaluated_at: new Date().toISOString()
        };
      }

      return {
        release_id: params.releaseId,
        environment: params.environment,
        verdict: 'DENIED',
        can_activate: false,
        blocking_reasons: [`No governance case or valid release authorization exists for release "${params.releaseId}".`],
        domain_evaluations: {} as any,
        separation_of_duties_valid: false,
        unresolved_incidents_count: 0,
        evaluated_at: new Date().toISOString()
      };
    }

    const reviews = await GovernanceRepository.findReviewsByCase(caseEntity.id);

    const result = GovernanceDecisionEngine.evaluateReleaseGate({
      initiatorId: caseEntity.initiator_id,
      releaseId: params.releaseId,
      environment: params.environment,
      caseEntity,
      reviews
    });

    AuditService.record({
      actor_type: 'SERVICE',
      actor_id: 'ci_cd_release_gate',
      action: 'GOVERNANCE.GATE_EVALUATED',
      resource_type: 'release_gate',
      resource_id: params.releaseId,
      purpose: 'Deployment Readiness Verification',
      authorization_basis: { environment: params.environment, verdict: result.verdict },
      result: result.can_activate ? 'ALLOWED' : 'DENIED',
      metadata: { blocking_reasons: result.blocking_reasons }
    });

    return result;
  }

  /**
   * Revokes a previously authorized release.
   * Immediately blocks deployment and emits domain event.
   */
  public static async revokeRelease(params: {
    releaseId: string;
    revokedBy: string;
    reason: string;
  }): Promise<void> {
    const auth = await GovernanceRepository.findReleaseAuthorization(params.releaseId);
    if (!auth) {
      throw new ValidationError(`Release authorization for "${params.releaseId}" not found.`);
    }

    auth.status = ReleaseAuthorizationStatus.REVOKED;
    auth.revoked_at = new Date().toISOString();
    auth.revoked_by = params.revokedBy;
    auth.revocation_reason = params.reason;

    await GovernanceRepository.saveReleaseAuthorization(auth);

    // Publish canonical domain event
    EventBus.enqueue(
      'governance.release_revoked',
      'governance',
      auth.id,
      DataClassification.INTERNAL,
      {
        release_id: params.releaseId,
        revoked_by: params.revokedBy,
        reason: params.reason,
        revoked_at: auth.revoked_at
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.revokedBy,
      action: 'GOVERNANCE.RELEASE_REVOKED',
      resource_type: 'release_authorization',
      resource_id: params.releaseId,
      purpose: 'Safety/Compliance Remediation',
      authorization_basis: { reason: params.reason },
      result: 'ALLOWED',
      metadata: { release_id: params.releaseId, reason: params.reason }
    });

    logger.warn(`RELEASE AUTHORIZATION REVOKED: "${params.releaseId}" revoked by ${params.revokedBy}. Reason: ${params.reason}`);
  }
}
