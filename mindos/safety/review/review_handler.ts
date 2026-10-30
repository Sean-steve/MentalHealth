/**
 * MindOS Safety Review Handler & Decision Provenance
 * Authority: Volumes I, V & Clinical Safety Policy Catalogue Section 8
 */

import {
  SafetyReviewEntity,
  SafetyReviewDecision,
  RiskState
} from '../domain/types.js';
import { SafetyReviewerAuth } from './reviewer_auth.js';
import { RiskStateMachine } from '../risk/state_machine.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { DomainInvariantError } from '../../platform/errors/index.js';

export interface SubmitReviewRequest {
  subject_user_id: string;
  escalation_id?: string;
  current_risk_state: RiskState;
  reviewer_id: string;
  reviewer_role: string;
  qualification_reference?: string;
  decision: SafetyReviewDecision;
  proposed_risk_level?: RiskState;
  rationale: string;
  evidence_refs?: string[];
  clinical_artifact_ref?: string;
  policy_version?: string;
}

export interface ReviewExecutionResult {
  review: SafetyReviewEntity;
  finalRiskState: RiskState;
  stateChanged: boolean;
}

export class SafetyReviewHandler {
  /**
   * Executes a human clinical review decision with role verification and provenance recording.
   */
  public static handleReview(req: SubmitReviewRequest): ReviewExecutionResult {
    // 1. Assert reviewer role eligibility (denies ordinary admin or moderator)
    SafetyReviewerAuth.assertReviewerEligibility({
      actor_id: req.reviewer_id,
      role: req.reviewer_role
    });

    if (!req.rationale || req.rationale.trim().length < 10) {
      throw new DomainInvariantError('Substantive clinical rationale (minimum 10 characters) is mandatory for safety reviews.');
    }

    let finalState = req.current_risk_state;
    let stateChanged = false;

    // 2. Evaluate decision vs state transition
    if (req.decision === SafetyReviewDecision.DECREASE_RISK_STATE || req.decision === SafetyReviewDecision.INCREASE_RISK_STATE) {
      if (!req.proposed_risk_level) {
        throw new DomainInvariantError(`proposed_risk_level is required when decision is ${req.decision}.`);
      }

      // Validate transition through canonical state machine with clinical signoff approved
      RiskStateMachine.validateTransition(req.current_risk_state, req.proposed_risk_level, {
        userId: req.subject_user_id,
        isClinicalReviewApproved: true,
        rationale: req.rationale
      });

      finalState = req.proposed_risk_level;
      stateChanged = true;
    }

    // 3. Construct review entity with complete provenance
    const review: SafetyReviewEntity = {
      id: generateUUIDv7(),
      subject_user_id: req.subject_user_id,
      escalation_id: req.escalation_id,
      reviewer_id: req.reviewer_id,
      reviewer_role: req.reviewer_role,
      qualification_reference: req.qualification_reference,
      decision: req.decision,
      proposed_risk_level: req.proposed_risk_level,
      rationale: req.rationale,
      evidence_refs: req.evidence_refs || [],
      clinical_artifact_ref: req.clinical_artifact_ref || 'ART-SAFE-001',
      policy_version: req.policy_version || '2.0.0-CLIN-SAFE',
      created_at: new Date().toISOString()
    };

    return {
      review,
      finalRiskState: finalState,
      stateChanged
    };
  }
}
