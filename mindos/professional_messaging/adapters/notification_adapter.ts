import { NotificationService } from '../../notifications/index.js';
import { ProfessionalMessagingNotificationPort } from '../application/ports.js';

export class NotificationServiceMessagingAdapter implements ProfessionalMessagingNotificationPort {
  public async notifyNewMessage(params: {
    thread_id: string;
    message_id: string;
    recipient_ids: string[];
  }): Promise<{ accepted: boolean }> {
    if (params.recipient_ids.length === 0) return { accepted: true };

    for (const recipientId of params.recipient_ids) {
      await NotificationService.sendNotification({
        userId: recipientId,
        channel: 'IN_APP',
        category: 'REMINDER',
        title: 'New care message',
        body: 'You have a new private care message in MindOS.',
        containsHealthSensitiveContent: true
      });
    }

    return { accepted: true };
  }
}
