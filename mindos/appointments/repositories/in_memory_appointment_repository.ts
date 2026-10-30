/**
 * MindOS Canonical In-Memory Appointment Repository
 */

import { IAppointmentRepository } from './interfaces.js';
import {
  AppointmentEntity,
  AppointmentRescheduleEntity,
  AppointmentAttendanceEntity,
  AppointmentWaitlistEntryEntity,
  WaitlistOfferEntity,
  AppointmentReminderEntity,
  VirtualSessionEntity
} from '../domain/types.js';
import { AppointmentState, WaitlistEntryState, WaitlistOfferState } from '../../platform/shared/state_machines.js';
import { AppointmentConflictError } from '../../platform/errors/index.js';

export class InMemoryAppointmentRepository implements IAppointmentRepository {
  private appointments: Map<string, AppointmentEntity> = new Map();
  private reschedules: Map<string, AppointmentRescheduleEntity> = new Map();
  private attendance: Map<string, AppointmentAttendanceEntity> = new Map();
  private waitlistEntries: Map<string, AppointmentWaitlistEntryEntity> = new Map();
  private waitlistOffers: Map<string, WaitlistOfferEntity> = new Map();
  private reminders: Map<string, AppointmentReminderEntity> = new Map();
  private virtualSessions: Map<string, VirtualSessionEntity> = new Map();

  // Appointments
  public async getAppointmentById(id: string): Promise<AppointmentEntity | null> {
    const apt = this.appointments.get(id);
    return apt ? { ...apt } : null;
  }

  public async getAppointmentByIdempotencyKey(key: string): Promise<AppointmentEntity | null> {
    for (const apt of this.appointments.values()) {
      if (apt.idempotency_key === key) {
        return { ...apt };
      }
    }
    return null;
  }

  public async getAppointmentsByProvider(providerId: string, startRange?: string, endRange?: string): Promise<AppointmentEntity[]> {
    const startMs = startRange ? new Date(startRange).getTime() : 0;
    const endMs = endRange ? new Date(endRange).getTime() : Infinity;

    return Array.from(this.appointments.values())
      .filter(apt => {
        if (apt.provider_id !== providerId && apt.professional_id !== providerId) return false;
        const aStart = new Date(apt.start_at).getTime();
        const aEnd = new Date(apt.end_at).getTime();
        return aStart < endMs && aEnd > startMs;
      })
      .map(a => ({ ...a }));
  }

  public async getAppointmentsBySubject(subjectUserId: string): Promise<AppointmentEntity[]> {
    return Array.from(this.appointments.values())
      .filter(apt => apt.subject_user_id === subjectUserId || apt.client_id === subjectUserId)
      .map(a => ({ ...a }));
  }

  public async saveAppointment(appointment: AppointmentEntity): Promise<AppointmentEntity> {
    // Overlap exclusion check
    const activeStates = [
      AppointmentState.CONFIRMED,
      AppointmentState.HELD,
      AppointmentState.CHECKED_IN,
      AppointmentState.IN_PROGRESS
    ];

    if (activeStates.includes(appointment.status)) {
      const apptStart = new Date(appointment.start_at).getTime();
      const apptEnd = new Date(appointment.end_at).getTime();

      for (const existing of this.appointments.values()) {
        if (existing.id !== appointment.id &&
            existing.provider_id === appointment.provider_id &&
            activeStates.includes(existing.status)) {
          const exStart = new Date(existing.start_at).getTime();
          const exEnd = new Date(existing.end_at).getTime();

          if (apptStart < exEnd && apptEnd > exStart) {
            throw new AppointmentConflictError(`Double booking detected for provider ${appointment.provider_id} between ${appointment.start_at} and ${appointment.end_at}`);
          }
        }
      }
    }

    this.appointments.set(appointment.id, { ...appointment });
    return { ...appointment };
  }

  public async updateAppointment(appointment: AppointmentEntity): Promise<AppointmentEntity> {
    return this.saveAppointment(appointment);
  }

  // Reschedules
  public async saveReschedule(reschedule: AppointmentRescheduleEntity): Promise<AppointmentRescheduleEntity> {
    this.reschedules.set(reschedule.id, { ...reschedule });
    return { ...reschedule };
  }

  public async getReschedulesByAppointment(appointmentId: string): Promise<AppointmentRescheduleEntity[]> {
    return Array.from(this.reschedules.values())
      .filter(r => r.appointment_id === appointmentId)
      .map(r => ({ ...r }));
  }

  // Attendance
  public async getAttendanceByAppointment(appointmentId: string): Promise<AppointmentAttendanceEntity | null> {
    for (const att of this.attendance.values()) {
      if (att.appointment_id === appointmentId) {
        return { ...att };
      }
    }
    return null;
  }

  public async saveAttendance(attendance: AppointmentAttendanceEntity): Promise<AppointmentAttendanceEntity> {
    this.attendance.set(attendance.id, { ...attendance });
    return { ...attendance };
  }

  public async updateAttendance(attendance: AppointmentAttendanceEntity): Promise<AppointmentAttendanceEntity> {
    this.attendance.set(attendance.id, { ...attendance });
    return { ...attendance };
  }

  // Waitlist
  public async saveWaitlistEntry(entry: AppointmentWaitlistEntryEntity): Promise<AppointmentWaitlistEntryEntity> {
    this.waitlistEntries.set(entry.id, { ...entry });
    return { ...entry };
  }

  public async getWaitlistEntryById(id: string): Promise<AppointmentWaitlistEntryEntity | null> {
    const entry = this.waitlistEntries.get(id);
    return entry ? { ...entry } : null;
  }

  public async getActiveWaitlistEntries(providerId?: string, serviceOfferingId?: string): Promise<AppointmentWaitlistEntryEntity[]> {
    return Array.from(this.waitlistEntries.values())
      .filter(w => {
        if (w.status !== WaitlistEntryState.ACTIVE) return false;
        if (providerId && w.provider_id && w.provider_id !== providerId) return false;
        if (serviceOfferingId && w.service_offering_id !== serviceOfferingId) return false;
        return true;
      })
      .map(w => ({ ...w }));
  }

  public async updateWaitlistEntry(entry: AppointmentWaitlistEntryEntity): Promise<AppointmentWaitlistEntryEntity> {
    this.waitlistEntries.set(entry.id, { ...entry });
    return { ...entry };
  }

  // Waitlist Offers
  public async saveWaitlistOffer(offer: WaitlistOfferEntity): Promise<WaitlistOfferEntity> {
    this.waitlistOffers.set(offer.id, { ...offer });
    return { ...offer };
  }

  public async getWaitlistOfferById(id: string): Promise<WaitlistOfferEntity | null> {
    const offer = this.waitlistOffers.get(id);
    return offer ? { ...offer } : null;
  }

  public async getActiveWaitlistOffer(waitlistEntryId: string): Promise<WaitlistOfferEntity | null> {
    const nowMs = Date.now();
    for (const offer of this.waitlistOffers.values()) {
      if (offer.waitlist_entry_id === waitlistEntryId && offer.status === WaitlistOfferState.PENDING) {
        if (new Date(offer.expires_at).getTime() > nowMs) {
          return { ...offer };
        } else {
          offer.status = WaitlistOfferState.EXPIRED;
        }
      }
    }
    return null;
  }

  public async updateWaitlistOffer(offer: WaitlistOfferEntity): Promise<WaitlistOfferEntity> {
    this.waitlistOffers.set(offer.id, { ...offer });
    return { ...offer };
  }

  // Reminders
  public async saveReminder(reminder: AppointmentReminderEntity): Promise<AppointmentReminderEntity> {
    this.reminders.set(reminder.id, { ...reminder });
    return { ...reminder };
  }

  public async getRemindersByAppointment(appointmentId: string): Promise<AppointmentReminderEntity[]> {
    return Array.from(this.reminders.values())
      .filter(r => r.appointment_id === appointmentId)
      .map(r => ({ ...r }));
  }

  public async getPendingReminders(upToTimestamp: string): Promise<AppointmentReminderEntity[]> {
    const upToMs = new Date(upToTimestamp).getTime();
    return Array.from(this.reminders.values())
      .filter(r => r.status === 'SCHEDULED' && new Date(r.scheduled_for).getTime() <= upToMs)
      .map(r => ({ ...r }));
  }

  public async updateReminder(reminder: AppointmentReminderEntity): Promise<AppointmentReminderEntity> {
    this.reminders.set(reminder.id, { ...reminder });
    return { ...reminder };
  }

  // Virtual Sessions
  public async saveVirtualSession(session: VirtualSessionEntity): Promise<VirtualSessionEntity> {
    this.virtualSessions.set(session.id, { ...session });
    return { ...session };
  }

  public async getVirtualSessionByAppointment(appointmentId: string): Promise<VirtualSessionEntity | null> {
    for (const s of this.virtualSessions.values()) {
      if (s.appointment_id === appointmentId) {
        return { ...s };
      }
    }
    return null;
  }

  public async updateVirtualSession(session: VirtualSessionEntity): Promise<VirtualSessionEntity> {
    this.virtualSessions.set(session.id, { ...session });
    return { ...session };
  }

  public clear(): void {
    this.appointments.clear();
    this.reschedules.clear();
    this.attendance.clear();
    this.waitlistEntries.clear();
    this.waitlistOffers.clear();
    this.reminders.clear();
    this.virtualSessions.clear();
  }
}
