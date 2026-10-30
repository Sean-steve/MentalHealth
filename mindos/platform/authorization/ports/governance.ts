/**
 * MindOS Governance Integration Ports (Sprint 5 Boundary)
 * Authority: Master Architecture Index Section 14, Volume VIII & Volume XIV
 * ADR-016
 * 
 * Defines governance hooks for:
 * - Clinical Governance (peer review, clinical safety signoff)
 * - Privacy Governance (DPIA review, data minimization, privacy rights)
 * - Regulatory Review (statutory oversight, jurisdiction-specific constraints)
 * - AI Safety Review (model evaluation, safety guardrail incidents)
 * 
 * Invariant (Section 43):
 * Unknown required governance state SHALL DENY high-risk actions.
 */

export interface GovernanceDecision {
  approved: boolean;
  reason: string;
  reviewId?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface ClinicalGovernanceDecisionPort {
  evaluateClinicalReview(params: {
    actorId: string;
    resourceType: string;
    resourceId?: string;
    action: string;
    context?: Record<string, unknown>;
  }): Promise<GovernanceDecision>;
}

export interface PrivacyGovernanceDecisionPort {
  evaluatePrivacyCompliance(params: {
    actorId: string;
    resourceType: string;
    resourceId?: string;
    action: string;
    context?: Record<string, unknown>;
  }): Promise<GovernanceDecision>;
}

export interface RegulatoryDecisionPort {
  evaluateRegulatoryReadiness(params: {
    actorId: string;
    jurisdiction: string;
    action: string;
    resourceType: string;
    context?: Record<string, unknown>;
  }): Promise<GovernanceDecision>;
}

export interface AISafetyGovernanceDecisionPort {
  evaluateSafetyReview(params: {
    actorId: string;
    modelId?: string;
    action: string;
    context?: Record<string, unknown>;
  }): Promise<GovernanceDecision>;
}

/**
 * Default safe implementations enforcing fail-closed / deny-by-default behavior
 * for unconfigured or unknown governance state.
 */
export class DefaultClinicalGovernancePort implements ClinicalGovernanceDecisionPort {
  public async evaluateClinicalReview(params: {
    actorId: string;
    resourceType: string;
    resourceId?: string;
    action: string;
    context?: Record<string, unknown>;
  }): Promise<GovernanceDecision> {
    const ctx = params.context || {};
    if (ctx.clinicalReviewApproved === true || ctx.hasClinicalSignoff === true) {
      return {
        approved: true,
        reason: 'Clinical governance sign-off confirmed.',
        reviewId: (ctx.reviewId as string) || 'clin-gov-approved'
      };
    }
    return {
      approved: false,
      reason: 'Clinical governance review required prior to executing high-risk clinical action.'
    };
  }
}

import { PrivacyGovernanceEngine } from '../../../privacy_governance/application/service.js';
import { DataCategory, ProcessingPurpose } from '../../../privacy_governance/types.js';

export class DefaultPrivacyGovernancePort implements PrivacyGovernanceDecisionPort {
  public async evaluatePrivacyCompliance(params: {
    actorId: string;
    resourceType: string;
    resourceId?: string;
    action: string;
    context?: Record<string, unknown>;
  }): Promise<GovernanceDecision> {
    const ctx = params.context || {};
    const activityCode = (ctx.processingActivityCode as string) || (ctx.activityCode as string);

    // If an activity code is provided, execute the canonical release gate verification
    if (activityCode) {
      const gateResult = await PrivacyGovernanceEngine.evaluateReleaseGate({
        processing_activity_code: activityCode,
        version: typeof ctx.activityVersion === 'number' ? ctx.activityVersion : undefined,
        data_categories: (ctx.dataCategories as DataCategory[]) || [DataCategory.IDENTITY],
        purpose: (ctx.purpose as ProcessingPurpose) || ProcessingPurpose.CARE_DELIVERY,
        processor_codes: ctx.processorCodes as string[] | undefined
      });

      if (!gateResult.permitted) {
        return {
          approved: false,
          reason: gateResult.reason || 'Privacy governance release gate failed.'
        };
      }

      return {
        approved: true,
        reason: 'Canonical Privacy Governance release gate passed with active approval certificate.',
        reviewId: gateResult.approval?.id,
        reviewedBy: gateResult.approval?.reviewer_id,
        reviewedAt: gateResult.approval?.approved_at
      };
    }

    if (ctx.privacyReviewApproved === true || ctx.hasDpiaSignoff === true) {
      return {
        approved: true,
        reason: 'Privacy governance review and DPIA compliance confirmed.',
        reviewId: (ctx.reviewId as string) || 'priv-gov-approved'
      };
    }
    return {
      approved: false,
      reason: 'Privacy governance review / DPIA sign-off required for high-risk processing.'
    };
  }
}

import { RegulatoryGovernanceService } from '../../../regulatory_governance/index.js';

export class DefaultRegulatoryGovernancePort implements RegulatoryDecisionPort {
  public async evaluateRegulatoryReadiness(params: {
    actorId: string;
    jurisdiction: string;
    action: string;
    resourceType: string;
    context?: Record<string, unknown>;
  }): Promise<GovernanceDecision> {
    const ctx = params.context || {};
    const resourceId = (ctx.resourceId as string) || (ctx.featureKey as string) || params.resourceType;

    // Execute canonical Regulatory Governance release gate verification
    const gateResult = await RegulatoryGovernanceService.evaluateReleaseGate({
      resourceId,
      jurisdictionCode: params.jurisdiction || (ctx.jurisdictionCode as string) || 'KE',
      resourceType: params.resourceType,
      targetEnvironment: (ctx.environment as string) || 'production'
    });

    if (!gateResult.permitted) {
      return {
        approved: false,
        reason: gateResult.reason || 'Regulatory governance release gate blocked activation.'
      };
    }

    return {
      approved: true,
      reason: 'Regulatory governance clearance verified under Kenya Regulatory Control Matrix.',
      reviewId: gateResult.approval?.id,
      reviewedBy: gateResult.approval?.reviewer_id,
      reviewedAt: gateResult.approval?.approved_at
    };
  }
}

export class DefaultAISafetyGovernancePort implements AISafetyGovernanceDecisionPort {
  public async evaluateSafetyReview(params: {
    actorId: string;
    modelId?: string;
    action: string;
    context?: Record<string, unknown>;
  }): Promise<GovernanceDecision> {
    const ctx = params.context || {};
    if (ctx.aiSafetyApproved === true) {
      return {
        approved: true,
        reason: 'AI safety review and guardrail verification confirmed.'
      };
    }
    return {
      approved: false,
      reason: 'AI safety sign-off required for autonomous or high-risk AI operations.'
    };
  }
}
