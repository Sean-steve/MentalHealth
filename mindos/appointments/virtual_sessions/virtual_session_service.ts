/**
 * MindOS Canonical Virtual Session Access & Authorization Service
 * Authority: ADR-038 Ephemeral Virtual Session Tokens & Join Window Protection
 */

import crypto from 'crypto';
import { IAppointmentRepository } from '../repositories/interfaces.js';
import { AppointmentBookingService } from '../booking/booking_service.js';
import { AppointmentState } from '../../platform/shared/state_machines.js';
import {
  AppointmentJoinNotAllowedError,
  AuthorizationError,
  NotFoundError
} from '../../platform/errors/index.js';

const VIRTUAL_SECRET = process.env.VIRTUAL_SESSION_SECRET || 'mindos-webrtc-virtual-session-secret-2026';

export class VirtualSessionService {
  public static async authorizeJoinSession(params: {
    appointmentId: string;
    actorId: string;
    isUser: boolean;
  }): Promise<{ sessionToken: string; joinWindowExpiresAt: string; sessionRoomId: string }> {
    const repo = AppointmentBookingService.getRepository();
    const apt = await repo.getAppointmentById(params.appointmentId);
    if (!apt) {
      throw new NotFoundError('Appointment not found.');
    }

    // 1. IDOR Authorization Check
    const isPatient = params.actorId === apt.subject_user_id || params.actorId === apt.client_id;
    const isClinician = params.actorId === apt.provider_id || params.actorId === apt.professional_id;

    if (!isPatient && !isClinician) {
      throw new AuthorizationError('You are not authorized to participate in this private clinical session.');
    }

    // 2. State Check
    if (apt.status !== AppointmentState.CONFIRMED &&
        apt.status !== AppointmentState.CHECKED_IN &&
        apt.status !== AppointmentState.IN_PROGRESS) {
      throw new AppointmentJoinNotAllowedError(`Cannot join session for appointment in status: ${apt.status}`);
    }

    // 3. Virtual Session Join Window Check
    const vs = await repo.getVirtualSessionByAppointment(apt.id);
    if (!vs) {
      throw new NotFoundError('Virtual session record not found for this appointment.');
    }

    const now = Date.now();
    const windowStartMs = new Date(vs.join_window_start).getTime();
    const windowEndMs = new Date(vs.join_window_end).getTime();

    if (now < windowStartMs) {
      throw new AppointmentJoinNotAllowedError('Virtual session join window is not yet open. You may enter 10 minutes prior to session start.');
    }

    if (now > windowEndMs) {
      throw new AppointmentJoinNotAllowedError('Virtual session join window has closed.');
    }

    // 4. Generate Ephemeral Authorized Join Token (15 minute validity)
    const tokenPayload = {
      appointmentId: apt.id,
      actorId: params.actorId,
      role: isClinician ? 'CLINICIAN' : 'PATIENT',
      roomId: vs.external_session_reference,
      exp: Date.now() + 15 * 60 * 1000
    };

    const encodedData = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
    const sig = crypto.createHmac('sha256', VIRTUAL_SECRET).update(encodedData).digest('base64url');
    const sessionToken = `${encodedData}.${sig}`;

    return {
      sessionToken,
      joinWindowExpiresAt: vs.join_window_end,
      sessionRoomId: vs.external_session_reference
    };
  }
}
