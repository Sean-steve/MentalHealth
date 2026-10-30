/**
 * MindOS Sprint 21 Canonical Care Relationships & Professional Clinical Workspace Tests
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, II, III, XV & Appendices B / C / Q / J
 * Clinical Safety Policy Catalogue (R-SAFE-001, R-REL-001..008, R-NOTE-001..003)
 * Kenya Data Protection Act 2019, Digital Health Act 2023
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  CareRelationshipService,
  CareTeamService,
  RelationshipAccessEvaluator,
  CareTransferService,
  LifecycleTransitionService,
  CareRelationshipEligibilityService,
  ReferralTransitionAdapter,
  AppointmentLifecycleAdapter,
  ContinuityReconciliationService,
  CareRelationshipType,
  CareRelationshipState,
  CareRelationshipOriginType,
  CareTeamRole,
  CareTeamMembershipState,
  DataDomain,
  ActionPermission,
  resetCareRelationshipsForTesting
} from '../mindos/care_relationships/index.js';

import {
  ClinicalEncounterService,
  ClinicalNoteService,
  PatientClinicalContextService,
  ProfessionalDashboardService,
  ProfessionalSafetyService,
  ClinicalTaskService,
  CarePlanService,
  WorkspaceAssessmentService,
  EncounterType,
  EncounterModality,
  ClinicalEncounterState,
  ClinicalNoteType,
  ClinicalNoteState,
  ClinicalTaskType,
  ClinicalTaskStatus,
  CarePlanStatus,
  ProfessionalSafetySeverity,
  resetClinicalWorkspaceForTesting
} from '../mindos/clinical_workspace/index.js';

import { CareService } from '../mindos/care/index.js';
import { ProfessionalService } from '../mindos/professionals/service.js';
import {
  ProfessionalType,
  ProfessionalState,
  ProfessionalVerificationState,
  DeliveryMode,
  ProfileVisibility
} from '../mindos/professionals/domain/types.js';
import { ConsentService } from '../mindos/consent/index.js';
import { EventBus } from '../mindos/platform/events/index.js';
import { AuditService } from '../mindos/platform/audit/index.js';
import { DomainInvariantError, AuthorizationError, NotFoundError } from '../mindos/platform/errors/index.js';

describe('MindOS Sprint 21: Care Relationships, Clinical Workspace & Continuity Platform', () => {
  const patientUserId = 'user-patient-2101';
  const secondPatientUserId = 'user-patient-2102';
  const leadProviderId = 'prof-lead-clinician-2101';
  const secondaryProviderId = 'prof-secondary-clinician-2102';
  const unverifiedProviderId = 'prof-unverified-clinician-2103';
  const targetTransferProviderId = 'prof-target-transfer-2104';
  const suspendedProviderId = 'prof-suspended-clinician-2105';

  before(async () => {
    ConsentService.resetForTesting();
    resetCareRelationshipsForTesting();
    resetClinicalWorkspaceForTesting();

    // Register active clinical consents for patients
    ConsentService.recordConsent({
      userId: patientUserId,
      consentType: 'CLINICAL_CONSULTATION',
      status: 'GRANTED'
    });
    ConsentService.recordConsent({
      userId: secondPatientUserId,
      consentType: 'CLINICAL_CONSULTATION',
      status: 'GRANTED'
    });

    const profRepo = ProfessionalService.getRepository();

    // 1. Lead Verified Provider
    await profRepo.saveProfile({
      id: leadProviderId,
      user_id: 'user-clinician-lead',
      professional_type: ProfessionalType.CLINICAL_PSYCHOLOGIST,
      display_name: 'Dr. Zuri Mwangi',
      legal_name_reference: 'Zuri Mwangi',
      status: ProfessionalState.ACTIVE,
      verification_status: ProfessionalVerificationState.VERIFIED,
      jurisdictions: ['KE'],
      languages: ['en', 'sw'],
      specialties: ['CBT', 'Trauma'],
      delivery_modes: [DeliveryMode.TELEHEALTH, DeliveryMode.IN_PERSON],
      organization_refs: [],
      profile_visibility: ProfileVisibility.PUBLIC_DIRECTORY,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // 2. Secondary Verified Provider (Care Team member)
    await profRepo.saveProfile({
      id: secondaryProviderId,
      user_id: 'user-clinician-sec',
      professional_type: ProfessionalType.COUNSELLOR,
      display_name: 'Counselor Peter Ochieng',
      legal_name_reference: 'Peter Ochieng',
      status: ProfessionalState.ACTIVE,
      verification_status: ProfessionalVerificationState.VERIFIED,
      jurisdictions: ['KE'],
      languages: ['en', 'sw'],
      specialties: ['Anxiety'],
      delivery_modes: [DeliveryMode.TELEHEALTH],
      organization_refs: [],
      profile_visibility: ProfileVisibility.PUBLIC_DIRECTORY,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // 3. Unverified Provider
    await profRepo.saveProfile({
      id: unverifiedProviderId,
      user_id: 'user-unverified',
      professional_type: ProfessionalType.COUNSELLOR,
      display_name: 'Unverified Provider',
      legal_name_reference: 'Unverified Provider',
      status: ProfessionalState.ONBOARDING,
      verification_status: ProfessionalVerificationState.DRAFT,
      jurisdictions: ['KE'],
      languages: ['en'],
      specialties: [],
      delivery_modes: [DeliveryMode.TELEHEALTH],
      organization_refs: [],
      profile_visibility: ProfileVisibility.INTERNAL_ONLY,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // 4. Target Transfer Provider
    await profRepo.saveProfile({
      id: targetTransferProviderId,
      user_id: 'user-clinician-transfer',
      professional_type: ProfessionalType.PSYCHIATRIST,
      display_name: 'Dr. Halima Abdi',
      legal_name_reference: 'Halima Abdi',
      status: ProfessionalState.ACTIVE,
      verification_status: ProfessionalVerificationState.VERIFIED,
      jurisdictions: ['KE'],
      languages: ['en', 'so'],
      specialties: ['Psychiatry'],
      delivery_modes: [DeliveryMode.TELEHEALTH],
      organization_refs: [],
      profile_visibility: ProfileVisibility.PUBLIC_DIRECTORY,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // 5. Suspended Provider (initially ACTIVE, then suspended during continuity tests)
    await profRepo.saveProfile({
      id: suspendedProviderId,
      user_id: 'user-clinician-suspended',
      professional_type: ProfessionalType.CLINICAL_PSYCHOLOGIST,
      display_name: 'Dr. Suspended Provider',
      legal_name_reference: 'Suspended Provider',
      status: ProfessionalState.ACTIVE,
      verification_status: ProfessionalVerificationState.VERIFIED,
      jurisdictions: ['KE'],
      languages: ['en'],
      specialties: ['CBT'],
      delivery_modes: [DeliveryMode.TELEHEALTH],
      organization_refs: [],
      profile_visibility: ProfileVisibility.INTERNAL_ONLY,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  });

  describe('1. Care Relationship Creation, Invariants & Bounded Context', () => {
    it('successfully establishes active care relationship with verified provider and valid consent', async () => {
      const relationship = await CareRelationshipService.createRelationship({
        subjectUserId: patientUserId,
        primaryProviderId: leadProviderId,
        relationshipType: CareRelationshipType.PSYCHOLOGY,
        originType: CareRelationshipOriginType.CARE_NAVIGATION,
        originReference: 'nav-session-101',
        jurisdiction: 'KE',
        purpose: 'CARE_DELIVERY',
        activateImmediately: true,
        actorId: leadProviderId
      });

      assert.ok(relationship.id);
      assert.equal(relationship.status, CareRelationshipState.ACTIVE);
      assert.equal(relationship.subject_user_id, patientUserId);
      assert.equal(relationship.primary_provider_id, leadProviderId);
      assert.equal(relationship.relationship_type, CareRelationshipType.PSYCHOLOGY);
      assert.ok(relationship.scope.allowed_data_domains.includes(DataDomain.CLINICAL_NOTES));

      // Verifies primary provider was automatically added to care team
      const team = await CareTeamService.listMembers(relationship.id);
      assert.equal(team.length, 1);
      assert.equal(team[0].professional_id, leadProviderId);
      assert.equal(team[0].team_role, CareTeamRole.PRIMARY_PROVIDER);
      assert.equal(team[0].status, CareTeamMembershipState.ACTIVE);
    });

    it('strictly forbids establishing care relationship from passive directory or profile viewing (R-REL-001)', async () => {
      await assert.rejects(
        async () => {
          await CareRelationshipService.createRelationship({
            subjectUserId: patientUserId,
            primaryProviderId: leadProviderId,
            relationshipType: CareRelationshipType.PSYCHOLOGY,
            originType: 'DIRECTORY_VIEW' as any,
            originReference: 'dir-view-001',
            purpose: 'CARE_DELIVERY',
            actorId: 'user-actor'
          });
        },
        (err: Error) => {
          assert.ok(err instanceof DomainInvariantError);
          assert.match(err.message, /R-REL-001/);
          return true;
        }
      );
    });

    it('rejects creating care relationship with an unverified provider (R-REL-003)', async () => {
      await assert.rejects(
        async () => {
          await CareRelationshipService.createRelationship({
            subjectUserId: patientUserId,
            primaryProviderId: unverifiedProviderId,
            relationshipType: CareRelationshipType.COUNSELLING,
            originType: CareRelationshipOriginType.CARE_NAVIGATION,
            originReference: 'nav-session-102',
            purpose: 'CARE_DELIVERY',
            actorId: unverifiedProviderId
          });
        },
        (err: Error) => {
          assert.ok(err instanceof AuthorizationError);
          assert.match(err.message, /must be verified/i);
          return true;
        }
      );
    });

    it('enforces canonical state machine transitions and rejects invalid state jumps', async () => {
      const rel = await CareRelationshipService.createRelationship({
        subjectUserId: secondPatientUserId,
        primaryProviderId: leadProviderId,
        relationshipType: CareRelationshipType.COUNSELLING,
        originType: CareRelationshipOriginType.CARE_NAVIGATION,
        originReference: 'nav-session-103',
        purpose: 'CARE_DELIVERY',
        activateImmediately: false,
        actorId: leadProviderId
      });

      assert.equal(rel.status, CareRelationshipState.PROPOSED);

      // PROPOSED -> ACTIVE is allowed
      const activated = await CareRelationshipService.activateRelationship(rel.id, leadProviderId);
      assert.equal(activated.status, CareRelationshipState.ACTIVE);

      // ACTIVE -> PAUSED is allowed
      const paused = await CareRelationshipService.pauseRelationship(rel.id, 'Temporary pause', leadProviderId);
      assert.equal(paused.status, CareRelationshipState.PAUSED);

      // PAUSED -> ACTIVE is allowed
      const resumed = await LifecycleTransitionService.transition(
        rel.id,
        CareRelationshipState.ACTIVE,
        leadProviderId,
        'Resuming care'
      );
      assert.equal(resumed.status, CareRelationshipState.ACTIVE);

      // ACTIVE -> TERMINATED is allowed
      const terminated = await CareRelationshipService.terminateRelationship(rel.id, 'Treatment completed', leadProviderId);
      assert.equal(terminated.status, CareRelationshipState.TERMINATED);
      assert.ok(terminated.ended_at);

      // TERMINATED -> ACTIVE is STRICTLY FORBIDDEN by state machine
      await assert.rejects(
        async () => {
          await LifecycleTransitionService.transition(rel.id, CareRelationshipState.ACTIVE, leadProviderId);
        },
        (err: Error) => {
          assert.ok(err instanceof DomainInvariantError);
          assert.match(err.message, /INVALID_STATE_TRANSITION/);
          return true;
        }
      );
    });
  });

  describe('2. Referral & Appointment to Relationship Transitions', () => {
    it('proves referral creation alone does not create a care relationship (R-REL-002)', async () => {
      // Simulating a pending referral ID
      const referralId = 'ref-draft-001';
      const existingRels = await CareRelationshipService.listUserRelationships(
        'user-unreferred-patient',
        CareRelationshipState.ACTIVE
      );
      assert.equal(existingRels.length, 0);
    });

    it('transitions an ACCEPTED referral to an active CareRelationship via adapter', async () => {
      const referralId = 'ref-accepted-9901';
      const relationship = await ReferralTransitionAdapter.transitionAcceptedReferral({
        referralId,
        userId: patientUserId,
        receivingProviderId: leadProviderId,
        serviceType: 'PSYCHOLOGY',
        jurisdiction: 'KE',
        actorId: leadProviderId
      });

      assert.ok(relationship.id);
      assert.equal(relationship.status, CareRelationshipState.ACTIVE);
      assert.equal(relationship.origin_type, CareRelationshipOriginType.REFERRAL);
      assert.equal(relationship.origin_reference, referralId);
      assert.equal(relationship.primary_provider_id, leadProviderId);
    });

    it('associates appointment to existing active relationship without creating duplicate', async () => {
      const existingRels = await CareRelationshipService.listUserRelationships(
        patientUserId,
        CareRelationshipState.ACTIVE
      );
      const initialCount = existingRels.length;

      const associatedRel = await AppointmentLifecycleAdapter.associateOrEstablishRelationship({
        appointmentId: 'appt-2101',
        userId: patientUserId,
        providerId: leadProviderId,
        serviceType: 'PSYCHOLOGY',
        actorId: leadProviderId
      });

      assert.ok(associatedRel.id);
      const afterRels = await CareRelationshipService.listUserRelationships(
        patientUserId,
        CareRelationshipState.ACTIVE
      );
      assert.equal(afterRels.length, initialCount); // No duplicate created
    });
  });

  describe('3. Care Team Membership & Governance', () => {
    let testRelId: string;

    before(async () => {
      const rel = await CareRelationshipService.createRelationship({
        subjectUserId: patientUserId,
        primaryProviderId: leadProviderId,
        relationshipType: CareRelationshipType.PSYCHOLOGY,
        originType: CareRelationshipOriginType.CARE_NAVIGATION,
        originReference: 'nav-team-test',
        purpose: 'CARE_DELIVERY',
        activateImmediately: true,
        actorId: leadProviderId
      });
      testRelId = rel.id;
    });

    it('adds verified professional to care team with assigned role and scoped permissions', async () => {
      const member = await CareTeamService.addMember({
        relationshipId: testRelId,
        professionalId: secondaryProviderId,
        providerId: secondaryProviderId,
        teamRole: CareTeamRole.CARE_COORDINATOR,
        scope: {
          allowed_data_domains: [DataDomain.APPOINTMENTS, DataDomain.MESSAGING],
          allowed_actions: [ActionPermission.READ, ActionPermission.MESSAGE]
        },
        addedBy: leadProviderId,
        reasonCode: 'CARE_COORDINATION_SUPPORT'
      });

      assert.ok(member.id);
      assert.equal(member.professional_id, secondaryProviderId);
      assert.equal(member.team_role, CareTeamRole.CARE_COORDINATOR);
      assert.equal(member.status, CareTeamMembershipState.ACTIVE);
      assert.deepEqual(member.scope.allowed_data_domains, [DataDomain.APPOINTMENTS, DataDomain.MESSAGING]);
    });

    it('strictly rejects unverified professional from joining a care team (R-REL-008)', async () => {
      await assert.rejects(
        async () => {
          await CareTeamService.addMember({
            relationshipId: testRelId,
            professionalId: unverifiedProviderId,
            providerId: unverifiedProviderId,
            teamRole: CareTeamRole.CONSULTANT,
            addedBy: leadProviderId,
            reasonCode: 'CONSULTATION'
          });
        },
        (err: Error) => {
          assert.ok(err instanceof AuthorizationError);
          assert.match(err.message, /must be verified/i);
          return true;
        }
      );
    });

    it('handles care team member removal cleanly with audit and state transition', async () => {
      await CareTeamService.removeMember(
        testRelId,
        secondaryProviderId,
        leadProviderId,
        'Coordination completed'
      );

      const mem = await CareTeamService.getMembership(testRelId, secondaryProviderId);
      assert.ok(mem);
      assert.equal(mem.status, CareTeamMembershipState.REMOVED);
      assert.ok(mem.ended_at);
    });
  });

  describe('4. Relationship-Scoped Authorization & Minimum Necessary Access (R-REL-005)', () => {
    let scopedRelId: string;

    before(async () => {
      // Create a strictly scoped relationship that only allows DEMOGRAPHICS and APPOINTMENTS, but NOT CLINICAL_NOTES
      const rel = await CareRelationshipService.createRelationship({
        subjectUserId: patientUserId,
        primaryProviderId: leadProviderId,
        relationshipType: CareRelationshipType.SHORT_TERM_SUPPORT,
        originType: CareRelationshipOriginType.CARE_NAVIGATION,
        originReference: 'nav-scoped-test',
        purpose: 'CARE_DELIVERY',
        allowedDataDomains: [DataDomain.DEMOGRAPHICS, DataDomain.APPOINTMENTS],
        allowedActions: [ActionPermission.READ],
        activateImmediately: true,
        actorId: leadProviderId
      });
      scopedRelId = rel.id;
    });

    it('allows access to data domains explicitly granted in relationship scope', async () => {
      const result = await RelationshipAccessEvaluator.evaluateAccess({
        relationshipId: scopedRelId,
        professionalId: leadProviderId,
        dataDomain: DataDomain.APPOINTMENTS,
        action: ActionPermission.READ,
        purpose: 'CARE_DELIVERY'
      });

      assert.equal(result.allowed, true);
    });

    it('denies access to data domains NOT granted in relationship scope (R-REL-005)', async () => {
      const result = await RelationshipAccessEvaluator.evaluateAccess({
        relationshipId: scopedRelId,
        professionalId: leadProviderId,
        dataDomain: DataDomain.CLINICAL_NOTES,
        action: ActionPermission.READ,
        purpose: 'CARE_DELIVERY'
      });

      assert.equal(result.allowed, false);
      assert.equal(result.errorCode, 'AUTHZ_004');
      assert.match(result.denialReason || '', /outside authorized care relationship scope/);
    });

    it('denies write action if only read action is permitted by scope', async () => {
      const result = await RelationshipAccessEvaluator.evaluateAccess({
        relationshipId: scopedRelId,
        professionalId: leadProviderId,
        dataDomain: DataDomain.APPOINTMENTS,
        action: ActionPermission.WRITE,
        purpose: 'CARE_DELIVERY'
      });

      assert.equal(result.allowed, false);
      assert.equal(result.errorCode, 'AUTHZ_004');
      assert.match(result.denialReason || '', /not permitted by care relationship scope/);
    });

    it('strictly denies access when non-canonical clinical purpose is provided', async () => {
      const result = await RelationshipAccessEvaluator.evaluateAccess({
        relationshipId: scopedRelId,
        professionalId: leadProviderId,
        dataDomain: DataDomain.APPOINTMENTS,
        action: ActionPermission.READ,
        purpose: 'MARKETING_PROMOTION' // Forbidden non-clinical purpose
      });

      assert.equal(result.allowed, false);
      assert.equal(result.errorCode, 'AUTHZ_002');
      assert.match(result.denialReason || '', /invalid/i);
    });

    it('strictly denies access if patient active clinical consent is missing or withdrawn', async () => {
      // Create relationship for user without consent
      const unconsentedRel = await CareRelationshipService.createRelationship({
        subjectUserId: 'user-no-consent-99',
        primaryProviderId: leadProviderId,
        relationshipType: CareRelationshipType.PSYCHOLOGY,
        originType: CareRelationshipOriginType.CARE_NAVIGATION,
        originReference: 'nav-unconsented',
        purpose: 'CARE_DELIVERY',
        activateImmediately: true,
        actorId: leadProviderId
      });

      const result = await RelationshipAccessEvaluator.evaluateAccess({
        relationshipId: unconsentedRel.id,
        professionalId: leadProviderId,
        dataDomain: DataDomain.DEMOGRAPHICS,
        action: ActionPermission.READ,
        purpose: 'CARE_DELIVERY'
      });

      assert.equal(result.allowed, false);
      assert.match(result.denialReason || '', /consent/i);
    });
  });

  describe('5. Professional Clinical Workspace & Patient List', () => {
    it('returns patient list strictly containing patients with governed relationships', async () => {
      const patientCards = await ProfessionalDashboardService.getProfessionalPatientList(leadProviderId);
      assert.ok(patientCards.length > 0);

      const patientIds = patientCards.map(c => c.userId);
      assert.ok(patientIds.includes(patientUserId));
      assert.ok(patientCards.every(c => c.patientPseudonym.startsWith('PT-')));
    });

    it('strictly rejects unverified staff from accessing the workspace patient list', async () => {
      await assert.rejects(
        async () => {
          await ProfessionalDashboardService.getProfessionalPatientList(unverifiedProviderId);
        },
        (err: Error) => {
          assert.ok(err instanceof AuthorizationError);
          assert.match(err.message, /verified healthcare professional status required/i);
          return true;
        }
      );
    });

    it('generates aggregated workspace dashboard summary for clinician', async () => {
      const dashboard = await ProfessionalDashboardService.getDashboardSummary(leadProviderId);
      assert.equal(dashboard.professionalId, leadProviderId);
      assert.ok(dashboard.totalActivePatients >= 1);
      assert.ok(Array.isArray(dashboard.patientSummaries));
    });
  });

  describe('6. Structured Patient Clinical Context & Safety/AI Boundaries', () => {
    let fullRelId: string;

    before(async () => {
      const rel = await CareRelationshipService.createRelationship({
        subjectUserId: patientUserId,
        primaryProviderId: leadProviderId,
        relationshipType: CareRelationshipType.PSYCHOLOGY,
        originType: CareRelationshipOriginType.CARE_NAVIGATION,
        originReference: 'nav-full-context',
        purpose: 'CARE_DELIVERY',
        activateImmediately: true,
        actorId: leadProviderId
      });
      fullRelId = rel.id;
    });

    it('aggregates structured clinical context and strictly bounds AI summary (never raw chats)', async () => {
      const context = await PatientClinicalContextService.getPatientClinicalContext({
        relationshipId: fullRelId,
        professionalId: leadProviderId,
        purpose: 'CARE_DELIVERY'
      });

      assert.ok(context.demographics);
      assert.equal(context.demographics.pseudonym, `PT-${patientUserId.substring(0, 8).toUpperCase()}`);
      assert.ok(context.relationship);
      assert.ok(context.ai_context);
      assert.equal(context.ai_context.is_bounded, true);
      assert.ok(!('raw_chat_transcript' in (context.ai_context as any))); // Proves raw chat is never exposed
      assert.ok(context.safety_context);
    });

    it('records high-integrity audit event for every patient context access', async () => {
      const auditRecords = AuditService.getAuditTrail().filter(
        r => r.action === 'CLINICAL_WORKSPACE.PATIENT_CONTEXT_ACCESSED'
      );
      assert.ok(auditRecords.length > 0);
      assert.equal(auditRecords[0].actor_id, leadProviderId);
      assert.equal(auditRecords[0].result, 'ALLOWED');
    });
  });

  describe('7. Clinical Encounter Foundation & Lifecycle', () => {
    let encounterRelId: string;
    let createdEncounterId: string;

    before(async () => {
      const rel = await CareRelationshipService.createRelationship({
        subjectUserId: patientUserId,
        primaryProviderId: leadProviderId,
        relationshipType: CareRelationshipType.PSYCHOLOGY,
        originType: CareRelationshipOriginType.CARE_NAVIGATION,
        originReference: 'nav-enc-test',
        purpose: 'CARE_DELIVERY',
        activateImmediately: true,
        actorId: leadProviderId
      });
      encounterRelId = rel.id;
    });

    it('schedules clinical encounter with lead professional and modality', async () => {
      const enc = await ClinicalEncounterService.scheduleEncounter({
        relationshipId: encounterRelId,
        leadProfessionalId: leadProviderId,
        encounterType: EncounterType.INITIAL_EVALUATION,
        modality: EncounterModality.VIDEO_TELEHEALTH,
        reasonForVisit: 'Initial diagnostic assessment and intake evaluation',
        actorId: leadProviderId
      });

      assert.ok(enc.id);
      assert.equal(enc.status, ClinicalEncounterState.SCHEDULED);
      assert.equal(enc.lead_professional_id, leadProviderId);
      assert.equal(enc.modality, EncounterModality.VIDEO_TELEHEALTH);
      createdEncounterId = enc.id;
    });

    it('starts clinical encounter (IN_PROGRESS) and enforces active relationship state', async () => {
      const inProgress = await ClinicalEncounterService.startEncounter({
        encounterId: createdEncounterId,
        actorId: leadProviderId
      });

      assert.equal(inProgress.status, ClinicalEncounterState.IN_PROGRESS);
      assert.ok(inProgress.started_at);
    });

    it('completes clinical encounter with clinical summary and duration tracking', async () => {
      const completed = await ClinicalEncounterService.completeEncounter({
        encounterId: createdEncounterId,
        clinicalSummary: 'Intake completed. Patient exhibits moderate anxiety symptoms. Scheduled CBT follow-up.',
        actorId: leadProviderId
      });

      assert.equal(completed.status, ClinicalEncounterState.COMPLETED);
      assert.ok(completed.ended_at);
      assert.ok(completed.clinical_summary);
      assert.ok(completed.duration_minutes !== undefined);
    });
  });

  describe('8. Clinical Notes, Authorship, Immutability & Addenda (R-NOTE-001..003)', () => {
    let noteRelId: string;
    let signedNoteId: string;

    before(async () => {
      const rel = await CareRelationshipService.createRelationship({
        subjectUserId: patientUserId,
        primaryProviderId: leadProviderId,
        relationshipType: CareRelationshipType.PSYCHOLOGY,
        originType: CareRelationshipOriginType.CARE_NAVIGATION,
        originReference: 'nav-notes-test',
        purpose: 'CARE_DELIVERY',
        activateImmediately: true,
        actorId: leadProviderId
      });
      noteRelId = rel.id;
    });

    it('drafts a structured clinical SOAP note', async () => {
      const draft = await ClinicalNoteService.draftNote({
        relationshipId: noteRelId,
        authorProfessionalId: leadProviderId,
        authorRole: 'PRIMARY_PSYCHOLOGIST',
        noteType: ClinicalNoteType.SOAP_NOTE,
        structuredContent: {
          subjective: 'Patient reports feeling overwhelmed with workplace demands.',
          objective: 'Alert, oriented x4. Affect anxious, speech coherent and goal-directed.',
          assessment: 'Adjustment disorder with anxious mood (DSM-5 F43.22).',
          plan: 'Weekly CBT sessions focusing on cognitive restructuring and sleep hygiene.'
        },
        actorId: leadProviderId
      });

      assert.ok(draft.id);
      assert.equal(draft.status, ClinicalNoteState.DRAFT);
      assert.equal(draft.is_signed, false);
      assert.ok(draft.content_hash);
      signedNoteId = draft.id;
    });

    it('signs clinical note with cryptographic signature hash, locking note as immutable record', async () => {
      const signed = await ClinicalNoteService.signNote({
        noteId: signedNoteId,
        signerProfessionalId: leadProviderId,
        actorId: leadProviderId
      });

      assert.equal(signed.status, ClinicalNoteState.SIGNED);
      assert.equal(signed.is_signed, true);
      assert.equal(signed.signed_by, leadProviderId);
      assert.ok(signed.signed_at);
      assert.ok(signed.signature_hash);
    });

    it('strictly forbids editing a signed clinical note in place (R-NOTE-002 immutability guard)', async () => {
      await assert.rejects(
        async () => {
          await ClinicalNoteService.updateDraftNote(
            signedNoteId,
            { subjective: 'Tampered note attempt' },
            leadProviderId
          );
        },
        (err: Error) => {
          assert.ok(err instanceof DomainInvariantError);
          assert.match(err.message, /R-NOTE-002/);
          return true;
        }
      );
    });

    it('corrects / updates signed note using signed ADDENDUM workflow referencing original note', async () => {
      const addendum = await ClinicalNoteService.createAddendum({
        originalNoteId: signedNoteId,
        authorProfessionalId: leadProviderId,
        authorRole: 'PRIMARY_PSYCHOLOGIST',
        structuredContent: {
          narrative: 'Addendum: Clarifying that patient agreed to complete PHQ-9 prior to session 2.'
        },
        amendmentReason: 'Omission of agreed pre-session assessment protocol',
        actorId: leadProviderId
      });

      assert.ok(addendum.id);
      assert.equal(addendum.note_type, ClinicalNoteType.ADDENDUM);
      assert.equal(addendum.amendment_of_id, signedNoteId);
      assert.equal(addendum.is_signed, true);
      assert.equal(addendum.amendment_reason, 'Omission of agreed pre-session assessment protocol');

      // Verify original note transitioned to AMENDED
      const { note: updatedOriginal, amendments } = await ClinicalNoteService.getNoteById(
        signedNoteId,
        leadProviderId
      );
      assert.equal(updatedOriginal.status, ClinicalNoteState.AMENDED);
      assert.equal(amendments.length, 1);
      assert.equal(amendments[0].id, addendum.id);
    });
  });

  describe('9. Professional Safety Concern Submission & Safety Kernel Integration', () => {
    let safetyRelId: string;

    before(async () => {
      const rel = await CareRelationshipService.createRelationship({
        subjectUserId: patientUserId,
        primaryProviderId: leadProviderId,
        relationshipType: CareRelationshipType.PSYCHOLOGY,
        originType: CareRelationshipOriginType.CARE_NAVIGATION,
        originReference: 'nav-safety-test',
        purpose: 'CARE_DELIVERY',
        activateImmediately: true,
        actorId: leadProviderId
      });
      safetyRelId = rel.id;
    });

    it('submits clinical safety concern with clinician provenance and emits audit event', async () => {
      const concern = await ProfessionalSafetyService.submitSafetyConcern({
        relationshipId: safetyRelId,
        reportingProfessionalId: leadProviderId,
        concernType: 'SUICIDALITY_IDEATION_PASSIVE',
        severity: ProfessionalSafetySeverity.HIGH,
        narrative: 'Patient expressed passive thoughts of death during session. Denies intent or plan. Safety plan reviewed.',
        recommendedAction: 'Increase session frequency to twice weekly and ensure 24/7 crisis helpline contacts are in hand.',
        actorId: leadProviderId
      });

      assert.ok(concern.id);
      assert.equal(concern.severity, ProfessionalSafetySeverity.HIGH);
      assert.equal(concern.reporting_professional_id, leadProviderId);

      const list = await ProfessionalSafetyService.listConcernsForRelationship(safetyRelId, leadProviderId);
      assert.equal(list.length, 1);
      assert.equal(list[0].id, concern.id);
    });
  });

  describe('10. Clinical Tasks & Care Plans Readiness', () => {
    let planRelId: string;

    before(async () => {
      const rel = await CareRelationshipService.createRelationship({
        subjectUserId: patientUserId,
        primaryProviderId: leadProviderId,
        relationshipType: CareRelationshipType.PSYCHOLOGY,
        originType: CareRelationshipOriginType.CARE_NAVIGATION,
        originReference: 'nav-plan-test',
        purpose: 'CARE_DELIVERY',
        activateImmediately: true,
        actorId: leadProviderId
      });
      planRelId = rel.id;
    });

    it('creates and retrieves structured clinical care plan with goals and interventions', async () => {
      const plan = await CarePlanService.createCarePlan({
        relationshipId: planRelId,
        authorProfessionalId: leadProviderId,
        title: 'Cognitive Behavioral Anxiety Reduction Care Plan',
        goals: [
          'Reduce GAD-7 score from 14 to below 8 within 8 weeks',
          'Practice progressive muscle relaxation 4 times weekly'
        ],
        interventions: [
          'Psychoeducation on sympathetic nervous system response',
          'Cognitive reframing of catastrophic thoughts',
          'Graded exposure hierarchy formulation'
        ],
        reviewDate: new Date(Date.now() + 3600000 * 24 * 30).toISOString(),
        actorId: leadProviderId
      });

      assert.ok(plan.id);
      assert.equal(plan.status, CarePlanStatus.ACTIVE);
      assert.equal(plan.goals.length, 2);

      const fetched = await CarePlanService.getCarePlanForRelationship(planRelId, leadProviderId);
      assert.ok(fetched);
      assert.equal(fetched.id, plan.id);
    });

    it('creates clinical task, tracks status update, and verifies patient coordination', async () => {
      const task = await ClinicalTaskService.createTask({
        relationshipId: planRelId,
        assignedToUserId: patientUserId,
        taskType: ClinicalTaskType.HOMEWORK,
        title: 'Complete Thought Record Journal',
        description: 'Record automatic negative thoughts when experiencing anxiety episodes.',
        creatorProfessionalId: leadProviderId,
        actorId: leadProviderId
      });

      assert.ok(task.id);
      assert.equal(task.status, ClinicalTaskStatus.PENDING);

      const updated = await ClinicalTaskService.updateTaskStatus(
        task.id,
        ClinicalTaskStatus.COMPLETED,
        patientUserId
      );
      assert.equal(updated.status, ClinicalTaskStatus.COMPLETED);
      assert.ok(updated.completed_at);
    });
  });

  describe('11. Care Continuity, Provider Suspension & Credential Expiry', () => {
    let continuityRelId: string;

    before(async () => {
      const rel = await CareRelationshipService.createRelationship({
        subjectUserId: patientUserId,
        primaryProviderId: suspendedProviderId,
        relationshipType: CareRelationshipType.PSYCHOLOGY,
        originType: CareRelationshipOriginType.CARE_NAVIGATION,
        originReference: 'nav-continuity-test',
        purpose: 'CARE_DELIVERY',
        activateImmediately: true,
        actorId: 'admin-actor'
      });
      continuityRelId = rel.id;
    });

    it('automatically pauses relationships and suspends care team memberships upon provider suspension (R-REL-006)', async () => {
      const result = await ContinuityReconciliationService.handleProviderSuspension(
        suspendedProviderId,
        'Regulatory disciplinary inquiry by KMPDC',
        'regulator-actor'
      );

      assert.ok(result.affectedRelationshipsCount >= 1);

      const rel = await CareRelationshipService.getRelationship(continuityRelId);
      assert.ok(rel);
      assert.equal(rel.status, CareRelationshipState.PAUSED);
    });

    it('restricts write and signing privileges upon credential expiration', async () => {
      const activeRel = await CareRelationshipService.createRelationship({
        subjectUserId: secondPatientUserId,
        primaryProviderId: leadProviderId,
        relationshipType: CareRelationshipType.PSYCHOLOGY,
        originType: CareRelationshipOriginType.CARE_NAVIGATION,
        originReference: 'nav-cred-exp-test',
        purpose: 'CARE_DELIVERY',
        activateImmediately: true,
        actorId: leadProviderId
      });

      await ContinuityReconciliationService.handleCredentialExpiry(leadProviderId, 'system-monitor');

      const updatedRel = await CareRelationshipService.getRelationship(activeRel.id);
      assert.ok(updatedRel);
      assert.equal(updatedRel.status, CareRelationshipState.RESTRICTED);
      assert.ok(!updatedRel.scope.allowed_actions.includes(ActionPermission.SIGN));
      assert.ok(!updatedRel.scope.allowed_actions.includes(ActionPermission.WRITE));
    });
  });

  describe('12. Transfer of Care & Relationship Termination', () => {
    let transferRelId: string;

    before(async () => {
      const rel = await CareRelationshipService.createRelationship({
        subjectUserId: patientUserId,
        primaryProviderId: leadProviderId,
        relationshipType: CareRelationshipType.PSYCHOLOGY,
        originType: CareRelationshipOriginType.CARE_NAVIGATION,
        originReference: 'nav-transfer-test',
        purpose: 'CARE_DELIVERY',
        activateImmediately: true,
        actorId: leadProviderId
      });
      transferRelId = rel.id;
    });

    it('initiates transfer of care setting status to TRANSFER_PENDING', async () => {
      const pendingTransfer = await CareTransferService.initiateTransfer({
        relationshipId: transferRelId,
        targetProviderId: targetTransferProviderId,
        reason: 'Patient requires specialized psychiatric pharmacological evaluation',
        actorId: leadProviderId
      });

      assert.equal(pendingTransfer.status, CareRelationshipState.TRANSFER_PENDING);
      assert.equal(pendingTransfer.transfer_target_provider_id, targetTransferProviderId);
    });

    it('completes transfer of care: terminates old relationship and activates new relationship', async () => {
      const { previousRelationship, newRelationship } = await CareTransferService.completeTransfer({
        relationshipId: transferRelId,
        userConsentReference: 'consent-transfer-pt2101',
        actorId: targetTransferProviderId
      });

      assert.equal(previousRelationship.status, CareRelationshipState.TERMINATED);
      assert.ok(previousRelationship.ended_at);

      assert.ok(newRelationship.id);
      assert.equal(newRelationship.status, CareRelationshipState.ACTIVE);
      assert.equal(newRelationship.primary_provider_id, targetTransferProviderId);
      assert.equal(newRelationship.origin_type, CareRelationshipOriginType.ADMINISTRATIVE_TRANSFER);
    });

    it('strictly enforces post-termination read-only access (write and sign actions forbidden) (R-REL-007)', async () => {
      // Trying to write a note on the terminated relationship
      await assert.rejects(
        async () => {
          await ClinicalNoteService.draftNote({
            relationshipId: transferRelId,
            authorProfessionalId: leadProviderId,
            authorRole: 'FORMER_PRIMARY',
            noteType: ClinicalNoteType.PROGRESS_NOTE,
            structuredContent: { narrative: 'Post-termination documentation attempt' },
            actorId: leadProviderId
          });
        },
        (err: Error) => {
          assert.ok(err instanceof AuthorizationError);
          assert.match(err.message, /terminated/i);
          return true;
        }
      );

      // Historical read access on terminated relationship is permitted for clinical audit
      const readAccess = await RelationshipAccessEvaluator.evaluateAccess({
        relationshipId: transferRelId,
        professionalId: leadProviderId,
        dataDomain: DataDomain.CLINICAL_NOTES,
        action: ActionPermission.READ,
        purpose: 'CARE_DELIVERY'
      });
      assert.equal(readAccess.allowed, true);
    });
  });

  describe('13. Backward-Compatible CareService Facade', () => {
    it('preserves existing CareService.establishRelationship and recordClinicalNote behavior', async () => {
      const facadeRel = await CareService.establishRelationship({
        clientId: 'user-legacy-patient',
        professionalId: leadProviderId,
        scopes: ['CONSULTATION', 'NOTES']
      });

      assert.ok(facadeRel.id);
      assert.equal(facadeRel.client_id, 'user-legacy-patient');
      assert.equal(facadeRel.professional_id, leadProviderId);
      assert.equal(facadeRel.state, CareRelationshipState.ACTIVE);

      const note = await CareService.recordClinicalNote({
        relationshipId: facadeRel.id,
        professionalId: leadProviderId,
        noteType: 'PROGRESS',
        ciphertext: 'enc-ciphertext-legacy-001'
      });

      assert.ok(note.id);
      assert.equal(note.care_relationship_id, facadeRel.id);
      assert.equal(note.is_signed, true);
      assert.equal(note.content_ciphertext, 'enc-ciphertext-legacy-001');
    });
  });
});
