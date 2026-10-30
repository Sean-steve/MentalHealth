/**
 * MindOS Safety Escalation Router & SLA Policy
 * Authority: Volumes I, V & Clinical Safety Policy Catalogue Section 6
 * 
 * Rules:
 * - Critical Acknowledgement SLA: <= 15 minutes.
 * - High Acknowledgement SLA: <= 60 minutes.
 * - Invariant: Platform SHALL NOT claim active human monitoring until a qualified reviewer has acknowledged (R-SAFE-005).
 */

import {
  SafetyEscalationEntity,
  SafetyEscalationType,
  SafetyActionPriority,
  EscalationState
} from '../domain/types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';

export interface EscalationRequest {
  userId: string;
  riskStateId?: string;
  escalationType: SafetyEscalationType;
  priority: SafetyActionPriority;
  reasonCodes: string[];
  policyVersion: string;
}

export class EscalationRouter {
  /**
   * Constructs an authoritative SafetyEscalation entity with deterministic SLA deadlines.
   */
  public static createEscalation(req: EscalationRequest): SafetyEscalationEntity {
    const now = new Date();
    const nowIso = now.toISOString();

    let ackDueMinutes = 60; // 1 hour default
    let resDueMinutes = 360; // 6 hours default
    let assignedTeam = 'SAFETY_OPERATIONS';

    if (req.priority === SafetyActionPriority.CRITICAL) {
      ackDueMinutes = 15; // 15 mins for critical
      resDueMinutes = 120; // 2 hours for critical
      assignedTeam = 'CLINICAL_SAFETY_ONCALL';
    } else if (req.priority === SafetyActionPriority.HIGH) {
      ackDueMinutes = 60;
      resDueMinutes = 360;
      assignedTeam = 'CLINICAL_SAFETY';
    }

    const slaAckDueAt = new Date(now.getTime() + ackDueMinutes * 60 * 1000).toISOString();
    const slaResDueAt = new Date(now.getTime() + resDueMinutes * 60 * 1000).toISOString();

    return {
      id: generateUUIDv7(),
      subject_user_id: req.userId,
      risk_state_id: req.riskStateId,
      escalation_type: req.escalationType,
      priority: req.priority,
      status: EscalationState.PENDING_REVIEW,
      reason_codes: req.reasonCodes,
      created_at: nowIso,
      assigned_team: assignedTeam,
      policy_version: req.policyVersion,
      sla_acknowledgement_due_at: slaAckDueAt,
      sla_resolution_due_at: slaResDueAt
    };
  }
}
