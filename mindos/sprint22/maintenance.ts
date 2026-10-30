import { CarePlanService } from '../care_plans/index.js';
import { ProfessionalMessagingService } from '../professional_messaging/index.js';
import {
  ClinicalTaskService,
  ClinicalTaskScheduler,
  ClinicalTaskState
} from '../clinical_tasks/index.js';

export interface Sprint22MaintenanceOptions {
  now?: Date;
  reminder?: {
    horizon_minutes: number;
    reminder_key: string;
  };
  process_recurrence?: boolean;
  recurrence_limit?: number;
}

export interface Sprint22MaintenanceResult {
  reconciled: {
    overdue: string[];
    readied: string[];
  };
  reminders: {
    status: 'NOT_REQUESTED' | 'RAN';
    sent: string[];
    skipped: string[];
  };
  recurrence: {
    status: 'NOT_REQUESTED' | 'RAN';
    created: string[];
    not_configured: string[];
    exhausted: string[];
    not_recurring: string[];
  };
}

export async function runSprint22Maintenance(
  options: Sprint22MaintenanceOptions = {}
): Promise<Sprint22MaintenanceResult> {
  const now = options.now || new Date();
  const reconciled = await ClinicalTaskService.reconcile(now);

  const reminders = options.reminder
    ? {
        status: 'RAN' as const,
        ...(await ClinicalTaskScheduler.sendDueReminders({
          now,
          horizon_minutes: options.reminder.horizon_minutes,
          reminder_key: options.reminder.reminder_key
        }))
      }
    : {
        status: 'NOT_REQUESTED' as const,
        sent: [],
        skipped: []
      };

  const recurrence = {
    status: options.process_recurrence ? 'RAN' as const : 'NOT_REQUESTED' as const,
    created: [] as string[],
    not_configured: [] as string[],
    exhausted: [] as string[],
    not_recurring: [] as string[]
  };

  if (options.process_recurrence) {
    const limit = options.recurrence_limit;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw new Error('recurrence_limit must be a positive integer when supplied.');
    }

    const candidates = (await ClinicalTaskService.listTasksForScheduler())
      .filter(task => task.status === ClinicalTaskState.COMPLETED && Boolean(task.recurrence_rule))
      .sort((a, b) => {
        const aTime = Date.parse(a.completed_at || a.updated_at);
        const bTime = Date.parse(b.completed_at || b.updated_at);
        return aTime - bTime || a.id.localeCompare(b.id);
      });

    for (const task of candidates.slice(0, limit || candidates.length)) {
      const result = await ClinicalTaskScheduler.spawnNextOccurrence(task.id);
      if (result.status === 'CREATED' && result.task_id) {
        recurrence.created.push(result.task_id);
      } else if (result.status === 'NOT_CONFIGURED') {
        recurrence.not_configured.push(task.id);
      } else if (result.status === 'NO_NEXT_OCCURRENCE') {
        recurrence.exhausted.push(task.id);
      } else if (result.status === 'NOT_RECURRING') {
        recurrence.not_recurring.push(task.id);
      }
    }
  }

  return { reconciled, reminders, recurrence };
}

export interface Sprint22RelationshipClosureResult {
  relationship_id: string;
  care_plan: {
    plan_id?: string;
    action: 'NONE' | 'TERMINATED' | 'REVOKED';
  };
  clinical_tasks: {
    cancelled: string[];
  };
  professional_messaging: {
    closed_threads: string[];
  };
}

/**
 * Retry-safe cross-domain reconciliation for a terminated/revoked care relationship.
 * Each bounded context remains authoritative for its own records and preserves
 * completed historical state.
 */
export async function reconcileSprint22RelationshipClosure(
  relationshipId: string
): Promise<Sprint22RelationshipClosureResult> {
  const carePlan = await CarePlanService.reconcileRelationshipClosure(relationshipId);
  const clinicalTasks = await ClinicalTaskService.reconcileRelationshipClosure(relationshipId);
  const closedThreads = await ProfessionalMessagingService.reconcileRelationship(relationshipId);

  return {
    relationship_id: relationshipId,
    care_plan: carePlan,
    clinical_tasks: clinicalTasks,
    professional_messaging: { closed_threads: closedThreads }
  };
}
