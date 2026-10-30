/**
 * MindOS Appointments Bounded Context
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, II, III, XV & Appendices B / C / Q / J
 * Clinical Safety Policy Catalogue (R-SAFE-001, ADR-033..039)
 * Kenya Data Protection Act 2019, Digital Health Act 2023
 */

export * from './domain/types.js';
export * from './lifecycle/state_machine.js';
export * from './repositories/interfaces.js';
export * from './repositories/in_memory_appointment_repository.js';
export * from './booking/booking_service.js';
export * from './rescheduling/reschedule_service.js';
export * from './cancellation/cancellation_service.js';
export * from './attendance/attendance_service.js';
export * from './waitlist/waitlist_service.js';
export * from './reminders/reminder_service.js';
export * from './virtual_sessions/virtual_session_service.js';
export * from './reconciliation/reconciliation_service.js';
export * from './adapters/care_session_port.js';
export * from './adapters/calendar_integration_port.js';

import {
  AppointmentEntity,
  AppointmentType,
  BookingSource
} from './domain/types.js';
import { AppointmentBookingService } from './booking/booking_service.js';
import { AppointmentCancellationService } from './cancellation/cancellation_service.js';
import { AppointmentState } from '../platform/shared/state_machines.js';
import { AvailabilitySlotService } from '../availability/slots/slot_service.js';
import { InMemoryAppointmentRepository } from './repositories/in_memory_appointment_repository.js';
import { InMemoryAvailabilityRepository } from '../availability/repositories/in_memory_availability_repository.js';
import { ProfessionalService } from '../professionals/service.js';
import { ValidationError, ConflictError } from '../platform/errors/index.js';

// Wire AvailabilitySlotService to query active appointments
AvailabilitySlotService.setAppointmentFetcher(async (providerId: string, startRange: string, endRange: string) => {
  const repo = AppointmentBookingService.getRepository();
  const list = await repo.getAppointmentsByProvider(providerId, startRange, endRange);
  return list.map(a => ({
    start_at: a.start_at,
    end_at: a.end_at,
    status: a.status
  }));
});

/**
 * Backward-compatible facade preserving Sprint 1–19 signatures while backing
 * directly onto the canonical Sprint 20 scheduling engine.
 */
export class AppointmentService {
  /**
   * Backward-compatible booking endpoint
   */
  public static async bookAppointment(params: {
    professionalId: string;
    clientId: string;
    startTime: string;
    endTime: string;
    serviceOfferingId?: string;
    slotToken?: string;
    holdId?: string;
    referralId?: string;
    idempotencyKey?: string;
  }): Promise<AppointmentEntity> {
    if (!ProfessionalService.isVerified(params.professionalId)) {
      throw new ValidationError('Appointments can only be scheduled with verified professionals.');
    }

    // Resolve service offering ID if not passed
    let serviceOfferingId = params.serviceOfferingId;
    if (!serviceOfferingId) {
      const profRepo = ProfessionalService.getRepository();
      const offerings = await profRepo.listServiceOfferingsByProviderId(params.professionalId);
      if (offerings.length > 0) {
        serviceOfferingId = offerings[0].id;
      } else {
        // Fallback default clinical service for compatibility
        serviceOfferingId = `srv-${params.professionalId.substring(0, 8)}`;
      }
    }

    try {
      return await AppointmentBookingService.book({
        providerId: params.professionalId,
        subjectUserId: params.clientId,
        serviceOfferingId: serviceOfferingId,
        startAt: params.startTime,
        endAt: params.endTime,
        slotToken: params.slotToken,
        holdId: params.holdId,
        referralId: params.referralId,
        idempotencyKey: params.idempotencyKey,
        bookingSource: BookingSource.USER_SELF_SERVICE
      });
    } catch (err: any) {
      if (err.errorCode === 'APPOINTMENT_CONFLICT' || err.errorCode === 'APPOINTMENT_SLOT_UNAVAILABLE') {
        throw new ConflictError('Selected appointment slot is already booked.', { errorCode: 'APPT_002' });
      }
      throw err;
    }
  }

  /**
   * Backward-compatible cancellation endpoint
   */
  public static async cancelAppointment(
    appointmentId: string,
    actorId: string,
    isUser: boolean
  ): Promise<AppointmentEntity> {
    return await AppointmentCancellationService.cancel({
      appointmentId,
      actorId,
      isUser,
      reasonCode: 'USER_OR_PROVIDER_REQUESTED'
    });
  }

  /**
   * Reset repositories for test isolation
   */
  public static resetForTesting(): void {
    const apptRepo = new InMemoryAppointmentRepository();
    AppointmentBookingService.setRepository(apptRepo);

    const availRepo = new InMemoryAvailabilityRepository();
    AvailabilitySlotService.setRepository(availRepo);

    AvailabilitySlotService.setAppointmentFetcher(async (providerId: string, startRange: string, endRange: string) => {
      const list = await apptRepo.getAppointmentsByProvider(providerId, startRange, endRange);
      return list.map(a => ({
        start_at: a.start_at,
        end_at: a.end_at,
        status: a.status
      }));
    });
  }
}
