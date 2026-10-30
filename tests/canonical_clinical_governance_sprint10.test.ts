/**
 * MindOS Sprint 10: Canonical Clinical Governance Engine Test Suite
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
 * 
 * Tests:
 * 1. Clinical Artifact Registry, Taxonomy & Structured Risk Classification (CR-0 to CR-3)
 * 2. Version Lifecycle, State Machine Invariants & Transition Guards
 * 3. Clinical Claims & Evidence Adequacy (Oxford Levels, Retraction, Study Quality)
 * 4. Separation of Duties (R-GOV-002) & Reviewer Eligibility / Specialty Verification
 * 5. Review Workflows, Consensus Orchestration & Formal Approval Records
 * 6. Material Change Detection (Mandatory Re-Review Triggers)
 * 7. Rapid Clinical Emergency Suspension, Invalidation & Release Revocation
 * 8. Clinical Reconciliation Daemon (Expiry & Evidence Tracking)
 * 9. End-to-End Release Authorization Integration with Governance Kernel
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  ClinicalGovernanceEngine,
  ClinicalArtifactType,
  ClinicalArtifactState,
  ClinicalClaimType,
  ClinicalClaimStrength,
  ClinicalEvidenceType,
  ClinicalEvidenceQuality,
  EvidenceRelationshipType,
  ClinicalReviewDecision,
  ClinicalReviewerEligibilityEngine,
  ClinicalReviewerSpecialty,
  ClinicalReviewLevel,
  ClinicalRiskClassifier,
  MaterialChangeDetectionEngine,
  ClinicalEvidenceAdequacyService,
  ClinicalGovernanceReconciliationDaemon,
  ClinicalGovernancePersistence
} from '../mindos/clinical_governance/index.js';

import {
  GovernanceOrchestrator,
  GovernanceRepository,
  GovernanceDomain,
  GovernedResourceType,
  ReleaseAuthorizationStatus
} from '../mindos/governance/index.js';

import { AuditService } from '../mindos/platform/audit/index.js';
import { EventBus } from '../mindos/platform/events/index.js';
import { DomainInvariantError, AuthorizationError, GovernanceBlockedError } from '../mindos/platform/errors/index.js';

describe('MindOS Sprint 10: Canonical Clinical Governance Engine', () => {
  const AUTHOR_ID = 'author-clinical-001';
  const PSYCHOLOGIST_ID = 'rev-psychologist-001';
  const PSYCHIATRIST_ID = 'rev-psychiatrist-002';
  const MEDICAL_OFFICER_ID = 'rev-med-officer-003';
  const UNQUALIFIED_ADMIN_ID = 'admin-user-999';

  beforeEach(() => {
    ClinicalGovernancePersistence.resetForTesting();
    ClinicalReviewerEligibilityEngine.resetForTesting();
    GovernanceOrchestrator.resetForTesting();
    AuditService.resetForTesting();
    EventBus.clearOutbox();

    // Register canonical clinical reviewers
    ClinicalReviewerEligibilityEngine.registerReviewer({
      reviewer_id: PSYCHOLOGIST_ID,
      name: 'Dr. Amina Ochieng',
      email: 'amina.ochieng@mindos.ke',
      specialties: [ClinicalReviewerSpecialty.CLINICAL_PSYCHOLOGY, ClinicalReviewerSpecialty.GENERAL_PRACTICE],
      has_verified_license: true,
      license_number: 'KMPDC-CP-88421',
      jurisdictions: ['KE', 'GLOBAL'],
      conflict_of_interest_cleared: true,
      is_active: true
    });

    ClinicalReviewerEligibilityEngine.registerReviewer({
      reviewer_id: PSYCHIATRIST_ID,
      name: 'Dr. Faraji Mwangi',
      email: 'faraji.mwangi@mindos.ke',
      specialties: [ClinicalReviewerSpecialty.PSYCHIATRY, ClinicalReviewerSpecialty.CLINICAL_PSYCHOLOGY],
      has_verified_license: true,
      license_number: 'KMPDC-PSY-12994',
      jurisdictions: ['KE'],
      conflict_of_interest_cleared: true,
      is_active: true
    });

    ClinicalReviewerEligibilityEngine.registerReviewer({
      reviewer_id: MEDICAL_OFFICER_ID,
      name: 'Dr. Kevin Kiprop',
      email: 'kevin.kiprop@mindos.ke',
      specialties: [ClinicalReviewerSpecialty.GENERAL_PRACTICE],
      has_verified_license: true,
      license_number: 'KMPDC-GP-55120',
      jurisdictions: ['KE'],
      conflict_of_interest_cleared: true,
      is_active: true
    });
  });

  describe('1. Clinical Artifact Registry & Structured Risk Classification', () => {
    test('Correctly registers psychoeducational content as low risk (CR-1)', async () => {
      const artifact = await ClinicalGovernanceEngine.registerArtifact({
        artifact_code: 'PSY-SLEEP-HYGIENE-01',
        artifact_type: ClinicalArtifactType.PSYCHOEDUCATIONAL_CONTENT,
        name: 'Sleep Hygiene Guide for Mild Anxiety',
        description: 'Evidence-based cognitive restructuring for sleep habits.',
        owner_id: AUTHOR_ID,
        intended_use: 'General psychoeducation for non-crisis insomnia',
        classification_inputs: {
          is_crisis_related: false,
          targets_minors: false,
          involves_prescribing: false
        }
      });

      assert.equal(artifact.artifact_code, 'PSY-SLEEP-HYGIENE-01');
      assert.equal(artifact.status, ClinicalArtifactState.DRAFT);
      assert.equal(artifact.clinical_risk_class, 'CR-1');
      assert.equal(artifact.version, 1);
    });

    test('Classifies screening tool (PHQ-9) as moderate clinical risk (CR-2)', async () => {
      const artifact = await ClinicalGovernanceEngine.registerArtifact({
        artifact_code: 'ASM-PHQ9-STANDARD',
        artifact_type: ClinicalArtifactType.ASSESSMENT,
        name: 'Patient Health Questionnaire-9',
        description: 'Standard validated depressive symptom severity score.',
        owner_id: AUTHOR_ID,
        intended_use: 'Screening for depressive symptoms in outpatient settings',
        classification_inputs: {
          is_diagnostic_algorithm: true,
          is_crisis_related: true // Question 9 detects suicidal ideation
        }
      });

      assert.equal(artifact.clinical_risk_class, 'CR-2');
      assert.ok(artifact.risk_factors.includes('DIAGNOSTIC_OR_SCREENING_ALGORITHM'));
      assert.ok(artifact.risk_factors.includes('CRISIS_OR_SUICIDAL_IDEATION_TOUCHPOINT'));
    });

    test('Classifies autonomous AI triage as high clinical risk (CR-3)', async () => {
      const artifact = await ClinicalGovernanceEngine.registerArtifact({
        artifact_code: 'TRIAGE-CRISIS-ESCALATION',
        artifact_type: ClinicalArtifactType.CRISIS_ESCALATION_PROTOCOL,
        name: 'Emergency Psychiatric Crisis Protocol',
        description: 'Automated rapid triage for acute distress.',
        owner_id: AUTHOR_ID,
        intended_use: 'Emergency triage and dispatch protocol',
        classification_inputs: {
          is_crisis_related: true,
          involves_autonomous_intervention: true
        }
      });

      assert.equal(artifact.clinical_risk_class, 'CR-3');
    });

    test('Enforces invariant: AI systems SHALL NOT autonomously prescribe medication', async () => {
      await assert.rejects(
        async () => {
          await ClinicalGovernanceEngine.registerArtifact({
            artifact_code: 'AI-AUTO-PRESCRIBE',
            artifact_type: ClinicalArtifactType.AI_CLINICAL_PROMPT,
            name: 'Autonomous Antidepressant Prescriber',
            description: 'AI model autonomously prescribing SSRIs.',
            owner_id: AUTHOR_ID,
            intended_use: 'Medication titration and prescription generation',
            classification_inputs: {
              involves_prescribing: true,
              involves_autonomous_intervention: true
            }
          });
        },
        (err: any) => {
          assert.ok(err instanceof GovernanceBlockedError);
          assert.ok(err.message.includes('Kenya Digital Health Act 2023'));
          return true;
        }
      );
    });
  });

  describe('2. Version Lifecycle & State Machine Invariants', () => {
    test('Rejects invalid state transitions in artifact lifecycle', async () => {
      const artifact = await ClinicalGovernanceEngine.registerArtifact({
        artifact_code: 'EXC-BOX-BREATHING',
        artifact_type: ClinicalArtifactType.GUIDED_EXERCISE,
        name: 'Box Breathing Grounding Technique',
        description: 'Somatic parasympathetic stimulation exercise.',
        owner_id: AUTHOR_ID,
        intended_use: 'Acute anxiety grounding'
      });

      // Cannot jump from DRAFT directly to APPROVED without passing evidence and review
      await assert.rejects(
        async () => {
          await ClinicalGovernanceEngine.submitVersionForReview({
            artifactId: artifact.id,
            version: 1,
            submittedBy: AUTHOR_ID
          });
        },
        (err: any) => {
          // Requires claims and evidence before entering review
          assert.ok(err instanceof DomainInvariantError);
          assert.ok(err.message.includes('No clinical claims defined'));
          return true;
        }
      );
    });
  });

  describe('3. Clinical Claims & Evidence Adequacy Evaluation', () => {
    test('Rejects submission if STRONG clinical claim lacks Oxford Level I / II evidence', async () => {
      const artifact = await ClinicalGovernanceEngine.registerArtifact({
        artifact_code: 'CBT-DEPRESSION-MODULE',
        artifact_type: ClinicalArtifactType.INTERVENTION_PROTOCOL,
        name: 'CBT 8-Week Protocol for Moderate Depression',
        description: 'Structured computerized cognitive behavioral therapy.',
        owner_id: AUTHOR_ID,
        intended_use: 'Clinical remission of major depressive episode'
      });

      // Add a STRONG curative clinical claim
      const claim = await ClinicalGovernanceEngine.addClaim({
        artifactId: artifact.id,
        version: 1,
        claim_code: 'CLAIM-REMISSION-40',
        claim_type: ClinicalClaimType.THERAPEUTIC_EFFICACY,
        claim_statement: 'Reduces PHQ-9 depressive scores by 40% at 8-week completion.',
        strength: ClinicalClaimStrength.STRONG,
        defined_by: AUTHOR_ID
      });

      // Add only low-grade anecdotal evidence (Oxford Level 5)
      const evidence = await ClinicalGovernanceEngine.registerEvidenceMetadata({
        title: 'Single Clinician Case Series',
        evidence_type: ClinicalEvidenceType.CASE_SERIES,
        oxford_level: 'Level 5',
        publication_status: 'UNPUBLISHED_INTERNAL',
        registered_by: AUTHOR_ID
      });

      await ClinicalGovernanceEngine.linkClaimEvidence({
        claimId: claim.id,
        evidenceId: evidence.id,
        relationship_type: EvidenceRelationshipType.SUPPORTS,
        linkedBy: AUTHOR_ID
      });

      // Evaluation must fail adequacy
      const adequacy = await ClinicalEvidenceAdequacyService.evaluateArtifactEvidence(artifact.id, 1);
      assert.equal(adequacy.is_adequate, false);
      assert.ok(adequacy.missing_requirements.some(r => r.includes('requires at least Oxford Level II evidence')));

      // Submitting for review must fail
      await assert.rejects(
        async () => {
          await ClinicalGovernanceEngine.submitVersionForReview({
            artifactId: artifact.id,
            version: 1,
            submittedBy: AUTHOR_ID
          });
        },
        (err: any) => {
          assert.ok(err instanceof DomainInvariantError);
          assert.ok(err.message.includes('Evidence adequacy check failed'));
          return true;
        }
      );
    });

    test('Passes adequacy when STRONG claim is backed by peer-reviewed RCT (Oxford Level 1b)', async () => {
      const artifact = await ClinicalGovernanceEngine.registerArtifact({
        artifact_code: 'ACT-MINDFULNESS-V1',
        artifact_type: ClinicalArtifactType.GUIDED_EXERCISE,
        name: 'Acceptance and Commitment Grounding Exercise',
        description: 'Mindfulness and psychological flexibility exercise.',
        owner_id: AUTHOR_ID,
        intended_use: 'Stress and anxiety reduction'
      });

      const claim = await ClinicalGovernanceEngine.addClaim({
        artifactId: artifact.id,
        version: 1,
        claim_code: 'CLAIM-ANXIETY-REDUCTION',
        claim_type: ClinicalClaimType.THERAPEUTIC_EFFICACY,
        claim_statement: 'Statistically significant reduction in GAD-7 anxiety scores.',
        strength: ClinicalClaimStrength.STRONG,
        defined_by: AUTHOR_ID
      });

      const rctEvidence = await ClinicalGovernanceEngine.registerEvidenceMetadata({
        title: 'Multi-Center Randomized Controlled Trial on Digital ACT',
        citation: 'Journal of Clinical Psychology, 2024, 80(3): 412-429',
        doi: '10.1002/jclp.23841',
        evidence_type: ClinicalEvidenceType.RANDOMIZED_CONTROLLED_TRIAL,
        oxford_level: 'Level 1b',
        peer_reviewed: true,
        quality_rating: ClinicalEvidenceQuality.HIGH_QUALITY,
        publication_status: 'PEER_REVIEWED_PUBLISHED',
        registered_by: AUTHOR_ID
      });

      await ClinicalGovernanceEngine.linkClaimEvidence({
        claimId: claim.id,
        evidenceId: rctEvidence.id,
        relationship_type: EvidenceRelationshipType.SUPPORTS,
        linkedBy: AUTHOR_ID
      });

      const adequacy = await ClinicalEvidenceAdequacyService.evaluateArtifactEvidence(artifact.id, 1);
      assert.equal(adequacy.is_adequate, true);
      assert.equal(adequacy.missing_requirements.length, 0);

      // Now submission for review succeeds
      const updated = await ClinicalGovernanceEngine.submitVersionForReview({
        artifactId: artifact.id,
        version: 1,
        submittedBy: AUTHOR_ID
      });

      assert.equal(updated.status, ClinicalArtifactState.UNDER_REVIEW);
    });

    test('Rejects evidence marked as RETRACTED or METHODOLOGICALLY_FLAWED', async () => {
      const artifact = await ClinicalGovernanceEngine.registerArtifact({
        artifact_code: 'RETRACTED-TEST',
        artifact_type: ClinicalArtifactType.GUIDED_EXERCISE,
        name: 'Retracted Protocol Exercise',
        description: 'Exercise based on flawed literature.',
        owner_id: AUTHOR_ID,
        intended_use: 'Test retraction rejection'
      });

      const claim = await ClinicalGovernanceEngine.addClaim({
        artifactId: artifact.id,
        version: 1,
        claim_code: 'CLAIM-RETRACTED',
        claim_type: ClinicalClaimType.SYMPTOM_REDUCTION,
        claim_statement: 'Claim supported by retracted study.',
        strength: ClinicalClaimStrength.MODERATE,
        defined_by: AUTHOR_ID
      });

      const flawedEvidence = await ClinicalGovernanceEngine.registerEvidenceMetadata({
        title: 'Retracted Study on Rapid Desensitization',
        evidence_type: ClinicalEvidenceType.RANDOMIZED_CONTROLLED_TRIAL,
        oxford_level: 'Level 1b',
        quality_rating: ClinicalEvidenceQuality.CRITICAL_RISK_OF_BIAS,
        is_retracted: true,
        registered_by: AUTHOR_ID
      });

      await ClinicalGovernanceEngine.linkClaimEvidence({
        claimId: claim.id,
        evidenceId: flawedEvidence.id,
        relationship_type: EvidenceRelationshipType.SUPPORTS,
        linkedBy: AUTHOR_ID
      });

      const adequacy = await ClinicalEvidenceAdequacyService.evaluateArtifactEvidence(artifact.id, 1);
      assert.equal(adequacy.is_adequate, false);
      assert.ok(adequacy.missing_requirements.some(r => r.includes('has been retracted')));
    });
  });

  describe('4. Separation of Duties (R-GOV-002) & Reviewer Eligibility', () => {
    test('Strictly forbids clinical author from reviewing or approving their own artifact', async () => {
      const artifact = await ClinicalGovernanceEngine.registerArtifact({
        artifact_code: 'SELF-APPROVAL-TEST',
        artifact_type: ClinicalArtifactType.PSYCHOEDUCATIONAL_CONTENT,
        name: 'Self Approval Test Article',
        description: 'Testing four-eyes principle.',
        owner_id: AUTHOR_ID,
        intended_use: 'Testing four-eyes rule'
      });

      const claim = await ClinicalGovernanceEngine.addClaim({
        artifactId: artifact.id,
        version: 1,
        claim_code: 'CLAIM-SELF-1',
        claim_type: ClinicalClaimType.INFORMATIONAL_EDUCATIONAL,
        claim_statement: 'Purely educational article on stress response.',
        strength: ClinicalClaimStrength.INFORMATIONAL,
        defined_by: AUTHOR_ID
      });

      const evidence = await ClinicalGovernanceEngine.registerEvidenceMetadata({
        title: 'Textbook of Psychiatry Chapter 4',
        evidence_type: ClinicalEvidenceType.EXPERT_OPINION,
        oxford_level: 'Level 5',
        registered_by: AUTHOR_ID
      });

      await ClinicalGovernanceEngine.linkClaimEvidence({
        claimId: claim.id,
        evidenceId: evidence.id,
        relationship_type: EvidenceRelationshipType.SUPPORTS,
        linkedBy: AUTHOR_ID
      });

      await ClinicalGovernanceEngine.submitVersionForReview({
        artifactId: artifact.id,
        version: 1,
        submittedBy: AUTHOR_ID
      });

      const assigned = await ClinicalGovernanceEngine.assignReviewer({
        artifactId: artifact.id,
        version: 1,
        reviewerId: PSYCHOLOGIST_ID,
        assignedBy: 'system-governance'
      });

      // If the author attempts to submit a review decision:
      await assert.rejects(
        async () => {
          await ClinicalGovernanceEngine.submitReview({
            reviewId: assigned.id,
            reviewerId: AUTHOR_ID, // AUTHOR ATTEMPTS TO APPROVE OWN WORK
            decision: ClinicalReviewDecision.APPROVE,
            checklist: {
              clinical_rationale_verified: true,
              evidence_adequacy_verified: true,
              benefit_risk_acceptable: true,
              safety_and_contraindications_verified: true,
              population_appropriateness_verified: true,
              plain_language_verified: true,
              escalation_pathway_verified: true
            }
          });
        },
        (err: any) => {
          assert.ok(err instanceof AuthorizationError);
          assert.equal(err.errorCode, 'AUTHZ_004');
          assert.ok(err.message.includes('CLINICAL_SELF_APPROVAL_PROHIBITED'));
          return true;
        }
      );
    });

    test('Forbids ordinary administrator or unqualified user from conducting clinical review', async () => {
      const artifact = await ClinicalGovernanceEngine.registerArtifact({
        artifact_code: 'ADMIN-REVIEW-TEST',
        artifact_type: ClinicalArtifactType.PSYCHOEDUCATIONAL_CONTENT,
        name: 'Admin Review Test',
        description: 'Testing non-clinician prohibition.',
        owner_id: AUTHOR_ID,
        intended_use: 'Admin test'
      });

      await assert.rejects(
        async () => {
          await ClinicalGovernanceEngine.assignReviewer({
            artifactId: artifact.id,
            version: 1,
            reviewerId: UNQUALIFIED_ADMIN_ID,
            assignedBy: 'system-governance'
          });
        },
        (err: any) => {
          assert.ok(err instanceof AuthorizationError);
          assert.ok(err.message.includes('not a registered clinical reviewer'));
          return true;
        }
      );
    });

    test('Enforces psychiatry / clinical psychology specialist review for CR-3 critical artifacts', async () => {
      const artifact = await ClinicalGovernanceEngine.registerArtifact({
        artifact_code: 'CR3-SPECIALTY-CHECK',
        artifact_type: ClinicalArtifactType.CRISIS_ESCALATION_PROTOCOL,
        name: 'Acute Suicidality Escalation Protocol',
        description: 'Crisis dispatch and immediate clinician alerting.',
        owner_id: AUTHOR_ID,
        intended_use: 'High-risk crisis escalation',
        classification_inputs: {
          is_crisis_related: true,
          involves_autonomous_intervention: true
        }
      });

      // General practitioner attempts to be assigned to CR-3 critical review:
      await assert.rejects(
        async () => {
          await ClinicalGovernanceEngine.assignReviewer({
            artifactId: artifact.id,
            version: 1,
            reviewerId: MEDICAL_OFFICER_ID, // Only GENERAL_PRACTICE, not Psychiatry or Clinical Psychology
            assignedBy: 'system-governance'
          });
        },
        (err: any) => {
          assert.ok(err instanceof AuthorizationError);
          assert.ok(err.message.includes('CR-3 critical artifacts require specialist review'));
          return true;
        }
      );

      // Qualified Psychiatrist succeeds
      const assigned = await ClinicalGovernanceEngine.assignReviewer({
        artifactId: artifact.id,
        version: 1,
        reviewerId: PSYCHIATRIST_ID,
        assignedBy: 'system-governance'
      });
      assert.equal(assigned.reviewer_id, PSYCHIATRIST_ID);
    });
  });

  describe('5. Review Workflows, Consensus Orchestration & Formal Approval Records', () => {
    test('Orchestrates full dual-reviewer review cycle and issues tamper-evident approval', async () => {
      const artifact = await ClinicalGovernanceEngine.registerArtifact({
        artifact_code: 'ASM-GAD7-STANDARD',
        artifact_type: ClinicalArtifactType.ASSESSMENT,
        name: 'Generalized Anxiety Disorder 7-item Scale',
        description: 'Validated screening for anxiety disorders.',
        owner_id: AUTHOR_ID,
        intended_use: 'Screening for generalized anxiety disorder',
        classification_inputs: {
          is_diagnostic_algorithm: true
        }
      });

      assert.equal(artifact.clinical_risk_class, 'CR-2');

      const claim = await ClinicalGovernanceEngine.addClaim({
        artifactId: artifact.id,
        version: 1,
        claim_code: 'CLAIM-GAD7-VALIDATION',
        claim_type: ClinicalClaimType.DIAGNOSTIC_ACCURACY,
        claim_statement: 'Sensitivity 89% and Specificity 82% for GAD cut-off >= 10.',
        strength: ClinicalClaimStrength.STRONG,
        defined_by: AUTHOR_ID
      });

      const metaEvidence = await ClinicalGovernanceEngine.registerEvidenceMetadata({
        title: 'Validation of the Generalized Anxiety Disorder-7 in Primary Care',
        citation: 'Arch Intern Med. 2006;166(10):1092-1097',
        evidence_type: ClinicalEvidenceType.META_ANALYSIS,
        oxford_level: 'Level 1a',
        quality_rating: ClinicalEvidenceQuality.HIGH_QUALITY,
        peer_reviewed: true,
        registered_by: AUTHOR_ID
      });

      await ClinicalGovernanceEngine.linkClaimEvidence({
        claimId: claim.id,
        evidenceId: metaEvidence.id,
        relationship_type: EvidenceRelationshipType.SUPPORTS,
        linkedBy: AUTHOR_ID
      });

      await ClinicalGovernanceEngine.submitVersionForReview({
        artifactId: artifact.id,
        version: 1,
        submittedBy: AUTHOR_ID
      });

      // Assign Reviewer 1 (Clinical Psychologist)
      const review1 = await ClinicalGovernanceEngine.assignReviewer({
        artifactId: artifact.id,
        version: 1,
        reviewerId: PSYCHOLOGIST_ID,
        assignedBy: 'system-governance'
      });

      // Assign Reviewer 2 (Psychiatrist - CR-2 requires dual review)
      const review2 = await ClinicalGovernanceEngine.assignReviewer({
        artifactId: artifact.id,
        version: 1,
        reviewerId: PSYCHIATRIST_ID,
        assignedBy: 'system-governance'
      });

      // Reviewer 1 approves with all 7 checklist items checked
      await ClinicalGovernanceEngine.submitReview({
        reviewId: review1.id,
        reviewerId: PSYCHOLOGIST_ID,
        decision: ClinicalReviewDecision.APPROVE,
        checklist: {
          clinical_rationale_verified: true,
          evidence_adequacy_verified: true,
          benefit_risk_acceptable: true,
          safety_and_contraindications_verified: true,
          population_appropriateness_verified: true,
          plain_language_verified: true,
          escalation_pathway_verified: true
        },
        notes: 'Sound psychometric properties and validated translations for Kenya.'
      });

      // Artifact remains UNDER_REVIEW until Reviewer 2 completes review
      let currentArt = await ClinicalGovernancePersistence.getArtifactById(artifact.id);
      assert.equal(currentArt?.status, ClinicalArtifactState.UNDER_REVIEW);

      // Reviewer 2 approves
      await ClinicalGovernanceEngine.submitReview({
        reviewId: review2.id,
        reviewerId: PSYCHIATRIST_ID,
        decision: ClinicalReviewDecision.APPROVE,
        checklist: {
          clinical_rationale_verified: true,
          evidence_adequacy_verified: true,
          benefit_risk_acceptable: true,
          safety_and_contraindications_verified: true,
          population_appropriateness_verified: true,
          plain_language_verified: true,
          escalation_pathway_verified: true
        },
        notes: 'Concur. Approved for standard outpatient deployment.'
      });

      // Now artifact transitions to APPROVED and approval record exists
      currentArt = await ClinicalGovernancePersistence.getArtifactById(artifact.id);
      assert.equal(currentArt?.status, ClinicalArtifactState.APPROVED);

      const approval = await ClinicalGovernancePersistence.getApprovalForArtifactVersion(artifact.id, 1);
      assert.ok(approval);
      assert.equal(approval?.status, 'ACTIVE');
      assert.equal(approval?.approver_ids.length, 2);
      assert.ok(approval?.approval_code.startsWith('CLIN-APP-'));
      assert.ok(approval?.evidence_hash);
    });

    test('Enforces complete 7-item checklist: incomplete checklist blocks approval', async () => {
      const artifact = await ClinicalGovernanceEngine.registerArtifact({
        artifact_code: 'CHECKLIST-TEST',
        artifact_type: ClinicalArtifactType.PSYCHOEDUCATIONAL_CONTENT,
        name: 'Incomplete Checklist Test',
        description: 'Test checklist verification.',
        owner_id: AUTHOR_ID,
        intended_use: 'Checklist testing'
      });

      const claim = await ClinicalGovernanceEngine.addClaim({
        artifactId: artifact.id,
        version: 1,
        claim_code: 'CLAIM-CHECKLIST',
        claim_type: ClinicalClaimType.INFORMATIONAL_EDUCATIONAL,
        claim_statement: 'Informational guide.',
        strength: ClinicalClaimStrength.INFORMATIONAL,
        defined_by: AUTHOR_ID
      });

      const ev = await ClinicalGovernanceEngine.registerEvidenceMetadata({
        title: 'Review Guide',
        evidence_type: ClinicalEvidenceType.EXPERT_OPINION,
        oxford_level: 'Level 5',
        registered_by: AUTHOR_ID
      });

      await ClinicalGovernanceEngine.linkClaimEvidence({
        claimId: claim.id,
        evidenceId: ev.id,
        relationship_type: EvidenceRelationshipType.SUPPORTS,
        linkedBy: AUTHOR_ID
      });

      await ClinicalGovernanceEngine.submitVersionForReview({
        artifactId: artifact.id,
        version: 1,
        submittedBy: AUTHOR_ID
      });

      const review = await ClinicalGovernanceEngine.assignReviewer({
        artifactId: artifact.id,
        version: 1,
        reviewerId: PSYCHOLOGIST_ID,
        assignedBy: 'system-governance'
      });

      // Reviewer forgets to check escalation_pathway_verified
      await assert.rejects(
        async () => {
          await ClinicalGovernanceEngine.submitReview({
            reviewId: review.id,
            reviewerId: PSYCHOLOGIST_ID,
            decision: ClinicalReviewDecision.APPROVE,
            checklist: {
              clinical_rationale_verified: true,
              evidence_adequacy_verified: true,
              benefit_risk_acceptable: true,
              safety_and_contraindications_verified: true,
              population_appropriateness_verified: true,
              plain_language_verified: true,
              escalation_pathway_verified: false // FAILED CHECKLIST ITEM
            }
          });
        },
        (err: any) => {
          assert.ok(err instanceof DomainInvariantError);
          assert.ok(err.message.includes('incomplete clinical checklist'));
          return true;
        }
      );
    });
  });

  describe('6. Material Change Detection & Semantic Versioning', () => {
    test('Detects material change and flags new version as requiring clinical re-review', async () => {
      const artifact = await ClinicalGovernanceEngine.registerArtifact({
        artifact_code: 'MAT-CHANGE-01',
        artifact_type: ClinicalArtifactType.GUIDED_EXERCISE,
        name: 'Mindfulness Breathing',
        description: 'Breathing protocol v1.',
        owner_id: AUTHOR_ID,
        intended_use: 'Mild tension reduction'
      });

      // Create v2 with expanded intended use to severe trauma (material change)
      const v2 = await ClinicalGovernanceEngine.createVersion({
        artifactId: artifact.id,
        specification: { steps: ['deep inhale 10s', 'hold 10s'] },
        intended_use: 'Acute trauma processing and PTSD flashback intervention', // MATERIAL CHANGE
        authorId: AUTHOR_ID
      });

      assert.equal(v2.version, 2);
      assert.equal(v2.is_material_change, true);
      assert.ok(v2.material_change_summary?.includes('Intended clinical use expanded or modified'));
    });

    test('Identifies non-material editorial changes without triggering forced re-classification', async () => {
      const artifact = await ClinicalGovernanceEngine.registerArtifact({
        artifact_code: 'NON-MAT-CHANGE-01',
        artifact_type: ClinicalArtifactType.PSYCHOEDUCATIONAL_CONTENT,
        name: 'Depression Education',
        description: 'Depression symptoms overview.',
        owner_id: AUTHOR_ID,
        intended_use: 'General psychoeducation'
      });

      // Minor formatting adjustment in specification only
      const v2 = await ClinicalGovernanceEngine.createVersion({
        artifactId: artifact.id,
        specification: { formatting: 'dark-mode-optimized', typography: 'accessible' },
        intended_use: artifact.intended_use, // identical intended use
        authorId: AUTHOR_ID
      });

      assert.equal(v2.version, 2);
      assert.equal(v2.is_material_change, false);
    });
  });

  describe('7. Rapid Clinical Emergency Suspension & Reinstatement', () => {
    test('Immediately suspends artifact, revokes approvals, and notifies audit and event bus', async () => {
      const artifact = await ClinicalGovernanceEngine.registerArtifact({
        artifact_code: 'EMERGENCY-SUSPEND-TEST',
        artifact_type: ClinicalArtifactType.CRISIS_ESCALATION_PROTOCOL,
        name: 'Rapid Triage Bot',
        description: 'Automated triage.',
        owner_id: AUTHOR_ID,
        intended_use: 'Crisis triage'
      });

      const claim = await ClinicalGovernanceEngine.addClaim({
        artifactId: artifact.id,
        version: 1,
        claim_code: 'CLAIM-EMERG',
        claim_type: ClinicalClaimType.INFORMATIONAL_EDUCATIONAL,
        claim_statement: 'Emergency triage information.',
        strength: ClinicalClaimStrength.INFORMATIONAL,
        defined_by: AUTHOR_ID
      });

      const ev = await ClinicalGovernanceEngine.registerEvidenceMetadata({
        title: 'Guideline',
        evidence_type: ClinicalEvidenceType.CLINICAL_PRACTICE_GUIDELINE,
        oxford_level: 'Level 2b',
        registered_by: AUTHOR_ID
      });

      await ClinicalGovernanceEngine.linkClaimEvidence({
        claimId: claim.id,
        evidenceId: ev.id,
        relationship_type: EvidenceRelationshipType.SUPPORTS,
        linkedBy: AUTHOR_ID
      });

      await ClinicalGovernanceEngine.submitVersionForReview({
        artifactId: artifact.id,
        version: 1,
        submittedBy: AUTHOR_ID
      });

      const rev = await ClinicalGovernanceEngine.assignReviewer({
        artifactId: artifact.id,
        version: 1,
        reviewerId: PSYCHIATRIST_ID,
        assignedBy: 'system-governance'
      });

      await ClinicalGovernanceEngine.submitReview({
        reviewId: rev.id,
        reviewerId: PSYCHIATRIST_ID,
        decision: ClinicalReviewDecision.APPROVE,
        checklist: {
          clinical_rationale_verified: true,
          evidence_adequacy_verified: true,
          benefit_risk_acceptable: true,
          safety_and_contraindications_verified: true,
          population_appropriateness_verified: true,
          plain_language_verified: true,
          escalation_pathway_verified: true
        }
      });

      let current = await ClinicalGovernancePersistence.getArtifactById(artifact.id);
      assert.equal(current?.status, ClinicalArtifactState.APPROVED);

      // Trigger Emergency Suspension (e.g. Adverse clinical report received)
      const suspended = await ClinicalGovernanceEngine.emergencySuspendArtifact({
        artifactId: artifact.id,
        suspendedBy: PSYCHIATRIST_ID,
        reason: 'Adverse clinical incident reported: Bot gave unsafe escalation advice in high crisis.',
        adverse_event_ref: 'ADV-INC-2026-9901'
      });

      assert.equal(suspended.status, ClinicalArtifactState.SUSPENDED);

      // Verify approval status was revoked
      const approval = await ClinicalGovernancePersistence.getApprovalForArtifactVersion(artifact.id, 1);
      assert.equal(approval?.status, 'REVOKED');

      // Verify domain event emitted
      const events = EventBus.getOutbox();
      const suspendEvent = events.find(e => e.event_type === 'clinical.artifact_suspended');
      assert.ok(suspendEvent);
    });

    test('Permits controlled remediation and reinstatement following emergency suspension', async () => {
      const artifact = await ClinicalGovernanceEngine.registerArtifact({
        artifact_code: 'REINSTATE-TEST',
        artifact_type: ClinicalArtifactType.GUIDED_EXERCISE,
        name: 'Breathing Grounding',
        description: 'Grounding protocol.',
        owner_id: AUTHOR_ID,
        intended_use: 'Mild anxiety'
      });

      // Directly put into SUSPENDED state
      artifact.status = ClinicalArtifactState.SUSPENDED;
      await ClinicalGovernancePersistence.saveArtifact(artifact);

      // Reinstatement transitions back to UNDER_REVIEW for formal re-evaluation
      const reinstated = await ClinicalGovernanceEngine.reinstateArtifact({
        artifactId: artifact.id,
        reinstatedBy: PSYCHIATRIST_ID,
        remediation_notes: 'Safety guardrails hardened and prompt regression tested.',
        new_evidence_refs: ['EVID-NEW-SAFETY-01']
      });

      assert.equal(reinstated.status, ClinicalArtifactState.UNDER_REVIEW);
    });
  });

  describe('8. Clinical Reconciliation Daemon', () => {
    test('Automatically marks expired approval records as EXPIRED and emits domain event', async () => {
      const artifact = await ClinicalGovernanceEngine.registerArtifact({
        artifact_code: 'EXPIRY-TEST',
        artifact_type: ClinicalArtifactType.PSYCHOEDUCATIONAL_CONTENT,
        name: 'Expired Content Article',
        description: 'Testing expiry reconciliation.',
        owner_id: AUTHOR_ID,
        intended_use: 'General information'
      });

      artifact.status = ClinicalArtifactState.APPROVED;
      await ClinicalGovernancePersistence.saveArtifact(artifact);

      // Create an approval that expired yesterday
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await ClinicalGovernancePersistence.saveApprovalRecord({
        id: 'app-expired-01',
        approval_code: 'CLIN-APP-EXPIRED-01',
        artifact_id: artifact.id,
        artifact_code: artifact.artifact_code,
        version: 1,
        approved_at: new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: yesterday, // EXPIRED
        approver_ids: [PSYCHOLOGIST_ID],
        review_ids: ['rev-01'],
        decision: ClinicalReviewDecision.APPROVE,
        evidence_hash: 'hash-exp',
        status: 'ACTIVE',
        conditions: [],
        created_at: new Date().toISOString()
      });

      const daemonResult = await ClinicalGovernanceReconciliationDaemon.runAudit();
      assert.ok(daemonResult.issues.some(i => i.issue_type === 'EXPIRED_APPROVAL'));

      const updatedArt = await ClinicalGovernancePersistence.getArtifactById(artifact.id);
      assert.equal(updatedArt?.status, ClinicalArtifactState.EXPIRED);

      const events = EventBus.getOutbox();
      assert.ok(events.some(e => e.event_type === 'clinical.artifact_expired'));
    });

    test('Flags artifact as ACTION_REQUIRED when supporting evidence is retracted post-approval', async () => {
      const artifact = await ClinicalGovernanceEngine.registerArtifact({
        artifact_code: 'POST-APPROVAL-RETRACTION-TEST',
        artifact_type: ClinicalArtifactType.INTERVENTION_PROTOCOL,
        name: 'Depression Protocol with Tainted Study',
        description: 'Testing retrospective retraction reconciliation.',
        owner_id: AUTHOR_ID,
        intended_use: 'Clinical intervention'
      });

      artifact.status = ClinicalArtifactState.APPROVED;
      await ClinicalGovernancePersistence.saveArtifact(artifact);

      // Create active approval
      const futureDate = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000).toISOString();
      await ClinicalGovernancePersistence.saveApprovalRecord({
        id: 'app-active-01',
        approval_code: 'CLIN-APP-ACTIVE-01',
        artifact_id: artifact.id,
        artifact_code: artifact.artifact_code,
        version: 1,
        approved_at: new Date().toISOString(),
        expires_at: futureDate,
        approver_ids: [PSYCHIATRIST_ID],
        review_ids: ['rev-02'],
        decision: ClinicalReviewDecision.APPROVE,
        evidence_hash: 'hash-active',
        status: 'ACTIVE',
        conditions: [],
        created_at: new Date().toISOString()
      });

      const claim = await ClinicalGovernanceEngine.addClaim({
        artifactId: artifact.id,
        version: 1,
        claim_code: 'CLAIM-RETRACTED-POST',
        claim_type: ClinicalClaimType.THERAPEUTIC_EFFICACY,
        claim_statement: 'Core therapeutic claim.',
        strength: ClinicalClaimStrength.STRONG,
        defined_by: AUTHOR_ID
      });

      const ev = await ClinicalGovernanceEngine.registerEvidenceMetadata({
        title: 'Study Retracted by Publisher Post-Approval',
        evidence_type: ClinicalEvidenceType.RANDOMIZED_CONTROLLED_TRIAL,
        oxford_level: 'Level 1b',
        registered_by: AUTHOR_ID
      });

      await ClinicalGovernanceEngine.linkClaimEvidence({
        claimId: claim.id,
        evidenceId: ev.id,
        relationship_type: EvidenceRelationshipType.SUPPORTS,
        linkedBy: AUTHOR_ID
      });

      // Now publisher issues retraction
      await ClinicalGovernanceEngine.invalidateEvidence({
        evidenceId: ev.id,
        status: 'RETRACTED',
        reason: 'Data fabrication found by institutional integrity committee.',
        invalidatedBy: 'clinical-safety-officer'
      });

      // Run reconciliation audit
      const audit = await ClinicalGovernanceReconciliationDaemon.runAudit();
      assert.ok(audit.issues.some(i => i.issue_type === 'INVALIDATED_EVIDENCE'));

      const updatedArt = await ClinicalGovernancePersistence.getArtifactById(artifact.id);
      assert.equal(updatedArt?.status, ClinicalArtifactState.ACTION_REQUIRED);
    });
  });

  describe('9. Production Release Gate Integration with Sprint 9 Governance Kernel', () => {
    test('Release is BLOCKED when clinical features lack clinical sign-off', async () => {
      // Register a feature flag that has clinical impact
      await GovernanceOrchestrator.registerGovernedResource({
        resource_key: 'telehealth.kenya_e_prescriptions',
        resource_type: GovernedResourceType.FEATURE_FLAG,
        name: 'Kenya Telehealth E-Prescriptions',
        description: 'Electronic prescribing module for outpatient mental health.',
        owner_id: AUTHOR_ID,
        classificationParams: {
          hasClinicalImpact: true,
          clinicalImpactClass: 'CR-3',
          jurisdictions: ['KE']
        }
      });

      // Release attempt with only Security and QA sign-offs, but missing Clinical approver:
      await assert.rejects(
        async () => {
          await GovernanceOrchestrator.authorizeRelease({
            releaseId: 'rel-2026-sprint10-001',
            featureKeys: ['telehealth.kenya_e_prescriptions'],
            authorId: AUTHOR_ID,
            securityApproverId: 'sec-lead-001',
            qaApproverId: 'qa-lead-001',
            releaseAuthorityId: 'rel-lead-001'
            // clinicalApproverId intentionally omitted!
          });
        },
        (err: any) => {
          assert.ok(err instanceof GovernanceBlockedError);
          assert.equal(err.errorCode, 'GOV_CLINICAL_REQUIRED');
          assert.ok(err.message.includes('requires Clinical Governance sign-off'));
          return true;
        }
      );
    });

    test('Release is BLOCKED if author attempts to provide their own clinical approval', async () => {
      await GovernanceOrchestrator.registerGovernedResource({
        resource_key: 'feature.guided_cbt_module',
        resource_type: GovernedResourceType.FEATURE_FLAG,
        name: 'Guided CBT Module',
        description: 'Interactive CBT module for depressive symptoms.',
        owner_id: AUTHOR_ID,
        classificationParams: {
          hasClinicalImpact: true,
          clinicalImpactClass: 'CR-2'
        }
      });

      await assert.rejects(
        async () => {
          await GovernanceOrchestrator.authorizeRelease({
            releaseId: 'rel-2026-sprint10-002',
            featureKeys: ['feature.guided_cbt_module'],
            authorId: AUTHOR_ID,
            clinicalApproverId: AUTHOR_ID, // AUTHOR ATTEMPTS CLINICAL APPROVAL!
            securityApproverId: 'sec-lead-001',
            qaApproverId: 'qa-lead-001',
            releaseAuthorityId: 'rel-lead-001'
          });
        },
        (err: any) => {
          assert.ok(err instanceof AuthorizationError);
          assert.equal(err.errorCode, 'AUTHZ_004');
          assert.ok(err.message.includes('CLINICAL_SELF_APPROVAL_PROHIBITED'));
          return true;
        }
      );
    });

    test('Release succeeds when all gates including qualified Clinical Director sign off', async () => {
      await GovernanceOrchestrator.registerGovernedResource({
        resource_key: 'feature.sleep_hygiene_module',
        resource_type: GovernedResourceType.FEATURE_FLAG,
        name: 'Sleep Hygiene Module',
        description: 'Psychoeducational guide for sleep hygiene.',
        owner_id: AUTHOR_ID,
        classificationParams: {
          hasClinicalImpact: true,
          clinicalImpactClass: 'CR-1'
        }
      });

      const releaseAuth = await GovernanceOrchestrator.authorizeRelease({
        releaseId: 'rel-2026-sprint10-003',
        featureKeys: ['feature.sleep_hygiene_module'],
        authorId: AUTHOR_ID,
        clinicalApproverId: PSYCHOLOGIST_ID, // Qualified clinical reviewer
        securityApproverId: 'sec-lead-001',
        qaApproverId: 'qa-lead-001',
        releaseAuthorityId: 'rel-lead-001'
      });

      assert.equal(releaseAuth.status, ReleaseAuthorizationStatus.AUTHORIZED);
      assert.equal(releaseAuth.clinical_status, 'APPROVED');
      assert.ok(releaseAuth.clinical_signoff_at);
      assert.ok(releaseAuth.approvers.includes(PSYCHOLOGIST_ID));
    });
  });
});
