import { NotificationService } from '../../notifications/index.js';
import { ProfessionalService } from '../../professionals/service.js';
import { ClinicalTaskReminderPort } from '../application/ports.js';
import { ClinicalTask } from '../domain/entities.js';
import { ClinicalTaskAssigneeType } from '../domain/types.js';

export class NotificationServiceClinicalTaskReminderAdapter implements ClinicalTaskReminderPort {
  private async resolveUserId(task: ClinicalTask): Promise<string | null> {
    if (task.assigned_to_type === ClinicalTaskAssigneeType.USER) return task.assigned_to_id;
    if (task.assigned_to_type === ClinicalTaskAssigneeType.PROFESSIONAL) {
      const profile = await ProfessionalService.getRepository().findProfileById(task.assigned_to_id);
      return profile?.user_id || null;
    }
    return null;
  }

  async notifyDue(params: {
    task: ClinicalTask;
    reminder_key: string;
  }): Promise<{ accepted: boolean; notification_reference?: string }> {
    const userId = await this.resolveUserId(params.task);
    if (!userId) return { accepted: false };

    const notification = await NotificationService.sendNotification({
      userId,
      channel: 'IN_APP',
      category: 'REMINDER',
      title: 'Care plan reminder',
      body: 'You have a care-plan action coming up.',
      containsHealthSensitiveContent: true
    });

    return { accepted: true, notification_reference: notification.id };
  }
}
