import { DomainInvariantError, NotFoundError } from '../../platform/errors/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EscalationState, RiskState } from '../../platform/shared/state_machines.js';
import { ClinicalOperationsRepository } from '../repositories/index.js';
import {
  ClinicalOperationsEscalation,
  ClinicalOperationsEscalationLevel
} from '../domain/types.js';
import { ClinicalOperationsStaffingRegistry } from './staffing_registry.js';

const queueForLevel = (level: ClinicalOperationsEscalationLevel): string =>
  level === 'L3' ? 'URGENT_SAFETY' : 'CLINICAL_REVIEW';

const allowedTransitions: Record<EscalationState, EscalationState[]> = {
  [EscalationState.NEW]: [EscalationState.TRIAGED, EscalationState.CANCELLED],
  [EscalationState.PENDING_REVIEW]: [EscalationState.TRIAGED, EscalationState.CANCELLED],
  [EscalationState.TRIAGED]: [EscalationState.ASSIGNED, EscalationState.CANCELLED],
  [EscalationState.ASSIGNED]: [EscalationState.IN_REVIEW, EscalationState.CANCELLED],
  [EscalationState.IN_REVIEW]: [EscalationState.ACTION_REQUIRED, EscalationState.FOLLOW_UP, EscalationState.RESOLVED, EscalationState.CANCELLED],
  [EscalationState.ACTION_REQUIRED]: [EscalationState.FOLLOW_UP, EscalationState.RESOLVED, EscalationState.CANCELLED],
  [EscalationState.FOLLOW_UP]: [EscalationState.ACTION_REQUIRED, EscalationState.RESOLVED, EscalationState.CANCELLED],
  [EscalationState.RESOLVED]: [],
  [EscalationState.CANCELLED]: []
};

export class ClinicalOperationsEscalationService {
  static async createIfStaffed(input: {
    subject_user_id: string;
    risk_event_id: string;
    risk_state: RiskState;
    level: ClinicalOperationsEscalationLevel;
    jurisdiction: string;
    reason_codes: string[];
    policy_version: string;
    source_summary_reference?: string;
  }): Promise<ClinicalOperationsEscalation | null> {
    if (input.level === 'L0' || input.level === 'L1') return null;

    const queueKey = queueForLevel(input.level);
    const capability = await ClinicalOperationsStaffingRegistry.findActiveCapability(
      input.jurisdiction,
      queueKey
    );

    // R-OPS-001: no configured staffed capability means no human-review promise/case.
    if (!capability) return null;

    const existing=(await ClinicalOperationsRepository.listEscalations())
      .find(x=>x.risk_event_id===input.risk_event_id&&x.state!==EscalationState.CANCELLED);
    if(existing)return existing;

    const now = new Date().toISOString();
    const escalation: ClinicalOperationsEscalation = {
      id: generateUUIDv7(),
      subject_user_id: input.subject_user_id,
      risk_event_id: input.risk_event_id,
      risk_state: input.risk_state,
      level: input.level,
      jurisdiction: input.jurisdiction,
      queue_key: queueKey,
      state: EscalationState.NEW,
      reason_codes: [...input.reason_codes],
      source_summary_reference: input.source_summary_reference,
      created_at: now,
      updated_at: now,
      policy_version: input.policy_version
    };
    await ClinicalOperationsRepository.saveEscalation(escalation);
    this.audit('CLINICAL_OPS.ESCALATION_CREATED', escalation, 'SERVICE');
    return escalation;
  }

  static async transition(
    id: string,
    to: EscalationState,
    actor: { actor_id: string; actor_role: string },
    extras: {
      reviewer_id?: string;
      reviewer_role?: string;
      resolution_summary_reference?: string;
      cancellation_reason?: string;
    } = {}
  ): Promise<ClinicalOperationsEscalation> {
    const escalation = await ClinicalOperationsRepository.getEscalation(id);
    if (!escalation) throw new NotFoundError('Clinical operations escalation not found.');

    if (!allowedTransitions[escalation.state]?.includes(to)) {
      throw new DomainInvariantError(`Invalid EscalationState transition ${escalation.state} -> ${to}.`);
    }

    const now = new Date().toISOString();

    if (to === EscalationState.TRIAGED) escalation.triaged_at = now;

    if (to === EscalationState.ASSIGNED) {
      const capability = await ClinicalOperationsStaffingRegistry.findActiveCapability(
        escalation.jurisdiction,
        escalation.queue_key
      );
      if (!capability) {
        throw new DomainInvariantError('Cannot assign escalation when the configured human-review capability is not actively staffed.');
      }
      if (!extras.reviewer_id || !extras.reviewer_role) {
        throw new DomainInvariantError('reviewer_id and reviewer_role are required for assignment.');
      }
      if (!capability.qualified_role_codes.includes(extras.reviewer_role)) {
        throw new DomainInvariantError('Reviewer role is not qualified for this staffed clinical-operations capability.');
      }
      escalation.assigned_reviewer_id = extras.reviewer_id;
      escalation.assigned_reviewer_role = extras.reviewer_role;
      escalation.assigned_at = now;
    }

    if (to === EscalationState.IN_REVIEW) {
      if (!escalation.assigned_reviewer_id) {
        throw new DomainInvariantError('An escalation must be assigned to a real qualified reviewer before review can start.');
      }
      escalation.review_started_at = now;
    }

    if (to === EscalationState.ACTION_REQUIRED) escalation.action_required_at = now;
    if (to === EscalationState.FOLLOW_UP) escalation.follow_up_started_at = now;

    if (to === EscalationState.RESOLVED) {
      if (!extras.resolution_summary_reference) {
        throw new DomainInvariantError('resolution_summary_reference is required to resolve an escalation.');
      }
      escalation.resolution_summary_reference = extras.resolution_summary_reference;
      escalation.resolved_at = now;
    }

    if (to === EscalationState.CANCELLED) {
      if (!extras.cancellation_reason) {
        throw new DomainInvariantError('cancellation_reason is required; escalations must not be silently deleted.');
      }
      escalation.cancellation_reason = extras.cancellation_reason;
      escalation.cancelled_at = now;
    }

    escalation.state = to;
    escalation.updated_at = now;
    await ClinicalOperationsRepository.saveEscalation(escalation);
    this.audit('CLINICAL_OPS.ESCALATION_STATE_CHANGED', escalation, actor.actor_id, {
      actor_role: actor.actor_role,
      to_state: to
    });
    return escalation;
  }

  static async get(id: string): Promise<ClinicalOperationsEscalation> {
    const value = await ClinicalOperationsRepository.getEscalation(id);
    if (!value) throw new NotFoundError('Clinical operations escalation not found.');
    return value;
  }

  static async list(): Promise<ClinicalOperationsEscalation[]> {
    return ClinicalOperationsRepository.listEscalations();
  }

  private static audit(
    action: string,
    escalation: ClinicalOperationsEscalation,
    actorId: string,
    metadata: Record<string, unknown> = {}
  ): void {
    AuditService.record({
      actor_type: actorId === 'SERVICE' ? 'SERVICE' : 'USER',
      actor_id: actorId === 'SERVICE' ? undefined : actorId,
      action,
      resource_type: 'clinical_operations_escalations',
      resource_id: escalation.id,
      purpose: 'CLINICAL_OPERATIONS',
      authorization_basis: { policy_version: escalation.policy_version },
      result: 'ALLOWED',
      metadata: {
        escalation_state: escalation.state,
        level: escalation.level,
        jurisdiction: escalation.jurisdiction,
        queue_key: escalation.queue_key,
        ...metadata
      }
    });
  }
}
