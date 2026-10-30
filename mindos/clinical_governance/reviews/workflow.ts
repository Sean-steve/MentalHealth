/**
 * MindOS Clinical Review Workflow Engine
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendix B
 * Orchestrates multi-reviewer policies, structured review checklists, conflict resolution,
 * and conditional approval workflows.
 */

import {
  ClinicalArtifactType,
  ClinicalRiskClass,
  ClinicalReviewLevel,
  ClinicalReviewerSpecialty,
  ClinicalReview,
  ClinicalReviewDecision,
  ClinicalReviewChecklist,
  ClinicalCondition
} from '../types.js';
import { ValidationError, AuthorizationError, DomainInvariantError } from '../../platform/errors/index.js';

export interface ReviewRequirements {
  review_level: ClinicalReviewLevel;
  required_reviewers_count: number;
  required_specialty?: ClinicalReviewerSpecialty;
  expiry_days: number;
}

export class ClinicalReviewWorkflowEngine {
  /**
   * Calculates mandated review requirements based on artifact risk class and type.
   */
  public static calculateRequirements(params: {
    artifactType: ClinicalArtifactType;
    clinicalRiskClass: ClinicalRiskClass;
  }): ReviewRequirements {
    switch (params.clinicalRiskClass) {
      case 'CR-3':
        return {
          review_level: ClinicalReviewLevel.MULTI_REVIEWER,
          required_reviewers_count: 2,
          required_specialty: ClinicalReviewerSpecialty.PSYCHIATRY,
          expiry_days: 180 // 6-month strict renewal
        };
      case 'CR-2':
        return {
          review_level: ClinicalReviewLevel.MULTI_REVIEWER,
          required_reviewers_count: 2,
          required_specialty: ClinicalReviewerSpecialty.CLINICAL_PSYCHOLOGY,
          expiry_days: 365 // 1-year renewal
        };
      case 'CR-1':
        return {
          review_level: ClinicalReviewLevel.STANDARD_CLINICAL_REVIEW,
          required_reviewers_count: 1,
          required_specialty: ClinicalReviewerSpecialty.GENERAL_MENTAL_HEALTH,
          expiry_days: 365
        };
      case 'CR-0':
      default:
        return {
          review_level: ClinicalReviewLevel.STANDARD_CLINICAL_REVIEW,
          required_reviewers_count: 1,
          expiry_days: 730 // 2 years
        };
    }
  }

  /**
   * Validates that a completed review has a fully completed structured checklist.
   * Empty textareas or incomplete checklists are rejected.
   */
  public static validateChecklist(checklist: Record<string, any>, decision?: ClinicalReviewDecision): void {
    if (!checklist || typeof checklist !== 'object') {
      throw new ValidationError('Clinical review checklist missing or invalid.');
    }

    const isSevenItemChecklist = 'clinical_rationale_verified' in checklist || 'benefit_risk_acceptable' in checklist;
    
    const requiredKeys: string[] = isSevenItemChecklist
      ? [
          'clinical_rationale_verified',
          'evidence_adequacy_verified',
          'benefit_risk_acceptable',
          'safety_and_contraindications_verified',
          'population_appropriateness_verified',
          'plain_language_verified',
          'escalation_pathway_verified'
        ]
      : [
          'intended_use_appropriate',
          'population_defined',
          'claims_supported',
          'evidence_adequate',
          'limitations_disclosed',
          'contraindications_defined',
          'safety_implications_reviewed',
          'language_clinically_appropriate',
          'user_misinterpretation_risk_mitigated',
          'risk_escalation_implications_reviewed',
          'monitoring_requirements_established'
        ];

    for (const key of requiredKeys) {
      if (typeof checklist[key] !== 'boolean') {
        throw new ValidationError(`Clinical review checklist incomplete: "${key}" must be explicitly evaluated.`);
      }
      if (decision === ClinicalReviewDecision.APPROVE && checklist[key] !== true) {
        throw new DomainInvariantError(
          `Review submission rejected: Cannot approve with incomplete clinical checklist. All checklist criteria must be verified. ("${key}" is false)`
        );
      }
    }
  }

  /**
   * Aggregates multiple independent reviews for an artifact version.
   * Returns final consensus decision or identifies clinical conflict.
   */
  public static evaluateConsensus(params: {
    requiredCount: number;
    reviews: ClinicalReview[];
  }): {
    consensus_reached: boolean;
    final_decision?: ClinicalReviewDecision;
    has_conflict: boolean;
    pending_reviewers: number;
    conditions: ClinicalCondition[];
    conflict_summary?: string;
  } {
    const completed = params.reviews.filter(r => r.status === 'COMPLETED' && r.decision);
    const pending_reviewers = Math.max(0, params.requiredCount - completed.length);

    if (completed.length < params.requiredCount) {
      return {
        consensus_reached: false,
        has_conflict: false,
        pending_reviewers,
        conditions: []
      };
    }

    const decisions = completed.map(r => r.decision!);
    const hasRejection = decisions.includes(ClinicalReviewDecision.REJECT);
    const hasApproval = decisions.includes(ClinicalReviewDecision.APPROVE) || 
                        decisions.includes(ClinicalReviewDecision.CONDITIONAL_APPROVE);

    // Conflict detection: If one reviewer approves and another rejects, DO NOT average the decision
    if (hasRejection && hasApproval) {
      return {
        consensus_reached: false,
        has_conflict: true,
        pending_reviewers: 0,
        conditions: [],
        conflict_summary: 'CLINICAL_REVIEW_CONFLICT: Reviewers submitted conflicting decisions (APPROVE vs REJECT). Escalated to Clinical Governance Lead.'
      };
    }

    // If any reviewer requires more information
    if (decisions.includes(ClinicalReviewDecision.MORE_INFORMATION_REQUIRED)) {
      return {
        consensus_reached: true,
        final_decision: ClinicalReviewDecision.MORE_INFORMATION_REQUIRED,
        has_conflict: false,
        pending_reviewers: 0,
        conditions: []
      };
    }

    if (hasRejection) {
      return {
        consensus_reached: true,
        final_decision: ClinicalReviewDecision.REJECT,
        has_conflict: false,
        pending_reviewers: 0,
        conditions: []
      };
    }

    // Collect all conditions across all reviews
    const allConditions: ClinicalCondition[] = [];
    for (const r of completed) {
      if (r.conditions && r.conditions.length > 0) {
        allConditions.push(...r.conditions);
      }
    }

    const hasConditional = decisions.includes(ClinicalReviewDecision.CONDITIONAL_APPROVE) || allConditions.length > 0;

    return {
      consensus_reached: true,
      final_decision: hasConditional ? ClinicalReviewDecision.CONDITIONAL_APPROVE : ClinicalReviewDecision.APPROVE,
      has_conflict: false,
      pending_reviewers: 0,
      conditions: allConditions
    };
  }
}
