/**
 * MindOS Canonical Appointment Reminder Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, II, III, XV & Appendices B / C / Q / J
 * Clinical Safety Policy Catalogue (R-SAFE-001, ADR-033..039)
 */

import { IAppointmentRepository } from '../repositories/interfaces.js';
import { AppointmentBookingService } from '../booking/booking_service.js';
import { NotificationService } from '../../notifications/index.js';

export class AppointmentReminderService {
  public static async dispatchPendingReminders(nowIso?: string): Promise<number> {
    const timestamp = nowIso || new Date().toISOString();
    const repo = AppointmentBookingService.getRepository();
    const pending = await repo.getPendingReminders(timestamp);

    let dispatchedCount = 0;

    for (const reminder of pending) {
      const apt = await repo.getAppointmentById(reminder.appointment_id);
      if (!apt || apt.status !== 'CONFIRMED' && apt.status !== 'CHECKED_IN') {
        reminder.status = 'CANCELLED';
        await repo.updateReminder(reminder);
        continue;
      }

      let title = 'MindOS Care Appointment';
      let body = 'You have an upcoming consultation scheduled with your care provider.';

      if (reminder.reminder_type === 'BOOKING_CONFIRMATION') {
        title = 'Appointment Confirmed';
        body = `Your consultation is confirmed for ${new Date(apt.start_at).toLocaleDateString()}.`;
      } else if (reminder.reminder_type === 'UPCOMING_24H') {
        title = 'Upcoming Appointment Tomorrow';
        body = 'Reminder: Your care consultation is scheduled for tomorrow. Please ensure a quiet, private space.';
      } else if (reminder.reminder_type === 'SAME_DAY_2H') {
        title = 'Appointment in 2 Hours';
        body = 'Your care consultation begins in 2 hours. Tap to view your session details.';
      }

      const notif = await NotificationService.sendNotification({
        userId: apt.subject_user_id,
        channel: reminder.channel,
        category: 'APPOINTMENT',
        title,
        body,
        containsHealthSensitiveContent: true // Protects lock screen privacy
      });

      reminder.status = 'SENT';
      reminder.notification_id = notif.id;
      await repo.updateReminder(reminder);
      dispatchedCount++;
    }

    return dispatchedCount;
  }
}
