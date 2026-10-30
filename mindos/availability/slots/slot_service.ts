/**
 * MindOS Canonical Availability Slot Computation Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, II, III, XV & Appendices B / C / Q
 * Clinical Safety Policy Catalogue (R-SAFE-001, ADR-033..039)
 */

import { IAvailabilityRepository } from '../repositories/interfaces.js';
import { InMemoryAvailabilityRepository } from '../repositories/in_memory_availability_repository.js';
import {
  BookableSlot,
  ProviderSchedulingProfile,
  AvailabilityRule,
  AvailabilityException,
  AvailabilityExceptionType,
  ScheduleBlock,
  AppointmentHold,
  KENYA_TIMEZONE,
  DEFAULT_BOOKING_HORIZON_DAYS,
  DEFAULT_MINIMUM_NOTICE_HOURS,
  DEFAULT_BUFFER_BEFORE_MINUTES,
  DEFAULT_BUFFER_AFTER_MINUTES
} from '../domain/types.js';
import { SlotTokenService } from './slot_token_service.js';
import { ProfessionalService } from '../../professionals/service.js';
import {
  ProfessionalState,
  ProfessionalVerificationState,
  ServiceOfferingStatus
} from '../../professionals/domain/types.js';
import {
  AppointmentProviderNotEligibleError,
  AppointmentServiceNotEligibleError
} from '../../platform/errors/index.js';
import { AppointmentState } from '../../platform/shared/state_machines.js';

export interface GetBookableSlotsParams {
  providerId: string;
  serviceOfferingId: string;
  startDate: string; // ISO8601 UTC
  endDate: string;   // ISO8601 UTC
  clientTimezone?: string;
}

export class AvailabilitySlotService {
  private static repository: IAvailabilityRepository = new InMemoryAvailabilityRepository();
  private static appointmentFetcher?: (providerId: string, startRange: string, endRange: string) => Promise<Array<{ start_at: string; end_at: string; status: AppointmentState }>>;

  public static setRepository(repo: IAvailabilityRepository): void {
    this.repository = repo;
  }

  public static getRepository(): IAvailabilityRepository {
    return this.repository;
  }

  public static setAppointmentFetcher(
    fetcher: (providerId: string, startRange: string, endRange: string) => Promise<Array<{ start_at: string; end_at: string; status: AppointmentState }>>
  ): void {
    this.appointmentFetcher = fetcher;
  }

  /**
   * Computes clean, verified, conflict-free bookable slots with signed tamper-resistant tokens.
   */
  public static async getBookableSlots(params: GetBookableSlotsParams): Promise<BookableSlot[]> {
    const now = new Date();
    const nowMs = now.getTime();

    // 1. Revalidate Provider Status & Verified Credentials
    const profRepo = ProfessionalService.getRepository();
    const provider = await profRepo.findProviderById(params.providerId);
    if (!provider || provider.status !== 'ACTIVE' || provider.verification_status !== ProfessionalVerificationState.VERIFIED) {
      throw new AppointmentProviderNotEligibleError('Provider is not active or verified for care delivery.');
    }

    const profProfile = await profRepo.findProfileById(params.providerId);
    if (!profProfile || profProfile.status !== ProfessionalState.ACTIVE || profProfile.verification_status !== ProfessionalVerificationState.VERIFIED) {
      throw new AppointmentProviderNotEligibleError('Professional profile is inactive or unverified.');
    }

    // Check credentials validity
    const registrations = await profRepo.listRegistrationsByProfessionalId(params.providerId);
    const hasActiveRegistration = registrations.some(r => r.status === 'ACTIVE' && new Date(r.expires_at).getTime() > nowMs);
    if (!hasActiveRegistration) {
      throw new AppointmentProviderNotEligibleError('Provider has no active, unexpired professional registrations.');
    }

    // 2. Validate Service Offering
    const service = await profRepo.findServiceOfferingById(params.serviceOfferingId);
    if (!service || service.status !== ServiceOfferingStatus.ACTIVE || service.provider_id !== params.providerId) {
      throw new AppointmentServiceNotEligibleError('Service offering is not active or does not belong to provider.');
    }

    // 3. Resolve Provider Scheduling Profile
    let profile = await this.repository.getProfileByProviderId(params.providerId);
    if (!profile) {
      profile = {
        id: `prof-sched-${params.providerId}`,
        provider_id: params.providerId,
        status: 'ACTIVE',
        default_timezone: KENYA_TIMEZONE,
        booking_horizon_days: DEFAULT_BOOKING_HORIZON_DAYS,
        minimum_booking_notice_hours: DEFAULT_MINIMUM_NOTICE_HOURS,
        default_buffer_before_minutes: DEFAULT_BUFFER_BEFORE_MINUTES,
        default_buffer_after_minutes: DEFAULT_BUFFER_AFTER_MINUTES,
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      };
      await this.repository.saveProfile(profile);
    }

    if (profile.status !== 'ACTIVE') {
      return [];
    }

    // 4. Calculate Time Horizon Clamping
    const horizonMs = profile.booking_horizon_days * 24 * 60 * 60 * 1000;
    const maxHorizonDate = new Date(nowMs + horizonMs);
    const minNoticeMs = nowMs + profile.minimum_booking_notice_hours * 60 * 60 * 1000;

    const requestStart = new Date(params.startDate);
    const requestEnd = new Date(params.endDate);

    // Clamp search start to at least minNoticeMs
    const searchStart = requestStart.getTime() < minNoticeMs ? new Date(minNoticeMs) : requestStart;
    // Clamp search end to maxHorizonDate
    const searchEnd = requestEnd.getTime() > maxHorizonDate.getTime() ? maxHorizonDate : requestEnd;

    if (searchStart.getTime() >= searchEnd.getTime()) {
      return [];
    }

    const startIso = searchStart.toISOString();
    const endIso = searchEnd.toISOString();

    // 5. Gather Constraints in Parallel
    const [rules, exceptions, scheduleBlocks, activeHolds, existingAppointments] = await Promise.all([
      this.repository.getRulesByProviderId(params.providerId),
      this.repository.getExceptionsByProvider(params.providerId, startIso, endIso),
      this.repository.getScheduleBlocksByProvider(params.providerId, startIso, endIso),
      this.repository.getActiveHoldsByProvider(params.providerId, startIso, endIso),
      this.appointmentFetcher ? this.appointmentFetcher(params.providerId, startIso, endIso) : Promise.resolve([])
    ]);

    // Active booked appointments
    const bookedAppointments = existingAppointments.filter(apt => 
      apt.status === AppointmentState.CONFIRMED ||
      apt.status === AppointmentState.HELD ||
      apt.status === AppointmentState.CHECKED_IN ||
      apt.status === AppointmentState.IN_PROGRESS
    );

    const bookableSlots: BookableSlot[] = [];
    const durationMinutes = service.duration_minutes || 50;
    const bufferAfterMinutes = profile.default_buffer_after_minutes || 15;
    const slotTotalMinutes = durationMinutes + bufferAfterMinutes;

    // 6. Iterate through days from searchStart to searchEnd
    const currentDate = new Date(searchStart);
    // Align to beginning of day (00:00:00 UTC)
    currentDate.setUTCHours(0, 0, 0, 0);

    while (currentDate.getTime() <= searchEnd.getTime()) {
      const dayOfWeek = currentDate.getUTCDay(); // 0=Sunday..6=Saturday
      const dateString = currentDate.toISOString().split('T')[0]; // "YYYY-MM-DD"

      // Check if day matches any active availability rules for this service or generic
      const applicableRules = rules.filter(r => 
        r.day_of_week === dayOfWeek &&
        (!r.service_offering_id || r.service_offering_id === params.serviceOfferingId) &&
        r.effective_from <= dateString &&
        (!r.effective_until || r.effective_until >= dateString)
      );

      for (const rule of applicableRules) {
        const [startH, startM] = rule.start_time.split(':').map(Number);
        const [endH, endM] = rule.end_time.split(':').map(Number);

        const ruleStart = new Date(currentDate);
        ruleStart.setUTCHours(startH, startM, 0, 0);

        const ruleEnd = new Date(currentDate);
        ruleEnd.setUTCHours(endH, endM, 0, 0);

        // Generate discrete slots within rule window
        let slotCandidateStart = new Date(ruleStart);

        while (slotCandidateStart.getTime() + durationMinutes * 60 * 1000 <= ruleEnd.getTime()) {
          const slotCandidateEnd = new Date(slotCandidateStart.getTime() + durationMinutes * 60 * 1000);
          const slotOccupiedEnd = new Date(slotCandidateStart.getTime() + slotTotalMinutes * 60 * 1000);

          const slotStartMs = slotCandidateStart.getTime();
          const slotEndMs = slotCandidateEnd.getTime();
          const occupiedEndMs = slotOccupiedEnd.getTime();

          // Condition A: Must be in future and after minimum notice
          if (slotStartMs >= minNoticeMs && slotStartMs >= searchStart.getTime() && slotEndMs <= searchEnd.getTime()) {
            // Condition B: Check Exceptions
            const isBlockedByException = exceptions.some(exc => {
              if (exc.exception_type === AvailabilityExceptionType.UNAVAILABLE ||
                  exc.exception_type === AvailabilityExceptionType.LEAVE ||
                  exc.exception_type === AvailabilityExceptionType.HOLIDAY ||
                  exc.exception_type === AvailabilityExceptionType.TRAINING ||
                  exc.exception_type === AvailabilityExceptionType.PERSONAL_BLOCK) {
                const eStart = new Date(exc.start_at).getTime();
                const eEnd = new Date(exc.end_at).getTime();
                return slotStartMs < eEnd && occupiedEndMs > eStart;
              }
              return false;
            });

            // Condition C: Check Schedule Blocks
            const isBlockedByBlock = scheduleBlocks.some(block => {
              const bStart = new Date(block.start_at).getTime();
              const bEnd = new Date(block.end_at).getTime();
              return slotStartMs < bEnd && occupiedEndMs > bStart;
            });

            // Condition D: Check Active Holds
            const isBlockedByHold = activeHolds.some(hold => {
              const hStart = new Date(hold.start_at).getTime();
              const hEnd = new Date(hold.end_at).getTime();
              return slotStartMs < hEnd && slotEndMs > hStart;
            });

            // Condition E: Check Existing Booked Appointments
            const isBlockedByAppointment = bookedAppointments.some(apt => {
              const aStart = new Date(apt.start_at).getTime();
              const aEnd = new Date(apt.end_at).getTime();
              return slotStartMs < aEnd && slotEndMs > aStart;
            });

            if (!isBlockedByException && !isBlockedByBlock && !isBlockedByHold && !isBlockedByAppointment) {
              const startIsoStr = slotCandidateStart.toISOString();
              const endIsoStr = slotCandidateEnd.toISOString();
              const slotId = `slot_${params.providerId.substring(0, 8)}_${slotStartMs}`;

              const slotToken = SlotTokenService.generateToken({
                provider_id: params.providerId,
                service_offering_id: params.serviceOfferingId,
                start_at: startIsoStr,
                end_at: endIsoStr
              });

              bookableSlots.push({
                slot_id: slotId,
                provider_id: params.providerId,
                service_offering_id: params.serviceOfferingId,
                start_at: startIsoStr,
                end_at: endIsoStr,
                duration_minutes: durationMinutes,
                timezone: profile.default_timezone,
                delivery_mode: service.delivery_mode,
                slot_token: slotToken,
                pricing_amount: service.pricing_reference?.amount,
                pricing_currency: service.pricing_reference?.currency
              });
            }
          }

          // Advance by total interval (duration + buffer)
          slotCandidateStart = new Date(slotCandidateStart.getTime() + slotTotalMinutes * 60 * 1000);
        }
      }

      // Next day
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    return bookableSlots;
  }
}
