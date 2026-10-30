/**
 * MindOS Sprint 19: Canonical Professional Identity, Credential Verification,
 * Provider Registry, Service Offerings, Scope of Practice & Care-Network Eligibility Test Suite
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q / J
 * Kenya Regulatory Control Matrix: KMPDC Act Cap 253, Nurses Act Cap 257, Data Protection Act 2019
 * Architectural Decisions: ADR-026, ADR-027, ADR-028, ADR-029, ADR-030, ADR-031, ADR-032
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  ProfessionalService,
  ProfessionalType,
  ProfessionalState,
  ProfessionalVerificationState,
  CredentialType,
  CredentialStatus,
  VerificationType,
  VerificationCaseStatus,
  VerificationDecision,
  ScopeType,
  TargetPopulation,
  DeliveryMode,
  ProviderStatus,
  DiscoverabilityStatus,
  ServiceType,
  ServiceOfferingStatus,
  ProfileVisibility,
  SuspensionReasonCode,
  SpecialtyRegistry,
  ProfessionalScopeService,
  ProfessionalVerificationService,
  ProviderRegistryService,
  InMemoryProfessionalRepository
} from '../mindos/professionals/index.js';

import {
  DomainInvariantError,
  SelfVerificationProhibitedError,
  SeparationOfDutiesViolationError,
  ProfessionalProfileRequiredError,
  ProfessionalScopeDeniedError,
  ProfessionalSuspendedError,
  DuplicateProfessionalRegistrationError,
  EvidenceTamperingDetectedError
} from '../mindos/platform/errors/index.js';

import { CareService } from '../mindos/care/index.js';
import { AppointmentService } from '../mindos/appointments/index.js';
import { GovernanceEvidenceService } from '../mindos/platform/audit/application/governance_evidence_service.js';
import { generateUUIDv7 } from '../mindos/platform/database/uuid.js';

describe('Sprint 19 — Professional Network & Provider Verification Platform', () => {
  let repo: InMemoryProfessionalRepository;
  let verificationService: ProfessionalVerificationService;
  let registryService: ProviderRegistryService;

  const APPLICANT_USER_ID = '01918c00-0010-7000-8000-000000000088';
  const REVIEWER_USER_ID = '01918c00-0010-7000-8000-000000000005';
  const REVIEWER_ROLES = ['PROVIDER_VERIFICATION_REVIEWER'];

  beforeEach(async () => {
    repo = new InMemoryProfessionalRepository();
    verificationService = new ProfessionalVerificationService(repo);
    registryService = new ProviderRegistryService(repo);
    await ProfessionalService.reset();
  });

  // ============================================================================
  // 1. Professional Profile Creation & Invariants (ADR-026)
  // ============================================================================
  describe('1. Professional Profile Creation & Domain Invariants', () => {
    test('Creates initial professional profile in DRAFT state with governed defaults', async () => {
      const profile = await registryService.createProfile({
        userId: APPLICANT_USER_ID,
        professionalType: ProfessionalType.CLINICAL_PSYCHOLOGIST,
        displayName: 'Dr. Jane Doe, PsyD',
        legalNameReference: 'Jane Wambui Doe',
        bio: 'Specialist in cognitive behavioral therapy and trauma recovery.',
        jurisdictions: ['KE'],
        languages: ['English', 'Swahili'],
        deliveryModes: [DeliveryMode.TELEHEALTH, DeliveryMode.IN_PERSON]
      });

      assert.equal(profile.user_id, APPLICANT_USER_ID);
      assert.equal(profile.status, ProfessionalState.DRAFT);
      assert.equal(profile.verification_status, ProfessionalVerificationState.DRAFT);
      assert.deepEqual(profile.jurisdictions, ['KE']);
      assert.equal(profile.profile_visibility, ProfileVisibility.PUBLIC_DIRECTORY);
    });

    test('Rejects duplicate professional profile for the same user account', async () => {
      await registryService.createProfile({
        userId: APPLICANT_USER_ID,
        professionalType: ProfessionalType.COUNSELLOR,
        displayName: 'Counselor John',
        legalNameReference: 'John Kamau'
      });

      await assert.rejects(
        () => registryService.createProfile({
          userId: APPLICANT_USER_ID,
          professionalType: ProfessionalType.COUNSELLOR,
          displayName: 'Counselor John Duplicate',
          legalNameReference: 'John Kamau'
        }),
        (err: Error) => {
          assert.match(err.message, /already exists/);
          return true;
        }
      );
    });

    test('Moderation: Rejects unsubstantiated clinical or cure claims in bio', async () => {
      await assert.rejects(
        () => registryService.createProfile({
          userId: APPLICANT_USER_ID,
          professionalType: ProfessionalType.COUNSELLOR,
          displayName: 'Counselor Unsafe',
          legalNameReference: 'Unsafe Tester',
          bio: 'I offer a guaranteed cure for clinical depression in 3 sessions!'
        }),
        (err: Error) => {
          assert.match(err.message, /PROHIBITED_MARKETING_CLAIM/);
          return true;
        }
      );
    });
  });

  // ============================================================================
  // 2. Credentials, Licensure & Duplicate Protection (Appendix Q)
  // ============================================================================
  describe('2. Credentials, Regulatory Licensure & Tamper-Evidence', () => {
    test('Attaches degree credential and validates statutory council registration', async () => {
      const profile = await registryService.createProfile({
        userId: APPLICANT_USER_ID,
        professionalType: ProfessionalType.CLINICAL_PSYCHOLOGIST,
        displayName: 'Dr. Jane Doe',
        legalNameReference: 'Jane Doe'
      });

      const cred = await registryService.addCredential({
        professionalId: profile.id,
        credentialType: CredentialType.DEGREE,
        title: 'Doctor of Psychology (PsyD)',
        issuer: 'University of Nairobi',
        issueDate: '2018-12-10',
        credentialNumberReference: 'UON-GRAD-2018-8821'
      });

      assert.equal(cred.status, CredentialStatus.PENDING);
      assert.equal(cred.title, 'Doctor of Psychology (PsyD)');

      const reg = await registryService.addRegistration({
        professionalId: profile.id,
        authorityId: 'KMPDC',
        registrationType: 'SPECIALIST_PRACTICING_LICENSE',
        registrationNumber: 'KMPDC-PSY-2026-9901',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-12-31T23:59:59.000Z'
      });

      assert.equal(reg.status, 'PENDING_VERIFICATION');
      assert.equal(reg.authority_id, 'KMPDC');
    });

    test('Rejects unrecognized statutory authority', async () => {
      const profile = await registryService.createProfile({
        userId: APPLICANT_USER_ID,
        professionalType: ProfessionalType.COUNSELLOR,
        displayName: 'Test Counselor',
        legalNameReference: 'Test Name'
      });

      await assert.rejects(
        () => registryService.addRegistration({
          professionalId: profile.id,
          authorityId: 'UNKNOWN_COUNCIL_XYZ',
          registrationType: 'PRACTICING_LICENSE',
          registrationNumber: 'XYZ-12345',
          issuedAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2027-12-31T23:59:59.000Z'
        }),
        (err: Error) => {
          assert.match(err.message, /not recognized/);
          return true;
        }
      );
    });

    test('Rejects duplicate active registration number across multiple profiles', async () => {
      // Profile 1
      const profile1 = await registryService.createProfile({
        userId: APPLICANT_USER_ID,
        professionalType: ProfessionalType.COUNSELLOR,
        displayName: 'Counselor 1',
        legalNameReference: 'Counselor One'
      });

      const reg1 = await registryService.addRegistration({
        professionalId: profile1.id,
        authorityId: 'KMPDC',
        registrationType: 'COUNSELOR_LICENSE',
        registrationNumber: 'KMPDC-CNS-2026-0001',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-12-31T23:59:59.000Z'
      });
      reg1.status = 'ACTIVE';
      await repo.saveRegistration(reg1);

      // Profile 2 tries to use the same registration number
      const profile2 = await registryService.createProfile({
        userId: '01918c00-0010-7000-8000-000000000089',
        professionalType: ProfessionalType.COUNSELLOR,
        displayName: 'Counselor 2',
        legalNameReference: 'Counselor Two'
      });

      await assert.rejects(
        () => registryService.addRegistration({
          professionalId: profile2.id,
          authorityId: 'KMPDC',
          registrationType: 'COUNSELOR_LICENSE',
          registrationNumber: 'KMPDC-CNS-2026-0001',
          issuedAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2027-12-31T23:59:59.000Z'
        }),
        (err: Error) => {
          assert.ok(err instanceof DuplicateProfessionalRegistrationError);
          return true;
        }
      );
    });
  });

  // ============================================================================
  // 3. Verification Workflow & Separation of Duties (Section 21, ADR-016)
  // ============================================================================
  describe('3. Verification Workflow & Separation of Duties', () => {
    test('Self-Verification Prohibition: Applicant cannot review or approve own verification', async () => {
      const profile = await registryService.createProfile({
        userId: APPLICANT_USER_ID,
        professionalType: ProfessionalType.CLINICAL_PSYCHOLOGIST,
        displayName: 'Applicant Self',
        legalNameReference: 'Self Reviewer'
      });

      await registryService.addRegistration({
        professionalId: profile.id,
        authorityId: 'KMPDC',
        registrationType: 'PRACTICING_LICENSE',
        registrationNumber: 'KMPDC-PSY-SELF-01',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-12-31T23:59:59.000Z'
      });

      const vCase = await verificationService.submitVerificationCase({
        professionalId: profile.id,
        applicantUserId: APPLICANT_USER_ID
      });

      // Applicant attempts to record a check on their own case
      await assert.rejects(
        () => verificationService.recordVerificationCheck({
          caseId: vCase.id,
          reviewerUserId: APPLICANT_USER_ID, // VIOLATION!
          reviewerRoles: ['PROVIDER_VERIFICATION_REVIEWER'],
          checkType: 'CREDENTIAL_VALIDITY',
          status: 'PASSED'
        }),
        (err: Error) => {
          assert.ok(err instanceof SelfVerificationProhibitedError);
          return true;
        }
      );

      // Applicant attempts to issue a decision on their own case
      await assert.rejects(
        () => verificationService.issueDecision({
          caseId: vCase.id,
          reviewerUserId: APPLICANT_USER_ID, // VIOLATION!
          reviewerRoles: ['PROVIDER_VERIFICATION_REVIEWER'],
          decision: VerificationDecision.VERIFY,
          decisionReason: 'I verify myself'
        }),
        (err: Error) => {
          assert.ok(err instanceof SelfVerificationProhibitedError);
          return true;
        }
      );
    });

    test('Verifier Role Enforcement: Verifier must hold governed verification role', async () => {
      const profile = await registryService.createProfile({
        userId: APPLICANT_USER_ID,
        professionalType: ProfessionalType.COUNSELLOR,
        displayName: 'Applicant',
        legalNameReference: 'Applicant Name'
      });

      await registryService.addRegistration({
        professionalId: profile.id,
        authorityId: 'KMPDC',
        registrationType: 'PRACTICING_LICENSE',
        registrationNumber: 'KMPDC-CNS-ROLE-01',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-12-31T23:59:59.000Z'
      });

      const vCase = await verificationService.submitVerificationCase({
        professionalId: profile.id,
        applicantUserId: APPLICANT_USER_ID
      });

      await assert.rejects(
        () => verificationService.recordVerificationCheck({
          caseId: vCase.id,
          reviewerUserId: REVIEWER_USER_ID,
          reviewerRoles: ['USER'], // NOT a verifier role!
          checkType: 'IDENTITY',
          status: 'PASSED'
        }),
        (err: Error) => {
          assert.ok(err instanceof SeparationOfDutiesViolationError);
          return true;
        }
      );
    });

    test('Successful End-to-End Verification transitions Profile and derives Scope', async () => {
      const profile = await registryService.createProfile({
        userId: APPLICANT_USER_ID,
        professionalType: ProfessionalType.CLINICAL_PSYCHOLOGIST,
        displayName: 'Dr. Sarah Mutua, PhD',
        legalNameReference: 'Sarah Wambui Mutua'
      });

      await registryService.addRegistration({
        professionalId: profile.id,
        authorityId: 'KMPDC',
        registrationType: 'SPECIALIST_LICENSE',
        registrationNumber: 'KMPDC-PSY-2026-7788',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-12-31T23:59:59.000Z'
      });

      const vCase = await verificationService.submitVerificationCase({
        professionalId: profile.id,
        applicantUserId: APPLICANT_USER_ID
      });

      assert.equal(vCase.status, VerificationCaseStatus.SUBMITTED);

      // Verifier records checks
      await verificationService.recordVerificationCheck({
        caseId: vCase.id,
        reviewerUserId: REVIEWER_USER_ID,
        reviewerRoles: REVIEWER_ROLES,
        checkType: 'IDENTITY',
        status: 'PASSED',
        notes: 'National ID verified'
      });

      await verificationService.recordVerificationCheck({
        caseId: vCase.id,
        reviewerUserId: REVIEWER_USER_ID,
        reviewerRoles: REVIEWER_ROLES,
        checkType: 'REGULATORY_COUNCIL',
        status: 'PASSED',
        notes: 'Verified directly with KMPDC register'
      });

      // Issue decision: VERIFY
      const completedCase = await verificationService.issueDecision({
        caseId: vCase.id,
        reviewerUserId: REVIEWER_USER_ID,
        reviewerRoles: REVIEWER_ROLES,
        decision: VerificationDecision.VERIFY,
        decisionReason: 'All credentials and council registrations authentic and active.'
      });

      assert.equal(completedCase.status, VerificationCaseStatus.VERIFIED);
      assert.equal(completedCase.decision, VerificationDecision.VERIFY);

      // Verify profile state updated
      const updatedProfile = await repo.findProfileById(profile.id);
      assert.equal(updatedProfile?.status, ProfessionalState.ACTIVE);
      assert.equal(updatedProfile?.verification_status, ProfessionalVerificationState.VERIFIED);

      // Verify scope was derived
      const scope = await repo.findActiveScopeByProfessionalId(profile.id);
      assert.ok(scope);
      assert.equal(scope.scope_type, ScopeType.CLINICAL_PSYCHOLOGY);
      assert.ok(scope.allowed_service_types.includes(ServiceType.PSYCHOLOGY_SESSION));
      assert.ok(scope.restrictions.includes('NON_PRESCRIBING'));

      // Verify provider created and discoverable
      const provider = await repo.findProviderByProfileId(profile.id);
      assert.ok(provider);
      assert.equal(provider.status, ProviderStatus.ACTIVE);
      assert.equal(provider.discoverability_status, DiscoverabilityStatus.DISCOVERABLE);
    });
  });

  // ============================================================================
  // 4. Scope of Practice & Clinical Boundary Enforcement (ADR-028)
  // ============================================================================
  describe('4. Scope of Practice & Clinical Boundary Enforcement', () => {
    test('Psychiatry Exclusivity: Non-psychiatrist cannot deliver psychiatry consultation', async () => {
      const psychologistProfile = {
        id: 'prof-psy-01',
        professional_type: ProfessionalType.CLINICAL_PSYCHOLOGIST,
        jurisdictions: ['KE']
      } as any;

      const scope = {
        id: 'scope-01',
        professional_id: 'prof-psy-01',
        scope_type: ScopeType.CLINICAL_PSYCHOLOGY,
        allowed_service_types: [ServiceType.PSYCHOLOGY_SESSION, ServiceType.COUNSELLING_SESSION],
        allowed_populations: [TargetPopulation.ADULTS],
        allowed_modalities: [DeliveryMode.TELEHEALTH],
        restrictions: ['NON_PRESCRIBING'],
        status: 'ACTIVE'
      } as any;

      const evalResult = ProfessionalScopeService.validateScope({
        professional: psychologistProfile,
        scope,
        serviceType: ServiceType.PSYCHIATRY_CONSULTATION, // OUT OF SCOPE!
        population: TargetPopulation.ADULTS,
        deliveryMode: DeliveryMode.TELEHEALTH,
        jurisdiction: 'KE'
      });

      assert.equal(evalResult.allowed, false);
      assert.ok(evalResult.reason_codes.some(r => r.includes('SERVICE_TYPE_OUT_OF_SCOPE')));
    });

    test('Minor Population Protection: Scope restricted from treating minors blocks youth services', async () => {
      const adultOnlyScope = {
        id: 'scope-adults-01',
        professional_id: 'prof-adults-01',
        scope_type: ScopeType.GENERAL_COUNSELLING,
        allowed_service_types: [ServiceType.COUNSELLING_SESSION],
        allowed_populations: [TargetPopulation.ADULTS], // ONLY adults
        allowed_modalities: [DeliveryMode.TELEHEALTH],
        restrictions: ['ADULTS_ONLY', 'NO_MINORS'],
        status: 'ACTIVE'
      } as any;

      const evalResult = ProfessionalScopeService.validateScope({
        professional: { jurisdictions: ['KE'] } as any,
        scope: adultOnlyScope,
        serviceType: ServiceType.COUNSELLING_SESSION,
        population: TargetPopulation.CHILDREN, // MINOR!
        deliveryMode: DeliveryMode.TELEHEALTH,
        jurisdiction: 'KE'
      });

      assert.equal(evalResult.allowed, false);
      assert.ok(evalResult.reason_codes.some(r => r.includes('POPULATION_OUT_OF_SCOPE') || r.includes('MINOR_PATIENTS_RESTRICTED')));
    });

    test('Service Offering Creation enforces Scope of Practice', async () => {
      // Seed a verified counselor with adult-only counselling scope
      const profile = await registryService.createProfile({
        userId: APPLICANT_USER_ID,
        professionalType: ProfessionalType.COUNSELLOR,
        displayName: 'Counselor Mark',
        legalNameReference: 'Mark Kibet'
      });

      await registryService.addRegistration({
        professionalId: profile.id,
        authorityId: 'KMPDC',
        registrationType: 'PRACTICING_LICENSE',
        registrationNumber: 'KMPDC-CNS-2026-MARK',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-12-31T23:59:59.000Z'
      });

      const vCase = await verificationService.submitVerificationCase({
        professionalId: profile.id,
        applicantUserId: APPLICANT_USER_ID
      });

      await verificationService.recordVerificationCheck({
        caseId: vCase.id,
        reviewerUserId: REVIEWER_USER_ID,
        reviewerRoles: REVIEWER_ROLES,
        checkType: 'IDENTITY',
        status: 'PASSED'
      });

      await verificationService.issueDecision({
        caseId: vCase.id,
        reviewerUserId: REVIEWER_USER_ID,
        reviewerRoles: REVIEWER_ROLES,
        decision: VerificationDecision.VERIFY,
        decisionReason: 'Verified'
      });

      const provider = (await repo.findProviderByProfileId(profile.id))!;

      // Allowed: Adult Counselling Session
      const allowedService = await registryService.createServiceOffering({
        providerId: provider.id,
        serviceCode: 'CNS-ADULT-50',
        serviceType: ServiceType.COUNSELLING_SESSION,
        name: 'Individual Adult Counselling',
        description: 'Supportive adult counselling.',
        deliveryMode: DeliveryMode.TELEHEALTH,
        population: TargetPopulation.ADULTS,
        pricingReference: { currency: 'KES', amount: 3000, billing_model: 'PER_SESSION' }
      });

      assert.equal(allowedService.status, ServiceOfferingStatus.ACTIVE);

      // Prohibited: Psychiatry Consultation (Out of scope for counselor!)
      await assert.rejects(
        () => registryService.createServiceOffering({
          providerId: provider.id,
          serviceCode: 'PSY-CONS-50',
          serviceType: ServiceType.PSYCHIATRY_CONSULTATION, // ILLEGAL
          name: 'Psychiatry Evaluation',
          description: 'Medication management.',
          deliveryMode: DeliveryMode.TELEHEALTH,
          population: TargetPopulation.ADULTS
        }),
        (err: Error) => {
          assert.ok(err instanceof ProfessionalScopeDeniedError);
          return true;
        }
      );
    });
  });

  // ============================================================================
  // 5. Provider Registry, Public Projection & Discoverability (ADR-030)
  // ============================================================================
  describe('5. Provider Registry & Governed Public Discoverability', () => {
    test('Strict Projection: Conceals raw internal notes, license documents & PII', async () => {
      // Use seeded canonical providers
      const results = await ProfessionalService.getRegistryService().searchDiscoverableProviders({
        jurisdiction: 'KE',
        serviceType: ServiceType.PSYCHOLOGY_SESSION
      });

      assert.ok(results.length > 0);
      const first = results[0];

      // Safe fields present
      assert.ok(first.display_name);
      assert.ok(first.professional_type);
      assert.ok(first.services.length > 0);

      // Invariant: No raw national ID, evidence vault hash, or reviewer identity leaked
      assert.equal((first as any).legal_name_reference, undefined);
      assert.equal((first as any).user_id, undefined);
      assert.equal((first as any).evidence_id, undefined);
      assert.equal((first as any).verification_checks, undefined);
    });

    test('Filters discoverable providers by specialty and delivery mode', async () => {
      const results = await ProfessionalService.getRegistryService().searchDiscoverableProviders({
        specialtyCode: 'TRAUMA_PTSD',
        deliveryMode: DeliveryMode.TELEHEALTH
      });

      assert.ok(results.length > 0);
      for (const p of results) {
        assert.ok(p.specialties.includes('TRAUMA_PTSD'));
        assert.ok(p.delivery_modes.includes(DeliveryMode.TELEHEALTH));
      }
    });

    test('Specialty Registry: Governed taxonomy validates mental health specialties', () => {
      assert.equal(SpecialtyRegistry.isValidSpecialty('DEPRESSION'), true);
      assert.equal(SpecialtyRegistry.isValidSpecialty('ANXIETY'), true);
      assert.equal(SpecialtyRegistry.isValidSpecialty('TRAUMA_PTSD'), true);
      assert.equal(SpecialtyRegistry.isValidSpecialty('INVALID_FAKE_SPECIALTY'), false);
    });
  });

  // ============================================================================
  // 6. Suspension Workflow & Cascading Effects (ADR-031)
  // ============================================================================
  describe('6. Suspension Workflow & Cascading Effects', () => {
    test('Suspending a provider cascades to Scope, Services, and Directory Removal', async () => {
      // Create and verify a provider
      const profile = await registryService.createProfile({
        userId: APPLICANT_USER_ID,
        professionalType: ProfessionalType.COUNSELLOR,
        displayName: 'Counselor To Suspend',
        legalNameReference: 'Suspension Test'
      });

      await registryService.addRegistration({
        professionalId: profile.id,
        authorityId: 'KMPDC',
        registrationType: 'PRACTICING_LICENSE',
        registrationNumber: 'KMPDC-SUSP-01',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-12-31T23:59:59.000Z'
      });

      const vCase = await verificationService.submitVerificationCase({
        professionalId: profile.id,
        applicantUserId: APPLICANT_USER_ID
      });

      await verificationService.recordVerificationCheck({
        caseId: vCase.id,
        reviewerUserId: REVIEWER_USER_ID,
        reviewerRoles: REVIEWER_ROLES,
        checkType: 'IDENTITY',
        status: 'PASSED'
      });

      await verificationService.issueDecision({
        caseId: vCase.id,
        reviewerUserId: REVIEWER_USER_ID,
        reviewerRoles: REVIEWER_ROLES,
        decision: VerificationDecision.VERIFY,
        decisionReason: 'Verified'
      });

      const provider = (await repo.findProviderByProfileId(profile.id))!;

      // Add active service
      const service = await registryService.createServiceOffering({
        providerId: provider.id,
        serviceCode: 'CNS-TEST',
        serviceType: ServiceType.COUNSELLING_SESSION,
        name: 'Test Counselling',
        description: 'Test description',
        deliveryMode: DeliveryMode.TELEHEALTH,
        population: TargetPopulation.ADULTS
      });

      assert.equal(service.status, ServiceOfferingStatus.ACTIVE);

      // Now issue formal suspension
      await verificationService.suspendProfessional(
        profile.id,
        SuspensionReasonCode.SAFETY_ISSUE,
        'Clinical safety breach reported and pending formal disciplinary inquiry.',
        REVIEWER_USER_ID
      );

      // 1. Profile suspended
      const updatedProfile = await repo.findProfileById(profile.id);
      assert.equal(updatedProfile?.status, ProfessionalState.SUSPENDED);

      // 2. Scope suspended
      const scope = await repo.findActiveScopeByProfessionalId(profile.id);
      assert.equal(scope, null); // No active scope

      // 3. Provider suspended & hidden
      const updatedProvider = await repo.findProviderById(provider.id);
      assert.equal(updatedProvider?.status, ProviderStatus.SUSPENDED);
      assert.equal(updatedProvider?.discoverability_status, DiscoverabilityStatus.SUSPENDED);

      // 4. Service offering suspended
      const updatedService = await repo.findServiceOfferingById(service.id);
      assert.equal(updatedService?.status, ServiceOfferingStatus.SUSPENDED);

      // 5. Creating new services blocked
      await assert.rejects(
        () => registryService.createServiceOffering({
          providerId: provider.id,
          serviceCode: 'CNS-NEW',
          serviceType: ServiceType.COUNSELLING_SESSION,
          name: 'Blocked Service',
          description: 'Blocked description',
          deliveryMode: DeliveryMode.TELEHEALTH,
          population: TargetPopulation.ADULTS
        }),
        (err: Error) => {
          assert.ok(err instanceof ProfessionalSuspendedError);
          return true;
        }
      );
    });
  });

  // ============================================================================
  // 7. Continuous Eligibility & Credential Expiration (ADR-027)
  // ============================================================================
  describe('7. Continuous Eligibility & Credential Expiration Audit', () => {
    test('Detects expired registrations and revokes active status and discoverability', async () => {
      const profile = await registryService.createProfile({
        userId: APPLICANT_USER_ID,
        professionalType: ProfessionalType.COUNSELLOR,
        displayName: 'Dr. Expired License',
        legalNameReference: 'Expired Tester'
      });

      // Add an already-expired license (expired yesterday)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const reg = await registryService.addRegistration({
        professionalId: profile.id,
        authorityId: 'KMPDC',
        registrationType: 'PRACTICING_LICENSE',
        registrationNumber: 'KMPDC-EXP-001',
        issuedAt: '2024-01-01T00:00:00.000Z',
        expiresAt: yesterday
      });
      reg.status = 'ACTIVE';
      await repo.saveRegistration(reg);

      const provider = {
        id: generateUUIDv7(),
        professional_profile_id: profile.id,
        provider_type: ProfessionalType.COUNSELLOR as any,
        status: ProviderStatus.ACTIVE,
        verification_status: ProfessionalVerificationState.VERIFIED,
        jurisdictions: ['KE'],
        organization_refs: [],
        discoverability_status: DiscoverabilityStatus.DISCOVERABLE,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await repo.saveProvider(provider);

      // Run continuous eligibility evaluation
      const auditResult = await verificationService.evaluateCredentialExpirations();
      assert.equal(auditResult.expiredCount, 1);

      // Verify registration transitioned to EXPIRED
      const updatedReg = await repo.findRegistrationById(reg.id);
      assert.equal(updatedReg?.status, 'EXPIRED');

      // Verify profile transitioned to EXPIRED
      const updatedProfile = await repo.findProfileById(profile.id);
      assert.equal(updatedProfile?.status, ProfessionalState.EXPIRED);

      // Verify provider hidden from directory
      const updatedProvider = await repo.findProviderById(provider.id);
      assert.equal(updatedProvider?.discoverability_status, DiscoverabilityStatus.HIDDEN);
    });
  });

  // ============================================================================
  // 8. Care-Network Destination Eligibility & Referral Anchoring (ADR-032)
  // ============================================================================
  describe('8. Care-Network Destination Eligibility & Referral Anchoring', () => {
    test('Generates immutable destination eligibility snapshot for referral routing', async () => {
      const canonicalPsychologistId = '01918c00-0030-7000-8000-000000000001';

      const eligibility = await ProfessionalService.getRegistryService().evaluateCareNetworkEligibility(
        canonicalPsychologistId,
        ServiceType.PSYCHOLOGY_SESSION,
        TargetPopulation.ADULTS,
        DeliveryMode.TELEHEALTH,
        'KE'
      );

      assert.equal(eligibility.eligible, true);
      assert.ok(eligibility.destination_snapshot);
      assert.equal(eligibility.destination_snapshot.provider_id, canonicalPsychologistId);
      assert.equal(eligibility.destination_snapshot.regulatory_body, 'KMPDC');
      assert.equal(eligibility.destination_snapshot.verification_state, ProfessionalVerificationState.VERIFIED);
      assert.ok(eligibility.destination_snapshot.license_number.includes('KMPDC'));
    });

    test('Ineligible if service type is not in provider scope or active services', async () => {
      const canonicalPsychologistId = '01918c00-0030-7000-8000-000000000001';

      const eligibility = await ProfessionalService.getRegistryService().evaluateCareNetworkEligibility(
        canonicalPsychologistId,
        ServiceType.PSYCHIATRY_CONSULTATION, // Out of scope for psychologist!
        TargetPopulation.ADULTS,
        DeliveryMode.TELEHEALTH,
        'KE'
      );

      assert.equal(eligibility.eligible, false);
      assert.ok(eligibility.reasons.some(r => r.includes('SERVICE_TYPE_OUT_OF_SCOPE') || r.includes('MATCHING_SERVICE')));
      assert.equal(eligibility.destination_snapshot, undefined);
    });
  });

  // ============================================================================
  // 9. Integration with Care & Appointments Contexts
  // ============================================================================
  describe('9. Cross-Context Verification Enforcement', () => {
    test('CareService establishes relationship with verified professional', async () => {
      const canonicalPsychologistId = '01918c00-0030-7000-8000-000000000001';

      assert.equal(ProfessionalService.isVerified(canonicalPsychologistId), true);

      const rel = await CareService.establishRelationship({
        clientId: 'client-user-99',
        professionalId: canonicalPsychologistId
      });

      assert.ok(rel.id);
      assert.equal(rel.professional_id, canonicalPsychologistId);
    });

    test('AppointmentService blocks booking with unverified provider', async () => {
      const unverifiedId = 'unverified-provider-id-999';

      assert.equal(ProfessionalService.isVerified(unverifiedId), false);

      await assert.rejects(
        () => AppointmentService.bookAppointment({
          clientId: 'client-user-99',
          professionalId: unverifiedId,
          startTime: '2026-10-01T10:00:00.000Z',
          endTime: '2026-10-01T11:00:00.000Z'
        }),
        (err: Error) => {
          assert.match(err.message, /verified professionals/);
          return true;
        }
      );
    });
  });
});
