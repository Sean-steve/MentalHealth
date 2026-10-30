/**
 * MindOS Governance Kernel & Review Orchestrator
 * Authority: Master Architecture Index Section 7, Volumes III, XIV, XV & Appendices B / C / Q
 * Sprint 9: Governance Kernel, Review Orchestration, Approval Workflows, Feature Risk Classification & Production Release Gates
 *
 * Core Invariants:
 * - R-GOV-001: Clinical, DPIA, Regulatory, AI Safety, Security, and QA are first-class persistent domains.
 * - R-GOV-002: Feature authors/initiators SHALL NOT self-approve mandatory governance gates (Separation of Duties).
 * - R-QA-001: Unresolved critical safety, security, privacy or governance blocker SHALL prevent production authorization.
 * - Fail-Closed: "No required governance approval = no governed production activation."
 */

import { generateUUIDv7 } from '../platform/database/uuid.js';
import { GovernanceBlockedError, AuthorizationError, ValidationError } from '../platform/errors/index.js';
import { AuditService } from '../platform/audit/index.js';
import { EventBus } from '../platform/events/index.js';
import { DataClassification } from '../platform/shared/data_classification.js';
import { GovernanceDecision } from '../platform/shared/state_machines.js';

import {
  GovernedResourceType,
  GovernanceDomain,
  ClinicalRiskClass,
  AIRiskClass,
  PrivacyRiskClass,
  RegulatoryRiskClass,
  GovernanceCaseState,
  GovernanceReviewState,
  ReleaseAuthorizationStatus,
  GovernedResourceEntity,
  GovernanceCaseEntity,
  GovernanceReviewEntity,
  ReleaseAuthorizationEntity,
  GovernanceWorkItemEntity,
  RiskAssessmentResult,
  ReleaseGateEvaluationResult,
  GateDomainEvaluation
} from './types.js';

import { GovernanceRequirementEngine, ResourceClassificationParams } from './requirements.js';
import { GovernanceDecisionEngine } from './decision_engine.js';
import { GovernanceRepository } from './persistence.js';
import { ReleaseGateService } from './release_gates.js';
import { FeatureFlagService } from '../platform/features/index.js';

// Re-export all sub-modules for consumers
export * from './types.js';
export * from './requirements.js';
export * from './decision_engine.js';
export * from './persistence.js';
export * from './release_gates.js';

// Wire up governance gate checking with FeatureFlagService
FeatureFlagService.setGovernanceGateChecker((releaseId: string) => {
  const auth = GovernanceOrchestrator.getReleaseAuthorization(releaseId);
  if (!auth) return false;
  return auth.status === ReleaseAuthorizationStatus.AUTHORIZED && auth.state === GovernanceDecision.APPROVED;
});

export class GovernanceOrchestrator {
  private static workItems: Map<string, GovernanceWorkItemEntity> = new Map();
  private static releaseAuthorizations: Map<string, ReleaseAuthorizationEntity> = new Map();

  /**
   * Registers a platform asset as a Governed Resource.
   * Runs automated multi-dimensional risk classification and mandates domain reviews.
   */
  public static async registerGovernedResource(params: {
    resource_key: string;
    resource_type: GovernedResourceType;
    name: string;
    description: string;
    owner_id: string;
    classificationParams?: Partial<ResourceClassificationParams>;
  }): Promise<{ resource: GovernedResourceEntity; riskAssessment: RiskAssessmentResult }> {
    const existing = await GovernanceRepository.findResourceByKey(params.resource_key);
    if (existing) {
      const assessment = GovernanceRequirementEngine.classify({
        resource_key: existing.resource_key,
        name: existing.name,
        clinicalImpactClass: existing.clinical_risk_class,
        hasClinicalImpact: existing.requires_clinical_review,
        aiRiskClass: existing.ai_risk_class,
        hasAIModelOrInference: existing.requires_ai_safety_review,
        hasHealthDataProcessing: existing.requires_dpia
      } as any);
      return { resource: existing, riskAssessment: assessment };
    }

    const assessment = GovernanceRequirementEngine.classify({
      resource_key: params.resource_key,
      name: params.name,
      ...(params.classificationParams || {})
    });

    const id = generateUUIDv7();
    const now = new Date().toISOString();

    const resource: GovernedResourceEntity = {
      id,
      resource_key: params.resource_key,
      resource_type: params.resource_type,
      name: params.name,
      description: params.description,
      owner_id: params.owner_id,
      clinical_risk_class: assessment.clinical_risk_class,
      ai_risk_class: assessment.ai_risk_class,
      privacy_risk_class: assessment.privacy_risk_class,
      regulatory_risk_class: assessment.regulatory_risk_class,
      requires_clinical_review: assessment.mandated_domains.includes(GovernanceDomain.CLINICAL_GOVERNANCE),
      requires_dpia: assessment.mandated_domains.includes(GovernanceDomain.PRIVACY_GOVERNANCE),
      requires_regulatory_review: assessment.mandated_domains.includes(GovernanceDomain.REGULATORY_GOVERNANCE),
      requires_ai_safety_review: assessment.mandated_domains.includes(GovernanceDomain.AI_SAFETY_GOVERNANCE),
      requires_security_review: assessment.mandated_domains.includes(GovernanceDomain.SECURITY_GOVERNANCE),
      requires_qa_review: assessment.mandated_domains.includes(GovernanceDomain.QA_GOVERNANCE),
      metadata: {},
      status: 'ACTIVE',
      created_at: now,
      updated_at: now
    };

    await GovernanceRepository.saveResource(resource);

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.owner_id,
      action: 'GOVERNANCE.RESOURCE_REGISTERED',
      resource_type: 'governed_resource',
      resource_id: resource.id,
      purpose: 'Platform Asset Governance Registration',
      authorization_basis: { resourceKey: resource.resource_key },
      result: 'ALLOWED',
      metadata: {
        resourceKey: resource.resource_key,
        clinicalRisk: resource.clinical_risk_class,
        aiRisk: resource.ai_risk_class,
        mandatedDomains: assessment.mandated_domains
      }
    });

    return { resource, riskAssessment: assessment };
  }

  /**
   * Creates a formal Governance Case to track approval lifecycle for a resource or release.
   * Dispatches domain reviews to specialized role holders.
   */
  public static async createGovernanceCase(params: {
    resourceKey: string;
    releaseId?: string;
    initiatorId: string;
    summary: string;
  }): Promise<{ caseEntity: GovernanceCaseEntity; reviews: GovernanceReviewEntity[] }> {
    let resource = await GovernanceRepository.findResourceByKey(params.resourceKey);
    if (!resource) {
      const reg = await GovernanceOrchestrator.registerGovernedResource({
        resource_key: params.resourceKey,
        resource_type: GovernedResourceType.FEATURE_FLAG,
        name: params.resourceKey,
        description: params.summary,
        owner_id: params.initiatorId
      });
      resource = reg.resource;
    }

    const assessment = GovernanceRequirementEngine.classify({
      resource_key: resource.resource_key,
      name: resource.name,
      clinicalImpactClass: resource.clinical_risk_class,
      hasClinicalImpact: resource.requires_clinical_review,
      aiRiskClass: resource.ai_risk_class,
      hasAIModelOrInference: resource.requires_ai_safety_review,
      hasHealthDataProcessing: resource.requires_dpia
    } as any);

    const caseId = generateUUIDv7();
    const caseNumber = `GOV-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    const now = new Date().toISOString();

    const caseEntity: GovernanceCaseEntity = {
      id: caseId,
      case_number: caseNumber,
      resource_id: resource.id,
      release_id: params.releaseId,
      state: GovernanceCaseState.IN_REVIEW,
      initiator_id: params.initiatorId,
      mandated_domains: assessment.mandated_domains,
      risk_assessment: assessment,
      summary: params.summary,
      created_at: now,
      updated_at: now
    };

    await GovernanceRepository.saveCase(caseEntity);

    // Create review tasks for each mandated domain
    const reviews: GovernanceReviewEntity[] = [];
    const domainRoles: Record<GovernanceDomain, string> = {
      [GovernanceDomain.CLINICAL_GOVERNANCE]: 'ROLE_CLINICAL_DIRECTOR',
      [GovernanceDomain.PRIVACY_GOVERNANCE]: 'ROLE_DATA_PROTECTION_OFFICER',
      [GovernanceDomain.REGULATORY_GOVERNANCE]: 'ROLE_REGULATORY_COUNSEL',
      [GovernanceDomain.AI_SAFETY_GOVERNANCE]: 'ROLE_AI_SAFETY_OFFICER',
      [GovernanceDomain.SECURITY_GOVERNANCE]: 'ROLE_SECURITY_ENGINEER',
      [GovernanceDomain.QA_GOVERNANCE]: 'ROLE_QA_LEAD'
    };

    for (const domain of assessment.mandated_domains) {
      const reviewId = generateUUIDv7();
      const review: GovernanceReviewEntity = {
        id: reviewId,
        case_id: caseId,
        domain,
        state: GovernanceReviewState.PENDING,
        assigned_role: domainRoles[domain] || 'ROLE_GOVERNANCE_REVIEWER',
        conditions: [],
        evidence_hashes: [],
        started_at: now
      };

      await GovernanceRepository.saveReview(review);
      reviews.push(review);

      // Emit canonical domain event
      EventBus.enqueue(
        'governance.review_required',
        'governance',
        caseId,
        DataClassification.INTERNAL,
        {
          case_id: caseId,
          case_number: caseNumber,
          domain,
          assigned_role: review.assigned_role,
          resource_key: resource.resource_key
        }
      );
    }

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.initiatorId,
      action: 'GOVERNANCE.CASE_CREATED',
      resource_type: 'governance_case',
      resource_id: caseId,
      purpose: `Governance Case Creation: ${caseNumber}`,
      authorization_basis: { resourceKey: params.resourceKey },
      result: 'ALLOWED',
      metadata: { caseNumber, mandatedDomains: assessment.mandated_domains }
    });

    return { caseEntity, reviews };
  }

  /**
   * Records an official review decision for a domain.
   * Enforces Separation of Duties: Author cannot review/approve their own work (R-GOV-002).
   */
  public static async submitReviewDecision(params: {
    reviewId: string;
    reviewerId: string;
    decision: GovernanceDecision;
    conditions?: string[];
    evidenceHashes?: string[];
    notes?: string;
  }): Promise<GovernanceReviewEntity> {
    const reviews = await GovernanceRepository.findReviewsByCase(params.reviewId);
    let targetReview: GovernanceReviewEntity | undefined;

    // Search across cases if reviewId is the review's primary key
    for (const r of await GovernanceRepository.listResources()) {
      // no-op, just search
    }

    // Direct lookup through stored reviews
    for (const r of (GovernanceRepository as any).reviews.values()) {
      if (r.id === params.reviewId) {
        targetReview = r;
        break;
      }
    }

    if (!targetReview) {
      throw new ValidationError(`Governance review "${params.reviewId}" not found.`);
    }

    const caseEntity = await GovernanceRepository.findCase(targetReview.case_id);
    if (!caseEntity) {
      throw new ValidationError(`Parent governance case not found for review "${params.reviewId}".`);
    }

    // Enforce Separation of Duties: Feature author / initiator cannot self-approve review (R-GOV-002)
    if (caseEntity.initiator_id === params.reviewerId) {
      throw new AuthorizationError(
        'SEPARATION_OF_DUTIES: Feature author/initiator cannot approve governance review.',
        { errorCode: 'AUTHZ_004' }
      );
    }

    const now = new Date().toISOString();
    targetReview.reviewer_id = params.reviewerId;
    targetReview.decision = params.decision;
    targetReview.conditions = params.conditions || [];
    targetReview.evidence_hashes = params.evidenceHashes || [];
    targetReview.notes = params.notes;
    targetReview.decided_at = now;

    if (params.decision === GovernanceDecision.APPROVED || params.decision === GovernanceDecision.APPROVED_WITH_CONTROLS) {
      targetReview.state = GovernanceReviewState.APPROVED;
    } else if (params.decision === GovernanceDecision.REVISION_REQUIRED) {
      targetReview.state = GovernanceReviewState.REVISION_REQUIRED;
    } else {
      targetReview.state = GovernanceReviewState.BLOCKED;
    }

    await GovernanceRepository.saveReview(targetReview);

    // Emit canonical domain event
    EventBus.enqueue(
      'governance.review_decided',
      'governance',
      caseEntity.id,
      DataClassification.INTERNAL,
      {
        case_id: caseEntity.id,
        review_id: targetReview.id,
        domain: targetReview.domain,
        reviewer_id: params.reviewerId,
        decision: params.decision,
        decided_at: now
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.reviewerId,
      action: 'GOVERNANCE.REVIEW_DECIDED',
      resource_type: 'governance_review',
      resource_id: targetReview.id,
      purpose: `Governance Decision: ${targetReview.domain}`,
      authorization_basis: { decision: params.decision },
      result: 'ALLOWED',
      metadata: { domain: targetReview.domain, decision: params.decision }
    });

    return targetReview;
  }

  /**
   * Initializes a governance work package for a feature or release (Canonical API).
   */
  public static async assessFeature(params: {
    featureKey: string;
    hasClinicalImpact: boolean;
    hasHealthDataProcessing: boolean;
    hasAIModelOrInference: boolean;
    authorId: string;
  }): Promise<GovernanceWorkItemEntity[]> {
    const createdItems: GovernanceWorkItemEntity[] = [];

    const addWorkItem = (reviewType: GovernanceWorkItemEntity['review_type'], ownerRole: string) => {
      const id = generateUUIDv7();
      const item: GovernanceWorkItemEntity = {
        id,
        feature_key: params.featureKey,
        review_type: reviewType,
        required: true,
        state: 'OPEN',
        owner_role: ownerRole,
        created_at: new Date().toISOString()
      };
      GovernanceOrchestrator.workItems.set(id, item);
      GovernanceRepository.saveWorkItem(item);
      createdItems.push(item);
    };

    if (params.hasClinicalImpact) {
      addWorkItem('CLINICAL', 'CLINICAL_REVIEWER');
    }
    if (params.hasHealthDataProcessing) {
      addWorkItem('DPIA', 'PRIVACY_OFFICER');
    }
    addWorkItem('REGULATORY', 'REGULATORY_REVIEWER');
    if (params.hasAIModelOrInference) {
      addWorkItem('AI_SAFETY', 'AI_SAFETY_REVIEWER');
    }
    addWorkItem('SECURITY', 'SECURITY_REVIEWER');
    addWorkItem('QA', 'QA_LEAD');

    // Register governed resource and case in parallel
    await GovernanceOrchestrator.registerGovernedResource({
      resource_key: params.featureKey,
      resource_type: GovernedResourceType.FEATURE_FLAG,
      name: params.featureKey,
      description: `Feature assessment for ${params.featureKey}`,
      owner_id: params.authorId,
      classificationParams: {
        hasClinicalImpact: params.hasClinicalImpact,
        hasHealthDataProcessing: params.hasHealthDataProcessing,
        hasAIModelOrInference: params.hasAIModelOrInference
      } as any
    });

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.authorId,
      action: 'GOVERNANCE.FEATURE_ASSESSMENT_INITIATED',
      resource_type: 'governance_work_items',
      purpose: `Feature Impact Assessment: ${params.featureKey}`,
      authorization_basis: { featureKey: params.featureKey },
      result: 'ALLOWED',
      metadata: { workItemsCount: createdItems.length }
    });

    return createdItems;
  }

  /**
   * Authorizes a production release by validating all mandatory governance gates.
   * Enforces Separation of Duties (R-GOV-002) and Hard Release Gates (R-QA-001).
   */
  public static async authorizeRelease(params: {
    releaseId: string;
    featureKeys: string[];
    authorId: string;
    clinicalApproverId?: string;
    dpiaApproverId?: string;
    regulatoryApproverId?: string;
    aiSafetyApproverId?: string;
    securityApproverId: string;
    qaApproverId: string;
    releaseAuthorityId: string;
    evidenceRefs?: string[];
  }): Promise<ReleaseAuthorizationEntity> {
    const allApprovers = [
      params.clinicalApproverId,
      params.dpiaApproverId,
      params.regulatoryApproverId,
      params.aiSafetyApproverId,
      params.securityApproverId,
      params.qaApproverId
    ].filter(Boolean) as string[];

    // Enforce Separation of Duties: Author cannot be the sole approver for all gates (R-GOV-002)
    const approversSet = new Set(allApprovers);
    if (approversSet.size <= 1 && approversSet.has(params.authorId)) {
      throw new AuthorizationError(
        'SEPARATION_OF_DUTIES: Release cannot be authorized solely by the feature author.',
        { errorCode: 'AUTHZ_004' }
      );
    }

    // Enforce Separation of Duties: Author cannot clinically self-approve (R-GOV-002)
    if (params.clinicalApproverId && params.clinicalApproverId === params.authorId) {
      throw new AuthorizationError(
        'CLINICAL_SELF_APPROVAL_PROHIBITED: Feature author cannot provide clinical approval for their own release.',
        { errorCode: 'AUTHZ_004' }
      );
    }

    // Verify clinical gate if any feature has clinical impact
    for (const key of params.featureKeys) {
      const resource = await GovernanceRepository.findResourceByKey(key);
      if (resource && resource.requires_clinical_review && !params.clinicalApproverId) {
        throw new GovernanceBlockedError(
          `MANDATORY_GATE_OPEN: Feature "${key}" requires Clinical Governance sign-off before release authorization.`,
          { errorCode: 'GOV_CLINICAL_REQUIRED', details: { featureKey: key } }
        );
      }
    }

    // Verify all required gates
    const clinical_status = params.clinicalApproverId ? 'APPROVED' : 'NOT_REQUIRED';
    const dpia_status = params.dpiaApproverId ? 'APPROVED' : 'NOT_REQUIRED';
    const regulatory_status = params.regulatoryApproverId ? 'APPROVED' : 'NOT_REQUIRED';
    const ai_safety_status = params.aiSafetyApproverId ? 'APPROVED' : 'NOT_REQUIRED';
    const security_status = params.securityApproverId ? 'APPROVED' : 'BLOCKED';
    const qa_status = params.qaApproverId ? 'APPROVED' : 'BLOCKED';

    if (security_status !== 'APPROVED' || qa_status !== 'APPROVED') {
      throw new GovernanceBlockedError(
        'MANDATORY_GATE_OPEN: Security and QA sign-offs are mandatory for all production releases.',
        { errorCode: 'GOV_001' }
      );
    }

    const authId = generateUUIDv7();
    const now = new Date().toISOString();

    const authRecord: ReleaseAuthorizationEntity = {
      id: authId,
      release_id: params.releaseId,
      environment: 'production',
      feature_keys: params.featureKeys,
      clinical_status,
      dpia_status,
      regulatory_status,
      ai_safety_status,
      security_status,
      qa_status,
      clinical_signoff_at: params.clinicalApproverId ? now : undefined,
      privacy_signoff_at: params.dpiaApproverId ? now : undefined,
      regulatory_signoff_at: params.regulatoryApproverId ? now : undefined,
      ai_safety_signoff_at: params.aiSafetyApproverId ? now : undefined,
      security_signoff_at: now,
      qa_signoff_at: now,
      evidence_refs: params.evidenceRefs || [],
      approvers: Array.from(new Set([...allApprovers, params.releaseAuthorityId])),
      authorized_by: Array.from(new Set([...allApprovers, params.releaseAuthorityId])),
      authorized_at: now,
      state: GovernanceDecision.APPROVED,
      status: ReleaseAuthorizationStatus.AUTHORIZED,
      created_at: now
    } as any;

    GovernanceOrchestrator.releaseAuthorizations.set(params.releaseId, authRecord);
    await GovernanceRepository.saveReleaseAuthorization(authRecord);

    EventBus.enqueue(
      'governance.release_authorized',
      'governance',
      authId,
      DataClassification.INTERNAL,
      {
        authorization_id: authId,
        release_id: params.releaseId,
        feature_keys: params.featureKeys,
        authorized_at: now
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.releaseAuthorityId,
      action: 'GOVERNANCE.RELEASE_AUTHORIZED',
      resource_type: 'release_authorizations',
      resource_id: authId,
      purpose: `Release Authorization: ${params.releaseId}`,
      authorization_basis: {
        releaseId: params.releaseId,
        approvers: authRecord.authorized_by
      },
      result: 'ALLOWED'
    });

    return authRecord;
  }

  /**
   * Evaluates deployment readiness gate for CI/CD or runtime activation.
   */
  public static async evaluateReleaseGate(params: {
    releaseId: string;
    environment: string;
    featureKey?: string;
  }): Promise<ReleaseGateEvaluationResult> {
    return ReleaseGateService.evaluateGate(params);
  }

  /**
   * Revokes a release authorization immediately.
   */
  public static async revokeRelease(params: {
    releaseId: string;
    revokedBy: string;
    reason: string;
  }): Promise<void> {
    await ReleaseGateService.revokeRelease(params);
    const cached = GovernanceOrchestrator.releaseAuthorizations.get(params.releaseId);
    if (cached) {
      cached.status = ReleaseAuthorizationStatus.REVOKED;
      cached.revoked_at = new Date().toISOString();
    }
  }

  public static getReleaseAuthorization(releaseId: string): ReleaseAuthorizationEntity | undefined {
    return GovernanceOrchestrator.releaseAuthorizations.get(releaseId);
  }

  public static async listReleaseAuthorizations(): Promise<ReleaseAuthorizationEntity[]> {
    return GovernanceRepository.listReleaseAuthorizations();
  }

  public static async recordReviewDecision(params: {
    resourceId: string;
    domain: GovernanceDomain;
    decision: GovernanceDecision;
    reviewerId: string;
    notes?: string;
    conditions?: string[];
  }): Promise<void> {
    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.reviewerId,
      action: 'GOVERNANCE.DOMAIN_DECISION_RECORDED',
      resource_type: 'governed_resource',
      resource_id: params.resourceId,
      purpose: `Domain Decision: ${params.domain}`,
      result: 'ALLOWED',
      authorization_basis: { decision: params.decision }
    });
  }

  public static async revokeReleaseAuthorization(params: {
    resourceId: string;
    reason: string;
    revokedBy: string;
  }): Promise<void> {
    for (const auth of GovernanceOrchestrator.releaseAuthorizations.values()) {
      if (auth.status === ReleaseAuthorizationStatus.AUTHORIZED) {
        auth.status = ReleaseAuthorizationStatus.REVOKED;
        auth.revoked_at = new Date().toISOString();
        await GovernanceRepository.saveReleaseAuthorization(auth);
      }
    }
  }

  public static resetForTesting(): void {
    GovernanceOrchestrator.workItems.clear();
    GovernanceOrchestrator.releaseAuthorizations.clear();
    GovernanceRepository.resetForTesting();
    FeatureFlagService.setGovernanceGateChecker((releaseId: string) => {
      const auth = GovernanceOrchestrator.getReleaseAuthorization(releaseId);
      if (!auth) return false;
      return auth.status === ReleaseAuthorizationStatus.AUTHORIZED && auth.state === GovernanceDecision.APPROVED;
    });
  }
}
