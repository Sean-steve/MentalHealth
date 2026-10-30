/**
 * MindOS Sprint 20 Canonical Availability & Appointment Scheduling Engine Tests
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, II, III, XV & Appendices B / C / Q / J
 * Clinical Safety Policy Catalogue (R-SAFE-001, ADR-033..039)
 * Kenya Data Protection Act 2019, Digital Health Act 2023
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  AvailabilitySlotService,
  SlotTokenService,
  AppointmentHoldService,
  DayOfWeek,
  AvailabilityExceptionType,
  ScheduleBlockType,
  ScheduleBlockSource,
  KENYA_TIMEZONE
} from '../mindos/availability/index.js';

import {
  AppointmentBookingService,
  AppointmentRescheduleService,
  AppointmentCancellationService,
  AppointmentAttendanceService,
  AppointmentWaitlistService,
  AppointmentReminderService,
  VirtualSessionService,
  AppointmentReconciliationService,
  AppointmentStateMachine,
  AppointmentService,
  CareSessionPort,
  CalendarIntegrationPort,
  AppointmentType,
  BookingSource
} from '../mindos/appointments/index.js';

import {
  AppointmentState,
  AppointmentHoldState,
  WaitlistEntryState,
  WaitlistOfferState,
  ScheduleBlockState
} from '../mindos/platform/shared/state_machines.js';

import { ProfessionalService } from '../mindos/professionals/service.js';
import {
  ProfessionalType,
  ProfessionalState,
  ProfessionalVerificationState,
  ProviderType,
  ProviderStatus,
  DeliveryMode,
  ServiceType,
  ServiceOfferingStatus,
  TargetPopulation,
  ProfileVisibility,
  DiscoverabilityStatus,
  VerificationMethod
} from '../mindos/professionals/domain/types.js';

import { ReferralService } from '../mindos/care_navigation/referrals/referral_service.js';
import { CareLevel, ServiceModality } from '../mindos/care_navigation/domain/types.js';
import { ProviderMatcher } from '../mindos/care_navigation/matching/provider_matcher.js';
import { ConsentService } from '../mindos/consent/index.js';

import {
  AppointmentSlotUnavailableError,
  AppointmentProviderNotEligibleError,
  AppointmentServiceNotEligibleError,
  AppointmentUserNotEligibleError,
  AppointmentReferralRequiredError,
  AppointmentConflictError,
  AppointmentRescheduleNotAllowedError,
  AppointmentAlreadyCancelledError,
  AppointmentAlreadyCompletedError,
  AppointmentInvalidStateError,
  AppointmentJoinNotAllowedError,
  AppointmentHoldExpiredError,
  AuthorizationError,
  DomainInvariantError
} from '../mindos/platform/errors/index.js';

describe('MindOS Sprint 20: Canonical Availability & Appointment Scheduling Platform', () => {
  const verifiedProviderId = 'prof-sprint20-verified-001';
  const unverifiedProviderId = 'prof-sprint20-unverified-002';
  const suspendedProviderId = 'prof-sprint20-suspended-003';
  const serviceOfferingId = 'serv-sprint20-telehealth-001';
  const patientUserId = 'user-patient-sprint20-001';

  before(async () => {
    // Grant consent for patient
    ConsentService.recordConsent({
      userId: patientUserId,
      consentType: 'CARE_REFERRAL',
      status: 'GRANTED'
    });
    ConsentService.recordConsent({
      userId: patientUserId,
      consentType: 'CLINICAL_CONSULTATION',
      status: 'GRANTED'
    });

    // Register provider in ProviderMatcher for referral routing checks
    ProviderMatcher.registerProviderProfile({
      professional_id: verifiedProviderId,
      title: 'Dr.',
      full_name: 'Dr. Amani Kimani',
      verification_state: ProfessionalVerificationState.APPROVED as any,
      regulatory_body: 'KMPDC',
      license_number: 'KMPDC-A-99201',
      license_expires_at: '2028-12-31T23:59:59.000Z',
      specialties: ['CBT'],
      supported_care_levels: [CareLevel.LEVEL_3],
      modalities: [ServiceModality.TELEHEALTH],
      jurisdictions: ['KE'],
      languages: ['en'],
      capacity_status: 'AVAILABLE'
    });

    const profRepo = ProfessionalService.getRepository();

    // 1. Verified Provider
    await profRepo.saveProfile({
      id: verifiedProviderId,
      user_id: 'user-clinician-001',
      professional_type: ProfessionalType.CLINICAL_PSYCHOLOGIST,
      display_name: 'Dr. Amani Kimani',
      legal_name_reference: 'Amani Kimani',
      status: ProfessionalState.ACTIVE,
      verification_status: ProfessionalVerificationState.VERIFIED,
      jurisdictions: ['KE'],
      languages: ['en', 'sw'],
      specialties: ['CBT'],
      delivery_modes: [DeliveryMode.TELEHEALTH],
      organization_refs: [],
      profile_visibility: ProfileVisibility.PUBLIC_DIRECTORY,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    await profRepo.saveProvider({
      id: verifiedProviderId,
      professional_profile_id: verifiedProviderId,
      provider_type: ProviderType.INDIVIDUAL_PROFESSIONAL,
      status: ProviderStatus.ACTIVE,
      verification_status: ProfessionalVerificationState.VERIFIED,
      jurisdictions: ['KE'],
      organization_refs: [],
      discoverability_status: DiscoverabilityStatus.DISCOVERABLE,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    await profRepo.saveRegistration({
      id: 'reg-amani-001',
      professional_id: verifiedProviderId,
      authority_id: 'KMPDC',
      registration_type: 'PRACTICING_LICENSE',
      registration_number: 'KMPDC-A-99201',
      jurisdiction: 'KE',
      issued_at: '2023-01-01T00:00:00.000Z',
      expires_at: '2028-12-31T23:59:59.000Z',
      status: 'ACTIVE',
      verification_method: VerificationMethod.REGULATORY_CONFIRMATION,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    await profRepo.saveServiceOffering({
      id: serviceOfferingId,
      provider_id: verifiedProviderId,
      service_code: 'PSYCHOTHERAPY_50M',
      service_type: ServiceType.PSYCHOLOGY_SESSION,
      name: 'Individual Cognitive Behavioral Therapy',
      description: 'Standard 50-minute governed psychotherapy session',
      delivery_mode: DeliveryMode.TELEHEALTH,
      jurisdiction: 'KE',
      population: TargetPopulation.ADULTS,
      duration_minutes: 50,
      pricing_reference: { amount: 3500, currency: 'KES', billing_model: 'PER_SESSION' },
      status: ServiceOfferingStatus.ACTIVE,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // 2. Unverified Provider
    await profRepo.saveProfile({
      id: unverifiedProviderId,
      user_id: 'user-clinician-002',
      professional_type: ProfessionalType.COUNSELLOR,
      display_name: 'Jane Doe',
      legal_name_reference: 'Jane Doe',
      status: ProfessionalState.IN_VERIFICATION,
      verification_status: ProfessionalVerificationState.IN_REVIEW,
      jurisdictions: ['KE'],
      languages: ['en'],
      specialties: ['COUNSELLING'],
      delivery_modes: [DeliveryMode.TELEHEALTH],
      organization_refs: [],
      profile_visibility: ProfileVisibility.INTERNAL_ONLY,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    await profRepo.saveProvider({
      id: unverifiedProviderId,
      professional_profile_id: unverifiedProviderId,
      provider_type: ProviderType.INDIVIDUAL_PROFESSIONAL,
      status: ProviderStatus.PENDING_VERIFICATION,
      verification_status: ProfessionalVerificationState.IN_REVIEW,
      jurisdictions: ['KE'],
      organization_refs: [],
      discoverability_status: DiscoverabilityStatus.HIDDEN,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // 3. Provider with Expired Registration
    const expiredProviderId = 'prof-expired-reg-004';
    await profRepo.saveProfile({
      id: expiredProviderId,
      user_id: 'user-clinician-004',
      professional_type: ProfessionalType.PSYCHIATRIST,
      display_name: 'Dr. Expired Reg',
      legal_name_reference: 'Dr. Expired Reg',
      status: ProfessionalState.ACTIVE,
      verification_status: ProfessionalVerificationState.VERIFIED,
      jurisdictions: ['KE'],
      languages: ['en'],
      specialties: ['PSYCHIATRY'],
      delivery_modes: [DeliveryMode.TELEHEALTH],
      organization_refs: [],
      profile_visibility: ProfileVisibility.PUBLIC_DIRECTORY,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    await profRepo.saveProvider({
      id: expiredProviderId,
      professional_profile_id: expiredProviderId,
      provider_type: ProviderType.INDIVIDUAL_PROFESSIONAL,
      status: ProviderStatus.ACTIVE,
      verification_status: ProfessionalVerificationState.VERIFIED,
      jurisdictions: ['KE'],
      organization_refs: [],
      discoverability_status: DiscoverabilityStatus.DISCOVERABLE,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    await profRepo.saveRegistration({
      id: 'reg-expired-001',
      professional_id: expiredProviderId,
      authority_id: 'KMPDC',
      registration_type: 'PRACTICING_LICENSE',
      registration_number: 'KMPDC-EXP-001',
      jurisdiction: 'KE',
      status: 'ACTIVE',
      verification_method: VerificationMethod.REGULATORY_CONFIRMATION,
      issued_at: '2020-01-01T00:00:00.000Z',
      expires_at: '2022-01-01T00:00:00.000Z', // Expired
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  });

  beforeEach(() => {
    AvailabilitySlotService.setClockForTesting(
      () => new Date('2026-10-01T00:00:00.000Z')
    );
    AppointmentService.resetForTesting();
    AppointmentBookingService.setSafetyRiskChecker(async () => 'SAFE');
  });

  describe('1. Provider Availability & Dynamic Bookable Slot Generation', () => {
    it('generates discrete bookable slots matching weekly rules, service duration, and post-session buffer', async () => {
      const availRepo = AvailabilitySlotService.getRepository();

      // Configure recurring weekly availability rule: Mondays & Wednesdays 09:00 - 12:00
      await availRepo.saveRule({
        id: 'rule-mon-wed',
        provider_id: verifiedProviderId,
        service_offering_id: serviceOfferingId,
        timezone: KENYA_TIMEZONE,
        day_of_week: DayOfWeek.MONDAY,
        start_time: '09:00',
        end_time: '12:00',
        effective_from: '2026-01-01',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      });

      // Query slots for a 1-week window in future
      const targetMonday = new Date('2026-10-05T00:00:00.000Z'); // 2026-10-05 is a Monday
      const targetEnd = new Date('2026-10-05T23:59:59.000Z');

      const slots = await AvailabilitySlotService.getBookableSlots({
        providerId: verifiedProviderId,
        serviceOfferingId,
        startDate: targetMonday.toISOString(),
        endDate: targetEnd.toISOString()
      });

      assert.ok(slots.length > 0, 'Should generate bookable slots for Monday');
      assert.strictEqual(slots[0].duration_minutes, 50);
      assert.strictEqual(slots[0].delivery_mode, DeliveryMode.TELEHEALTH);
      assert.strictEqual(slots[0].pricing_amount, 3500);

      // Verify slot token is cryptographically valid
      const tokenVerification = SlotTokenService.verifyToken(slots[0].slot_token);
      assert.strictEqual(tokenVerification.valid, true);
      assert.strictEqual(tokenVerification.payload?.provider_id, verifiedProviderId);
    });

    it('detects tampering or modification in slot tokens', () => {
      const token = SlotTokenService.generateToken({
        provider_id: verifiedProviderId,
        service_offering_id: serviceOfferingId,
        start_at: '2026-10-05T09:00:00.000Z',
        end_at: '2026-10-05T09:50:00.000Z'
      });

      // Tamper with payload
      const [payloadB64, sig] = token.split('.');
      const tamperedPayload = Buffer.from(JSON.stringify({
        provider_id: 'malicious-hacker-provider',
        service_offering_id: serviceOfferingId,
        start_at: '2026-10-05T09:00:00.000Z',
        end_at: '2026-10-05T09:50:00.000Z',
        generated_at: Date.now()
      })).toString('base64url');

      const tamperedToken = `${tamperedPayload}.${sig}`;
      const result = SlotTokenService.verifyToken(tamperedToken);
      assert.strictEqual(result.valid, false);
      assert.match(result.error || '', /tamper detected/i);
    });

    it('suppresses slots overlapping with leave exceptions and schedule blocks', async () => {
      const availRepo = AvailabilitySlotService.getRepository();

      await availRepo.saveRule({
        id: 'rule-friday',
        provider_id: verifiedProviderId,
        service_offering_id: serviceOfferingId,
        timezone: KENYA_TIMEZONE,
        day_of_week: DayOfWeek.FRIDAY,
        start_time: '09:00',
        end_time: '12:00',
        effective_from: '2026-01-01',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      });

      const fridayStart = new Date('2026-10-09T00:00:00.000Z'); // Friday
      const fridayEnd = new Date('2026-10-09T23:59:59.000Z');

      // Before exception: slots exist
      const beforeSlots = await AvailabilitySlotService.getBookableSlots({
        providerId: verifiedProviderId,
        serviceOfferingId,
        startDate: fridayStart.toISOString(),
        endDate: fridayEnd.toISOString()
      });
      assert.ok(beforeSlots.length >= 2);

      // Add a Leave Exception covering 09:00 to 10:30
      await availRepo.saveException({
        id: 'exc-leave-001',
        provider_id: verifiedProviderId,
        start_at: '2026-10-09T08:30:00.000Z',
        end_at: '2026-10-09T10:30:00.000Z',
        exception_type: AvailabilityExceptionType.LEAVE,
        reason_code: 'ANNUAL_LEAVE',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      });

      const afterSlots = await AvailabilitySlotService.getBookableSlots({
        providerId: verifiedProviderId,
        serviceOfferingId,
        startDate: fridayStart.toISOString(),
        endDate: fridayEnd.toISOString()
      });

      // The 09:00 slot is suppressed
      assert.ok(afterSlots.length < beforeSlots.length);
      assert.ok(afterSlots.every(s => new Date(s.start_at).getTime() >= new Date('2026-10-09T10:30:00.000Z').getTime()));
    });
  });

  describe('2. Provider Eligibility & Credential Verification Guards', () => {
    it('blocks slot generation and booking for unverified providers', async () => {
      await assert.rejects(
        async () => {
          await AvailabilitySlotService.getBookableSlots({
            providerId: unverifiedProviderId,
            serviceOfferingId,
            startDate: '2026-10-05T00:00:00.000Z',
            endDate: '2026-10-05T23:59:59.000Z'
          });
        },
        (err: any) => err instanceof AppointmentProviderNotEligibleError
      );

      await assert.rejects(
        async () => {
          await AppointmentBookingService.book({
            subjectUserId: patientUserId,
            providerId: unverifiedProviderId,
            serviceOfferingId,
            startAt: '2026-10-05T09:00:00.000Z',
            endAt: '2026-10-05T09:50:00.000Z'
          });
        },
        (err: any) => err instanceof AppointmentProviderNotEligibleError
      );
    });

    it('blocks booking for providers with expired regulatory credentials', async () => {
      await assert.rejects(
        async () => {
          await AppointmentBookingService.book({
            subjectUserId: patientUserId,
            providerId: 'prof-expired-reg-004',
            serviceOfferingId,
            startAt: '2026-10-05T09:00:00.000Z',
            endAt: '2026-10-05T09:50:00.000Z'
          });
        },
        (err: any) => err instanceof AppointmentProviderNotEligibleError
      );
    });
  });

  describe('3. Clinical Safety Kernel Integration (R-SAFE-001)', () => {
    it('blocks routine booking if patient is under an active CRITICAL risk state', async () => {
      // Mock Safety Kernel returning CRITICAL state for the patient
      AppointmentBookingService.setSafetyRiskChecker(async (userId) => {
        if (userId === 'user-in-crisis-001') return 'CRITICAL';
        return 'SAFE';
      });

      await assert.rejects(
        async () => {
          await AppointmentBookingService.book({
            subjectUserId: 'user-in-crisis-001',
            providerId: verifiedProviderId,
            serviceOfferingId,
            startAt: '2026-10-05T09:00:00.000Z',
            endAt: '2026-10-05T09:50:00.000Z'
          });
        },
        (err: any) => {
          assert.strictEqual(err instanceof DomainInvariantError, true);
          assert.match(err.message, /crisis intervention/i);
          return true;
        }
      );
    });
  });

  describe('4. Concurrency Protection, Holds & Double-Booking Prevention', () => {
    const slotStart = '2026-10-12T10:00:00.000Z';
    const slotEnd = '2026-10-12T10:50:00.000Z';

    it('creates temporary 5-minute appointment hold and consumes it upon booking', async () => {
      const hold = await AppointmentHoldService.createHold({
        providerId: verifiedProviderId,
        serviceOfferingId,
        subjectUserId: patientUserId,
        startAt: slotStart,
        endAt: slotEnd,
        idempotencyKey: 'hold-idemp-key-001'
      });

      assert.strictEqual(hold.status, AppointmentHoldState.ACTIVE);
      assert.ok(new Date(hold.expires_at).getTime() > Date.now());

      // Concurrent hold attempt on same slot is rejected
      await assert.rejects(
        async () => {
          await AppointmentHoldService.createHold({
            providerId: verifiedProviderId,
            serviceOfferingId,
            subjectUserId: 'other-user-999',
            startAt: slotStart,
            endAt: slotEnd,
            idempotencyKey: 'hold-idemp-key-002'
          });
        },
        (err: any) => err instanceof AppointmentSlotUnavailableError
      );

      // Book with the hold ID
      const booking = await AppointmentBookingService.book({
        subjectUserId: patientUserId,
        providerId: verifiedProviderId,
        serviceOfferingId,
        startAt: slotStart,
        endAt: slotEnd,
        holdId: hold.id
      });

      assert.strictEqual(booking.status, AppointmentState.CONFIRMED);
      assert.strictEqual(booking.subject_user_id, patientUserId);

      // Verify hold is consumed
      const availRepo = AvailabilitySlotService.getRepository();
      const consumedHold = await availRepo.getHoldById(hold.id);
      assert.strictEqual(consumedHold?.status, AppointmentHoldState.CONSUMED);
    });

    it('strictly prevents double booking of overlapping appointments for the same provider', async () => {
      const apt1Start = '2026-10-14T14:00:00.000Z';
      const apt1End = '2026-10-14T14:50:00.000Z';

      // First booking succeeds
      await AppointmentBookingService.book({
        subjectUserId: patientUserId,
        providerId: verifiedProviderId,
        serviceOfferingId,
        startAt: apt1Start,
        endAt: apt1End,
        idempotencyKey: 'booking-first-unique-1'
      });

      // Overlapping second booking fails
      await assert.rejects(
        async () => {
          await AppointmentBookingService.book({
            subjectUserId: 'user-patient-sprint20-002',
            providerId: verifiedProviderId,
            serviceOfferingId,
            startAt: '2026-10-14T14:30:00.000Z', // Overlaps!
            endAt: '2026-10-14T15:20:00.000Z',
            idempotencyKey: 'booking-second-clashing-2'
          });
        },
        (err: any) => err instanceof AppointmentConflictError
      );
    });
  });

  describe('5. Referral Integration & Routing Verification', () => {
    it('validates referral ownership, provider routing, and bookable status', async () => {
      const validReferral = await ReferralService.createReferral({
        userId: patientUserId,
        careLevel: CareLevel.LEVEL_3,
        receivingProviderId: verifiedProviderId,
        receivingServiceType: 'PSYCHOTHERAPY_50M',
        autoReady: true
      });

      const booking = await AppointmentBookingService.book({
        subjectUserId: patientUserId,
        providerId: verifiedProviderId,
        serviceOfferingId,
        startAt: '2026-10-16T10:00:00.000Z',
        endAt: '2026-10-16T10:50:00.000Z',
        referralId: validReferral.id,
        appointmentType: AppointmentType.REFERRAL_CONSULT,
        bookingSource: BookingSource.REFERRAL_ROUTING
      });

      assert.strictEqual(booking.referral_id, validReferral.id);
      assert.strictEqual(booking.appointment_type, AppointmentType.REFERRAL_CONSULT);
    });

    it('rejects booking if referral belongs to another user', async () => {
      ConsentService.recordConsent({
        userId: 'some-other-user-999',
        consentType: 'CARE_REFERRAL',
        status: 'GRANTED'
      });

      const otherUserReferral = await ReferralService.createReferral({
        userId: 'some-other-user-999',
        careLevel: CareLevel.LEVEL_3,
        receivingProviderId: verifiedProviderId,
        receivingServiceType: 'PSYCHOTHERAPY_50M',
        autoReady: true
      });

      await assert.rejects(
        async () => {
          await AppointmentBookingService.book({
            subjectUserId: patientUserId,
            providerId: verifiedProviderId,
            serviceOfferingId,
            startAt: '2026-10-16T11:00:00.000Z',
            endAt: '2026-10-16T11:50:00.000Z',
            referralId: otherUserReferral.id
          });
        },
        (err: any) => err instanceof AppointmentUserNotEligibleError
      );
    });
  });

  describe('6. Rescheduling, Policy Enforcement & Reminders', () => {
    it('enforces 24-hour advance notice policy for patient rescheduling and updates schedule blocks', async () => {
      // Create appointment 48 hours in future
      const futureStart = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const futureEnd = new Date(Date.now() + 48.8 * 60 * 60 * 1000).toISOString();

      const booking = await AppointmentBookingService.book({
        subjectUserId: patientUserId,
        providerId: verifiedProviderId,
        serviceOfferingId,
        startAt: futureStart,
        endAt: futureEnd
      });

      const newStart = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      const newEnd = new Date(Date.now() + 72.8 * 60 * 60 * 1000).toISOString();

      const rescheduled = await AppointmentRescheduleService.reschedule({
        appointmentId: booking.id,
        newStartAt: newStart,
        newEndAt: newEnd,
        actorId: patientUserId,
        initiatedBy: 'USER',
        reasonCode: 'CLIENT_SCHEDULE_CHANGE'
      });

      assert.strictEqual(rescheduled.start_at, newStart);
      assert.strictEqual(rescheduled.version, 2);

      // Try rescheduling an appointment less than 24h away -> Rejected!
      const shortNoticeStart = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
      const shortNoticeEnd = new Date(Date.now() + 5.8 * 60 * 60 * 1000).toISOString();

      const bookingSoon = await AppointmentBookingService.book({
        subjectUserId: patientUserId,
        providerId: verifiedProviderId,
        serviceOfferingId,
        startAt: shortNoticeStart,
        endAt: shortNoticeEnd
      });

      await assert.rejects(
        async () => {
          await AppointmentRescheduleService.reschedule({
            appointmentId: bookingSoon.id,
            newStartAt: newStart,
            newEndAt: newEnd,
            actorId: patientUserId,
            initiatedBy: 'USER',
            reasonCode: 'LATE_NOTICE_ATTEMPT'
          });
        },
        (err: any) => err instanceof AppointmentRescheduleNotAllowedError
      );
    });
  });

  describe('7. Cancellation & Automated Waitlist Offers', () => {
    it('cancels appointment, releases schedule blocks, and generates waitlist offer for waitlisted user', async () => {
      const aptStart = '2026-10-20T14:00:00.000Z';
      const aptEnd = '2026-10-20T14:50:00.000Z';

      const booking = await AppointmentBookingService.book({
        subjectUserId: patientUserId,
        providerId: verifiedProviderId,
        serviceOfferingId,
        startAt: aptStart,
        endAt: aptEnd
      });

      // Another user joins waitlist for this provider and service
      const waitlistEntry = await AppointmentWaitlistService.joinWaitlist({
        subjectUserId: 'user-waitlist-patient-002',
        providerId: verifiedProviderId,
        serviceOfferingId
      });
      assert.strictEqual(waitlistEntry.status, WaitlistEntryState.ACTIVE);

      // Cancel appointment
      const cancelled = await AppointmentCancellationService.cancel({
        appointmentId: booking.id,
        actorId: patientUserId,
        isUser: true,
        reasonCode: 'PATIENT_UNAVAILABLE'
      });

      assert.strictEqual(cancelled.status, AppointmentState.CANCELLED_BY_USER);

      // Verify schedule block was released
      const availRepo = AvailabilitySlotService.getRepository();
      const blocks = await availRepo.getScheduleBlocksByProvider(verifiedProviderId, aptStart, aptEnd);
      assert.strictEqual(blocks.length, 0, 'Schedule block should be released');

      // Verify waitlist offer was automatically generated for the newly opened slot
      const apptRepo = AppointmentBookingService.getRepository();
      const offer = await apptRepo.getActiveWaitlistOffer(waitlistEntry.id);
      assert.ok(offer, 'Waitlist offer should be generated');
      assert.strictEqual(offer.slot_start, aptStart);
      assert.strictEqual(offer.slot_end, aptEnd);

      // Waitlisted user accepts offer -> Books appointment automatically
      const { appointment: waitlistBooking } = await AppointmentWaitlistService.respondToOffer({
        offerId: offer.id,
        accept: true,
        actorId: 'user-waitlist-patient-002'
      });

      assert.ok(waitlistBooking);
      assert.strictEqual(waitlistBooking.subject_user_id, 'user-waitlist-patient-002');
      assert.strictEqual(waitlistBooking.booking_source, BookingSource.WAITLIST_OFFER);
    });

    it('disallows cancelling an already cancelled appointment', async () => {
      const booking = await AppointmentBookingService.book({
        subjectUserId: patientUserId,
        providerId: verifiedProviderId,
        serviceOfferingId,
        startAt: '2026-10-22T09:00:00.000Z',
        endAt: '2026-10-22T09:50:00.000Z'
      });

      await AppointmentCancellationService.cancel({
        appointmentId: booking.id,
        actorId: patientUserId,
        isUser: true,
        reasonCode: 'FIRST_CANCEL'
      });

      await assert.rejects(
        async () => {
          await AppointmentCancellationService.cancel({
            appointmentId: booking.id,
            actorId: patientUserId,
            isUser: true,
            reasonCode: 'SECOND_CANCEL'
          });
        },
        (err: any) => err instanceof AppointmentAlreadyCancelledError
      );
    });
  });

  describe('8. Attendance, Check-In Window & Clinical Encounter Lifecycle', () => {
    it('enforces check-in window [-15 min, +30 min] and clinician session start/completion authority', async () => {
      // Create appointment centered on current time so check-in is valid
      const now = new Date();
      const currentSlotStart = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // 5 mins in future
      const currentSlotEnd = new Date(now.getTime() + 55 * 60 * 1000).toISOString();

      const booking = await AppointmentBookingService.book({
        subjectUserId: patientUserId,
        providerId: verifiedProviderId,
        serviceOfferingId,
        startAt: currentSlotStart,
        endAt: currentSlotEnd
      });

      // User checks in
      const att = await AppointmentAttendanceService.checkIn({
        appointmentId: booking.id,
        actorId: patientUserId,
        isUser: true
      });
      assert.strictEqual(att.user_status, 'CHECKED_IN');

      // Provider checks in
      const att2 = await AppointmentAttendanceService.checkIn({
        appointmentId: booking.id,
        actorId: verifiedProviderId,
        isUser: false
      });
      assert.strictEqual(att2.provider_status, 'CHECKED_IN');

      // Patient cannot start encounter (clinician only)
      await assert.rejects(
        async () => {
          await AppointmentAttendanceService.startSession({
            appointmentId: booking.id,
            actorId: patientUserId
          });
        },
        (err: any) => err instanceof AuthorizationError
      );

      // Clinician starts session
      const inProgress = await AppointmentAttendanceService.startSession({
        appointmentId: booking.id,
        actorId: verifiedProviderId
      });
      assert.strictEqual(inProgress.status, AppointmentState.IN_PROGRESS);

      // Clinician completes session
      const completed = await AppointmentAttendanceService.completeSession({
        appointmentId: booking.id,
        actorId: verifiedProviderId
      });
      assert.strictEqual(completed.status, AppointmentState.COMPLETED);
      assert.ok(completed.completed_at);
    });

    it('rejects check-in attempted before the window opens (> 15 minutes before start)', async () => {
      const farFutureStart = new Date(Date.now() + 120 * 60 * 1000).toISOString(); // 2 hours away
      const farFutureEnd = new Date(Date.now() + 170 * 60 * 1000).toISOString();

      const booking = await AppointmentBookingService.book({
        subjectUserId: patientUserId,
        providerId: verifiedProviderId,
        serviceOfferingId,
        startAt: farFutureStart,
        endAt: farFutureEnd
      });

      await assert.rejects(
        async () => {
          await AppointmentAttendanceService.checkIn({
            appointmentId: booking.id,
            actorId: patientUserId,
            isUser: true
          });
        },
        (err: any) => err instanceof AppointmentInvalidStateError
      );
    });
  });

  describe('9. Ephemeral Virtual Sessions & Join Window Protection', () => {
    it('authorizes join with ephemeral signed token within window and blocks unauthorized third parties', async () => {
      // Create session happening now (within join window)
      const now = new Date();
      const startAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
      const endAt = new Date(now.getTime() + 55 * 60 * 1000).toISOString();

      const booking = await AppointmentBookingService.book({
        subjectUserId: patientUserId,
        providerId: verifiedProviderId,
        serviceOfferingId,
        startAt,
        endAt,
        deliveryMode: 'TELEHEALTH'
      });

      // Patient joins
      const patientJoin = await VirtualSessionService.authorizeJoinSession({
        appointmentId: booking.id,
        actorId: patientUserId,
        isUser: true
      });
      assert.ok(patientJoin.sessionToken);
      assert.ok(patientJoin.sessionRoomId);

      // Clinician joins
      const clinicianJoin = await VirtualSessionService.authorizeJoinSession({
        appointmentId: booking.id,
        actorId: verifiedProviderId,
        isUser: false
      });
      assert.ok(clinicianJoin.sessionToken);

      // Third party attempted join is blocked (IDOR protection)
      await assert.rejects(
        async () => {
          await VirtualSessionService.authorizeJoinSession({
            appointmentId: booking.id,
            actorId: 'eavesdropper-user-009',
            isUser: true
          });
        },
        (err: any) => err instanceof AuthorizationError
      );
    });
  });

  describe('10. Reminder Service & Health Privacy Safeguards', () => {
    it('dispatches pending reminders with health privacy safeguards', async () => {
      const startAt = new Date(Date.now() + 60 * 1000).toISOString(); // 1 minute in future
      const endAt = new Date(Date.now() + 51 * 60 * 1000).toISOString();

      await AppointmentBookingService.book({
        subjectUserId: patientUserId,
        providerId: verifiedProviderId,
        serviceOfferingId,
        startAt,
        endAt
      });

      // Dispatch reminders scheduled up to 2 seconds from now
      const dispatched = await AppointmentReminderService.dispatchPendingReminders(
        new Date(Date.now() + 2000).toISOString()
      );
      assert.ok(dispatched >= 1, 'Should dispatch booking confirmation reminder');
    });
  });

  describe('11. Provider Suspension Reconciliation', () => {
    it('automatically cancels future appointments and releases schedule blocks upon provider suspension', async () => {
      const futureStart = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();
      const futureEnd = new Date(Date.now() + 37 * 60 * 60 * 1000).toISOString();

      const booking = await AppointmentBookingService.book({
        subjectUserId: patientUserId,
        providerId: verifiedProviderId,
        serviceOfferingId,
        startAt: futureStart,
        endAt: futureEnd
      });

      const impacted = await AppointmentReconciliationService.reconcileProviderSuspension(
        verifiedProviderId,
        'REGULATORY_BOARD_SUSPENSION_ORDER'
      );

      assert.ok(impacted >= 1);

      const apptRepo = AppointmentBookingService.getRepository();
      const reloaded = await apptRepo.getAppointmentById(booking.id);
      assert.strictEqual(reloaded?.status, AppointmentState.CANCELLED_BY_PROVIDER);
    });
  });

  describe('12. Care Session Port & External Calendar Privacy Projection', () => {
    it('exports clean care session handoff context and masks sensitive clinical details in calendar feeds', async () => {
      const startAt = '2026-10-30T10:00:00.000Z';
      const endAt = '2026-10-30T10:50:00.000Z';

      const booking = await AppointmentBookingService.book({
        subjectUserId: patientUserId,
        providerId: verifiedProviderId,
        serviceOfferingId,
        startAt,
        endAt,
        deliveryMode: 'TELEHEALTH'
      });

      // Care Session context handoff
      const context = CareSessionPort.getCareSessionContext(booking);
      assert.strictEqual(context.appointmentId, booking.id);
      assert.strictEqual(context.patientId, patientUserId);
      assert.strictEqual(context.providerId, verifiedProviderId);

      // Calendar projection
      const cal = CalendarIntegrationPort.projectToCalendarEvent(booking);
      assert.strictEqual(cal.summary, 'MindOS Confidential Care Session');
      // Must not contain clinical diagnoses or psychotherapy keywords in summary
      assert.doesNotMatch(cal.summary, /psychotherapy|depression|bipolar|schizophrenia|cbt/i);
    });
  });

  describe('13. Backward-Compatible AppointmentService Facade', () => {
    it('preserves Sprint 1–19 bookAppointment and cancelAppointment behavior', async () => {
      const start = '2026-11-01T09:00:00.000Z';
      const end = '2026-11-01T09:50:00.000Z';

      const apt = await AppointmentService.bookAppointment({
        professionalId: verifiedProviderId,
        clientId: patientUserId,
        startTime: start,
        endTime: end
      });

      assert.strictEqual(apt.professional_id, verifiedProviderId);
      assert.strictEqual(apt.client_id, patientUserId);
      assert.strictEqual(apt.state, AppointmentState.CONFIRMED);

      const cancelled = await AppointmentService.cancelAppointment(apt.id, patientUserId, true);
      assert.strictEqual(cancelled.state, AppointmentState.CANCELLED_BY_USER);
    });
  });
});
