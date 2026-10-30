/**
 * MindOS Canonical Appointment Reconciliation & Event Handler Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, II, III, XV & Appendices B / C / Q / J
 * Clinical Safety Policy Catalogue (R-SAFE-001, ADR-033..039)
 */

import { IAppointmentRepository } from '../repositories/interfaces.js';
import { AppointmentBookingService } from '../booking/booking_service.js';
import { AvailabilitySlotService } from '../../availability/slots/slot_service.js';
import { AppointmentState } from '../../platform/shared/state_machines.js';
import { NotificationService } from '../../notifications/index.js';
import { EventBus } from '../../platform/events/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { AuditService } from '../../platform/audit/index.js';

export class AppointmentReconciliationService {
  /**
   * Reconciles provider suspension or credential expiration
   */
  public static async reconcileProviderSuspension(providerId: string, reason: string): Promise<number> {
    const repo = AppointmentBookingService.getRepository();
    const availRepo = AvailabilitySlotService.getRepository();
    const nowIso = new Date().toISOString();

    // Fetch future appointments for suspended provider
    const appointments = await repo.getAppointmentsByProvider(providerId, nowIso);
    let impactedCount = 0;

    for (const apt of appointments) {
      if (apt.status === AppointmentState.CONFIRMED || apt.status === AppointmentState.PENDING_CONFIRMATION) {
        apt.status = AppointmentState.CANCELLED_BY_PROVIDER;
        apt.state = AppointmentState.CANCELLED_BY_PROVIDER;
        apt.cancelled_at = nowIso;
        apt.version += 1;
        await repo.updateAppointment(apt);

        // Release schedule block
        await availRepo.releaseScheduleBlockBySource(apt.id);

        // Invalidate reminders
        const reminders = await repo.getRemindersByAppointment(apt.id);
        for (const r of reminders) {
          if (r.status === 'SCHEDULED') {
            r.status = 'CANCELLED';
            await repo.updateReminder(r);
          }
        }

        // Notify user with privacy-safe notice
        await NotificationService.sendNotification({
          userId: apt.subject_user_id,
          channel: 'IN_APP',
          category: 'APPOINTMENT',
          title: 'Schedule Change Notification',
          body: 'A scheduled consultation requires rescheduling. Our care team is contacting you to select an alternative provider or time.',
          containsHealthSensitiveContent: true
        });

        EventBus.enqueue(
          'appointment.cancelled',
          'appointments',
          apt.id,
          DataClassification.SENSITIVE,
          {
            appointment_id: apt.id,
            provider_id: providerId,
            subject_user_id: apt.subject_user_id,
            reason_code: 'PROVIDER_SUSPENDED_OR_CREDENTIAL_EXPIRED',
            details: reason
          }
        );

        impactedCount++;
      }
    }

    AuditService.record({
      action: 'APPOINTMENTS_RECONCILED_PROVIDER_SUSPENSION',
      actor_type: 'SYSTEM',
      actor_id: 'SYSTEM',
      resource_type: 'PROVIDER',
      resource_id: providerId,
      resource_classification: DataClassification.SENSITIVE,
      authorization_basis: { policy: 'CREDENTIAL_REVOCATION_POLICY' },
      result: 'SUCCESS',
      metadata: { impactedCount, reason }
    });

    return impactedCount;
  }
}
