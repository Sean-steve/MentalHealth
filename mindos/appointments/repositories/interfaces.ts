/**
 * MindOS Appointments Repository Interface
 */

import {
  AppointmentEntity,
  AppointmentRescheduleEntity,
  AppointmentAttendanceEntity,
  AppointmentWaitlistEntryEntity,
  WaitlistOfferEntity,
  AppointmentReminderEntity,
  VirtualSessionEntity
} from '../domain/types.js';
import { AppointmentState } from '../../platform/shared/state_machines.js';

export interface IAppointmentRepository {
  // Appointments
  getAppointmentById(id: string): Promise<AppointmentEntity | null>;
  getAppointmentByIdempotencyKey(key: string): Promise<AppointmentEntity | null>;
  getAppointmentsByProvider(providerId: string, startRange?: string, endRange?: string): Promise<AppointmentEntity[]>;
  getAppointmentsBySubject(subjectUserId: string): Promise<AppointmentEntity[]>;
  saveAppointment(appointment: AppointmentEntity): Promise<AppointmentEntity>;
  updateAppointment(appointment: AppointmentEntity): Promise<AppointmentEntity>;

  // Reschedules
  saveReschedule(reschedule: AppointmentRescheduleEntity): Promise<AppointmentRescheduleEntity>;
  getReschedulesByAppointment(appointmentId: string): Promise<AppointmentRescheduleEntity[]>;

  // Attendance
  getAttendanceByAppointment(appointmentId: string): Promise<AppointmentAttendanceEntity | null>;
  saveAttendance(attendance: AppointmentAttendanceEntity): Promise<AppointmentAttendanceEntity>;
  updateAttendance(attendance: AppointmentAttendanceEntity): Promise<AppointmentAttendanceEntity>;

  // Waitlist
  saveWaitlistEntry(entry: AppointmentWaitlistEntryEntity): Promise<AppointmentWaitlistEntryEntity>;
  getWaitlistEntryById(id: string): Promise<AppointmentWaitlistEntryEntity | null>;
  getActiveWaitlistEntries(providerId?: string, serviceOfferingId?: string): Promise<AppointmentWaitlistEntryEntity[]>;
  updateWaitlistEntry(entry: AppointmentWaitlistEntryEntity): Promise<AppointmentWaitlistEntryEntity>;

  // Waitlist Offers
  saveWaitlistOffer(offer: WaitlistOfferEntity): Promise<WaitlistOfferEntity>;
  getWaitlistOfferById(id: string): Promise<WaitlistOfferEntity | null>;
  getActiveWaitlistOffer(waitlistEntryId: string): Promise<WaitlistOfferEntity | null>;
  updateWaitlistOffer(offer: WaitlistOfferEntity): Promise<WaitlistOfferEntity>;

  // Reminders
  saveReminder(reminder: AppointmentReminderEntity): Promise<AppointmentReminderEntity>;
  getRemindersByAppointment(appointmentId: string): Promise<AppointmentReminderEntity[]>;
  getPendingReminders(upToTimestamp: string): Promise<AppointmentReminderEntity[]>;
  updateReminder(reminder: AppointmentReminderEntity): Promise<AppointmentReminderEntity>;

  // Virtual Sessions
  saveVirtualSession(session: VirtualSessionEntity): Promise<VirtualSessionEntity>;
  getVirtualSessionByAppointment(appointmentId: string): Promise<VirtualSessionEntity | null>;
  updateVirtualSession(session: VirtualSessionEntity): Promise<VirtualSessionEntity>;
}
