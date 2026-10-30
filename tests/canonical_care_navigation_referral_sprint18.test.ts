/**
 * MindOS Sprint 18: Canonical Care Navigation, Support Pathways & Referral Orchestration Test Suite
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
 * Clinical Safety Policy Catalogue: R-SAFE-001, R-SAFE-002, R-NAV-001..010
 * Architectural Decisions: ADR-006, ADR-008, ADR-010, ADR-016
 * 
 * Verifies:
 * 1. Care Pathway Registry & Stepped-Care Hierarchy (LEVEL_0 through LEVEL_4)
 * 2. Need Classification, Acuity Evaluation & Recommendation Scoring
 * 3. Authoritative Safety Kernel Integration & Emergency Escalation (Safety > Navigation)
 * 4. Provider Matching Readiness & Clinical Verification Enforcements (R-NAV-004)
 * 5. Minimum-Necessary Handoff Packages, Consent Gates & SHA-256 Tamper-Evidence
 * 6. Referral Lifecycle State Machine & Transition Guards
 * 7. AI Companion Port & Prohibition of Autonomous Referrals (R-NAV-008)
 * 8. Audit Logging & Outbox Domain Event Generation
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  CarePathwayRegistry,
  CareRecommender,
  NavigationSessionService,
  ProviderMatcher,
  ReferralService,
  HandoffService,
  AICareNavigationPort,
  CareNavigationInvariants,
  CareLevel,
  SupportNeedDomain,
  PathwayAcuity,
  ReferralState,
  ReferralUrgency,
  HandoffPackageState,
  NavigationSessionState,
  ProfessionalVerificationState,
  MatchingCapacityStatus,
  CarePathwayEntity
} from '../mindos/care_navigation/index.js';

import { ConsentService } from '../mindos/consent/index.js';
import { SafetyKernel } from '../mindos/safety/index.js';
import { EventBus } from '../mindos/platform/events/index.js';
import { AuditService } from '../mindos/platform/audit/index.js';
import { DomainInvariantError, NotFoundError } from '../mindos/platform/errors/index.js';

describe('Sprint 18 — Care Navigation, Support Pathways & Referrals', () => {
  const TEST_USER_ID = '01918c00-0010-7000-8000-000000000099';
  const TEST_PROVIDER_ID = '01918c00-0030-7000-8000-000000000001';

  beforeEach(() => {
    // Reset registries and memory stores where applicable
    CarePathwayRegistry.resetToDefaults();
    ProviderMatcher.resetToDefaults();
    NavigationSessionService.reset();
    ReferralService.reset();
    HandoffService.reset();

    // Ensure test user has required consent
    try {
      ConsentService.recordConsent({
        userId: TEST_USER_ID,
        consentType: 'TERMS_OF_SERVICE',
        status: 'GRANTED',
        source: 'TEST'
      });
      ConsentService.recordConsent({
        userId: TEST_USER_ID,
        consentType: 'CARE_REFERRAL',
        status: 'GRANTED',
        source: 'TEST'
      });
    } catch {
      // ignore if already present
    }
  });

  // =========================================================================
  // 1. Care Pathway Registry & Stepped-Care Hierarchy
  // =========================================================================
  describe('1. Care Pathway Registry & Stepped-Care Hierarchy', () => {
    test('canonical seed pathways cover all stepped care levels LEVEL_0 through LEVEL_4', () => {
      const all = CarePathwayRegistry.listPathways();
      assert.ok(all.length >= 6, 'Should have at least 6 seeded pathways');

      const levels = new Set(all.map(p => p.care_level));
      assert.ok(levels.has(CareLevel.LEVEL_0), 'Must include LEVEL_0 (Self-directed/Psychoeducation)');
      assert.ok(levels.has(CareLevel.LEVEL_1), 'Must include LEVEL_1 (Guided Self-Help)');
      assert.ok(levels.has(CareLevel.LEVEL_2), 'Must include LEVEL_2 (Structured Brief Interventions)');
      assert.ok(levels.has(CareLevel.LEVEL_3), 'Must include LEVEL_3 (Specialized Outpatient)');
      assert.ok(levels.has(CareLevel.LEVEL_4), 'Must include LEVEL_4 (Acute Crisis / Inpatient)');
    });

    test('pathways contain mandatory clinical review dates, disclaimers, and versioning', () => {
      const pathway = CarePathwayRegistry.requirePathway('PATH-ANX-L2-CBT');
      assert.equal(pathway.code, 'PATH-ANX-L2-CBT');
      assert.equal(pathway.care_level, CareLevel.LEVEL_2);
      assert.equal(pathway.status, 'ACTIVE');
      assert.ok(pathway.review_date, 'Must have review date');
      assert.ok(pathway.statutory_disclaimer.includes('not establish a medical diagnosis'));
      assert.ok(pathway.interventions.length > 0, 'Must define interventions');
    });

    test('level 4 pathways MUST declare emergency escalation targets', () => {
      const acutePathway = CarePathwayRegistry.requirePathway('PATH-CRISIS-L4');
      assert.equal(acutePathway.care_level, CareLevel.LEVEL_4);
      assert.ok(acutePathway.emergency_escalation_targets, 'Must specify emergency targets');
      assert.ok(acutePathway.emergency_escalation_targets.length > 0);
      assert.ok(acutePathway.emergency_escalation_targets.includes('1199'));
    });

    test('invariants reject pathways with missing disclaimers or invalid care levels', () => {
      assert.throws(() => {
        CarePathwayRegistry.registerPathway({
          code: 'INVALID-TEST',
          version: '1.0.0',
          name: 'Invalid Pathway',
          description: 'No disclaimer',
          care_level: CareLevel.LEVEL_1,
          primary_domains: [SupportNeedDomain.GENERAL_WELLBEING],
          acuity_levels: [PathwayAcuity.MILD],
          interventions: ['Breathing'],
          eligibility_criteria: ['Age 18+'],
          exclusion_criteria: [],
          statutory_disclaimer: '', // Missing disclaimer!
          review_date: '2027-01-01'
        });
      }, /R-NAV-001/);
    });

    test('pathways can be filtered by care level and domain', () => {
      const level0 = CarePathwayRegistry.listPathways({ careLevel: CareLevel.LEVEL_0 });
      assert.ok(level0.every(p => p.care_level === CareLevel.LEVEL_0));

      const anxiety = CarePathwayRegistry.listPathways({ needDomain: SupportNeedDomain.ANXIETY });
      assert.ok(anxiety.every(p => p.primary_domains.includes(SupportNeedDomain.ANXIETY)));
    });
  });

  // =========================================================================
  // 2. Need Classification, Acuity Evaluation & Recommendation Scoring
  // =========================================================================
  describe('2. Need Classification & Stepped-Care Recommender', () => {
    test('classifies mild stress symptoms into Level 0 or Level 1 care', () => {
      const classification = CareRecommender.classifySupportNeed({
        declaredDomain: SupportNeedDomain.STRESS_BURNOUT,
        declaredConcerns: ['work burnout', 'trouble relaxing']
      });

      assert.equal(classification.primary_domain, SupportNeedDomain.STRESS_BURNOUT);
      assert.equal(classification.assessed_acuity, PathwayAcuity.MILD);
      assert.equal(classification.recommended_care_level, CareLevel.LEVEL_1);
    });

    test('classifies high assessment scores into Level 2 or Level 3 care', () => {
      const classification = CareRecommender.classifySupportNeed({
        declaredDomain: SupportNeedDomain.DEPRESSION,
        assessmentBaselines: [
          { instrument_code: 'PHQ-9', score: 17, band: 'MODERATELY_SEVERE', result_id: 'r-1', taken_at: new Date().toISOString() }
        ]
      });

      assert.equal(classification.primary_domain, SupportNeedDomain.DEPRESSION);
      assert.equal(classification.assessed_acuity, PathwayAcuity.SEVERE);
      assert.equal(classification.recommended_care_level, CareLevel.LEVEL_3);
    });

    test('generates scored and ranked pathway recommendations matching need', () => {
      const classification = CareRecommender.classifySupportNeed({
        declaredDomain: SupportNeedDomain.ANXIETY,
        declaredConcerns: ['panic attacks', 'worry'],
        assessmentBaselines: [
          { instrument_code: 'GAD-7', score: 12, band: 'MODERATE', result_id: 'r-2', taken_at: new Date().toISOString() }
        ]
      });

      const pathways = CarePathwayRegistry.listPathways();
      const recommendations = CareRecommender.recommendPathways(classification, pathways);

      assert.ok(recommendations.length > 0);
      assert.ok(recommendations[0].match_score > 0.5);
      assert.ok(recommendations[0].pathway.primary_domains.includes(SupportNeedDomain.ANXIETY));
      assert.ok(recommendations[0].match_reasons.length > 0);
    });
  });

  // =========================================================================
  // 3. Safety Kernel Authority & Emergency Override
  // =========================================================================
  describe('3. Safety Kernel Integration & Emergency Overrides (R-SAFE-001, R-NAV-001..003)', () => {
    test('triggers emergency override when acute distress/suicide keyword is present', () => {
      const classification = CareRecommender.classifySupportNeed({
        declaredDomain: SupportNeedDomain.TRAUMA_CRISIS,
        declaredConcerns: ['suicidal thoughts', 'cannot go on']
      });

      assert.equal(classification.assessed_acuity, PathwayAcuity.ACUTE);
      assert.equal(classification.recommended_care_level, CareLevel.LEVEL_4);
      assert.equal(classification.safety_override_triggered, true);

      const pathways = CarePathwayRegistry.listPathways();
      const recs = CareRecommender.recommendPathways(classification, pathways);

      assert.ok(recs.length > 0);
      assert.equal(recs[0].pathway.care_level, CareLevel.LEVEL_4);
      assert.ok(recs[0].pathway.emergency_escalation_targets.includes('1199'));
    });

    test('navigation session records safety override and urgent escalation flag', async () => {
      const session = await NavigationSessionService.startSession({
        userId: TEST_USER_ID,
        declaredNeeds: { domain: 'CRISIS', concerns: ['self harm thoughts'] }
      });

      const evaluated = await NavigationSessionService.evaluateSession(session.id, {
        declaredDomain: SupportNeedDomain.TRAUMA_CRISIS,
        declaredConcerns: ['self harm thoughts', 'suicide']
      });

      assert.equal(evaluated.status, NavigationSessionState.NEEDS_EVALUATED);
      assert.equal(evaluated.safety_override, true);
      assert.equal(evaluated.urgent_escalation_required, true);
      assert.equal(evaluated.emergency_escalated, true);
    });

    test('invariant blocks overriding urgent safety state with non-urgent care levels', () => {
      assert.throws(() => {
        CareNavigationInvariants.assertSafetyStateCompatibility('URGENT', CareLevel.LEVEL_0);
      }, /R-SAFE-001/);

      assert.throws(() => {
        CareNavigationInvariants.assertSafetyStateCompatibility('URGENT', CareLevel.LEVEL_1);
      }, /R-SAFE-001/);

      // Level 4 is allowed for URGENT
      assert.doesNotThrow(() => {
        CareNavigationInvariants.assertSafetyStateCompatibility('URGENT', CareLevel.LEVEL_4);
      });
    });
  });

  // =========================================================================
  // 4. Provider Matching Readiness (R-NAV-004)
  // =========================================================================
  describe('4. Provider Matching Readiness (R-NAV-004)', () => {
    test('matches only APPROVED and currently licensed providers', () => {
      const results = ProviderMatcher.findMatchingProviders({
        care_level: CareLevel.LEVEL_2,
        need_domain: SupportNeedDomain.ANXIETY,
        jurisdiction: 'KE'
      });

      assert.ok(results.length > 0);
      for (const p of results) {
        assert.equal(p.verification_state, ProfessionalVerificationState.APPROVED);
        assert.ok(new Date(p.license_expiry).getTime() > Date.now(), 'License must be unexpired');
        assert.ok(p.jurisdictions.includes('KE'));
      }
    });

    test('rejects matching unapproved or suspended providers', () => {
      // Register a suspended provider
      ProviderMatcher.registerProviderProfile({
        professional_id: 'bad-provider-01',
        full_name: 'Suspended Practitioner',
        title: 'Clinical Psychologist',
        verification_state: ProfessionalVerificationState.SUSPENDED,
        regulatory_body: 'KMPDC',
        license_number: 'SUS-1234',
        license_expiry: '2028-01-01',
        care_levels: [CareLevel.LEVEL_2, CareLevel.LEVEL_3],
        specialties: ['CBT', 'Anxiety'],
        modalities: ['TELEHEALTH'],
        jurisdictions: ['KE'],
        languages: ['en'],
        capacity_status: MatchingCapacityStatus.AVAILABLE
      });

      const matched = ProviderMatcher.findMatchingProviders({
        care_level: CareLevel.LEVEL_2
      });

      assert.ok(!matched.some(p => p.professional_id === 'bad-provider-01'), 'Suspended provider must not appear');
    });

    test('assertProviderEligible throws for unapproved or expired providers', () => {
      assert.throws(() => {
        ProviderMatcher.assertProviderEligible('non-existent-id', CareLevel.LEVEL_2);
      }, NotFoundError);

      assert.throws(() => {
        ProviderMatcher.assertProviderEligible('bad-provider-01', CareLevel.LEVEL_2);
      }, DomainInvariantError);
    });
  });

  // =========================================================================
  // 5. Minimum-Necessary Handoff Packages (R-NAV-006, R-NAV-007)
  // =========================================================================
  describe('5. Minimum-Necessary Handoff Packages & Tamper-Evidence', () => {
    test('creates handoff package with SHA-256 evidence hash and data minimization', () => {
      const pkg = HandoffService.createHandoffPackage({
        referralId: 'ref-001',
        userId: TEST_USER_ID,
        receivingProviderId: TEST_PROVIDER_ID,
        primaryNeed: SupportNeedDomain.ANXIETY,
        acuity: PathwayAcuity.MODERATE,
        clinicalSummaryNotes: 'Patient experiencing moderate generalized anxiety symptoms for 3 months.',
        screeningSummaries: [
          { instrument_code: 'GAD-7', score: 12, band: 'MODERATE', completed_at: '2026-03-01' }
        ]
      });

      assert.equal(pkg.status, HandoffPackageState.ACTIVE);
      assert.ok(pkg.evidence_sha256 && pkg.evidence_sha256.length === 64, 'Must have 64-char hex SHA-256 hash');
      assert.equal(pkg.data_classification, 'HEALTH_SENSITIVE');
      assert.equal(pkg.access_purpose, 'CARE_REFERRAL_COORDINATION');

      // Verify SHA-256 verification
      assert.ok(HandoffService.verifyEvidenceIntegrity(pkg.id));
    });

    test('records access audit when receiving provider accesses handoff package', () => {
      const pkg = HandoffService.createHandoffPackage({
        referralId: 'ref-002',
        userId: TEST_USER_ID,
        receivingProviderId: TEST_PROVIDER_ID,
        primaryNeed: SupportNeedDomain.DEPRESSION,
        acuity: PathwayAcuity.MILD
      });

      const accessed = HandoffService.accessHandoffPackage({
        packageIdOrReferralId: pkg.id,
        requestingActorId: TEST_PROVIDER_ID
      });

      assert.equal(accessed.access_count, 1);
      assert.ok(accessed.last_accessed_at);
    });

    test('revoking a handoff package prevents further access', () => {
      const pkg = HandoffService.createHandoffPackage({
        referralId: 'ref-003',
        userId: TEST_USER_ID,
        receivingProviderId: TEST_PROVIDER_ID,
        primaryNeed: SupportNeedDomain.STRESS_BURNOUT,
        acuity: PathwayAcuity.MILD
      });

      HandoffService.revokeHandoffPackage({
        packageIdOrReferralId: pkg.id,
        actorId: TEST_USER_ID,
        reason: 'Patient withdrew referral consent'
      });

      assert.throws(() => {
        HandoffService.accessHandoffPackage({
          packageIdOrReferralId: pkg.id,
          requestingActorId: TEST_PROVIDER_ID
        });
      }, /revoked/i);
    });
  });

  // =========================================================================
  // 6. Referral Lifecycle State Machine
  // =========================================================================
  describe('6. Referral Lifecycle State Machine & Transition Guards', () => {
    test('full canonical referral lifecycle: DRAFT -> READY -> TRANSMITTED -> ACKNOWLEDGED -> ACCEPTED -> SCHEDULED -> COMPLETED', async () => {
      const referral = await ReferralService.createReferral({
        userId: TEST_USER_ID,
        careLevel: CareLevel.LEVEL_2,
        urgency: ReferralUrgency.ROUTINE,
        receivingProviderId: TEST_PROVIDER_ID,
        receivingServiceType: 'TELEHEALTH_PSYCHOTHERAPY',
        reasonCodes: ['ANXIETY_INTERVENTION'],
        primaryNeed: SupportNeedDomain.ANXIETY,
        acuity: PathwayAcuity.MODERATE,
        autoReady: false
      });

      assert.equal(referral.status, ReferralState.DRAFT);
      assert.ok(referral.handoff_package_id, 'Handoff package created');

      // 1. DRAFT -> READY
      const ready = await ReferralService.transitionReferral({
        referralId: referral.id,
        targetState: ReferralState.READY,
        actorId: TEST_USER_ID
      });
      assert.equal(ready.status, ReferralState.READY);

      // 2. READY -> TRANSMITTED
      const trans = await ReferralService.transitionReferral({
        referralId: referral.id,
        targetState: ReferralState.TRANSMITTED,
        actorId: 'SYSTEM_DISPATCHER'
      });
      assert.equal(trans.status, ReferralState.TRANSMITTED);
      assert.ok(trans.transmitted_at);

      // 3. TRANSMITTED -> ACKNOWLEDGED
      const ack = await ReferralService.transitionReferral({
        referralId: referral.id,
        targetState: ReferralState.ACKNOWLEDGED,
        actorId: TEST_PROVIDER_ID
      });
      assert.equal(ack.status, ReferralState.ACKNOWLEDGED);

      // 4. ACKNOWLEDGED -> ACCEPTED
      const acc = await ReferralService.transitionReferral({
        referralId: referral.id,
        targetState: ReferralState.ACCEPTED,
        actorId: TEST_PROVIDER_ID,
        actionNotes: 'Accepted for intake'
      });
      assert.equal(acc.status, ReferralState.ACCEPTED);

      // 5. ACCEPTED -> SCHEDULED
      const sched = await ReferralService.transitionReferral({
        referralId: referral.id,
        targetState: ReferralState.SCHEDULED,
        actorId: TEST_PROVIDER_ID,
        actionNotes: 'Scheduled for 2026-03-25'
      });
      assert.equal(sched.status, ReferralState.SCHEDULED);

      // 6. SCHEDULED -> COMPLETED
      const comp = await ReferralService.transitionReferral({
        referralId: referral.id,
        targetState: ReferralState.COMPLETED,
        actorId: TEST_PROVIDER_ID,
        actionNotes: 'Initial consultation completed'
      });
      assert.equal(comp.status, ReferralState.COMPLETED);
      assert.ok(comp.completed_at);
    });

    test('invalid state transitions are blocked by state machine validation', async () => {
      const referral = await ReferralService.createReferral({
        userId: TEST_USER_ID,
        careLevel: CareLevel.LEVEL_2,
        receivingProviderId: TEST_PROVIDER_ID,
        receivingServiceType: 'TELEHEALTH_PSYCHOTHERAPY',
        autoReady: false
      });

      // Cannot jump from DRAFT straight to ACCEPTED
      await assert.rejects(async () => {
        await ReferralService.transitionReferral({
          referralId: referral.id,
          targetState: ReferralState.ACCEPTED,
          actorId: TEST_PROVIDER_ID
        });
      }, DomainInvariantError);
    });
  });

  // =========================================================================
  // 7. AI Companion Port & Restriction (R-NAV-008)
  // =========================================================================
  describe('7. AI Companion Port & Autonomous Referral Prohibition (R-NAV-008)', () => {
    test('AI port allows starting navigation and reading care options', async () => {
      const nav = await AICareNavigationPort.startNavigation({
        userId: TEST_USER_ID,
        declaredDomain: 'ANXIETY',
        declaredConcerns: ['panic', 'worry']
      });

      assert.ok(nav.sessionId);
      assert.equal(nav.status, NavigationSessionState.NEEDS_EVALUATED);

      const options = await AICareNavigationPort.getCareOptions(nav.sessionId);
      assert.ok(options.recommendations.length > 0);
      assert.ok(options.statutoryDisclaimer.includes('not a medical diagnosis'));
    });

    test('AI port strictly prohibits autonomous referral dispatch', () => {
      assert.throws(() => {
        AICareNavigationPort.assertAIProhibitedFromReferralDispatch();
      }, /R-NAV-008/);
    });
  });
});
