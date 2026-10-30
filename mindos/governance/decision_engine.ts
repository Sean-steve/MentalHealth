/**
 * MindOS Governance Decision Engine
 * Authority: Master Architecture Index Section 7, Volumes III, XIV, XV & Appendices B / C / Q
 * Sprint 9: Deterministic Fail-Closed Release Gates & Multi-Domain Approval Aggregation
 */

import {
  GovernanceDomain,
  GovernanceCaseEntity,
  GovernanceReviewEntity,
  ReleaseGateEvaluationResult,
  GateDomainEvaluation
} from './types.js';
import { GovernanceDecision } from '../platform/shared/state_machines.js';

export interface EvaluationContext {
  initiatorId: string;
  releaseId: string;
  environment: string;
  caseEntity: GovernanceCaseEntity;
  reviews: GovernanceReviewEntity[];
  unresolvedIncidents?: Array<{ id: string; severity: string; title: string }>;
}

export class GovernanceDecisionEngine {
  /**
   * Deterministically evaluates whether a release gate can be approved.
   * Enforces:
   * - Fail-Closed invariant: Missing or pending review = Release Denied.
   * - Separation of Duties: Author cannot self-approve; reviewer cannot be initiator.
   * - Quality & Safety: Zero unresolved critical/high incidents.
   */
  public static evaluateReleaseGate(ctx: EvaluationContext): ReleaseGateEvaluationResult {
    const blockingReasons: string[] = [];
    const domainEvaluations: Record<GovernanceDomain, GateDomainEvaluation> = {
      [GovernanceDomain.CLINICAL_GOVERNANCE]: {
        domain: GovernanceDomain.CLINICAL_GOVERNANCE,
        required: false,
        status: 'SATISFIED',
        conditions: [],
        evidence_hashes: []
      },
      [GovernanceDomain.PRIVACY_GOVERNANCE]: {
        domain: GovernanceDomain.PRIVACY_GOVERNANCE,
        required: false,
        status: 'SATISFIED',
        conditions: [],
        evidence_hashes: []
      },
      [GovernanceDomain.REGULATORY_GOVERNANCE]: {
        domain: GovernanceDomain.REGULATORY_GOVERNANCE,
        required: false,
        status: 'SATISFIED',
        conditions: [],
        evidence_hashes: []
      },
      [GovernanceDomain.AI_SAFETY_GOVERNANCE]: {
        domain: GovernanceDomain.AI_SAFETY_GOVERNANCE,
        required: false,
        status: 'SATISFIED',
        conditions: [],
        evidence_hashes: []
      },
      [GovernanceDomain.SECURITY_GOVERNANCE]: {
        domain: GovernanceDomain.SECURITY_GOVERNANCE,
        required: false,
        status: 'SATISFIED',
        conditions: [],
        evidence_hashes: []
      },
      [GovernanceDomain.QA_GOVERNANCE]: {
        domain: GovernanceDomain.QA_GOVERNANCE,
        required: false,
        status: 'SATISFIED',
        conditions: [],
        evidence_hashes: []
      }
    };

    let separationOfDutiesValid = true;
    const approvers = new Set<string>();

    // 1. Mark which domains are mandated
    for (const domain of ctx.caseEntity.mandated_domains) {
      domainEvaluations[domain].required = true;
      domainEvaluations[domain].status = 'PENDING';
    }

    // 2. Map existing reviews to domains
    const reviewByDomain = new Map<GovernanceDomain, GovernanceReviewEntity>();
    for (const review of ctx.reviews) {
      reviewByDomain.set(review.domain, review);
    }

    // 3. Evaluate each mandated domain
    for (const domain of ctx.caseEntity.mandated_domains) {
      const review = reviewByDomain.get(domain);
      const evalEntry = domainEvaluations[domain];

      if (!review) {
        blockingReasons.push(`Mandated domain [${domain}] has no submitted review.`);
        evalEntry.status = 'PENDING';
        continue;
      }

      evalEntry.reviewer_id = review.reviewer_id;
      evalEntry.decision = review.decision;
      evalEntry.conditions = review.conditions || [];
      evalEntry.evidence_hashes = review.evidence_hashes || [];

      // Separation of Duties check: Initiator / author cannot approve their own review (R-GOV-002)
      if (review.reviewer_id && review.reviewer_id === ctx.initiatorId) {
        separationOfDutiesValid = false;
        blockingReasons.push(
          `Separation of duties violation: Initiator "${ctx.initiatorId}" cannot approve review for domain [${domain}].`
        );
      }

      if (review.reviewer_id) {
        approvers.add(review.reviewer_id);
      }

      if (!review.decision) {
        evalEntry.status = 'PENDING';
        blockingReasons.push(`Domain [${domain}] review is still pending decision.`);
      } else if (review.decision === GovernanceDecision.BLOCKED) {
        evalEntry.status = 'BLOCKED';
        blockingReasons.push(`Domain [${domain}] review is BLOCKED.`);
      } else if (review.decision === GovernanceDecision.REVISION_REQUIRED) {
        evalEntry.status = 'REVISION_REQUIRED';
        blockingReasons.push(`Domain [${domain}] review requires revisions before release.`);
      } else if (
        review.decision === GovernanceDecision.APPROVED ||
        review.decision === GovernanceDecision.APPROVED_WITH_CONTROLS
      ) {
        // Check evidence presence
        if (!review.evidence_hashes || review.evidence_hashes.length === 0) {
          // Warning or required depending on domain
          if (domain === GovernanceDomain.CLINICAL_GOVERNANCE || domain === GovernanceDomain.AI_SAFETY_GOVERNANCE || domain === GovernanceDomain.REGULATORY_GOVERNANCE) {
            blockingReasons.push(`Domain [${domain}] approval lacks required cryptographic evidence hashes.`);
            evalEntry.status = 'REVISION_REQUIRED';
            continue;
          }
        }
        evalEntry.status = 'SATISFIED';
      } else {
        evalEntry.status = 'PENDING';
        blockingReasons.push(`Domain [${domain}] has invalid decision state: ${review.decision}.`);
      }
    }

    // 4. Invariant: At least two distinct qualified reviewers required for production release
    if (ctx.environment === 'production' && approvers.size < 2) {
      separationOfDutiesValid = false;
      blockingReasons.push(
        `Multi-party governance invariant: Production releases require approvals from at least two distinct individuals. Found: ${approvers.size}.`
      );
    }

    // 5. Unresolved Incidents Check
    const unresolved = ctx.unresolvedIncidents || [];
    const criticalIncidents = unresolved.filter(
      inc => inc.severity === 'CRITICAL' || inc.severity === 'HIGH'
    );
    if (criticalIncidents.length > 0) {
      blockingReasons.push(
        `Release gate blocked by ${criticalIncidents.length} active unresolved safety/quality incident(s): ${criticalIncidents.map(i => i.title).join(', ')}.`
      );
    }

    const canActivate = blockingReasons.length === 0 && separationOfDutiesValid;
    const verdict = canActivate ? 'ALLOWED' : 'DENIED';

    return {
      release_id: ctx.releaseId,
      environment: ctx.environment,
      verdict,
      can_activate: canActivate,
      blocking_reasons: blockingReasons,
      domain_evaluations: domainEvaluations,
      separation_of_duties_valid: separationOfDutiesValid,
      unresolved_incidents_count: criticalIncidents.length,
      evaluated_at: new Date().toISOString()
    };
  }
}
