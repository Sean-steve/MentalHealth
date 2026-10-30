/**
 * MindOS Canonical Appointment Attendance & Encounter Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, II, III, XV & Appendices B / C / Q / J
 * Clinical Safety Policy Catalogue (R-SAFE-001, ADR-033..039)
 */

import { IAppointmentRepository } from '../repositories/interfaces.js';
import { AppointmentBookingService } from '../booking/booking_service.js';
import { AppointmentEntity, AppointmentAttendanceEntity } from '../domain/types.js';
import { AppointmentState, validateStateTransition } from '../../platform/shared/state_machines.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { AuditService } from '../../platform/audit/index.js';
import {
  AppointmentInvalidStateError,
  AuthorizationError,
  NotFoundError
} from '../../platform/errors/index.js';

export class AppointmentAttendanceService {
  /**
   * Check in to an appointment within canonical window [-15 min, +30 min] of start_at
   */
  public static async checkIn(params: {
    appointmentId: string;
    actorId: string;
    isUser: boolean;
  }): Promise<AppointmentAttendanceEntity> {
    const repo = AppointmentBookingService.getRepository();
    const apt = await repo.getAppointmentById(params.appointmentId);
    if (!apt) {
      throw new NotFoundError('Appointment not found.');
    }

    if (apt.status !== AppointmentState.CONFIRMED && apt.status !== AppointmentState.CHECKED_IN) {
      throw new AppointmentInvalidStateError(`Cannot check in for appointment in status: ${apt.status}`);
    }

    const now = new Date();
    const nowMs = now.getTime();
    const startMs = new Date(apt.start_at).getTime();

    // Check-in window validation
    const windowOpenMs = startMs - 15 * 60 * 1000;
    const windowCloseMs = startMs + 30 * 60 * 1000;

    if (nowMs < windowOpenMs) {
      throw new AppointmentInvalidStateError('Check-in window opens 15 minutes before appointment start time.');
    }
    if (nowMs > windowCloseMs) {
      throw new AppointmentInvalidStateError('Check-in window has closed. Please contact support or your provider.');
    }

    let att = await repo.getAttendanceByAppointment(apt.id);
    if (!att) {
      att = {
        id: generateUUIDv7(),
        appointment_id: apt.id,
        user_status: 'PENDING',
        provider_status: 'PENDING',
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      };
      await repo.saveAttendance(att);
    }

    if (params.isUser) {
      if (params.actorId !== apt.subject_user_id) {
        throw new AuthorizationError('Only the scheduled patient can check in as user.');
      }
      att.user_status = 'CHECKED_IN';
      att.user_checked_in_at = now.toISOString();
    } else {
      if (params.actorId !== apt.provider_id && params.actorId !== apt.professional_id) {
        throw new AuthorizationError('Only the assigned professional can check in as provider.');
      }
      att.provider_status = 'CHECKED_IN';
      att.provider_checked_in_at = now.toISOString();
    }

    att.updated_at = now.toISOString();
    const updatedAtt = await repo.updateAttendance(att);

    // Update appointment state to CHECKED_IN if not already
    if (apt.status === AppointmentState.CONFIRMED) {
      apt.status = AppointmentState.CHECKED_IN;
      apt.state = AppointmentState.CHECKED_IN;
      await repo.updateAppointment(apt);
    }

    AuditService.record({
      action: 'APPOINTMENT_CHECKED_IN',
      actor_type: params.isUser ? 'USER' : 'STAFF',
      actor_id: params.actorId,
      resource_type: 'APPOINTMENT',
      resource_id: apt.id,
      resource_classification: DataClassification.SENSITIVE,
      authorization_basis: { policy: 'APPOINTMENT_ATTENDANCE_POLICY' },
      result: 'SUCCESS',
      metadata: { isUser: params.isUser }
    });

    return updatedAtt;
  }

  /**
   * Start encounter session (Provider only)
   */
  public static async startSession(params: {
    appointmentId: string;
    actorId: string;
  }): Promise<AppointmentEntity> {
    const repo = AppointmentBookingService.getRepository();
    const apt = await repo.getAppointmentById(params.appointmentId);
    if (!apt) {
      throw new NotFoundError('Appointment not found.');
    }

    if (params.actorId !== apt.provider_id && params.actorId !== apt.professional_id) {
      throw new AuthorizationError('Only the assigned clinician can start the encounter.');
    }

    validateStateTransition('AppointmentState', apt.status, AppointmentState.IN_PROGRESS, apt.id, params.actorId);

    const now = new Date();
    apt.status = AppointmentState.IN_PROGRESS;
    apt.state = AppointmentState.IN_PROGRESS;
    apt.version += 1;

    const updated = await repo.updateAppointment(apt);

    // Update attendance record
    let att = await repo.getAttendanceByAppointment(apt.id);
    if (att) {
      att.session_started_at = now.toISOString();
      att.updated_at = now.toISOString();
      await repo.updateAttendance(att);
    }

    EventBus.enqueue(
      'appointment.started',
      'appointments',
      apt.id,
      DataClassification.SENSITIVE,
      {
        appointment_id: apt.id,
        provider_id: apt.provider_id,
        subject_user_id: apt.subject_user_id,
        started_at: now.toISOString()
      }
    );

    return updated;
  }

  /**
   * Mark appointment encounter completed (Authorized Provider Only)
   */
  public static async completeSession(params: {
    appointmentId: string;
    actorId: string;
  }): Promise<AppointmentEntity> {
    const repo = AppointmentBookingService.getRepository();
    const apt = await repo.getAppointmentById(params.appointmentId);
    if (!apt) {
      throw new NotFoundError('Appointment not found.');
    }

    if (params.actorId !== apt.provider_id && params.actorId !== apt.professional_id) {
      throw new AuthorizationError('Only the assigned clinician can mark the appointment as completed.');
    }

    validateStateTransition('AppointmentState', apt.status, AppointmentState.COMPLETED, apt.id, params.actorId);

    const now = new Date();
    apt.status = AppointmentState.COMPLETED;
    apt.state = AppointmentState.COMPLETED;
    apt.completed_at = now.toISOString();
    apt.version += 1;

    const updated = await repo.updateAppointment(apt);

    // Update attendance record
    let att = await repo.getAttendanceByAppointment(apt.id);
    if (att) {
      att.session_ended_at = now.toISOString();
      att.user_status = 'ATTENDED';
      att.provider_status = 'ATTENDED';
      att.recorded_by = params.actorId;
      att.updated_at = now.toISOString();
      await repo.updateAttendance(att);
    }

    EventBus.enqueue(
      'appointment.completed',
      'appointments',
      apt.id,
      DataClassification.SENSITIVE,
      {
        appointment_id: apt.id,
        provider_id: apt.provider_id,
        subject_user_id: apt.subject_user_id,
        completed_at: now.toISOString()
      }
    );

    AuditService.record({
      action: 'APPOINTMENT_COMPLETED',
      actor_type: 'STAFF',
      actor_id: params.actorId,
      resource_type: 'APPOINTMENT',
      resource_id: apt.id,
      resource_classification: DataClassification.SENSITIVE,
      authorization_basis: { policy: 'APPOINTMENT_COMPLETION_POLICY' },
      result: 'SUCCESS',
      metadata: { completed_at: now.toISOString() }
    });

    return updated;
  }

  /**
   * Record No-Show for appointment
   */
  public static async recordNoShow(params: {
    appointmentId: string;
    actorId: string;
    noShowParty: 'USER' | 'PROVIDER';
  }): Promise<AppointmentEntity> {
    const repo = AppointmentBookingService.getRepository();
    const apt = await repo.getAppointmentById(params.appointmentId);
    if (!apt) {
      throw new NotFoundError('Appointment not found.');
    }

    const targetState = params.noShowParty === 'USER' ? AppointmentState.NO_SHOW_USER : AppointmentState.NO_SHOW_PROVIDER;
    validateStateTransition('AppointmentState', apt.status, targetState, apt.id, params.actorId);

    apt.status = targetState;
    apt.state = AppointmentState.NO_SHOW; // general compatibility
    apt.version += 1;

    const updated = await repo.updateAppointment(apt);

    let att = await repo.getAttendanceByAppointment(apt.id);
    if (att) {
      if (params.noShowParty === 'USER') {
        att.user_status = 'NO_SHOW';
      } else {
        att.provider_status = 'NO_SHOW';
      }
      att.updated_at = new Date().toISOString();
      await repo.updateAttendance(att);
    }

    EventBus.enqueue(
      'appointment.no_show',
      'appointments',
      apt.id,
      DataClassification.SENSITIVE,
      {
        appointment_id: apt.id,
        no_show_party: params.noShowParty
      }
    );

    return updated;
  }
}
