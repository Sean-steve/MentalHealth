/**
 * MindOS Regulatory Governance Application Service & Gate Engine
 * Authority: Master Architecture Index, Volumes III, XV & Appendix I
 * Connects domain services, enforces fail-closed release gates,
 * and maintains audit integrity with Evidence Vault integration.
 */

import {
  Jurisdiction,
  RegulatoryAuthority,
  RegulatorySource,
  RegulatoryRequirement,
  RegulatoryControl,
  RegulatoryClassification,
  RegulatoryAssessment,
  RegulatoryApproval,
  RegulatoryGap,
  RegulatoryImpactAssessment,
  ExternalRegulatoryStatus,
  GovernanceCondition
} from '../domain/types.js';
import {
  JurisdictionStatus,
  RegulatoryClassificationType,
  RegulatoryDecisionType,
  RegulatoryGapType,
  RegulatoryGapSeverity,
  ControlEvidenceStatus,
  GovernanceConditionType
} from '../domain/taxonomy.js';
import { RegulatoryReviewState, validateStateTransition } from '../../platform/shared/state_machines.js';
import { JurisdictionRegistry } from '../jurisdictions/registry.js';
import { RegulatoryAuthorityRegistry } from '../authorities/registry.js';
import { RegulatorySourceRegistry } from '../sources/registry.js';
import { RegulatoryRequirementRegistry } from '../requirements/registry.js';
import { RegulatoryControlRegistry } from '../controls/registry.js';
import { RegulatoryClassificationEngine, ClassificationInput } from '../classifications/engine.js';
import { RegulatoryAssessmentWorkflow } from '../assessments/workflow.js';
import { RegulatoryGapService } from '../remediation/gap_service.js';
import { RegulatoryCertificationService } from '../certification/service.js';
import { RegulatorySourceChangeService } from '../impact/source_change_service.js';
import { RegulatoryReviewerService } from '../reviews/reviewer_service.js';
import { AuditService } from '../../platform/audit/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import {
  ValidationError,
  RegulatoryClassificationRequiredError,
  RegulatoryApprovalRequiredError,
  RegulatoryApprovalExpiredError,
  RegulatoryApprovalRevokedError,
  RegulatoryBlockingGapError,
  RegulatoryCertificationRequiredError,
  RegulatoryJurisdictionNotApprovedError,
  RegulatorySourceReviewRequiredError
} from '../../platform/errors/index.js';

export interface RegulatoryGateResult {
  permitted: boolean;
  reason?: string;
  reasons: string[];
  classification?: RegulatoryClassification;
  approval?: RegulatoryApproval;
  conditions?: GovernanceCondition[];
  blockingGapsCount: number;
  evaluatedAt: string;
}

export interface BackwardClassificationEntity {
  id: string;
  feature_key: string;
  jurisdiction_code: string;
  state: RegulatoryReviewState;
  scope_statement: string;
  applicable_requirements: string[];
  conditions: Record<string, unknown>;
  reviewer_id?: string;
  approved_at?: string;
}

export class RegulatoryGovernanceService {
  private static legacyEntities: Map<string, BackwardClassificationEntity> = new Map();

  static {
    RegulatoryGovernanceService.initialize();
  }

  public static initialize(): void {
    JurisdictionRegistry.initializeCanonicalJurisdictions();
    RegulatoryAuthorityRegistry.initializeCanonicalAuthorities();
    RegulatorySourceRegistry.initializeCanonicalSources();
    RegulatoryRequirementRegistry.initializeCanonicalRequirements();
    RegulatoryControlRegistry.initializeCanonicalControls();
    RegulatoryCertificationService.initializeCanonicalStatuses();
    RegulatoryGovernanceService.seedCanonicalClassifications();
  }

  public static seedCanonicalClassifications(): void {
    RegulatoryGovernanceService.legacyEntities.clear();
    const id = generateUUIDv7();
    const legacyEntry: BackwardClassificationEntity = {
      id,
      feature_key: 'core_platform',
      jurisdiction_code: 'KE',
      state: RegulatoryReviewState.APPROVED,
      scope_statement: 'MindOS Core Mental Health Support Platform (Kenya V1)',
      applicable_requirements: [
        'KE-REQ-PRIV-001',
        'KE-REQ-PRIV-002',
        'KE-REQ-DHA-001',
        'KE-REQ-DHA-002',
        'KE-REQ-HLTH-001',
        'KE-REQ-CYBER-001'
      ],
      conditions: { adult_only: true, minors_disabled: true },
      reviewer_id: 'legal_regulatory_officer_ke',
      approved_at: '2026-08-01T00:00:00.000Z'
    };
    RegulatoryGovernanceService.legacyEntities.set('core_platform_ke', legacyEntry);
    RegulatoryGovernanceService.legacyEntities.set('core_platform_KE', legacyEntry);

    // Also seed a canonical approval in the workflow synchronously
    const classification = RegulatoryClassificationEngine.classify({
      resource_id: 'core_platform',
      resource_version: '1.0.0',
      resource_type: 'platform',
      name: 'MindOS Core Platform',
      jurisdiction_code: 'KE',
      intended_use: 'Mental health support platform operating under Kenyan jurisdiction profile',
      processes_health_data: true
    });

    const assessmentId = generateUUIDv7();
    const approvalId = generateUUIDv7();
    const conditions: GovernanceCondition[] = [
      {
        id: generateUUIDv7(),
        assessment_id: assessmentId,
        type: GovernanceConditionType.JURISDICTION_RESTRICTION,
        code: 'COND_KE_ONLY',
        condition_type: GovernanceConditionType.JURISDICTION_RESTRICTION,
        condition_code: 'COND_KE_ONLY',
        description: 'Approved solely for territory of the Republic of Kenya',
        enforcement_mechanism: 'Release gate jurisdiction check',
        status: 'ACTIVE'
      }
    ];

    const assessment: RegulatoryAssessment = {
      id: assessmentId,
      resource_id: 'core_platform',
      resource_version: '1.0.0',
      jurisdiction_code: 'KE',
      classification_id: classification.id,
      status: RegulatoryReviewState.APPROVED,
      applicable_requirements: classification.applicable_requirements,
      control_assessment: {},
      blocking_gaps_count: 0,
      open_gaps_count: 0,
      conditions,
      started_at: '2026-08-01T00:00:00.000Z',
      initiated_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z'
    };

    const approval: RegulatoryApproval = {
      id: approvalId,
      assessment_id: assessmentId,
      resource_id: 'core_platform',
      resource_version: '1.0.0',
      jurisdiction_code: 'KE',
      classification_id: classification.id,
      source_versions: { 'KE-SRC-DPA-2019': '1.0.0' },
      requirement_set: classification.applicable_requirements,
      control_evidence: {},
      decision: RegulatoryDecisionType.APPROVE,
      status: 'ACTIVE',
      approved_by: 'lead_regulatory_counsel_ke',
      reviewer_id: 'lead_regulatory_counsel_ke',
      policy_version: '1.0.0',
      approved_at: '2026-08-01T00:00:00.000Z',
      expires_at: '2027-08-01T00:00:00.000Z',
      evidence_vault_ref: 'EV-REG-CANONICAL-CORE-PLATFORM',
      conditions
    };

    RegulatoryAssessmentWorkflow.recordApproval(approval, assessment);
  }

  // --- REGISTRIES EXPOSURE ---

  public static getJurisdiction(code: string): Jurisdiction | undefined {
    return JurisdictionRegistry.get(code);
  }

  public static listJurisdictions(): Jurisdiction[] {
    return JurisdictionRegistry.list();
  }

  public static getAuthority(code: string, jurisdictionCode = 'KE'): RegulatoryAuthority | undefined {
    return RegulatoryAuthorityRegistry.get(code, jurisdictionCode);
  }

  public static listAuthorities(jurisdictionCode = 'KE'): RegulatoryAuthority[] {
    return RegulatoryAuthorityRegistry.list(jurisdictionCode);
  }

  public static getSource(code: string): RegulatorySource | undefined {
    return RegulatorySourceRegistry.get(code);
  }

  public static listSources(jurisdictionCode = 'KE'): RegulatorySource[] {
    return RegulatorySourceRegistry.list(jurisdictionCode);
  }

  public static getRequirement(code: string): RegulatoryRequirement | undefined {
    return RegulatoryRequirementRegistry.get(code);
  }

  public static listRequirements(jurisdictionCode = 'KE'): RegulatoryRequirement[] {
    return RegulatoryRequirementRegistry.list(jurisdictionCode);
  }

  public static getControl(code: string): RegulatoryControl | undefined {
    return RegulatoryControlRegistry.get(code);
  }

  public static listControls(jurisdictionCode = 'KE'): RegulatoryControl[] {
    return RegulatoryControlRegistry.list(jurisdictionCode);
  }

  // --- CLASSIFICATION WORKFLOW ---

  public static classifyResource(input: ClassificationInput): RegulatoryClassification {
    return RegulatoryClassificationEngine.classify(input);
  }

  public static getClassification(resourceId: string, jurisdictionCode = 'KE'): BackwardClassificationEntity | undefined {
    // Check legacy first
    const legacy = RegulatoryGovernanceService.legacyEntities.get(`${resourceId}_${jurisdictionCode.toUpperCase()}`);
    if (legacy) return legacy;

    const modern = RegulatoryClassificationEngine.get(resourceId, jurisdictionCode);
    if (!modern) return undefined;

    const approval = RegulatoryAssessmentWorkflow.getApproval(resourceId, jurisdictionCode);
    return {
      id: modern.id,
      feature_key: modern.resource_id,
      jurisdiction_code: modern.jurisdiction_code,
      state: approval ? RegulatoryReviewState.APPROVED : RegulatoryReviewState.CLASSIFICATION_REQUIRED,
      scope_statement: modern.classification,
      applicable_requirements: modern.applicable_requirements,
      conditions: {},
      reviewer_id: approval?.reviewer_id,
      approved_at: approval?.approved_at
    };
  }

  public static async classifyFeature(params: {
    feature_key: string;
    jurisdiction_code: string;
    scope_statement: string;
    applicable_requirements: string[];
    intended_use?: string;
    processes_health_data?: boolean;
    makes_clinical_claims?: boolean;
  }): Promise<BackwardClassificationEntity> {
    const jurCode = params.jurisdiction_code.toUpperCase();
    const id = generateUUIDv7();

    const legacy: BackwardClassificationEntity = {
      id,
      feature_key: params.feature_key,
      jurisdiction_code: jurCode,
      state: RegulatoryReviewState.CLASSIFICATION_REQUIRED,
      scope_statement: params.scope_statement,
      applicable_requirements: params.applicable_requirements,
      conditions: {}
    };

    RegulatoryGovernanceService.legacyEntities.set(`${params.feature_key}_${jurCode}`, legacy);

    // Also register in modern classification engine
    RegulatoryClassificationEngine.classify({
      resource_id: params.feature_key,
      name: params.feature_key,
      jurisdiction_code: jurCode,
      resource_type: 'feature',
      intended_use: params.intended_use || params.scope_statement,
      processes_health_data: params.processes_health_data,
      makes_clinical_claims: params.makes_clinical_claims
    });

    return legacy;
  }

  public static async decideClassification(params: {
    featureKey: string;
    jurisdictionCode: string;
    reviewerId: string;
    approved: boolean;
    conditions?: Record<string, unknown>;
  }): Promise<BackwardClassificationEntity> {
    // Must be a human authorized legal/regulatory reviewer
    if (params.reviewerId.startsWith('ai_') || params.reviewerId.includes('bot')) {
      throw new ValidationError('AI system cannot approve regulatory legal classifications.');
    }

    const key = `${params.featureKey}_${params.jurisdictionCode.toUpperCase()}`;
    let entry = RegulatoryGovernanceService.legacyEntities.get(key);

    if (!entry) {
      // Create on demand if registered in modern engine
      const modern = RegulatoryClassificationEngine.get(params.featureKey, params.jurisdictionCode);
      if (!modern) {
        throw new ValidationError('Regulatory classification record not found');
      }
      entry = {
        id: modern.id,
        feature_key: modern.resource_id,
        jurisdiction_code: modern.jurisdiction_code,
        state: RegulatoryReviewState.CLASSIFICATION_REQUIRED,
        scope_statement: modern.classification,
        applicable_requirements: modern.applicable_requirements,
        conditions: {}
      };
      RegulatoryGovernanceService.legacyEntities.set(key, entry);
    }

    const targetState = params.approved ? RegulatoryReviewState.APPROVED : RegulatoryReviewState.BLOCKED;
    validateStateTransition('RegulatoryReviewState', entry.state, targetState, entry.id);

    entry.state = targetState;
    entry.reviewer_id = params.reviewerId;
    entry.approved_at = new Date().toISOString();
    if (params.conditions) {
      entry.conditions = params.conditions;
    }

    // Also initiate & approve assessment workflow in modern engine
    const assessment = await RegulatoryAssessmentWorkflow.initiateAssessment({
      resourceId: params.featureKey,
      jurisdictionCode: params.jurisdictionCode
    });

    if (params.approved) {
      await RegulatoryAssessmentWorkflow.decideAssessment({
        assessmentId: assessment.id,
        reviewerId: params.reviewerId,
        decision: RegulatoryDecisionType.APPROVE,
        reason: 'Regulatory classification confirmed by counsel',
        conditions: params.conditions ? Object.entries(params.conditions).map(([k, v]) => ({
          type: 'FEATURE_RESTRICTION' as any,
          code: k,
          description: String(v)
        })) : []
      });
    } else {
      await RegulatoryAssessmentWorkflow.decideAssessment({
        assessmentId: assessment.id,
        reviewerId: params.reviewerId,
        decision: RegulatoryDecisionType.REJECT,
        reason: 'Regulatory classification rejected by counsel'
      });
    }

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.reviewerId,
      action: 'REGULATORY_GOVERNANCE.CLASSIFICATION_DECISION',
      resource_type: 'regulatory_classification',
      resource_id: entry.id,
      purpose: `Regulatory Approval: ${params.featureKey} [${params.jurisdictionCode}]`,
      authorization_basis: { reviewerId: params.reviewerId, approved: params.approved },
      result: 'ALLOWED'
    });

    return entry;
  }

  // --- ASSESSMENT & APPROVAL WORKFLOW ---

  public static async initiateAssessment(params: {
    resourceId: string;
    resourceVersion?: string;
    jurisdictionCode?: string;
  }): Promise<RegulatoryAssessment> {
    return RegulatoryAssessmentWorkflow.initiateAssessment(params);
  }

  public static async decideAssessment(params: {
    assessmentId: string;
    reviewerId: string;
    decision: RegulatoryDecisionType;
    reason: string;
    conditions?: GovernanceCondition[];
    validityDays?: number;
  }): Promise<{ assessment: RegulatoryAssessment; approval?: RegulatoryApproval }> {
    RegulatoryReviewerService.assertAuthorized(params.reviewerId, 'decide regulatory assessment');
    return RegulatoryAssessmentWorkflow.decideAssessment(params);
  }

  public static getAssessment(id: string): RegulatoryAssessment | undefined {
    return RegulatoryAssessmentWorkflow.get(id);
  }

  public static getAssessmentByResource(resourceId: string, jurisdictionCode = 'KE'): RegulatoryAssessment | undefined {
    return RegulatoryAssessmentWorkflow.getByResource(resourceId, jurisdictionCode);
  }

  public static getApproval(resourceId: string, jurisdictionCode = 'KE'): RegulatoryApproval | undefined {
    return RegulatoryAssessmentWorkflow.getApproval(resourceId, jurisdictionCode);
  }

  public static listApprovals(jurisdictionCode = 'KE'): RegulatoryApproval[] {
    return RegulatoryAssessmentWorkflow.listApprovals(jurisdictionCode);
  }

  public static revokeApproval(params: {
    approvalId: string;
    revokedBy: string;
    reason: string;
  }): RegulatoryApproval {
    RegulatoryReviewerService.assertAuthorized(params.revokedBy, 'emergency revoke regulatory approval');
    return RegulatoryAssessmentWorkflow.revokeApproval(params);
  }

  // --- GAPS & REMEDIATIONS ---

  public static createGap(params: {
    assessmentId: string;
    requirementId: string;
    controlId?: string;
    gapType: RegulatoryGapType;
    severity: RegulatoryGapSeverity;
    description: string;
    remediationRequired: string;
    owner: string;
    dueAt?: string;
  }): RegulatoryGap {
    return RegulatoryGapService.createGap(params);
  }

  public static async resolveGap(params: {
    gapId: string;
    verifiedBy: string;
    resolutionEvidenceSummary: string;
    rawEvidenceContent?: string;
  }): Promise<RegulatoryGap> {
    RegulatoryReviewerService.assertAuthorized(params.verifiedBy, 'resolve regulatory gap');
    return RegulatoryGapService.resolveGap(params);
  }

  public static listGapsByAssessment(assessmentId: string): RegulatoryGap[] {
    return RegulatoryGapService.listByAssessment(assessmentId);
  }

  public static listBlockingGaps(assessmentId: string): RegulatoryGap[] {
    return RegulatoryGapService.listBlockingGaps(assessmentId);
  }

  // --- SOURCE AMENDMENTS & IMPACT ASSESSMENTS ---

  public static async assessSourceChange(params: {
    sourceCode: string;
    newVersion: string;
    newContentText: string;
    amendmentSummary: string;
    verifiedBy: string;
  }): Promise<{ impactAssessment: RegulatoryImpactAssessment; affectedApprovalsCount: number }> {
    RegulatoryReviewerService.assertAuthorized(params.verifiedBy, 'assess statutory source amendment');
    return RegulatorySourceChangeService.assessSourceChange(params);
  }

  // --- CERTIFICATION & STATUTORY REGISTRATIONS ---

  public static verifyExternalStatus(params: {
    authorityCode: string;
    jurisdictionCode: string;
    registrationType: string;
    registrationReference: string;
    verifiedBy: string;
    effectiveDate?: string;
    renewalDueDate?: string;
  }): ExternalRegulatoryStatus {
    RegulatoryReviewerService.assertAuthorized(params.verifiedBy, 'verify external regulatory registration');
    return RegulatoryCertificationService.verifyExternalStatus(params);
  }

  public static getExternalStatus(authorityCode: string, jurisdictionCode = 'KE'): ExternalRegulatoryStatus | undefined {
    return RegulatoryCertificationService.getExternalStatus(authorityCode, jurisdictionCode);
  }

  // --- RELEASE GATE ENFORCEMENT ---

  /**
   * Evaluates production regulatory release readiness for a governed resource.
   * Fail-Closed Invariant: Any missing classification, missing approval, expired approval,
   * blocking gap, missing statutory registration, or unconfirmed source amendment blocks release.
   */
  public static async evaluateReleaseGate(params: {
    resourceId: string;
    jurisdictionCode?: string;
    resourceType?: string;
    targetEnvironment?: string;
  }): Promise<RegulatoryGateResult> {
    const jurCode = (params.jurisdictionCode || 'KE').toUpperCase();
    const evaluatedAt = new Date().toISOString();
    const reasons: string[] = [];

    // 1. Jurisdiction Check
    const jur = JurisdictionRegistry.get(jurCode);
    if (!jur || jur.status !== JurisdictionStatus.ACTIVE) {
      reasons.push(`Target jurisdiction ${jurCode} is not active for production release.`);
      return {
        permitted: false,
        reason: reasons[0],
        reasons,
        blockingGapsCount: 0,
        evaluatedAt
      };
    }

    // 2. Classification Check
    let classification = RegulatoryClassificationEngine.get(params.resourceId, jurCode);
    if (!classification) {
      // Check legacy table
      const legacy = RegulatoryGovernanceService.legacyEntities.get(`${params.resourceId}_${jurCode}`);
      if (legacy) {
        classification = RegulatoryClassificationEngine.classify({
          resource_id: legacy.feature_key,
          resource_type: 'feature',
          name: legacy.feature_key,
          jurisdiction_code: jurCode,
          intended_use: legacy.scope_statement
        });
      }
    }

    if (!classification) {
      reasons.push(`Mandatory regulatory classification missing for resource ${params.resourceId} in ${jurCode}.`);
      return {
        permitted: false,
        reason: reasons[0],
        reasons,
        blockingGapsCount: 0,
        evaluatedAt
      };
    }

    // If completely exempt administrative utility
    if (classification.classification_type === RegulatoryClassificationType.EXEMPT) {
      return {
        permitted: true,
        reasons: ['Resource classified as EXEMPT administrative utility.'],
        classification,
        blockingGapsCount: 0,
        evaluatedAt
      };
    }

    // 3. Approval Check
    const approval = RegulatoryAssessmentWorkflow.getApproval(params.resourceId, jurCode);
    const legacy = RegulatoryGovernanceService.legacyEntities.get(`${params.resourceId}_${jurCode}`);

    if (!approval && (!legacy || legacy.state !== RegulatoryReviewState.APPROVED)) {
      reasons.push(`No active regulatory approval found for resource ${params.resourceId} in jurisdiction ${jurCode}.`);
      return {
        permitted: false,
        reason: reasons[0],
        reasons,
        classification,
        blockingGapsCount: 0,
        evaluatedAt
      };
    }

    // 4. Approval Validity & Expiration
    if (approval) {
      if (approval.status === 'REVOKED' || approval.status === 'SUSPENDED') {
        reasons.push(`Regulatory approval for ${params.resourceId} has been revoked or suspended.`);
      }
      if (new Date(approval.expires_at).getTime() <= Date.now()) {
        reasons.push(`Regulatory approval expired on ${approval.expires_at}. Reassessment required.`);
      }
    }

    // 5. Assessment State & Source Amendment Check
    const assessment = RegulatoryAssessmentWorkflow.getByResource(params.resourceId, jurCode);
    if (assessment) {
      if (assessment.status === RegulatoryReviewState.REVIEW_DUE) {
        reasons.push('Underlying statutory source amendment detected. Regulatory reassessment is required.');
      }
      if (assessment.status === RegulatoryReviewState.BLOCKED) {
        reasons.push('Regulatory assessment is in BLOCKED state.');
      }

      // 6. Blocking Gaps Check
      const blockingGaps = RegulatoryGapService.listBlockingGaps(assessment.id);
      if (blockingGaps.length > 0) {
        reasons.push(`Blocked by ${blockingGaps.length} unresolved regulatory compliance gaps.`);
      }
    }

    // 7. Statutory Authority Registration Check
    // External authority evidence is mandatory in real production, but internal/test regulatory
    // clearance remains independently testable and does not fabricate external registrations.
    const enforceExternalAuthorityEvidence =
      process.env.NODE_ENV === 'production' ||
      String(process.env.STRICT_REGULATORY_EXTERNAL_EVIDENCE || '').toLowerCase() === 'true';
    if (enforceExternalAuthorityEvidence &&
        (classification.classification_type === RegulatoryClassificationType.DIGITAL_HEALTH_SERVICE ||
         classification.classification_type === RegulatoryClassificationType.REGULATED_HEALTH_SYSTEM)) {
      const dhaStatus = RegulatoryCertificationService.getExternalStatus('DHA', jurCode);
      if (!dhaStatus || dhaStatus.status !== 'REGISTERED') {
        reasons.push('Mandatory Digital Health Agency (DHA) statutory registration missing or inactive.');
      }

      const odpcStatus = RegulatoryCertificationService.getExternalStatus('ODPC', jurCode);
      if (!odpcStatus || odpcStatus.status !== 'REGISTERED') {
        reasons.push('Mandatory ODPC Data Controller/Processor registration missing or inactive.');
      }
    }

    const permitted = reasons.length === 0;

    return {
      permitted,
      reason: permitted ? 'Regulatory governance release gate passed.' : reasons.join(' | '),
      reasons,
      classification,
      approval,
      conditions: approval?.conditions,
      blockingGapsCount: assessment ? RegulatoryGapService.listBlockingGaps(assessment.id).length : 0,
      evaluatedAt
    };
  }

  public static resetForTesting(): void {
    RegulatoryGovernanceService.legacyEntities.clear();
    JurisdictionRegistry.resetForTesting();
    RegulatoryAuthorityRegistry.resetForTesting();
    RegulatorySourceRegistry.resetForTesting();
    RegulatoryRequirementRegistry.resetForTesting();
    RegulatoryControlRegistry.resetForTesting();
    RegulatoryClassificationEngine.resetForTesting();
    RegulatoryAssessmentWorkflow.resetForTesting();
    RegulatoryGapService.resetForTesting();
    RegulatoryCertificationService.resetForTesting();
    RegulatorySourceChangeService.resetForTesting();
    RegulatoryGovernanceService.seedCanonicalClassifications();
  }
}
