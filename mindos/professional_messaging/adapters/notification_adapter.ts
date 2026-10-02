import { NotificationService } from '../../notifications/index.js';
import { ProfessionalService } from '../../professionals/service.js';
import {
  ProfessionalMessagingNotificationPort,
  ProfessionalMessagingNotificationRecipient
} from '../application/ports.js';
import { ThreadParticipantType } from '../domain/types.js';

export class NotificationServiceMessagingAdapter implements ProfessionalMessagingNotificationPort {
  private async resolveUserId(recipient: ProfessionalMessagingNotificationRecipient): Promise<string | null> {
    if (recipient.actor_type === ThreadParticipantType.USER) return recipient.actor_id;
    if (recipient.actor_type === ThreadParticipantType.PROFESSIONAL) {
      const profile = await ProfessionalService.getRepository().findProfileById(recipient.actor_id);
      return profile?.user_id || null;
    }
    return null;
  }

  public async notifyNewMessage(params: {
    thread_id: string;
    message_id: string;
    recipients: ProfessionalMessagingNotificationRecipient[];
  }): Promise<{ accepted: boolean }> {
    if (params.recipients.length === 0) return { accepted: true };

    let accepted = true;
    for (const recipient of params.recipients) {
      const userId = await this.resolveUserId(recipient);
      if (!userId) {
        accepted = false;
        continue;
      }
      await NotificationService.sendNotification({
        userId,
        channel: 'IN_APP',
        category: 'REMINDER',
        title: 'New care message',
        body: 'You have a new private care message in MindOS.',
        containsHealthSensitiveContent: true
      });
    }
    return { accepted };
  }
}
