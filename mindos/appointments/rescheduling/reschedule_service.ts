/**
 * MindOS Canonical Appointment Rescheduling Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, II, III, XV & Appendices B / C / Q / J
 * Clinical Safety Policy Catalogue (R-SAFE-001, ADR-033..039)
 */

import { IAppointmentRepository } from '../repositories/interfaces.js';
import { AppointmentBookingService } from '../booking/booking_service.js';
import { AppointmentEntity, AppointmentRescheduleEntity } from '../domain/types.js';
import { AppointmentState } from '../../platform/shared/state_machines.js';
import { AvailabilitySlotService } from '../../availability/slots/slot_service.js';
import { SlotTokenService } from '../../availability/slots/slot_token_service.js';
import {
  ScheduleBlock,
  ScheduleBlockType,
  ScheduleBlockSource
} from '../../availability/domain/types.js';
import { ScheduleBlockState } from '../../platform/shared/state_machines.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { AuditService } from '../../platform/audit/index.js';
import {
  AppointmentRescheduleNotAllowedError,
  AppointmentSlotUnavailableError,
  NotFoundError
} from '../../platform/errors/index.js';

export interface RescheduleAppointmentParams {
  appointmentId: string;
  newStartAt: string;
  newEndAt: string;
  slotToken?: string;
  actorId: string;
  initiatedBy: 'USER' | 'PROVIDER' | 'SYSTEM';
  reasonCode: string;
}

export class AppointmentRescheduleService {
  public static async reschedule(params: RescheduleAppointmentParams): Promise<AppointmentEntity> {
    const repo = AppointmentBookingService.getRepository();
    const apt = await repo.getAppointmentById(params.appointmentId);
    if (!apt) {
      throw new NotFoundError('Appointment not found.');
    }

    // 1. Validate State
    if (apt.status !== AppointmentState.CONFIRMED && apt.status !== AppointmentState.PENDING_CONFIRMATION) {
      throw new AppointmentRescheduleNotAllowedError(`Cannot reschedule appointment in status: ${apt.status}`);
    }

    const nowMs = Date.now();
    const currentStartMs = new Date(apt.start_at).getTime();

    // 2. Policy Cutoff Check (24 hours standard notice for user-initiated rescheduling)
    if (params.initiatedBy === 'USER') {
      const availRepo = AvailabilitySlotService.getRepository();
      const policy = await availRepo.getDefaultCancellationPolicy();
      const cutoffMs = (policy?.user_cancellation_cutoff_hours || 24) * 60 * 60 * 1000;

      if (currentStartMs - nowMs < cutoffMs) {
        throw new AppointmentRescheduleNotAllowedError(
          `Rescheduling requires at least ${policy?.user_cancellation_cutoff_hours || 24} hours advance notice.`
        );
      }
    }

    // 3. Verify Slot Token for New Slot (if provided)
    if (params.slotToken) {
      const verifyResult = SlotTokenService.verifyToken(params.slotToken);
      if (!verifyResult.valid || !verifyResult.payload) {
        throw new AppointmentSlotUnavailableError(`Invalid slot token for reschedule: ${verifyResult.error}`);
      }
      const p = verifyResult.payload;
      if (p.provider_id !== apt.provider_id ||
          p.start_at !== params.newStartAt ||
          p.end_at !== params.newEndAt) {
        throw new AppointmentSlotUnavailableError('Slot token parameters do not match requested new appointment time.');
      }
    }

    const availRepo = AvailabilitySlotService.getRepository();

    // 4. Release Old Schedule Block
    await availRepo.releaseScheduleBlockBySource(apt.id);

    // 5. Invalidate Old Reminders
    const existingReminders = await repo.getRemindersByAppointment(apt.id);
    for (const r of existingReminders) {
      if (r.status === 'SCHEDULED') {
        r.status = 'CANCELLED';
        await repo.updateReminder(r);
      }
    }

    // 6. Create New Schedule Block
    const newScheduleBlock: ScheduleBlock = {
      id: generateUUIDv7(),
      provider_id: apt.provider_id,
      start_at: params.newStartAt,
      end_at: params.newEndAt,
      block_type: ScheduleBlockType.APPOINTMENT,
      source_type: ScheduleBlockSource.APPOINTMENT,
      source_reference: apt.id,
      status: ScheduleBlockState.ACTIVE,
      created_at: new Date().toISOString()
    };
    await availRepo.saveScheduleBlock(newScheduleBlock);

    // 7. Record Reschedule Audit History
    const rescheduleRecord: AppointmentRescheduleEntity = {
      id: generateUUIDv7(),
      appointment_id: apt.id,
      old_start_at: apt.start_at,
      old_end_at: apt.end_at,
      new_start_at: params.newStartAt,
      new_end_at: params.newEndAt,
      initiated_by: params.initiatedBy,
      reason_code: params.reasonCode,
      created_at: new Date().toISOString()
    };
    await repo.saveReschedule(rescheduleRecord);

    // 8. Update Appointment Schedule
    apt.start_at = params.newStartAt;
    apt.end_at = params.newEndAt;
    apt.start_time = params.newStartAt;
    apt.end_time = params.newEndAt;
    apt.version += 1;

    const updated = await repo.updateAppointment(apt);

    // 9. Update Virtual Session Join Window
    const vs = await repo.getVirtualSessionByAppointment(apt.id);
    if (vs) {
      vs.join_window_start = new Date(new Date(params.newStartAt).getTime() - 10 * 60 * 1000).toISOString();
      vs.join_window_end = new Date(new Date(params.newEndAt).getTime() + 15 * 60 * 1000).toISOString();
      vs.expires_at = vs.join_window_end;
      await repo.updateVirtualSession(vs);
    }

    // 10. Reschedule Reminders
    const newStartMs = new Date(params.newStartAt).getTime();
    if (newStartMs - 24 * 60 * 60 * 1000 > nowMs) {
      await repo.saveReminder({
        id: generateUUIDv7(),
        appointment_id: apt.id,
        reminder_type: 'UPCOMING_24H',
        scheduled_for: new Date(newStartMs - 24 * 60 * 60 * 1000).toISOString(),
        channel: 'PUSH',
        status: 'SCHEDULED',
        created_at: new Date().toISOString()
      });
    }

    // 11. Emit Event
    EventBus.enqueue(
      'appointment.rescheduled',
      'appointments',
      apt.id,
      DataClassification.SENSITIVE,
      {
        appointment_id: apt.id,
        old_start_at: rescheduleRecord.old_start_at,
        new_start_at: rescheduleRecord.new_start_at,
        initiated_by: params.initiatedBy,
        reason_code: params.reasonCode
      }
    );

    AuditService.record({
      action: 'APPOINTMENT_RESCHEDULED',
      actor_type: params.initiatedBy === 'USER' ? 'USER' : 'STAFF',
      actor_id: params.actorId,
      resource_type: 'APPOINTMENT',
      resource_id: apt.id,
      resource_classification: DataClassification.SENSITIVE,
      authorization_basis: { policy: 'APPOINTMENT_RESCHEDULE_POLICY' },
      result: 'SUCCESS',
      metadata: {
        old_start_at: rescheduleRecord.old_start_at,
        new_start_at: rescheduleRecord.new_start_at,
        initiated_by: params.initiatedBy
      }
    });

    return updated;
  }
}
