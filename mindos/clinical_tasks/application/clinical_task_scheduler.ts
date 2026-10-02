import { DomainInvariantError } from '../../platform/errors/index.js';
import {
  ClinicalTaskState,
  ClinicalTaskAssigneeType
} from '../domain/types.js';
import {
  ClinicalTaskReminderReceipt
} from '../domain/entities.js';
import { ClinicalTaskService } from './clinical_task_service.js';
import {
  ClinicalTaskRecurrencePort,
  ClinicalTaskReminderPort,
  UnconfiguredClinicalTaskRecurrenceAdapter,
  NoopClinicalTaskReminderAdapter
} from './ports.js';

export interface SpawnNextOccurrenceResult {
  status: 'NOT_RECURRING' | 'NOT_CONFIGURED' | 'NO_NEXT_OCCURRENCE' | 'CREATED';
  task_id?: string;
  reason_code?: string;
}

export class ClinicalTaskScheduler {
  private static recurrencePort: ClinicalTaskRecurrencePort = new UnconfiguredClinicalTaskRecurrenceAdapter();
  private static reminderPort: ClinicalTaskReminderPort = new NoopClinicalTaskReminderAdapter();

  public static setRecurrencePort(port: ClinicalTaskRecurrencePort): void {
    ClinicalTaskScheduler.recurrencePort = port;
  }

  public static setReminderPort(port: ClinicalTaskReminderPort): void {
    ClinicalTaskScheduler.reminderPort = port;
  }

  /**
   * Creates at most one next occurrence. It never pre-generates an unbounded
   * future series. The normal task creation path revalidates relationship access.
   */
  public static async spawnNextOccurrence(
    completedTaskId: string,
    after?: string
  ): Promise<SpawnNextOccurrenceResult> {
    const task = await ClinicalTaskService.getTask(completedTaskId);
    if (!task.recurrence_rule) return { status: 'NOT_RECURRING' };
    if (task.status !== ClinicalTaskState.COMPLETED) {
      throw new DomainInvariantError('Recurring clinical task can generate its next occurrence only after completion.');
    }
    if (!task.created_by_professional_id) {
      throw new DomainInvariantError('Recurring clinical task is missing original professional authorship.');
    }

    const anchor = after || task.completed_at || new Date().toISOString();
    const decision = await ClinicalTaskScheduler.recurrencePort.nextOccurrence({ task, after: anchor });
    if (!decision.configured) {
      return { status: 'NOT_CONFIGURED', reason_code: decision.reason_code || 'RECURRENCE_POLICY_NOT_CONFIGURED' };
    }
    if (!decision.next_due_at) {
      return { status: 'NO_NEXT_OCCURRENCE', reason_code: decision.reason_code };
    }
    const nextMs = Date.parse(decision.next_due_at);
    const anchorMs = Date.parse(anchor);
    if (Number.isNaN(nextMs) || nextMs <= anchorMs) {
      throw new DomainInvariantError('Recurrence policy returned an invalid or non-future next occurrence.');
    }

    const rootId = task.recurrence_parent_task_id || task.id;
    const next = await ClinicalTaskService.createTask({
      care_relationship_id: task.care_relationship_id,
      care_plan_id: task.care_plan_id,
      care_goal_id: task.care_goal_id,
      task_type: task.task_type,
      assigned_to_type: task.assigned_to_type,
      assigned_to_id: task.assigned_to_id,
      priority: task.priority,
      title: task.title,
      instruction_reference: task.instruction_reference,
      due_at: decision.next_due_at,
      recurrence_rule: task.recurrence_rule,
      recurrence_parent_task_id: rootId,
      recurrence_sequence: (task.recurrence_sequence || 0) + 1,
      source_type: task.source_type,
      source_reference: task.source_reference,
      completion_authority: task.completion_authority,
      owner_domain: task.owner_domain,
      policy_version: task.policy_version,
      idempotency_key: `recurrence:${rootId}:${decision.next_due_at}`,
      creator_professional_id: task.created_by_professional_id
    });

    return { status: 'CREATED', task_id: next.id };
  }

  /**
   * Reminder timing is caller/policy supplied. No hidden "24 hours before"
   * default exists. Persistent receipts make repeated scheduler runs idempotent.
   */
  public static async sendDueReminders(params: {
    now: Date;
    horizon_minutes: number;
    reminder_key: string;
  }): Promise<{ sent: string[]; skipped: string[] }> {
    if (!Number.isFinite(params.horizon_minutes) || params.horizon_minutes < 0) {
      throw new DomainInvariantError('Reminder horizon_minutes must be an explicit non-negative number.');
    }
    if (!params.reminder_key) throw new DomainInvariantError('Reminder policy must provide reminder_key.');

    const sent: string[] = [];
    const skipped: string[] = [];
    const end = params.now.getTime() + params.horizon_minutes * 60_000;

    for (const task of await ClinicalTaskService.listTasksForScheduler()) {
      if (!task.due_at || ![ClinicalTaskState.READY, ClinicalTaskState.IN_PROGRESS].includes(task.status)) continue;
      const due = Date.parse(task.due_at);
      if (Number.isNaN(due) || due < params.now.getTime() || due > end) continue;

      const key = `${params.reminder_key}:${task.due_at}`;
      if (await ClinicalTaskService.findReminderReceipt(task.id, key)) {
        skipped.push(task.id);
        continue;
      }

      // System/care-team tasks are not blindly turned into end-user notifications.
      if (![ClinicalTaskAssigneeType.USER, ClinicalTaskAssigneeType.PROFESSIONAL].includes(task.assigned_to_type)) {
        skipped.push(task.id);
        continue;
      }

      const result = await ClinicalTaskScheduler.reminderPort.notifyDue({ task, reminder_key: key });
      if (!result.accepted) {
        skipped.push(task.id);
        continue;
      }

      const receipt: ClinicalTaskReminderReceipt = {
        id: await ClinicalTaskService.newId(),
        task_id: task.id,
        reminder_key: key,
        notification_reference: result.notification_reference,
        sent_at: params.now.toISOString()
      };
      await ClinicalTaskService.saveReminderReceipt(receipt);
      sent.push(task.id);
    }

    return { sent, skipped };
  }
}
