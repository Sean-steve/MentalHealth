/**
 * MindOS Sprint 11: Canonical Privacy Governance Engine Test Suite
 * Authority: Master Architecture Index Section 7, Volumes I, III, VIII, XV & Appendices B / C / Q
 *            Kenya Data Protection Act 2019 & General Regulations 2021
 * 
 * Comprehensive Test Suite covering:
 * 1. Canonical Processing Activity Registry, Classification & Deterministic Fingerprinting
 * 2. Material Change Detection & Version Lifecycle
 * 3. DPIA Trigger Engine (KDPA Section 31 High-Risk Classification)
 * 4. Privacy Risk Scoring, Control Mitigation & Residual Risk Gates
 * 5. Separation of Duties (R-GOV-002 / KDPA DPO Independence)
 * 6. Executable Governance & Fail-Closed Release Gate Enforcement
 * 7. Privacy Reconciliation Daemon (Expiry & Drift Telemetry)
 * 8. Statutory Retention & Right to Erasure Conflict Resolution (KDPA Sec 40 vs Kenya Health Act 2017)
 * 9. Cross-Border Data Transfer Safeguards (KDPA Sec 48 & 49)
 * 10. Canonical Privacy Audit Report Generation
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  PrivacyGovernanceEngine,
  PrivacyGovernancePersistence,
  PrivacyGovernanceService,
  PrivacyFingerprintEngine,
  DPIATriggerEngine,
  PrivacyRiskModel,
  CrossBorderTransferEngine,
  PrivacyRetentionBridge,
  PrivacyGovernanceReconciliationDaemon,
  DataCategory,
  DataSubjectCategory,
  ProcessingPurpose,
  LawfulBasis,
  ProcessingActivityState,
  DPIAState,
  DPIATriggerResult,
  RiskLikelihood,
  RiskImpact,
  RiskLevel,
  ControlEffectiveness,
  PrivacyDecision,
  TransferBasis,
  NecessityAssessment,
  ProportionalityAssessment
} from '../mindos/privacy_governance/index.js';

import {
  PrivacyHighResidualRiskError,
  ValidationError
} from '../mindos/platform/errors/index.js';

import { DefaultPrivacyGovernancePort } from '../mindos/platform/authorization/ports/governance.js';

const canonicalNecessity: NecessityAssessment = {
  necessity_rationale: 'Direct care delivery and mental health triage',
  data_minimization_evaluated: true,
  can_use_less_sensitive_data: false,
  can_process_locally_on_device: false,
  retention_minimized: true,
  alternatives_considered: ['No viable alternative for clinical fidelity']
};

const canonicalProportionality: ProportionalityAssessment = {
  proportionality_rationale: 'Safeguards proportionate to clinical benefits',
  expected_user_benefit: 'Timely and accurate clinical intervention',
  intrusiveness_level: 'MODERATE',
  safeguards_adequate: true,
  subject_expectations_met: true
};

describe('MindOS Sprint 11: Canonical Privacy Governance Engine', () => {
  beforeEach(() => {
    PrivacyGovernancePersistence.resetMemoryState();
    PrivacyGovernanceService.resetForTesting();
  });

  // ---------------------------------------------------------------------------
  // 1. Processing Activity Registration & Deterministic Fingerprinting
  // ---------------------------------------------------------------------------
  describe('1. Processing Activity Registration & Deterministic Fingerprinting', () => {
    test('successfully registers canonical processing activity and computes SHA-256 fingerprint', async () => {
      const activity = await PrivacyGovernanceEngine.registerProcessingActivity({
        code: 'PA-CARE-CONSULT-001',
        name: 'Clinical Consultation Telehealth Support',
        description: 'Telehealth dialogue between licensed clinician and user',
        owner_domain: 'care',
        owner_id: 'usr-clinician-lead-01',
        data_subject_categories: [DataSubjectCategory.USERS, DataSubjectCategory.PROFESSIONALS],
        data_categories: [DataCategory.IDENTITY, DataCategory.CONTACT, DataCategory.CLINICAL_RECORDS, DataCategory.ASSESSMENT],
        special_categories: [DataCategory.CLINICAL_RECORDS],
        purposes: [ProcessingPurpose.CARE_DELIVERY, ProcessingPurpose.SAFETY_RESPONSE],
        lawful_basis: [LawfulBasis.EXPLICIT_CONSENT, LawfulBasis.HEALTHCARE_DIRECT],
        clinical_relevance: true,
        ai_involvement: false,
        processors: ['PROC-INFRA-GCP-001']
      });

      assert.equal(activity.code, 'PA-CARE-CONSULT-001');
      assert.equal(activity.version, 1);
      assert.equal(activity.status, ProcessingActivityState.DPIA_REQUIRED); // Health data triggers mandatory DPIA
      assert.ok(activity.fingerprint);
      assert.equal(activity.fingerprint.length, 64); // SHA-256 hex string

      // Verify persistence
      const retrieved = await PrivacyGovernancePersistence.getActivityByCode('PA-CARE-CONSULT-001');
      assert.ok(retrieved);
      assert.equal(retrieved?.id, activity.id);
    });

    test('fingerprint is strictly deterministic and detects configuration tampering', () => {
      const specA = {
        code: 'PA-TEST-001',
        data_categories: [DataCategory.IDENTITY, DataCategory.JOURNAL],
        purposes: [ProcessingPurpose.CARE_DELIVERY],
        lawful_basis: [LawfulBasis.EXPLICIT_CONSENT],
        automated_processing: false
      };

      const specB = {
        code: 'PA-TEST-001',
        data_categories: [DataCategory.IDENTITY, DataCategory.JOURNAL],
        purposes: [ProcessingPurpose.CARE_DELIVERY],
        lawful_basis: [LawfulBasis.EXPLICIT_CONSENT],
        automated_processing: false
      };

      const fpA = PrivacyFingerprintEngine.computeFingerprint(specA);
      const fpB = PrivacyFingerprintEngine.computeFingerprint(specB);
      assert.equal(fpA, fpB);

      // Mutate spec
      const specMutated = { ...specA, automated_processing: true };
      const fpMutated = PrivacyFingerprintEngine.computeFingerprint(specMutated);
      assert.notEqual(fpA, fpMutated);
    });

    test('rejects registration missing mandatory attributes under KDPA Section 31', async () => {
      await assert.rejects(
        async () => {
          await PrivacyGovernanceEngine.registerProcessingActivity({
            code: '',
            name: 'Incomplete Activity',
            description: 'Missing code and owner',
            owner_domain: 'care',
            owner_id: '',
            data_subject_categories: [],
            data_categories: [],
            purposes: [],
            lawful_basis: []
          });
        },
        ValidationError
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Material Change Detection & Version Lifecycle
  // ---------------------------------------------------------------------------
  describe('2. Material Change Detection & Version Lifecycle', () => {
    test('introducing sensitive category, AI, or profiling triggers material change and increments version', async () => {
      const activity = await PrivacyGovernanceEngine.registerProcessingActivity({
        code: 'PA-JOURNAL-001',
        name: 'Private Journaling Service',
        description: 'User reflective journal',
        owner_domain: 'wellness',
        owner_id: 'usr-dev-01',
        data_subject_categories: [DataSubjectCategory.USERS],
        data_categories: [DataCategory.IDENTITY, DataCategory.JOURNAL],
        purposes: [ProcessingPurpose.CARE_DELIVERY],
        lawful_basis: [LawfulBasis.EXPLICIT_CONSENT]
      });

      assert.equal(activity.version, 1);

      // Non-material update (e.g. updating description)
      const nonMaterial = await PrivacyGovernanceEngine.updateProcessingActivity(
        activity.id,
        { description: 'Updated editorial description of reflective journal' },
        'usr-dev-01'
      );
      assert.equal(nonMaterial.version, 1);

      // Material update (introducing AI inference and new purpose)
      const materialUpdated = await PrivacyGovernanceEngine.updateProcessingActivity(
        activity.id,
        {
          ai_involvement: true,
          purposes: [ProcessingPurpose.CARE_DELIVERY, ProcessingPurpose.AI_SUPPORT],
          data_categories: [DataCategory.IDENTITY, DataCategory.JOURNAL, DataCategory.AI_DERIVED_METADATA]
        },
        'usr-dev-01'
      );

      assert.equal(materialUpdated.version, 2);
      assert.equal(materialUpdated.status, ProcessingActivityState.DPIA_REQUIRED);

      // Verify versions persisted
      const versions = await PrivacyGovernancePersistence.getVersions(activity.id);
      assert.equal(versions.length, 2);
      assert.equal(versions[1].version, 2);
      assert.equal(versions[1].is_material_change, true);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Canonical DPIA Trigger Engine (KDPA Section 31)
  // ---------------------------------------------------------------------------
  describe('3. Canonical DPIA Trigger Engine', () => {
    test('health data, AI inference, and profiling mandate DPIA', () => {
      const result = DPIATriggerEngine.evaluate({
        data_categories: [DataCategory.ASSESSMENT, DataCategory.IDENTITY],
        clinical_relevance: true,
        ai_involvement: true,
        profiling: true
      });

      assert.equal(result.result, DPIATriggerResult.DPIA_REQUIRED);
      assert.ok(result.factors.has_health_or_sensitive_data);
      assert.ok(result.factors.has_ai_or_automated_decisions);
      assert.ok(result.factors.has_profiling);
      assert.ok(result.factors.reasons.length >= 3);
    });

    test('benign non-sensitive data without AI returns DPIA_NOT_REQUIRED', () => {
      const result = DPIATriggerEngine.evaluate({
        data_categories: [DataCategory.IDENTITY],
        purposes: [ProcessingPurpose.PLATFORM_OPERATION],
        ai_involvement: false,
        profiling: false,
        clinical_relevance: false,
        recipients: [],
        transfer_locations: ['KE']
      });

      assert.equal(result.result, DPIATriggerResult.DPIA_NOT_REQUIRED);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Privacy Risk Scoring, Control Mitigation & Residual Risk Gates
  // ---------------------------------------------------------------------------
  describe('4. Privacy Risk Scoring, Control Mitigation & Residual Risk Gates', () => {
    test('calculates inherent risk and reduces residual risk via effective mitigating controls', () => {
      // Inherent: Likelihood HIGH (3) * Impact CRITICAL (4) = CRITICAL (12/16)
      const inherent = PrivacyRiskModel.calculateRiskLevel(RiskLikelihood.HIGH, RiskImpact.CRITICAL);
      assert.equal(inherent, RiskLevel.CRITICAL);

      // Apply controls
      const mitigated = PrivacyRiskModel.calculateResidualRisk(
        RiskLikelihood.HIGH,
        RiskImpact.CRITICAL,
        [
          { effectiveness: ControlEffectiveness.HIGHLY_EFFECTIVE }, // KMS encryption
          { effectiveness: ControlEffectiveness.EFFECTIVE }          // Pseudonymization
        ]
      );

      assert.ok(mitigated.residual_risk === RiskLevel.LOW || mitigated.residual_risk === RiskLevel.MODERATE);
    });

    test('blocks DPIA approval when residual risk remains HIGH or CRITICAL', async () => {
      const activity = await PrivacyGovernanceEngine.registerProcessingActivity({
        code: 'PA-UNMITIGATED-001',
        name: 'High Risk Unmitigated Activity',
        description: 'Unmitigated automated mental health risk profiling',
        owner_domain: 'research',
        owner_id: 'usr-researcher-01',
        data_subject_categories: [DataSubjectCategory.USERS],
        data_categories: [DataCategory.ASSESSMENT, DataCategory.AI_DERIVED_METADATA],
        purposes: [ProcessingPurpose.AI_SUPPORT],
        lawful_basis: [LawfulBasis.EXPLICIT_CONSENT],
        profiling: true,
        ai_involvement: true
      });

      // Submit DPIA with zero effective controls leaving residual risk CRITICAL
      const dpia = await PrivacyGovernanceEngine.submitDPIA(activity.id, {
        scope: 'Automated profiling of user distress signals',
        purpose: 'AI psychological triage',
        necessity_assessment: canonicalNecessity,
        proportionality_assessment: canonicalProportionality,
        requested_by: 'usr-researcher-01',
        risks: [
          {
            risk_code: 'RSK-UNMIT-001',
            threat_event: 'Unauthorized algorithmic diagnosis disclosure',
            risk_dimension: 'CONFIDENTIALITY',
            affected_data: [DataCategory.ASSESSMENT],
            affected_subjects: [DataSubjectCategory.USERS],
            likelihood: RiskLikelihood.CRITICAL,
            impact: RiskImpact.CRITICAL,
            controls: [
              { control_code: 'NONE', effectiveness: ControlEffectiveness.INEFFECTIVE }
            ],
            owner: 'usr-researcher-01'
          }
        ]
      });

      assert.equal(dpia.residual_risk, RiskLevel.CRITICAL);

      // Attempt approval by Data Protection Officer -> MUST FAIL with PrivacyHighResidualRiskError
      await assert.rejects(
        async () => {
          await PrivacyGovernanceEngine.decideDPIA(
            dpia.id,
            PrivacyDecision.APPROVE,
            { id: 'usr-dpo-officer-01', roles: ['ROLE_DATA_PROTECTION_OFFICER'] }
          );
        },
        PrivacyHighResidualRiskError
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Separation of Duties & Reviewer Eligibility (KDPA Section 24)
  // ---------------------------------------------------------------------------
  describe('5. Separation of Duties & Reviewer Eligibility', () => {
    test('activity owner is strictly forbidden from approving their own DPIA', async () => {
      const activity = await PrivacyGovernanceEngine.registerProcessingActivity({
        code: 'PA-SELF-APPROVE-001',
        name: 'Self Approver Test Activity',
        description: 'Test separation of duties',
        owner_domain: 'care',
        owner_id: 'usr-dual-role-01', // User is both author and DPO
        data_subject_categories: [DataSubjectCategory.USERS],
        data_categories: [DataCategory.JOURNAL],
        purposes: [ProcessingPurpose.CARE_DELIVERY],
        lawful_basis: [LawfulBasis.EXPLICIT_CONSENT]
      });

      const dpia = await PrivacyGovernanceEngine.submitDPIA(activity.id, {
        scope: 'Journal analysis',
        purpose: 'Care delivery',
        necessity_assessment: canonicalNecessity,
        proportionality_assessment: canonicalProportionality,
        requested_by: 'usr-dual-role-01',
        risks: [
          {
            risk_code: 'RSK-001',
            threat_event: 'Data leak',
            risk_dimension: 'CONFIDENTIALITY',
            affected_data: [DataCategory.JOURNAL],
            affected_subjects: [DataSubjectCategory.USERS],
            likelihood: RiskLikelihood.LOW,
            impact: RiskImpact.LOW,
            controls: [{ control_code: 'PC-TECH-001', effectiveness: ControlEffectiveness.HIGHLY_EFFECTIVE }],
            owner: 'usr-dual-role-01'
          }
        ]
      });

      // User attempts to approve their own activity
      await assert.rejects(
        async () => {
          await PrivacyGovernanceEngine.decideDPIA(
            dpia.id,
            PrivacyDecision.APPROVE,
            { id: 'usr-dual-role-01', roles: ['ROLE_DATA_PROTECTION_OFFICER'] }
          );
        },
        (err: Error) => {
          assert.match(err.message, /Separation of Duties Violation/);
          return true;
        }
      );
    });

    test('non-DPO role cannot approve DPIA', async () => {
      const activity = await PrivacyGovernanceEngine.registerProcessingActivity({
        code: 'PA-ROLE-CHECK-001',
        name: 'Role Check Activity',
        description: 'Testing role authorization',
        owner_domain: 'care',
        owner_id: 'usr-owner-01',
        data_subject_categories: [DataSubjectCategory.USERS],
        data_categories: [DataCategory.JOURNAL],
        purposes: [ProcessingPurpose.CARE_DELIVERY],
        lawful_basis: [LawfulBasis.EXPLICIT_CONSENT]
      });

      const dpia = await PrivacyGovernanceEngine.submitDPIA(activity.id, {
        scope: 'Test scope',
        purpose: 'Test purpose',
        necessity_assessment: canonicalNecessity,
        proportionality_assessment: canonicalProportionality,
        requested_by: 'usr-owner-01',
        risks: []
      });

      await assert.rejects(
        async () => {
          await PrivacyGovernanceEngine.decideDPIA(
            dpia.id,
            PrivacyDecision.APPROVE,
            { id: 'usr-developer-01', roles: ['ROLE_SOFTWARE_ENGINEER'] } // Unauthorized role
          );
        },
        (err: Error) => {
          assert.match(err.message, /lacks required Data Protection Officer role/);
          return true;
        }
      );
    });

    test('independent Data Protection Officer successfully approves valid low-residual-risk DPIA', async () => {
      const activity = await PrivacyGovernanceEngine.registerProcessingActivity({
        code: 'PA-VALID-001',
        name: 'Valid Governed Assessment',
        description: 'Validated psychometric instrument scoring',
        owner_domain: 'care',
        owner_id: 'usr-author-01',
        data_subject_categories: [DataSubjectCategory.USERS],
        data_categories: [DataCategory.ASSESSMENT, DataCategory.IDENTITY],
        purposes: [ProcessingPurpose.CARE_DELIVERY],
        lawful_basis: [LawfulBasis.EXPLICIT_CONSENT]
      });

      const dpia = await PrivacyGovernanceEngine.submitDPIA(activity.id, {
        scope: 'Validated scoring for PHQ-9 depression scale',
        purpose: 'Initial clinical assessment',
        necessity_assessment: canonicalNecessity,
        proportionality_assessment: canonicalProportionality,
        requested_by: 'usr-author-01',
        risks: [
          {
            risk_code: 'RSK-SCORE-001',
            threat_event: 'Transit interception of assessment scores',
            risk_dimension: 'CONFIDENTIALITY',
            affected_data: [DataCategory.ASSESSMENT],
            affected_subjects: [DataSubjectCategory.USERS],
            likelihood: RiskLikelihood.MEDIUM,
            impact: RiskImpact.MEDIUM,
            controls: [
              { control_code: 'PC-TECH-001', effectiveness: ControlEffectiveness.HIGHLY_EFFECTIVE },
              { control_code: 'PC-TECH-002', effectiveness: ControlEffectiveness.HIGHLY_EFFECTIVE }
            ],
            owner: 'usr-sec-01'
          }
        ]
      });

      assert.equal(dpia.residual_risk, RiskLevel.LOW);

      const decisionResult = await PrivacyGovernanceEngine.decideDPIA(
        dpia.id,
        PrivacyDecision.APPROVE,
        { id: 'usr-dpo-official-01', roles: ['ROLE_DATA_PROTECTION_OFFICER'] },
        { conditions: ['Annual re-audit', 'Zero raw log persistence'] }
      );

      assert.equal(decisionResult.dpia.status, DPIAState.APPROVED);
      assert.ok(decisionResult.approval);
      assert.equal(decisionResult.approval.decision, PrivacyDecision.APPROVE);
      assert.equal(decisionResult.approval.status, 'ACTIVE');
      assert.ok(decisionResult.approval.approved_at);

      // Verify activity transitioned to APPROVED
      const updatedActivity = await PrivacyGovernancePersistence.getActivityById(activity.id);
      assert.equal(updatedActivity?.status, ProcessingActivityState.APPROVED);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Executable Governance & Fail-Closed Release Gate Enforcement
  // ---------------------------------------------------------------------------
  describe('6. Executable Governance & Fail-Closed Release Gate Enforcement', () => {
    test('unregistered processing activity fails release gate', async () => {
      const port = new DefaultPrivacyGovernancePort();
      const decision = await port.evaluatePrivacyCompliance({
        actorId: 'usr-svc-api',
        resourceType: 'clinical_consultation',
        action: 'EXECUTE_PROCESSING',
        context: {
          processingActivityCode: 'PA-NON-EXISTENT-999'
        }
      });

      assert.equal(decision.approved, false);
      assert.match(decision.reason, /PRIVACY_PROCESSING_NOT_REGISTERED/);
    });

    test('registered but unapproved version fails release gate', async () => {
      const activity = await PrivacyGovernanceEngine.registerProcessingActivity({
        code: 'PA-PENDING-001',
        name: 'Pending Activity',
        description: 'Waiting for review',
        owner_domain: 'care',
        owner_id: 'usr-dev-01',
        data_subject_categories: [DataSubjectCategory.USERS],
        data_categories: [DataCategory.IDENTITY, DataCategory.ASSESSMENT],
        purposes: [ProcessingPurpose.CARE_DELIVERY],
        lawful_basis: [LawfulBasis.EXPLICIT_CONSENT]
      });

      const port = new DefaultPrivacyGovernancePort();
      const decision = await port.evaluatePrivacyCompliance({
        actorId: 'usr-svc-api',
        resourceType: 'telehealth',
        action: 'EXECUTE_PROCESSING',
        context: {
          processingActivityCode: activity.code,
          activityVersion: 1
        }
      });

      assert.equal(decision.approved, false);
      assert.match(decision.reason, /PRIVACY_PROCESSING_VERSION_NOT_APPROVED/);
    });

    test('approved processing activity with active certificate passes release gate', async () => {
      // 1. Register
      const activity = await PrivacyGovernanceEngine.registerProcessingActivity({
        code: 'PA-PROD-TELEHEALTH-001',
        name: 'Production Telehealth Consultation',
        description: 'Secure live session',
        owner_domain: 'care',
        owner_id: 'usr-care-author-01',
        data_subject_categories: [DataSubjectCategory.USERS, DataSubjectCategory.PROFESSIONALS],
        data_categories: [DataCategory.IDENTITY, DataCategory.CONTACT, DataCategory.CLINICAL_RECORDS],
        purposes: [ProcessingPurpose.CARE_DELIVERY],
        lawful_basis: [LawfulBasis.EXPLICIT_CONSENT],
        processors: ['PROC-INFRA-GCP-001']
      });

      // 2. Submit DPIA
      const dpia = await PrivacyGovernanceEngine.submitDPIA(activity.id, {
        scope: 'Telehealth clinical consult',
        purpose: 'Direct clinical care',
        necessity_assessment: canonicalNecessity,
        proportionality_assessment: canonicalProportionality,
        requested_by: 'usr-care-author-01',
        risks: [
          {
            risk_code: 'RSK-TH-001',
            threat_event: 'In-transit breach',
            risk_dimension: 'CONFIDENTIALITY',
            affected_data: [DataCategory.CLINICAL_RECORDS],
            affected_subjects: [DataSubjectCategory.USERS],
            likelihood: RiskLikelihood.LOW,
            impact: RiskImpact.MEDIUM,
            controls: [{ control_code: 'PC-TECH-002', effectiveness: ControlEffectiveness.HIGHLY_EFFECTIVE }],
            owner: 'usr-sec-lead'
          }
        ]
      });

      // 3. DPO Approval
      await PrivacyGovernanceEngine.decideDPIA(
        dpia.id,
        PrivacyDecision.APPROVE,
        { id: 'usr-dpo-officer-01', roles: ['ROLE_DATA_PROTECTION_OFFICER'] }
      );

      // 4. Test release gate through DefaultPrivacyGovernancePort
      const port = new DefaultPrivacyGovernancePort();
      const decision = await port.evaluatePrivacyCompliance({
        actorId: 'usr-gateway-service',
        resourceType: 'telehealth_session',
        action: 'START_SESSION',
        context: {
          processingActivityCode: 'PA-PROD-TELEHEALTH-001',
          activityVersion: 1,
          processorCodes: ['PROC-INFRA-GCP-001']
        }
      });

      assert.equal(decision.approved, true);
      assert.match(decision.reason, /release gate passed with active approval certificate/);
      assert.ok(decision.reviewId);
    });

    test('revoked approval immediately fails release gate', async () => {
      const activity = await PrivacyGovernanceEngine.registerProcessingActivity({
        code: 'PA-REVOKE-TEST-001',
        name: 'Revocation Test Activity',
        description: 'Test revocation behavior',
        owner_domain: 'care',
        owner_id: 'usr-author-99',
        data_subject_categories: [DataSubjectCategory.USERS],
        data_categories: [DataCategory.IDENTITY],
        purposes: [ProcessingPurpose.CARE_DELIVERY],
        lawful_basis: [LawfulBasis.EXPLICIT_CONSENT]
      });

      const dpia = await PrivacyGovernanceEngine.submitDPIA(activity.id, {
        scope: 'Test',
        purpose: 'Test',
        necessity_assessment: canonicalNecessity,
        proportionality_assessment: canonicalProportionality,
        requested_by: 'usr-author-99',
        risks: []
      });

      await PrivacyGovernanceEngine.decideDPIA(
        dpia.id,
        PrivacyDecision.APPROVE,
        { id: 'usr-dpo-01', roles: ['ROLE_DATA_PROTECTION_OFFICER'] }
      );

      // Revoke approval urgently
      await PrivacyGovernanceEngine.revokeApproval(
        activity.id,
        1,
        'usr-dpo-01',
        'Discovered unapproved subprocessor data ingestion'
      );

      const port = new DefaultPrivacyGovernancePort();
      const decision = await port.evaluatePrivacyCompliance({
        actorId: 'usr-gateway-service',
        resourceType: 'session',
        action: 'EXECUTE',
        context: {
          processingActivityCode: 'PA-REVOKE-TEST-001',
          activityVersion: 1
        }
      });

      assert.equal(decision.approved, false);
      assert.match(decision.reason, /PRIVACY_APPROVAL_REVOKED/);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Privacy Reconciliation Daemon & Expiry
  // ---------------------------------------------------------------------------
  describe('7. Privacy Reconciliation Daemon & Expiry', () => {
    test('reconciliation daemon detects expired approval, marks EXPIRED, and halts release gate', async () => {
      const activity = await PrivacyGovernanceEngine.registerProcessingActivity({
        code: 'PA-EXPIRE-TEST-001',
        name: 'Expiry Test Activity',
        description: 'Short validity window',
        owner_domain: 'care',
        owner_id: 'usr-author-01',
        data_subject_categories: [DataSubjectCategory.USERS],
        data_categories: [DataCategory.IDENTITY],
        purposes: [ProcessingPurpose.CARE_DELIVERY],
        lawful_basis: [LawfulBasis.EXPLICIT_CONSENT]
      });

      const dpia = await PrivacyGovernanceEngine.submitDPIA(activity.id, {
        scope: 'Test',
        purpose: 'Test',
        necessity_assessment: canonicalNecessity,
        proportionality_assessment: canonicalProportionality,
        requested_by: 'usr-author-01',
        risks: []
      });

      // Approve with negative validity days (already expired in past)
      await PrivacyGovernanceEngine.decideDPIA(
        dpia.id,
        PrivacyDecision.APPROVE,
        { id: 'usr-dpo-01', roles: ['ROLE_DATA_PROTECTION_OFFICER'] },
        { validity_days: -1 } // Expired yesterday
      );

      // Run reconciliation check
      const recon = await PrivacyGovernanceReconciliationDaemon.reconcileOnce();
      assert.ok(recon.expired_approvals >= 1);
      assert.equal(recon.drift_detected, true);

      // Release gate must now deny execution due to expiration
      const port = new DefaultPrivacyGovernancePort();
      const decision = await port.evaluatePrivacyCompliance({
        actorId: 'usr-gateway',
        resourceType: 'telehealth',
        action: 'EXECUTE',
        context: { processingActivityCode: 'PA-EXPIRE-TEST-001' }
      });

      assert.equal(decision.approved, false);
      assert.match(decision.reason, /PRIVACY_APPROVAL_EXPIRED/);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Statutory Retention & Right to Erasure Conflict Resolution
  // ---------------------------------------------------------------------------
  describe('8. Statutory Retention & Right to Erasure Conflict Resolution (KDPA Section 40)', () => {
    test('resolves erasure request: non-statutory categories deleted, statutory clinical categories held', () => {
      // User requests erasure of: IDENTITY, JOURNAL, ASSESSMENT, CLINICAL_RECORDS
      const requested = [
        DataCategory.IDENTITY,
        DataCategory.JOURNAL,
        DataCategory.ASSESSMENT,
        DataCategory.CLINICAL_RECORDS
      ];

      const resolution = PrivacyRetentionBridge.resolveErasureRequest(requested);

      // JOURNAL & IDENTITY can be deleted
      assert.ok(resolution.deleted_categories.includes(DataCategory.JOURNAL));
      assert.ok(resolution.deleted_categories.includes(DataCategory.IDENTITY));

      // ASSESSMENT & CLINICAL_RECORDS must be held under Kenya Health Act 2017 Sec 11 (10 years)
      assert.equal(resolution.retained_categories.length, 2);
      const clinicalHold = resolution.retained_categories.find((r) => r.category === DataCategory.CLINICAL_RECORDS);
      assert.ok(clinicalHold);
      assert.match(clinicalHold.statutory_hold_reason, /Kenya Health Act 2017 Section 11/);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Cross-Border Data Transfer Safeguards (KDPA Sec 48 & 49)
  // ---------------------------------------------------------------------------
  describe('9. Cross-Border Data Transfer Safeguards', () => {
    test('transborder transfer of health data outside Kenya requires explicit consent and safeguards', () => {
      // Transfer of AI conversation turns to US with Standard Contractual Clauses and approved review
      const permittedEval = CrossBorderTransferEngine.evaluateTransfer({
        origin_jurisdiction: 'KE',
        destination_jurisdiction: 'US',
        data_categories: [DataCategory.AI_CONVERSATION],
        transfer_basis: TransferBasis.STANDARD_CONTRACTUAL_CLAUSES,
        safeguards: ['ENCRYPTION_TLS13', 'ZERO_VENDOR_RETENTION_DPA'],
        review_status: 'APPROVED'
      });

      assert.equal(permittedEval.permitted, true);
      assert.equal(permittedEval.requires_explicit_consent, true); // Health sensitive data mandates explicit consent

      // Transfer lacking approved status or safeguards
      const blockedEval = CrossBorderTransferEngine.evaluateTransfer({
        origin_jurisdiction: 'KE',
        destination_jurisdiction: 'US',
        data_categories: [DataCategory.CLINICAL_RECORDS],
        transfer_basis: TransferBasis.STANDARD_CONTRACTUAL_CLAUSES,
        safeguards: [], // Missing safeguards!
        review_status: 'PENDING_REVIEW'
      });

      assert.equal(blockedEval.permitted, false);
      assert.ok(blockedEval.reasons.length >= 2);
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Canonical Privacy Audit Report Generation
  // ---------------------------------------------------------------------------
  describe('10. Canonical Privacy Audit Report Generation', () => {
    test('generates comprehensive regulatory audit report answering why processing was permitted', async () => {
      const activity = await PrivacyGovernanceEngine.registerProcessingActivity({
        code: 'PA-AUDIT-REPORT-001',
        name: 'Audit Reporting Demonstration',
        description: 'Sample governed activity for regulatory audit',
        owner_domain: 'care',
        owner_id: 'usr-author-audit',
        data_subject_categories: [DataSubjectCategory.USERS],
        data_categories: [DataCategory.IDENTITY, DataCategory.CONTACT],
        purposes: [ProcessingPurpose.CARE_DELIVERY],
        lawful_basis: [LawfulBasis.EXPLICIT_CONSENT]
      });

      const dpia = await PrivacyGovernanceEngine.submitDPIA(activity.id, {
        scope: 'Audit scope',
        purpose: 'Care delivery',
        necessity_assessment: canonicalNecessity,
        proportionality_assessment: canonicalProportionality,
        requested_by: 'usr-author-audit',
        risks: []
      });

      await PrivacyGovernanceEngine.decideDPIA(
        dpia.id,
        PrivacyDecision.APPROVE,
        { id: 'usr-dpo-auditor', roles: ['ROLE_DATA_PROTECTION_OFFICER'] },
        { conditions: ['Quarterly review'] }
      );

      const report = await PrivacyGovernanceEngine.generateAuditReport('PA-AUDIT-REPORT-001');

      assert.equal(report.activity_code, 'PA-AUDIT-REPORT-001');
      assert.equal(report.is_permitted, true);
      assert.equal(report.status, ProcessingActivityState.APPROVED);
      assert.ok(report.approval_details);
      assert.equal(report.approval_details.reviewer_id, 'usr-dpo-auditor');
      assert.deepEqual(report.approval_details.conditions, ['Quarterly review']);
      assert.ok(report.reasons.some((r) => r.includes('Permitted under valid Privacy Approval')));
    });
  });
});
