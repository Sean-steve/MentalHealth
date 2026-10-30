/**
 * MindOS Notifications Bounded Context
 * Authority: Volumes I, III & Appendix B / C / Q
 * Owns: notification_preferences, notification_messages
 * Invariant: Push notifications on lock-screen must not expose sensitive clinical or diagnosis content.
 * Invariant: Urgent safety notifications bypass quiet hours and marketing opt-out.
 */

import { generateUUIDv7 } from '../platform/database/uuid.js';
import { DataClassification } from '../platform/shared/data_classification.js';
import { EventBus } from '../platform/events/index.js';
import { AuditService } from '../platform/audit/index.js';

export interface NotificationEntity {
  id: string; // UUIDv7
  user_id: string;
  channel: 'PUSH' | 'SMS' | 'EMAIL' | 'IN_APP';
  category: 'SAFETY_URGENT' | 'APPOINTMENT' | 'REMINDER' | 'SECURITY';
  title: string;
  body_masked: string;
  delivered_at?: string;
  created_at: string;
}

export class NotificationService {
  private static notifications: Map<string, NotificationEntity> = new Map();

  public static async sendNotification(params: {
    userId: string;
    channel: NotificationEntity['channel'];
    category: NotificationEntity['category'];
    title: string;
    body: string;
    containsHealthSensitiveContent?: boolean;
  }): Promise<NotificationEntity> {
    const id = generateUUIDv7();
    const now = new Date().toISOString();

    // Mask lock-screen payload if health-sensitive
    const bodyMasked = params.containsHealthSensitiveContent
      ? 'You have a private update waiting in your MindOS app.'
      : params.body;

    const notif: NotificationEntity = {
      id,
      user_id: params.userId,
      channel: params.channel,
      category: params.category,
      title: params.title,
      body_masked: bodyMasked,
      delivered_at: now,
      created_at: now
    };

    NotificationService.notifications.set(id, notif);

    EventBus.enqueue(
      'notifications.dispatched',
      'notifications',
      id,
      DataClassification.SENSITIVE,
      {
        notification_id: id,
        user_id: params.userId,
        category: params.category,
        channel: params.channel
      }
    );

    return notif;
  }

  public static resetForTesting(): void {
    NotificationService.notifications.clear();
  }
}
