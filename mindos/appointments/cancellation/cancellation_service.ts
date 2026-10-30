/**
 * MindOS Canonical Appointment Cancellation Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, II, III, XV & Appendices B / C / Q / J
 * Clinical Safety Policy Catalogue (R-SAFE-001, ADR-033..039)
 */

import { IAppointmentRepository } from '../repositories/interfaces.js';
import { AppointmentBookingService } from '../booking/booking_service.js';
import { AppointmentEntity, WaitlistOfferEntity } from '../domain/types.js';
import { AppointmentState, WaitlistEntryState, WaitlistOfferState, validateStateTransition } from '../../platform/shared/state_machines.js';
import { AvailabilitySlotService } from '../../availability/slots/slot_service.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { AuditService } from '../../platform/audit/index.js';
import { NotificationService } from '../../notifications/index.js';
import {
  AppointmentAlreadyCancelledError,
  AppointmentAlreadyCompletedError,
  NotFoundError
} from '../../platform/errors/index.js';

export interface CancelAppointmentParams {
  appointmentId: string;
  actorId: string;
  isUser: boolean;
  reasonCode: string;
  clinicalContinuityNote?: string;
}

export class AppointmentCancellationService {
  public static async cancel(params: CancelAppointmentParams): Promise<AppointmentEntity> {
    const repo = AppointmentBookingService.getRepository();
    const apt = await repo.getAppointmentById(params.appointmentId);
    if (!apt) {
      throw new NotFoundError('Appointment not found.');
    }

    // 1. Validate State
    if (apt.status === AppointmentState.CANCELLED_BY_USER ||
        apt.status === AppointmentState.CANCELLED_BY_PROVIDER ||
        apt.status === AppointmentState.CANCELLED_BY_PROFESSIONAL) {
      throw new AppointmentAlreadyCancelledError();
    }

    if (apt.status === AppointmentState.COMPLETED) {
      throw new AppointmentAlreadyCompletedError();
    }

    const targetState = params.isUser ? AppointmentState.CANCELLED_BY_USER : AppointmentState.CANCELLED_BY_PROVIDER;
    validateStateTransition('AppointmentState', apt.status, targetState, apt.id, params.actorId);

    const now = new Date();
    const nowMs = now.getTime();
    const startMs = new Date(apt.start_at).getTime();

    // 2. Cancellation Policy Check
    const availRepo = AvailabilitySlotService.getRepository();
    const policy = await availRepo.getDefaultCancellationPolicy();
    const cutoffHours = policy?.user_cancellation_cutoff_hours || 24;
    const isLateCancellation = params.isUser && (startMs - nowMs < cutoffHours * 60 * 60 * 1000);

    // 3. Update Appointment Status
    apt.status = targetState;
    apt.state = targetState; // backward compatibility
    apt.cancelled_at = now.toISOString();
    apt.version += 1;

    const updated = await repo.updateAppointment(apt);

    // 4. Release Schedule Block
    await availRepo.releaseScheduleBlockBySource(apt.id);

    // 5. Invalidate Pending Reminders
    const reminders = await repo.getRemindersByAppointment(apt.id);
    for (const r of reminders) {
      if (r.status === 'SCHEDULED') {
        r.status = 'CANCELLED';
        await repo.updateReminder(r);
      }
    }

    // 6. Provider Cancellation Continuity Care
    if (!params.isUser) {
      await NotificationService.sendNotification({
        userId: apt.subject_user_id,
        channel: 'IN_APP',
        category: 'APPOINTMENT',
        title: 'Appointment Update',
        body: 'Your provider needed to reschedule your appointment. Our care team is ready to assist you in booking a new slot.',
        containsHealthSensitiveContent: true
      });
    }

    // 7. Auto-Match Waitlist & Generate Waitlist Offers
    await this.processWaitlistForOpenedSlot(apt.provider_id, apt.service_offering_id, apt.start_at, apt.end_at);

    // 8. Emit Canonical Cancellation Event
    EventBus.enqueue(
      'appointment.cancelled',
      'appointments',
      apt.id,
      DataClassification.SENSITIVE,
      {
        appointment_id: apt.id,
        provider_id: apt.provider_id,
        subject_user_id: apt.subject_user_id,
        cancelled_by: params.isUser ? 'USER' : 'PROVIDER',
        reason_code: params.reasonCode,
        is_late_cancellation: isLateCancellation
      }
    );

    // 9. Audit Logging
    AuditService.record({
      action: 'APPOINTMENT_CANCELLED',
      actor_type: params.isUser ? 'USER' : 'STAFF',
      actor_id: params.actorId,
      resource_type: 'APPOINTMENT',
      resource_id: apt.id,
      resource_classification: DataClassification.SENSITIVE,
      authorization_basis: { policy: 'APPOINTMENT_CANCELLATION_POLICY' },
      result: 'SUCCESS',
      metadata: {
        cancelled_by: params.isUser ? 'USER' : 'PROVIDER',
        reason_code: params.reasonCode,
        is_late_cancellation: isLateCancellation
      }
    });

    return updated;
  }

  private static async processWaitlistForOpenedSlot(
    providerId: string,
    serviceOfferingId: string,
    startAt: string,
    endAt: string
  ): Promise<void> {
    const repo = AppointmentBookingService.getRepository();
    const activeWaitlist = await repo.getActiveWaitlistEntries(providerId, serviceOfferingId);

    if (activeWaitlist.length === 0) return;

    // Pick the earliest waitlisted entry
    const candidate = activeWaitlist[0];
    const offerExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours offer window

    const offer: WaitlistOfferEntity = {
      id: generateUUIDv7(),
      waitlist_entry_id: candidate.id,
      slot_start: startAt,
      slot_end: endAt,
      offered_at: new Date().toISOString(),
      expires_at: offerExpiresAt,
      status: WaitlistOfferState.PENDING
    };

    await repo.saveWaitlistOffer(offer);

    candidate.status = WaitlistEntryState.OFFERED;
    await repo.updateWaitlistEntry(candidate);

    EventBus.enqueue(
      'appointment.waitlist_offer_created',
      'appointments',
      offer.id,
      DataClassification.SENSITIVE,
      {
        offer_id: offer.id,
        waitlist_entry_id: candidate.id,
        subject_user_id: candidate.subject_user_id,
        slot_start: startAt,
        expires_at: offerExpiresAt
      }
    );
  }
}
