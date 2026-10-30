/**
 * MindOS Canonical Appointment Booking Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, II, III, XV & Appendices B / C / Q / J
 * Clinical Safety Policy Catalogue (R-SAFE-001, ADR-033..039)
 */

import { IAppointmentRepository } from '../repositories/interfaces.js';
import { InMemoryAppointmentRepository } from '../repositories/in_memory_appointment_repository.js';
import {
  AppointmentEntity,
  AppointmentType,
  BookingSource,
  VirtualSessionEntity
} from '../domain/types.js';
import { AppointmentState } from '../../platform/shared/state_machines.js';
import { AvailabilitySlotService } from '../../availability/slots/slot_service.js';
import { SlotTokenService } from '../../availability/slots/slot_token_service.js';
import { AppointmentHoldService } from '../../availability/holds/hold_service.js';
import {
  ScheduleBlockType,
  ScheduleBlockSource,
  ScheduleBlock,
  KENYA_TIMEZONE
} from '../../availability/domain/types.js';
import { ScheduleBlockState } from '../../platform/shared/state_machines.js';
import { ProfessionalService } from '../../professionals/service.js';
import {
  ProfessionalState,
  ProfessionalVerificationState,
  ServiceOfferingStatus
} from '../../professionals/domain/types.js';
import { ReferralService } from '../../care_navigation/referrals/referral_service.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { AuditService } from '../../platform/audit/index.js';
import {
  AppointmentSlotUnavailableError,
  AppointmentProviderNotEligibleError,
  AppointmentServiceNotEligibleError,
  AppointmentUserNotEligibleError,
  AppointmentReferralRequiredError,
  DomainInvariantError
} from '../../platform/errors/index.js';

export interface BookAppointmentParams {
  subjectUserId: string;
  providerId: string;
  serviceOfferingId: string;
  startAt: string; // ISO8601 UTC
  endAt: string;   // ISO8601 UTC
  slotToken?: string;
  holdId?: string;
  referralId?: string;
  careNavigationSessionId?: string;
  careRelationshipId?: string;
  appointmentType?: AppointmentType | string;
  bookingSource?: BookingSource | string;
  idempotencyKey?: string;
  clientTimezone?: string;
  actorId?: string;
  deliveryMode?: string;
  locationReference?: string;
}

export class AppointmentBookingService {
  private static repository: IAppointmentRepository = new InMemoryAppointmentRepository();
  private static safetyRiskChecker?: (userId: string) => Promise<'SAFE' | 'ELEVATED' | 'CRITICAL'>;

  public static setRepository(repo: IAppointmentRepository): void {
    this.repository = repo;
  }

  public static getRepository(): IAppointmentRepository {
    return this.repository;
  }

  public static setSafetyRiskChecker(checker: (userId: string) => Promise<'SAFE' | 'ELEVATED' | 'CRITICAL'>): void {
    this.safetyRiskChecker = checker;
  }

  public static async book(params: BookAppointmentParams): Promise<AppointmentEntity> {
    const actorId = params.actorId || params.subjectUserId;
    const now = new Date();
    const nowMs = now.getTime();

    // 1. Idempotency Check
    if (params.idempotencyKey) {
      const existing = await this.repository.getAppointmentByIdempotencyKey(params.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    // 2. Clinical Safety Kernel Guard (R-SAFE-001)
    if (this.safetyRiskChecker) {
      const riskLevel = await this.safetyRiskChecker(params.subjectUserId);
      if (riskLevel === 'CRITICAL') {
        throw new DomainInvariantError(
          'Routine booking blocked: User is under an active CRITICAL safety alert requiring immediate clinical crisis intervention.',
          { details: { user_id: params.subjectUserId, risk_level: 'CRITICAL' } }
        );
      }
    }

    // 3. Provider Eligibility Revalidation
    const profRepo = ProfessionalService.getRepository();
    const provider = await profRepo.findProviderById(params.providerId);
    if (!provider || provider.status !== 'ACTIVE' || provider.verification_status !== ProfessionalVerificationState.VERIFIED) {
      throw new AppointmentProviderNotEligibleError('Provider is not active or verified for care delivery.');
    }

    const profProfile = await profRepo.findProfileById(params.providerId);
    if (!profProfile || profProfile.status !== ProfessionalState.ACTIVE || profProfile.verification_status !== ProfessionalVerificationState.VERIFIED) {
      throw new AppointmentProviderNotEligibleError('Professional profile is inactive or unverified.');
    }

    const registrations = await profRepo.listRegistrationsByProfessionalId(params.providerId);
    const hasActiveRegistration = registrations.some(r => r.status === 'ACTIVE' && new Date(r.expires_at).getTime() > nowMs);
    if (!hasActiveRegistration) {
      throw new AppointmentProviderNotEligibleError('Provider has no active, unexpired professional registration.');
    }

    // 4. Service Offering Eligibility Revalidation
    const service = await profRepo.findServiceOfferingById(params.serviceOfferingId);
    if (!service || service.status !== ServiceOfferingStatus.ACTIVE || service.provider_id !== params.providerId) {
      throw new AppointmentServiceNotEligibleError('Service offering is not active or does not belong to provider.');
    }

    // 5. Referral Revalidation (if applicable)
    if (params.referralId) {
      const referral = ReferralService.getReferral(params.referralId);
      if (!referral) {
        throw new AppointmentReferralRequiredError('Specified referral was not found.');
      }
      if (referral.user_id !== params.subjectUserId) {
        throw new AppointmentUserNotEligibleError('Referral subject does not match booking subject.');
      }
      if (referral.receiving_provider_id && referral.receiving_provider_id !== params.providerId) {
        throw new AppointmentProviderNotEligibleError('Referral is routed to a different provider.');
      }
      if (referral.status !== 'READY' && referral.status !== 'ACCEPTED' && referral.status !== 'IN_PROGRESS') {
        throw new AppointmentReferralRequiredError(`Referral is not in a bookable state (current: ${referral.status}).`);
      }
    }

    // 6. Slot Token or Hold Verification
    if (params.holdId) {
      const consumedHold = await AppointmentHoldService.consumeHold(params.holdId);
      if (consumedHold.provider_id !== params.providerId ||
          consumedHold.service_offering_id !== params.serviceOfferingId ||
          consumedHold.subject_user_id !== params.subjectUserId ||
          consumedHold.start_at !== params.startAt ||
          consumedHold.end_at !== params.endAt) {
        throw new AppointmentSlotUnavailableError('Hold details do not match the booking request.');
      }
    } else if (params.slotToken) {
      const verifyResult = SlotTokenService.verifyToken(params.slotToken);
      if (!verifyResult.valid || !verifyResult.payload) {
        throw new AppointmentSlotUnavailableError(`Invalid or tampered slot token: ${verifyResult.error}`);
      }
      const p = verifyResult.payload;
      if (p.provider_id !== params.providerId ||
          p.service_offering_id !== params.serviceOfferingId ||
          p.start_at !== params.startAt ||
          p.end_at !== params.endAt) {
        throw new AppointmentSlotUnavailableError('Slot token parameters do not match requested appointment.');
      }
    }

    // 7. Atomic Overlap Exclusion Check & Appointment Creation
    const appointmentId = generateUUIDv7();
    const deliveryMode = params.deliveryMode || service.delivery_mode || 'TELEHEALTH';
    const timezoneContext = params.clientTimezone || KENYA_TIMEZONE;

    const appointment: AppointmentEntity = {
      id: appointmentId,
      subject_user_id: params.subjectUserId,
      provider_id: params.providerId,
      professional_id: params.providerId,
      service_offering_id: params.serviceOfferingId,
      referral_id: params.referralId,
      care_navigation_session_id: params.careNavigationSessionId,
      care_relationship_id: params.careRelationshipId,
      appointment_type: params.appointmentType || AppointmentType.ROUTINE,
      start_at: params.startAt,
      end_at: params.endAt,
      timezone_context: timezoneContext,
      delivery_mode: deliveryMode,
      location_reference: params.locationReference,
      status: AppointmentState.CONFIRMED,
      booking_source: params.bookingSource || BookingSource.USER_SELF_SERVICE,
      idempotency_key: params.idempotencyKey,
      created_at: now.toISOString(),
      confirmed_at: now.toISOString(),
      version: 1,

      // Compatibility fields
      client_id: params.subjectUserId,
      start_time: params.startAt,
      end_time: params.endAt,
      state: AppointmentState.CONFIRMED
    };

    // Save with concurrency exclusion guard
    const saved = await this.repository.saveAppointment(appointment);

    // 8. Create Schedule Block in Availability Engine
    const availRepo = AvailabilitySlotService.getRepository();
    const scheduleBlock: ScheduleBlock = {
      id: generateUUIDv7(),
      provider_id: params.providerId,
      start_at: params.startAt,
      end_at: params.endAt,
      block_type: ScheduleBlockType.APPOINTMENT,
      source_type: ScheduleBlockSource.APPOINTMENT,
      source_reference: saved.id,
      status: ScheduleBlockState.ACTIVE,
      created_at: now.toISOString()
    };
    await availRepo.saveScheduleBlock(scheduleBlock);

    // 9. Provision Virtual Session if Telehealth
    if (deliveryMode === 'TELEHEALTH' || deliveryMode === 'HYBRID') {
      const joinWindowStart = new Date(new Date(params.startAt).getTime() - 10 * 60 * 1000).toISOString();
      const joinWindowEnd = new Date(new Date(params.endAt).getTime() + 15 * 60 * 1000).toISOString();
      const sessionRef = `vs_${saved.id.substring(0, 8)}`;

      const virtualSession: VirtualSessionEntity = {
        id: generateUUIDv7(),
        appointment_id: saved.id,
        provider: 'INTERNAL_WEBRTC',
        external_session_reference: sessionRef,
        join_window_start: joinWindowStart,
        join_window_end: joinWindowEnd,
        status: 'SCHEDULED',
        created_at: now.toISOString(),
        expires_at: joinWindowEnd
      };
      await this.repository.saveVirtualSession(virtualSession);
      saved.virtual_session_reference = sessionRef;
    }

    // 10. Schedule Automatic Reminders
    await this.scheduleReminders(saved);

    // 11. Emit Canonical Events
    EventBus.enqueue(
      'appointment.created',
      'appointments',
      saved.id,
      DataClassification.SENSITIVE,
      {
        appointment_id: saved.id,
        provider_id: saved.provider_id,
        subject_user_id: saved.subject_user_id,
        start_at: saved.start_at,
        end_at: saved.end_at,
        delivery_mode: saved.delivery_mode,
        service_offering_id: saved.service_offering_id
      }
    );

    EventBus.enqueue(
      'appointment.confirmed',
      'appointments',
      saved.id,
      DataClassification.SENSITIVE,
      {
        appointment_id: saved.id,
        provider_id: saved.provider_id,
        subject_user_id: saved.subject_user_id,
        start_at: saved.start_at,
        end_at: saved.end_at
      }
    );

    // 12. Audit Logging
    AuditService.record({
      action: 'APPOINTMENT_BOOKED',
      actor_type: 'USER',
      actor_id: actorId,
      resource_type: 'APPOINTMENT',
      resource_id: saved.id,
      resource_classification: DataClassification.SENSITIVE,
      authorization_basis: { policy: 'APPOINTMENT_BOOKING_POLICY' },
      result: 'SUCCESS',
      metadata: {
        provider_id: saved.provider_id,
        start_at: saved.start_at,
        end_at: saved.end_at,
        booking_source: saved.booking_source
      }
    });

    return saved;
  }

  private static async scheduleReminders(appointment: AppointmentEntity): Promise<void> {
    const startMs = new Date(appointment.start_at).getTime();
    const nowMs = Date.now();

    // 1. Confirmation Reminder
    await this.repository.saveReminder({
      id: generateUUIDv7(),
      appointment_id: appointment.id,
      reminder_type: 'BOOKING_CONFIRMATION',
      scheduled_for: new Date(nowMs + 1000).toISOString(),
      channel: 'IN_APP',
      status: 'SCHEDULED',
      created_at: new Date().toISOString()
    });

    // 2. 24h Advance Reminder
    const reminder24h = startMs - 24 * 60 * 60 * 1000;
    if (reminder24h > nowMs) {
      await this.repository.saveReminder({
        id: generateUUIDv7(),
        appointment_id: appointment.id,
        reminder_type: 'UPCOMING_24H',
        scheduled_for: new Date(reminder24h).toISOString(),
        channel: 'PUSH',
        status: 'SCHEDULED',
        created_at: new Date().toISOString()
      });
    }

    // 3. 2h Advance Reminder
    const reminder2h = startMs - 2 * 60 * 60 * 1000;
    if (reminder2h > nowMs) {
      await this.repository.saveReminder({
        id: generateUUIDv7(),
        appointment_id: appointment.id,
        reminder_type: 'SAME_DAY_2H',
        scheduled_for: new Date(reminder2h).toISOString(),
        channel: 'SMS',
        status: 'SCHEDULED',
        created_at: new Date().toISOString()
      });
    }
  }
}
