import { configureSprint22Runtime } from '../mindos/sprint22/runtime.js';
import { runSprint22Maintenance } from '../mindos/sprint22/maintenance.js';

function parseBoolean(name: string): boolean {
  return String(process.env[name] || '').toLowerCase() === 'true';
}

function optionalPositiveInteger(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

async function main(): Promise<void> {
  configureSprint22Runtime({ usePostgres: true });

  const reminderHorizonRaw = process.env.MINDOS_TASK_REMINDER_HORIZON_MINUTES;
  const reminderKey = process.env.MINDOS_TASK_REMINDER_KEY;

  if ((reminderHorizonRaw && !reminderKey) || (!reminderHorizonRaw && reminderKey)) {
    throw new Error(
      'MINDOS_TASK_REMINDER_HORIZON_MINUTES and MINDOS_TASK_REMINDER_KEY must be supplied together.'
    );
  }

  const reminder = reminderHorizonRaw && reminderKey
    ? {
        horizon_minutes: Number(reminderHorizonRaw),
        reminder_key: reminderKey
      }
    : undefined;

  if (reminder && (!Number.isFinite(reminder.horizon_minutes) || reminder.horizon_minutes < 0)) {
    throw new Error('MINDOS_TASK_REMINDER_HORIZON_MINUTES must be a non-negative number.');
  }

  const result = await runSprint22Maintenance({
    reminder,
    process_recurrence: parseBoolean('MINDOS_TASK_RECURRENCE_ENABLED'),
    recurrence_limit: optionalPositiveInteger('MINDOS_TASK_RECURRENCE_LIMIT')
  });

  process.stdout.write(JSON.stringify({
    sprint: 22,
    maintenance: result,
    executed_at: new Date().toISOString()
  }, null, 2) + '\n');
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Sprint 22 maintenance failed: ${message}\n`);
  process.exitCode = 1;
});
