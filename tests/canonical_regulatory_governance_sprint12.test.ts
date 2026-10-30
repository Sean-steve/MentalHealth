/**
 * MindOS Sprint 12: Regulatory Governance Test Suite
 * Authority: Master Architecture Index, Volumes III, XV, & Appendix I (Kenya Regulatory Control Matrix)
 *
 * Verifies:
 * 1. Kenya Jurisdiction Profile & Authority Registries (ODPC, DHA, MOH, NC4, CAK, PPB)
 * 2. Statutory Sources & Cryptographic Content Hash Integrity
 * 3. Classification Engine, Intended Use Invariants & AI Autonomous Decision Prohibition
 * 4. Control Mapping, Evidence Vault Integration & Verification
 * 5. Assessment Lifecycle, Gap Remediation & Blocking Invariants
 * 6. Statutory Source Amendment & Impact Re-Assessment Trigger
 * 7. Production Release Gate & RegulatoryDecisionPort Fail-Closed Verification
 * 8. Emergency Revocation Transitions & Immediate Gate Closure
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  RegulatoryGovernanceService,
  JurisdictionRegistry,
  RegulatoryAuthorityRegistry,
  RegulatorySourceRegistry,
  RegulatoryRequirementRegistry,
  RegulatoryControlRegistry,
  RegulatoryClassificationEngine,
  RegulatoryAssessmentWorkflow,
  RegulatoryGapService,
  RegulatoryCertificationService,
  RegulatoryReviewerService,
  RegulatorySourceChangeService,
  JurisdictionStatus,
  RegulatoryClassificationType,
  RegulatoryDecisionType,
  RegulatoryGapType,
  RegulatoryGapSeverity,
  ControlEvidenceStatus,
  RegulatorySourceClassification
} from '../mindos/regulatory_governance/index.js';
import { DefaultRegulatoryGovernancePort } from '../mindos/platform/authorization/ports/governance.js';
import { RegulatoryReviewState } from '../mindos/platform/shared/state_machines.js';
import {
  RegulatoryBlockingGapError,
  RegulatoryReviewerUnauthorizedError,
  RegulatorySourceReviewRequiredError
} from '../mindos/platform/errors/index.js';

describe('MindOS Sprint 12: Regulatory Governance & Kenya Control Matrix', () => {
  beforeEach(() => {
    RegulatoryGovernanceService.resetForTesting();
  });

  describe('1. Kenya Jurisdiction Profile & Authority Registries', () => {
    test('Initializes Kenya (KE) as active, high-risk, default production jurisdiction', () => {
      const ke = JurisdictionRegistry.get('KE');
      assert.ok(ke, 'Kenya jurisdiction must be registered');
      assert.equal(ke.code, 'KE');
      assert.equal(ke.status, JurisdictionStatus.ACTIVE);
      assert.equal(ke.default_language, 'en');
      assert.equal(ke.timezone_reference, 'Africa/Nairobi');
      assert.ok(ke.metadata?.dha_mandatory);
      assert.ok(ke.metadata?.odpc_mandatory);
    });

    test('Registers canonical Kenyan statutory authorities with strict mandates', () => {
      const authorities = RegulatoryAuthorityRegistry.list('KE');
      assert.ok(authorities.length >= 6, 'Must register at least 6 canonical Kenyan authorities');

      const codes = authorities.map(a => a.code);
      assert.ok(codes.includes('ODPC'), 'ODPC must be registered');
      assert.ok(codes.includes('DHA'), 'DHA must be registered');
      assert.ok(codes.includes('MOH'), 'MOH must be registered');
      assert.ok(codes.includes('NC4'), 'NC4 must be registered');
      assert.ok(codes.includes('CAK'), 'CAK must be registered');
      assert.ok(codes.includes('PPB'), 'PPB must be registered');

      const odpc = RegulatoryAuthorityRegistry.get('ODPC', 'KE');
      assert.ok(odpc?.official_reference.includes('Data Protection Act'));

      const dha = RegulatoryAuthorityRegistry.get('DHA', 'KE');
      assert.ok(dha?.official_reference.includes('Digital Health Act'));
    });
  });

  describe('2. Authoritative Statutory Sources & Cryptographic Integrity', () => {
    test('Enforces official source status and computes SHA-256 content hashes', () => {
      const sources = RegulatorySourceRegistry.list('KE');
      assert.ok(sources.length >= 6);

      for (const src of sources) {
        assert.equal(
          src.classification,
          RegulatorySourceClassification.AUTHORITATIVE_OFFICIAL_SOURCE,
          `Source ${src.source_code} must be flagged as official source`
        );
        const latestVersion = RegulatorySourceRegistry.getLatestVersion(src.id);
        assert.ok(latestVersion, `Source ${src.source_code} must have a registered version`);
        assert.ok(latestVersion.content_hash.length === 64, `Source ${src.source_code} must have a valid SHA-256 hash`);
      }

      const dpa = RegulatorySourceRegistry.get('KE-SRC-DPA-2019');
      assert.ok(dpa);
      assert.equal(dpa.title, 'Data Protection Act, 2019');
      assert.ok(dpa.official_reference.includes('Act No. 24 of 2019'));
    });

    test('Maps statutory requirements to official sources with exact legal references', () => {
      const reqs = RegulatoryRequirementRegistry.list('KE');
      assert.ok(reqs.length >= 10, 'Must register comprehensive statutory requirements');

      const dpaHealthReq = RegulatoryRequirementRegistry.get('KE-REQ-PRIV-002');
      assert.ok(dpaHealthReq);
      assert.equal(dpaHealthReq.legal_reference, 'DPA 2019 Section 44');
      assert.equal(dpaHealthReq.mandatory, true);

      const dhaDataGovReq = RegulatoryRequirementRegistry.get('KE-REQ-DHA-002');
      assert.ok(dhaDataGovReq);
      assert.equal(dhaDataGovReq.legal_reference, 'DHA 2023 Section 47');
    });
  });

  describe('3. Classification Engine & Invariants', () => {
    test('Classifies administrative utilities as EXEMPT', () => {
      const classification = RegulatoryClassificationEngine.classify({
        resource_id: 'color_theme_toggle',
        resource_type: 'utility',
        name: 'Dark Mode Switch',
        jurisdiction_code: 'KE',
        intended_use: 'Client-side theme preference storage'
      });

      assert.equal(classification.classification_type, RegulatoryClassificationType.EXEMPT);
      assert.equal(classification.human_review_required, false);
      assert.equal(classification.applicable_requirements.length, 0);
    });

    test('Classifies health data processing as REGULATED_HEALTH_SYSTEM requiring human review', () => {
      const classification = RegulatoryClassificationEngine.classify({
        resource_id: 'mood_diary_service',
        resource_type: 'service',
        name: 'Mood Diary Assessment',
        jurisdiction_code: 'KE',
        intended_use: 'Captures mental health mood tracking and clinical context',
        processes_health_data: true
      });

      assert.equal(classification.classification_type, RegulatoryClassificationType.REGULATED_HEALTH_SYSTEM);
      assert.equal(classification.human_review_required, true);
      assert.ok(classification.applicable_requirements.includes('KE-REQ-PRIV-001'));
      assert.ok(classification.applicable_requirements.includes('KE-REQ-PRIV-002'));
    });

    test('Strict Invariant: Autonomous AI cannot decide regulatory legal classification', async () => {
      await assert.rejects(
        async () => {
          await RegulatoryGovernanceService.decideClassification({
            featureKey: 'mood_diary_service',
            jurisdictionCode: 'KE',
            reviewerId: 'ai_autonomous_reviewer_v1',
            approved: true
          });
        },
        /AI system cannot approve regulatory legal classifications/
      );
    });

    test('Rejects non-registered or unqualified human reviewer', async () => {
      await assert.rejects(
        async () => {
          RegulatoryReviewerService.assertAuthorized('junior_intern_01', 'regulatory review');
        },
        RegulatoryReviewerUnauthorizedError
      );
    });
  });

  describe('4. Regulatory Controls & Evidence Vault Linkage', () => {
    test('Registers controls mapped to statutory requirements with evidence types', () => {
      const controls = RegulatoryControlRegistry.list('KE');
      assert.ok(controls.length >= 8);

      const dpaConsentCtrl = RegulatoryControlRegistry.get('KE-CTRL-DPA-01');
      assert.ok(dpaConsentCtrl);
      assert.equal(dpaConsentCtrl.requirement_id, 'KE-REQ-PRIV-001');
      assert.equal(dpaConsentCtrl.verification_status, ControlEvidenceStatus.VERIFIED);
      assert.ok(dpaConsentCtrl.evidence_vault_ref);
    });
  });

  describe('5. Assessment Workflow, Gaps & Release Invariants', () => {
    test('Fail-Closed Invariant: Unresolved blocking gaps prevent regulatory approval', async () => {
      const assessment = await RegulatoryAssessmentWorkflow.initiateAssessment({
        resourceId: 'tele_therapy_bridge',
        jurisdictionCode: 'KE'
      });

      // Create a critical gap
      RegulatoryGapService.createGap({
        assessmentId: assessment.id,
        requirementId: 'KE-REQ-DHA-001',
        gapType: RegulatoryGapType.REGISTRATION_MISSING,
        severity: RegulatoryGapSeverity.CRITICAL,
        description: 'DHA Digital Health Sandbox validation certificate not yet granted',
        remediationRequired: 'Complete sandbox audit with DHA compliance team',
        owner: 'compliance_team'
      });

      // Attempting to approve must fail
      await assert.rejects(
        async () => {
          await RegulatoryAssessmentWorkflow.decideAssessment({
            assessmentId: assessment.id,
            reviewerId: 'lead_regulatory_counsel_ke',
            decision: RegulatoryDecisionType.APPROVE,
            reason: 'Premature sign-off'
          });
        },
        RegulatoryBlockingGapError
      );
    });

    test('Remediating gap with evidence enables qualified counsel approval', async () => {
      const assessment = await RegulatoryAssessmentWorkflow.initiateAssessment({
        resourceId: 'crisis_escalation_system',
        jurisdictionCode: 'KE'
      });

      const gap = RegulatoryGapService.createGap({
        assessmentId: assessment.id,
        requirementId: 'KE-REQ-HLTH-001',
        gapType: RegulatoryGapType.INSUFFICIENT_EVIDENCE,
        severity: RegulatoryGapSeverity.CRITICAL,
        description: 'MOH clinical protocol alignment missing written sign-off',
        remediationRequired: 'Upload MOH clinical psychologist confirmation letter',
        owner: 'chief_medical_officer'
      });

      // Resolve the gap with evidence
      const resolvedGap = await RegulatoryGapService.resolveGap({
        gapId: gap.id,
        verifiedBy: 'lead_regulatory_counsel_ke',
        resolutionEvidenceSummary: 'MOH Letter of Alignment ref MOH/MINDOS/2026/08 verified',
        rawEvidenceContent: 'Official MOH sign-off certificate content'
      });

      assert.equal(resolvedGap.status, 'RESOLVED');
      assert.ok(resolvedGap.evidence_vault_ref);

      // Now approval succeeds
      const result = await RegulatoryAssessmentWorkflow.decideAssessment({
        assessmentId: assessment.id,
        reviewerId: 'lead_regulatory_counsel_ke',
        decision: RegulatoryDecisionType.APPROVE_WITH_CONDITIONS,
        reason: 'Statutory compliance confirmed with MOH protocol alignment',
        conditions: [
          {
            type: 'CLAIM_RESTRICTION' as any,
            code: 'COND_MOH_CRISIS_DISCLOSURE',
            description: 'Explicit crisis escalation consent required'
          }
        ]
      });

      assert.equal(result.assessment.status, RegulatoryReviewState.APPROVED_WITH_CONDITIONS);
      assert.ok(result.approval);
      assert.equal(result.approval.status, 'ACTIVE');
      assert.ok(result.approval.evidence_vault_ref, 'Must generate Evidence Vault cryptographic reference');
    });
  });

  describe('6. Statutory Source Amendment & Automatic Re-Assessment Trigger', () => {
    test('Amending a statutory source automatically triggers REVIEW_DUE on all dependent approvals', async () => {
      // Setup approved feature
      const assessment = await RegulatoryAssessmentWorkflow.initiateAssessment({
        resourceId: 'mental_health_screening',
        jurisdictionCode: 'KE'
      });

      await RegulatoryAssessmentWorkflow.decideAssessment({
        assessmentId: assessment.id,
        reviewerId: 'lead_regulatory_counsel_ke',
        decision: RegulatoryDecisionType.APPROVE,
        reason: 'Approved under DPA 2019'
      });

      const approvalBefore = RegulatoryAssessmentWorkflow.getApproval('mental_health_screening', 'KE');
      assert.ok(approvalBefore);
      assert.equal(approvalBefore.status, 'ACTIVE');

      // Now ODPC issues an official amendment to the Data Protection Act
      const { impactAssessment, affectedApprovalsCount } = await RegulatorySourceChangeService.assessSourceChange({
        sourceCode: 'KE-SRC-DPA-2019',
        newVersion: '2026.1',
        newContentText: 'Amended Data Protection Act 2019 including heightened cross-border provisions',
        amendmentSummary: 'New Section 48B on cloud health processing cross-border restrictions',
        verifiedBy: 'lead_regulatory_counsel_ke'
      });

      assert.ok(impactAssessment);
      assert.ok(affectedApprovalsCount >= 1);

      // Verify assessment moved to REVIEW_DUE
      const updatedAssessment = RegulatoryAssessmentWorkflow.getByResource('mental_health_screening', 'KE');
      assert.equal(updatedAssessment?.status, RegulatoryReviewState.REVIEW_DUE);

      // Release gate must immediately block until reassessment
      const gateResult = await RegulatoryGovernanceService.evaluateReleaseGate({
        resourceId: 'mental_health_screening',
        jurisdictionCode: 'KE'
      });

      assert.equal(gateResult.permitted, false);
      assert.ok(gateResult.reason?.includes('amendment detected'));
    });
  });

  describe('7. Production Release Gate & RegulatoryDecisionPort Fail-Closed Verification', () => {
    test('Blocks unclassified resource with clear diagnosis', async () => {
      const port = new DefaultRegulatoryGovernancePort();
      const decision = await port.evaluateRegulatoryReadiness({
        actorId: 'ci_cd_deployment_pipeline',
        jurisdiction: 'KE',
        action: 'RELEASE',
        resourceType: 'feature',
        context: {
          resourceId: 'completely_unknown_unclassified_module',
          environment: 'production'
        }
      });

      assert.equal(decision.approved, false);
      assert.ok(decision.reason?.includes('Mandatory regulatory classification missing'));
    });

    test('Allows EXEMPT administrative utility without regulatory approval', async () => {
      RegulatoryClassificationEngine.classify({
        resource_id: 'locale_selector',
        resource_type: 'utility',
        name: 'Language Selector',
        jurisdiction_code: 'KE',
        intended_use: 'Select English or Kiswahili client display language'
      });

      const port = new DefaultRegulatoryGovernancePort();
      const decision = await port.evaluateRegulatoryReadiness({
        actorId: 'ci_cd_pipeline',
        jurisdiction: 'KE',
        action: 'RELEASE',
        resourceType: 'utility',
        context: {
          resourceId: 'locale_selector',
          environment: 'production'
        }
      });

      assert.equal(decision.approved, true);
      assert.ok(decision.reason?.includes('clearance verified'));
    });

    test('Allows approved canonical core_platform in Kenya jurisdiction', async () => {
      const port = new DefaultRegulatoryGovernancePort();
      const decision = await port.evaluateRegulatoryReadiness({
        actorId: 'release_manager_ke',
        jurisdiction: 'KE',
        action: 'RELEASE',
        resourceType: 'platform',
        context: {
          resourceId: 'core_platform',
          environment: 'production'
        }
      });

      assert.equal(decision.approved, true);
      assert.ok(decision.reviewId);
    });

    test('Emergency Revocation immediately shuts production release gate', async () => {
      const port = new DefaultRegulatoryGovernancePort();

      // Verify core_platform is initially allowed
      const initial = await port.evaluateRegulatoryReadiness({
        actorId: 'release_manager_ke',
        jurisdiction: 'KE',
        action: 'RELEASE',
        resourceType: 'platform',
        context: { resourceId: 'core_platform' }
      });
      assert.equal(initial.approved, true);

      // Regulatory officer triggers emergency revocation
      const approval = RegulatoryAssessmentWorkflow.getApproval('core_platform', 'KE');
      assert.ok(approval);

      RegulatoryGovernanceService.revokeApproval({
        approvalId: approval.id,
        revokedBy: 'lead_regulatory_counsel_ke',
        reason: 'Emergent non-compliance discovery during regulatory audit'
      });

      // Gate must now fail closed immediately
      const postRevocation = await port.evaluateRegulatoryReadiness({
        actorId: 'release_manager_ke',
        jurisdiction: 'KE',
        action: 'RELEASE',
        resourceType: 'platform',
        context: { resourceId: 'core_platform' }
      });

      assert.equal(postRevocation.approved, false);
      assert.ok(postRevocation.reason?.includes('revoked'));
    });

    test('Rejects deployment to unsupported/inactive jurisdiction', async () => {
      const gateResult = await RegulatoryGovernanceService.evaluateReleaseGate({
        resourceId: 'core_platform',
        jurisdictionCode: 'XX'
      });

      assert.equal(gateResult.permitted, false);
      assert.ok(gateResult.reason?.includes('not active'));
    });
  });
});
