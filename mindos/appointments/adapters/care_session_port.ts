/**
 * MindOS Care Session Port - Handoff to Sprint 21 Care Session Execution Engine
 * Authority: Master Architecture Index Section 14 & Appendix B / C
 */

import { AppointmentEntity } from '../domain/types.js';

export interface CareSessionContext {
  appointmentId: string;
  encounterType: string;
  patientId: string;
  providerId: string;
  scheduledStart: string;
  scheduledEnd: string;
  deliveryMode: string;
  referralId?: string;
  careNavigationSessionId?: string;
  virtualSessionReference?: string;
}

export class CareSessionPort {
  public static getCareSessionContext(appointment: AppointmentEntity): CareSessionContext {
    return {
      appointmentId: appointment.id,
      encounterType: appointment.appointment_type,
      patientId: appointment.subject_user_id,
      providerId: appointment.provider_id,
      scheduledStart: appointment.start_at,
      scheduledEnd: appointment.end_at,
      deliveryMode: appointment.delivery_mode,
      referralId: appointment.referral_id,
      careNavigationSessionId: appointment.care_navigation_session_id,
      virtualSessionReference: appointment.virtual_session_reference
    };
  }
}
