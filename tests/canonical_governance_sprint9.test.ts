/**
 * MindOS Canonical Governance Kernel & Release Gates Test Suite (Sprint 9)
 * Authority: Master Architecture Index Section 7, Volumes III, XIV, XV & Appendices B / C / Q
 *
 * Invariants Tested:
 * - R-GOV-001: Clinical, DPIA, Regulatory, AI Safety, Security, and QA are first-class persistent domains.
 * - R-GOV-002: Feature authors/initiators SHALL NOT self-approve mandatory governance gates (Separation of Duties).
 * - R-QA-001: Unresolved critical safety, security, privacy or governance blocker SHALL prevent production authorization.
 * - Fail-Closed: "No required governance approval = no governed production activation."
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  GovernanceOrchestrator,
  GovernedResourceType,
  GovernanceDomain,
  GovernanceRequirementEngine,
  GovernanceDecisionEngine,
  ReleaseGateService,
  GovernanceRepository,
  ReleaseAuthorizationStatus
} from '../mindos/governance/index.js';
import { GovernanceDecision } from '../mindos/platform/shared/state_machines.js';
import { AuditService } from '../mindos/platform/audit/index.js';
import { EventBus } from '../mindos/platform/events/index.js';
import { FeatureFlagService } from '../mindos/platform/features/index.js';
import { AuthorizationError, GovernanceBlockedError } from '../mindos/platform/errors/index.js';
import { generateUUIDv7 } from '../mindos/platform/database/uuid.js';

describe('MindOS Governance Kernel & Release Gate Engine (Sprint 9)', () => {
  beforeEach(() => {
    GovernanceOrchestrator.resetForTesting();
    AuditService.resetForTesting();
    EventBus.resetForTesting();
    FeatureFlagService.resetForTesting();
  });

  describe('1. Governed Resource Registry & Multi-Dimensional Risk Classification', () => {
    test('Classifies standard non-clinical feature with mandatory baseline security and QA gates', async () => {
      const { resource, riskAssessment } = await GovernanceOrchestrator.registerGovernedResource({
        resource_key: 'telehealth.chat_reactions',
        resource_type: GovernedResourceType.FEATURE_FLAG,
        name: 'Chat Emoji Reactions',
        description: 'Enables interactive emoji reactions in appointment chat',
        owner_id: 'engineer_01'
      });

      assert.equal(resource.clinical_risk_class, 'CR-0');
      assert.equal(resource.ai_risk_class, 'AI-R0');
      assert.equal(resource.privacy_risk_class, 'LOW');
      assert.equal(resource.requires_clinical_review, false);
      assert.equal(resource.requires_dpia, false);
      assert.equal(resource.requires_security_review, true);
      assert.equal(resource.requires_qa_review, true);

      // Baseline requires security and QA
      assert.ok(riskAssessment.mandated_domains.includes(GovernanceDomain.SECURITY_GOVERNANCE));
      assert.ok(riskAssessment.mandated_domains.includes(GovernanceDomain.QA_GOVERNANCE));
    });

    test('Classifies supportive clinical care feature as CR-2 and mandates Clinical and Regulatory governance', async () => {
      const { resource, riskAssessment } = await GovernanceOrchestrator.registerGovernedResource({
        resource_key: 'clinical.cbt_thought_record',
        resource_type: GovernedResourceType.CLINICAL_ARTIFACT,
        name: 'CBT Thought Record Module',
        description: 'Interactive cognitive restructuring exercise',
        owner_id: 'clinical_lead_01',
        classificationParams: {
          hasClinicalImpact: true,
          clinicalImpactClass: 'CR-2',
          dataCategories: ['HEALTH_SENSITIVE']
        }
      });

      assert.equal(resource.clinical_risk_class, 'CR-2');
      assert.equal(resource.privacy_risk_class, 'HIGH');
      assert.equal(resource.regulatory_risk_class, 'COMPLIANCE_MANDATED');

      assert.ok(riskAssessment.mandated_domains.includes(GovernanceDomain.CLINICAL_GOVERNANCE));
      assert.ok(riskAssessment.mandated_domains.includes(GovernanceDomain.PRIVACY_GOVERNANCE));
      assert.ok(riskAssessment.mandated_domains.includes(GovernanceDomain.REGULATORY_GOVERNANCE));
      assert.ok(riskAssessment.mandated_domains.includes(GovernanceDomain.SECURITY_GOVERNANCE));
      assert.ok(riskAssessment.mandated_domains.includes(GovernanceDomain.QA_GOVERNANCE));
    });

    test('Strict Invariant R-AI-002: Rejects autonomous AI diagnosis or medication prescription', () => {
      assert.throws(
        () => {
          GovernanceRequirementEngine.classify({
            resource_key: 'ai.autonomous_diagnosis_engine',
            name: 'AI Diagnostic Assistant',
            hasAIModelOrInference: true,
            isDiagnosisOrPrescription: true
          });
        },
        (err: any) => {
          assert.ok(err instanceof GovernanceBlockedError);
          assert.match(err.message, /AI systems SHALL NOT autonomously perform clinical diagnosis/);
          return true;
        }
      );
    });

    test('Strict Invariant R-AI-001: Rejects fully autonomous unguided interventions', () => {
      assert.throws(
        () => {
          GovernanceRequirementEngine.classify({
            resource_key: 'ai.autonomous_actor',
            name: 'Autonomous Companion Agent',
            hasAIModelOrInference: true,
            aiAutonomyLevel: 'AUTONOMOUS'
          });
        },
        (err: any) => {
          assert.ok(err instanceof GovernanceBlockedError);
          assert.match(err.message, /Autonomous unguided clinical intervention is prohibited/);
          return true;
        }
      );
    });
  });

  describe('2. Governance Case & Review Orchestration Lifecycle', () => {
    test('Creates formal Governance Case and dispatches review tasks with domain events', async () => {
      const { caseEntity, reviews } = await GovernanceOrchestrator.createGovernanceCase({
        resourceKey: 'care.crisis_escalation_protocol',
        releaseId: 'rel-v2.4.0',
        initiatorId: 'product_manager_01',
        summary: 'Enhanced triage workflow for crisis team routing'
      });

      assert.ok(caseEntity.id);
      assert.match(caseEntity.case_number, /^GOV-/);
      assert.equal(caseEntity.state, 'IN_REVIEW');
      assert.ok(reviews.length >= 2);

      // Verify domain reviews exist
      const securityReview = reviews.find(r => r.domain === GovernanceDomain.SECURITY_GOVERNANCE);
      const qaReview = reviews.find(r => r.domain === GovernanceDomain.QA_GOVERNANCE);
      assert.ok(securityReview);
      assert.ok(qaReview);
      assert.equal(securityReview.state, 'PENDING');
      assert.equal(qaReview.state, 'PENDING');

      // Verify audit record was created
      const ledger = AuditService.getLedger();
      const caseAudit = ledger.find(e => e.action === 'GOVERNANCE.CASE_CREATED');
      assert.ok(caseAudit);
      assert.equal(caseAudit.actor_id, 'product_manager_01');
    });
  });

  describe('3. Separation of Duties Enforcement (R-GOV-002)', () => {
    test('Strict Invariant R-GOV-002: Feature initiator cannot self-approve their own domain review', async () => {
      const initiatorId = 'dev_author_101';
      const { caseEntity, reviews } = await GovernanceOrchestrator.createGovernanceCase({
        resourceKey: 'ai.companion_v2',
        initiatorId,
        summary: 'Companion sentiment adaptation'
      });

      const secReview = reviews.find(r => r.domain === GovernanceDomain.SECURITY_GOVERNANCE)!;

      // Attempt self-approval by initiator
      await assert.rejects(
        async () => {
          await GovernanceOrchestrator.submitReviewDecision({
            reviewId: secReview.id,
            reviewerId: initiatorId, // VIOLATION: Author self-approving
            decision: GovernanceDecision.APPROVED,
            evidenceHashes: ['sha256:abc123456789']
          });
        },
        (err: any) => {
          assert.ok(err instanceof AuthorizationError);
          assert.match(err.message, /Feature author\/initiator cannot approve governance review/);
          return true;
        }
      );
    });

    test('Strict Invariant R-GOV-002: Author cannot be the sole approver for all release gates', async () => {
      const authorId = 'solo_developer_01';

      await assert.rejects(
        async () => {
          await GovernanceOrchestrator.authorizeRelease({
            releaseId: 'rel-rogue-001',
            featureKeys: ['unreviewed_flag'],
            authorId,
            securityApproverId: authorId,
            qaApproverId: authorId,
            releaseAuthorityId: authorId
          });
        },
        (err: any) => {
          assert.ok(err instanceof AuthorizationError);
          assert.match(err.message, /Release cannot be authorized solely by the feature author/);
          return true;
        }
      );
    });
  });

  describe('4. Fail-Closed Release Gate Evaluation', () => {
    test('Denies release when mandated reviews are still pending or missing', async () => {
      const initiatorId = 'engineer_alex';
      const { caseEntity } = await GovernanceOrchestrator.createGovernanceCase({
        resourceKey: 'billing.pesa_checkout',
        releaseId: 'rel-billing-01',
        initiatorId,
        summary: 'M-Pesa payment integration'
      });

      const gateResult = await ReleaseGateService.evaluateGate({
        releaseId: 'rel-billing-01',
        environment: 'production',
        featureKey: 'billing.pesa_checkout'
      });

      assert.equal(gateResult.verdict, 'DENIED');
      assert.equal(gateResult.can_activate, false);
      assert.ok(gateResult.blocking_reasons.length > 0);
    });

    test('Allows release when all mandated reviews are approved by distinct qualified reviewers with evidence', async () => {
      const initiatorId = 'pm_sarah';
      const { caseEntity, reviews } = await GovernanceOrchestrator.createGovernanceCase({
        resourceKey: 'telehealth.secure_video',
        releaseId: 'rel-telehealth-v1',
        initiatorId,
        summary: 'WebRTC encrypted consultation pipeline'
      });

      // Submit approved reviews for each mandated domain by independent staff
      for (const rev of reviews) {
        await GovernanceOrchestrator.submitReviewDecision({
          reviewId: rev.id,
          reviewerId: `reviewer_${rev.domain.toLowerCase()}`,
          decision: GovernanceDecision.APPROVED,
          evidenceHashes: [`sha256:evidence_${rev.domain.toLowerCase()}_proof`],
          conditions: []
        });
      }

      const gateResult = await ReleaseGateService.evaluateGate({
        releaseId: 'rel-telehealth-v1',
        environment: 'production',
        featureKey: 'telehealth.secure_video'
      });

      assert.equal(gateResult.verdict, 'ALLOWED');
      assert.equal(gateResult.can_activate, true);
      assert.equal(gateResult.blocking_reasons.length, 0);
    });

    test('Strict Invariant R-QA-001: Denies release if critical unresolved safety or quality incident exists', () => {
      const mockCase: any = {
        id: generateUUIDv7(),
        case_number: 'GOV-TEST-001',
        resource_id: generateUUIDv7(),
        state: 'IN_REVIEW',
        initiator_id: 'author_01',
        mandated_domains: [GovernanceDomain.SECURITY_GOVERNANCE, GovernanceDomain.QA_GOVERNANCE]
      };

      const mockReviews: any[] = [
        {
          domain: GovernanceDomain.SECURITY_GOVERNANCE,
          reviewer_id: 'sec_lead_01',
          decision: GovernanceDecision.APPROVED,
          evidence_hashes: ['sha256:secproof']
        },
        {
          domain: GovernanceDomain.QA_GOVERNANCE,
          reviewer_id: 'qa_lead_01',
          decision: GovernanceDecision.APPROVED,
          evidence_hashes: ['sha256:qaproof']
        }
      ];

      const gateResult = GovernanceDecisionEngine.evaluateReleaseGate({
        initiatorId: 'author_01',
        releaseId: 'rel-critical-test',
        environment: 'production',
        caseEntity: mockCase,
        reviews: mockReviews,
        unresolvedIncidents: [
          { id: 'INC-999', severity: 'CRITICAL', title: 'Data leak vulnerability under active triage' }
        ]
      });

      assert.equal(gateResult.verdict, 'DENIED');
      assert.equal(gateResult.can_activate, false);
      assert.ok(gateResult.blocking_reasons.some(r => r.includes('active unresolved safety/quality incident')));
    });
  });

  describe('5. Release Authorization Lifecycle & Emergency Revocation', () => {
    test('Authorizes production release and writes immutable records and domain events', async () => {
      const release = await GovernanceOrchestrator.authorizeRelease({
        releaseId: 'rel-prod-3.0.0',
        featureKeys: ['core_platform', 'safety_v2'],
        authorId: 'eng_lead_01',
        securityApproverId: 'ciso_officer',
        qaApproverId: 'qa_director',
        releaseAuthorityId: 'cto_exec'
      });

      assert.equal(release.release_id, 'rel-prod-3.0.0');
      assert.equal(release.status, ReleaseAuthorizationStatus.AUTHORIZED);
      assert.equal(release.state, GovernanceDecision.APPROVED);

      // Verify retrieved authorization
      const fetched = GovernanceOrchestrator.getReleaseAuthorization('rel-prod-3.0.0');
      assert.ok(fetched);
      assert.equal(fetched.release_id, 'rel-prod-3.0.0');

      // Verify audit record was written
      const ledger = AuditService.getLedger();
      const releaseAudit = ledger.find(e => e.action === 'GOVERNANCE.RELEASE_AUTHORIZED');
      assert.ok(releaseAudit);
      assert.equal(releaseAudit.resource_id, release.id);
    });

    test('Revoking release immediately halts gate activation and emits governance.release_revoked', async () => {
      await GovernanceOrchestrator.authorizeRelease({
        releaseId: 'rel-revocable-01',
        featureKeys: ['payment_v2'],
        authorId: 'lead_eng',
        securityApproverId: 'sec_officer',
        qaApproverId: 'qa_officer',
        releaseAuthorityId: 'release_manager'
      });

      // Gate passes initially
      const initialGate = await GovernanceOrchestrator.evaluateReleaseGate({
        releaseId: 'rel-revocable-01',
        environment: 'production'
      });
      assert.equal(initialGate.can_activate, true);

      // Emergency Revocation
      await GovernanceOrchestrator.revokeRelease({
        releaseId: 'rel-revocable-01',
        revokedBy: 'ciso_emergency',
        reason: 'Post-deployment zero-day identified'
      });

      // Gate now blocked
      const revokedGate = await GovernanceOrchestrator.evaluateReleaseGate({
        releaseId: 'rel-revocable-01',
        environment: 'production'
      });
      assert.equal(revokedGate.verdict, 'DENIED');
      assert.equal(revokedGate.can_activate, false);
      assert.ok(revokedGate.blocking_reasons[0].includes('REVOKED'));
    });
  });

  describe('6. Feature Flag Production Gate Enforcement', () => {
    test('Governed feature flag refuses activation in production without active ReleaseAuthorization', () => {
      FeatureFlagService.register({
        key: 'governed.experimental_care_pathway',
        description: 'Governed clinical self-help pathway',
        owner: 'clinical-team@mindos.ke',
        defaultValue: true,
        allowedEnvironments: ['local', 'development', 'staging', 'production'],
        safetyCritical: false,
        governed: true, // Requires governance release gate
        createdAt: '2026-09-08',
        reviewDate: '2027-09-08'
      });

      // In development, non-production allowed
      const allowedInDev = FeatureFlagService.isEnabled('governed.experimental_care_pathway', {
        environment: 'development'
      });
      assert.equal(allowedInDev, true);

      // In production, blocked because no ReleaseAuthorization exists
      const allowedInProd = FeatureFlagService.isEnabled('governed.experimental_care_pathway', {
        environment: 'production'
      });
      assert.equal(allowedInProd, false);
    });

    test('Governed feature flag activates in production once ReleaseAuthorization is approved', async () => {
      const flagKey = 'governed.verified_telehealth_portal';
      FeatureFlagService.register({
        key: flagKey,
        description: 'Verified telehealth portal',
        owner: 'clinical-team@mindos.ke',
        defaultValue: true,
        allowedEnvironments: ['staging', 'production'],
        safetyCritical: false,
        governed: true,
        createdAt: '2026-09-08',
        reviewDate: '2027-09-08'
      });

      // Initially false in production
      assert.equal(FeatureFlagService.isEnabled(flagKey, { environment: 'production' }), false);

      // Grant release authorization
      await GovernanceOrchestrator.authorizeRelease({
        releaseId: flagKey,
        featureKeys: [flagKey],
        authorId: 'author_dev',
        securityApproverId: 'sec_lead',
        qaApproverId: 'qa_lead',
        releaseAuthorityId: 'prod_manager'
      });

      // Now true in production
      assert.equal(FeatureFlagService.isEnabled(flagKey, { environment: 'production' }), true);
    });
  });
});
