import { ClinicalTask } from '../domain/entities.js';

export interface ClinicalTaskRecurrencePort {
  nextOccurrence(params: {
    task: ClinicalTask;
    after: string;
  }): Promise<{
    configured: boolean;
    next_due_at?: string;
    reason_code?: string;
  }>;
}

export interface ClinicalTaskReminderPort {
  notifyDue(params: {
    task: ClinicalTask;
    reminder_key: string;
  }): Promise<{
    accepted: boolean;
    notification_reference?: string;
  }>;
}

export class UnconfiguredClinicalTaskRecurrenceAdapter implements ClinicalTaskRecurrencePort {
  async nextOccurrence(): Promise<{ configured: boolean; reason_code: string }> {
    return { configured: false, reason_code: 'RECURRENCE_POLICY_NOT_CONFIGURED' };
  }
}

export class NoopClinicalTaskReminderAdapter implements ClinicalTaskReminderPort {
  async notifyDue(): Promise<{ accepted: boolean }> {
    return { accepted: false };
  }
}
