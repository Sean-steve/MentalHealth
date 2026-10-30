/**
 * MindOS Canonical Calendar Integration Port - Privacy-Safe External Calendar Feeds
 * Authority: Kenya Data Protection Act 2019, Digital Health Act 2023
 * Invariant: Never export clinical symptoms, diagnoses, or sensitive intake summaries to external calendars.
 */

import { AppointmentEntity } from '../domain/types.js';

export interface CalendarEventProjection {
  uid: string;
  summary: string;
  description: string;
  dtStart: string;
  dtEnd: string;
  location: string;
  status: string;
}

export class CalendarIntegrationPort {
  public static projectToCalendarEvent(appointment: AppointmentEntity): CalendarEventProjection {
    return {
      uid: `${appointment.id}@mindos.health`,
      summary: 'MindOS Confidential Care Session',
      description: 'Private scheduled consultation on MindOS. For session link and details, please open your MindOS app.',
      dtStart: appointment.start_at,
      dtEnd: appointment.end_at,
      location: appointment.delivery_mode === 'TELEHEALTH' ? 'MindOS Telehealth Room' : (appointment.location_reference || 'In-Person Clinic'),
      status: appointment.status === 'CONFIRMED' ? 'CONFIRMED' : 'CANCELLED'
    };
  }
}
