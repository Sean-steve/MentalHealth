/**
 * MindOS Safety Escalation Service
 * Authority: Volumes I, V & Clinical Safety Policy Catalogue Section 6
 * 
 * Rules:
 * - Creates authoritative SafetyEscalation records.
 * - Publishes safety.escalation_created event.
 * - Enforces reviewer acknowledgement before claiming active human review (R-SAFE-005).
 * - Monitors SLA breaches.
 */

import { ISafetyRepository } from '../repositories/safety_repository.js';
import {
  SafetyEscalationEntity,
  RiskStateEntity,
  SafetyEscalationType,
  SafetyActionPriority,
  EscalationState
} from '../domain/types.js';
import { EscalationRouter } from '../escalations/escalation_router.js';
import { EscalationQueue } from '../escalations/escalation_queue.js';
import { EvaluatedRiskPolicyResult } from '../policies/canonical_policies.js';
import { EventPublisher } from '../../platform/events/index.js';
import { CanonicalEventTypes, EventPriority } from '../../platform/events/registry/event_registry.js';
import { SafetyMetrics } from '../infrastructure/metrics.js';
import { AuditService } from '../../platform/audit/index.js';
import { SafetyReviewerAuth } from '../review/reviewer_auth.js';
import { ClinicalOperationsStaffingRegistry } from '../../clinical_ops/application/staffing_registry.js';

export class SafetyEscalationService {
  constructor(private repo: ISafetyRepository) {}

  /**
   * Evaluates if escalation is required and creates it if not already active.
   */
  public async handleEscalationIfNeeded(
    riskState: RiskStateEntity,
    policyResult: EvaluatedRiskPolicyResult
  ): Promise<SafetyEscalationEntity | null> {
    if (!policyResult.requiresHumanReview || !policyResult.escalationType) {
      return null;
    }

    if (ClinicalOperationsStaffingRegistry.isEnforcementEnabled()) {
      const queueKey = riskState.level === 'URGENT' ? 'URGENT_SAFETY' : 'CLINICAL_REVIEW';
      const jurisdiction = String((riskState.source_summary as any)?.jurisdiction || process.env.DEFAULT_COUNTRY_CODE || 'KE');
      const staffed = await ClinicalOperationsStaffingRegistry.isHumanReviewActuallyAvailable(jurisdiction, queueKey);
      if (!staffed) {
        // Sprint 24 R-OPS-001: Safety actions/resources continue, but no human-review object is created.
        return null;
      }
    }

    // Check if user already has an active escalation of this type
    const activeEscalations = await this.repo.getActiveEscalations();
    const existing = activeEscalations.find(
      e => e.subject_user_id === riskState.subject_user_id &&
           e.escalation_type === policyResult.escalationType
    );

    if (existing) {
      // Idempotent reuse of active escalation
      return existing;
    }

    // Map priority
    const priority = riskState.level === 'URGENT' ? SafetyActionPriority.CRITICAL : SafetyActionPriority.HIGH;

    // Create new escalation
    const escalation = EscalationRouter.createEscalation({
      userId: riskState.subject_user_id,
      riskStateId: riskState.id,
      escalationType: policyResult.escalationType,
      priority,
      reasonCodes: riskState.reason_codes,
      policyVersion: riskState.policy_version
    });

    await this.repo.saveEscalation(escalation);
    SafetyMetrics.recordEscalationCreated(escalation.escalation_type, escalation.priority);

    // Audit record
    AuditService.record({
      actor_type: 'SERVICE',
      action: 'SAFETY.ESCALATION_CREATED',
      resource_type: 'safety_escalations',
      resource_id: escalation.id,
      purpose: 'SAFETY_RESPONSE',
      authorization_basis: { policy_version: escalation.policy_version },
      result: 'ALLOWED',
      metadata: {
        subject_user_id: escalation.subject_user_id,
        escalation_type: escalation.escalation_type,
        priority: escalation.priority,
        sla_acknowledgement_due_at: escalation.sla_acknowledgement_due_at
      }
    });

    // Publish event
    try {
      await EventPublisher.publish({
        type: CanonicalEventTypes.SAFETY_ESCALATION_CREATED,
        subjectId: escalation.subject_user_id,
        payload: {
          escalationId: escalation.id,
          escalationType: escalation.escalation_type,
          priority: escalation.priority,
          assignedTeam: escalation.assigned_team,
          slaAcknowledgementDueAt: escalation.sla_acknowledgement_due_at
        },
        priority: escalation.priority === SafetyActionPriority.CRITICAL ? EventPriority.CRITICAL : EventPriority.HIGH
      });
    } catch (err) {
      // Non-blocking
    }

    return escalation;
  }

  /**
   * Reviewer acknowledges escalation case.
   */
  public async acknowledgeEscalation(
    escalationId: string,
    reviewer: { actor_id: string; role: string }
  ): Promise<SafetyEscalationEntity> {
    SafetyReviewerAuth.assertReviewerEligibility(reviewer);

    const escalation = await this.repo.getEscalationById(escalationId);
    if (!escalation) {
      throw new Error(`Escalation ${escalationId} not found.`);
    }

    EscalationQueue.acknowledge(escalation, reviewer.actor_id);
    await this.repo.saveEscalation(escalation);

    AuditService.record({
      actor_type: 'USER',
      actor_id: reviewer.actor_id,
      action: 'SAFETY.ESCALATION_ACKNOWLEDGED',
      resource_type: 'safety_escalations',
      resource_id: escalation.id,
      purpose: 'SAFETY_RESPONSE',
      authorization_basis: { role: reviewer.role },
      result: 'ALLOWED',
      metadata: {
        subject_user_id: escalation.subject_user_id,
        acknowledged_at: escalation.acknowledged_at
      }
    });

    return escalation;
  }

  /**
   * Resolves escalation with mandatory outcome summary.
   */
  public async resolveEscalation(
    escalationId: string,
    reviewer: { actor_id: string; role: string },
    outcome: string
  ): Promise<SafetyEscalationEntity> {
    SafetyReviewerAuth.assertReviewerEligibility(reviewer);

    const escalation = await this.repo.getEscalationById(escalationId);
    if (!escalation) {
      throw new Error(`Escalation ${escalationId} not found.`);
    }

    EscalationQueue.resolve(escalation, reviewer.actor_id, outcome);
    await this.repo.saveEscalation(escalation);

    AuditService.record({
      actor_type: 'USER',
      actor_id: reviewer.actor_id,
      action: 'SAFETY.ESCALATION_RESOLVED',
      resource_type: 'safety_escalations',
      resource_id: escalation.id,
      purpose: 'SAFETY_RESPONSE',
      authorization_basis: { role: reviewer.role },
      result: 'ALLOWED',
      metadata: {
        subject_user_id: escalation.subject_user_id,
        resolved_at: escalation.resolved_at,
        outcome
      }
    });

    return escalation;
  }

  /**
   * Scans active escalations for SLA breaches and alerts.
   */
  public async monitorSlas(): Promise<SafetyEscalationEntity[]> {
    const active = await this.repo.getActiveEscalations();
    return EscalationQueue.checkSlaBreaches(active);
  }
}
