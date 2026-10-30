/**
 * MindOS Identity Notification Port & Adapters
 * Authority: Volumes III, VIII & ADR-014
 * 
 * Invariants:
 * - Decouples Identity core from external messaging transports (SES, Sendgrid, etc.).
 * - Outgoing notifications never include clinical observations or health data.
 * - Test / Development adapter captures events in-memory for zero-mock testing.
 */

import { logger } from '../../platform/observability/logger.js';

export interface SentNotification {
  id: string;
  type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'SECURITY_ALERT' | string;
  recipient: string;
  tokenPreview: string; // Truncated preview only
  rawTokenForTesting: string; // Accessible for unit and integration testing
  link: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  data?: Record<string, any>;
}

export interface IdentityNotificationPort {
  sendVerificationEmail(toEmail: string, rawToken: string, verificationLink: string): Promise<void>;
  sendPasswordResetEmail(toEmail: string, rawToken: string, resetLink: string): Promise<void>;
  sendSecurityAlert(toEmail: string, alertType: string, metadata?: Record<string, unknown>): Promise<void>;
}

export class DevIdentityNotificationAdapter implements IdentityNotificationPort {
  private sentNotifications: SentNotification[] = [];

  public async sendVerificationEmail(toEmail: string, rawToken: string, verificationLink: string): Promise<void> {
    const record: SentNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: 'EMAIL_VERIFICATION',
      recipient: toEmail,
      tokenPreview: rawToken.length > 8 ? `${rawToken.substring(0, 4)}...${rawToken.slice(-4)}` : '***',
      rawTokenForTesting: rawToken,
      link: verificationLink,
      timestamp: new Date().toISOString(),
      data: {
        token: rawToken,
        verificationLink
      }
    };

    this.sentNotifications.push(record);
    logger.info('Dispatched Identity Verification Notification', {
      type: record.type,
      recipient: toEmail,
      tokenPreview: record.tokenPreview
    });
  }

  public async sendPasswordResetEmail(toEmail: string, rawToken: string, resetLink: string): Promise<void> {
    const record: SentNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: 'PASSWORD_RESET',
      recipient: toEmail,
      tokenPreview: rawToken.length > 8 ? `${rawToken.substring(0, 4)}...${rawToken.slice(-4)}` : '***',
      rawTokenForTesting: rawToken,
      link: resetLink,
      timestamp: new Date().toISOString(),
      data: {
        token: rawToken,
        resetLink
      }
    };

    this.sentNotifications.push(record);
    logger.info('Dispatched Password Reset Notification', {
      type: record.type,
      recipient: toEmail,
      tokenPreview: record.tokenPreview
    });
  }

  public async sendSecurityAlert(toEmail: string, alertType: string, metadata?: Record<string, unknown>): Promise<void> {
    const record: SentNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: 'SECURITY_ALERT',
      recipient: toEmail,
      tokenPreview: 'N/A',
      rawTokenForTesting: '',
      link: '',
      timestamp: new Date().toISOString(),
      metadata: { alertType, ...metadata }
    };

    this.sentNotifications.push(record);
    logger.warn('Dispatched Identity Security Alert', {
      alertType,
      recipient: toEmail
    });
  }

  public getNotifications(): SentNotification[] {
    return [...this.sentNotifications];
  }

  public getSentNotifications(): SentNotification[] {
    return [...this.sentNotifications];
  }

  public getNotificationsFor(email: string): SentNotification[] {
    const norm = email.trim().toLowerCase();
    return this.sentNotifications.filter(n => n.recipient.toLowerCase() === norm);
  }

  public getLastNotification(): SentNotification | undefined {
    return this.sentNotifications[this.sentNotifications.length - 1];
  }

  public clear(): void {
    this.sentNotifications = [];
  }
}
