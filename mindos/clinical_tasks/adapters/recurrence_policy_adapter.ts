import {
  ClinicalTaskRecurrencePort
} from '../application/ports.js';
import { ClinicalTask } from '../domain/entities.js';
import { DomainInvariantError } from '../../platform/errors/index.js';

export type ClinicalTaskRecurrenceAnchor = 'PRIOR_DUE_AT' | 'COMPLETED_AT';

export interface ClinicalTaskRecurrencePolicy {
  rule_key: string;
  interval_minutes: number;
  anchor: ClinicalTaskRecurrenceAnchor;
  max_occurrences?: number;
  policy_version: string;
}

export class PolicyRegistryClinicalTaskRecurrenceAdapter implements ClinicalTaskRecurrencePort {
  private readonly policies = new Map<string, ClinicalTaskRecurrencePolicy>();

  constructor(policies: ClinicalTaskRecurrencePolicy[]) {
    for (const policy of policies) {
      if (!policy.rule_key) throw new DomainInvariantError('Recurrence policy rule_key is required.');
      if (!Number.isFinite(policy.interval_minutes) || policy.interval_minutes <= 0) {
        throw new DomainInvariantError(`Recurrence policy ${policy.rule_key} requires a positive interval_minutes.`);
      }
      if (!policy.policy_version) {
        throw new DomainInvariantError(`Recurrence policy ${policy.rule_key} requires policy_version.`);
      }
      if (policy.max_occurrences !== undefined &&
          (!Number.isInteger(policy.max_occurrences) || policy.max_occurrences < 1)) {
        throw new DomainInvariantError(`Recurrence policy ${policy.rule_key} has invalid max_occurrences.`);
      }
      if (this.policies.has(policy.rule_key)) {
        throw new DomainInvariantError(`Duplicate recurrence policy rule_key: ${policy.rule_key}.`);
      }
      this.policies.set(policy.rule_key, { ...policy });
    }
  }

  async nextOccurrence(params: {
    task: ClinicalTask;
    after: string;
  }): Promise<{
    configured: boolean;
    next_due_at?: string;
    reason_code?: string;
  }> {
    const key = params.task.recurrence_rule;
    if (!key) return { configured: true, reason_code: 'TASK_NOT_RECURRING' };

    const policy = this.policies.get(key);
    if (!policy) {
      return {
        configured: false,
        reason_code: 'RECURRENCE_RULE_NOT_REGISTERED'
      };
    }

    const nextSequence = (params.task.recurrence_sequence || 0) + 1;
    if (policy.max_occurrences !== undefined && nextSequence >= policy.max_occurrences) {
      return {
        configured: true,
        reason_code: 'RECURRENCE_MAX_OCCURRENCES_REACHED'
      };
    }

    const anchorValue =
      policy.anchor === 'PRIOR_DUE_AT'
        ? params.task.due_at
        : params.task.completed_at || params.after;

    if (!anchorValue) {
      return {
        configured: true,
        reason_code: 'RECURRENCE_ANCHOR_UNAVAILABLE'
      };
    }

    const anchorMs = Date.parse(anchorValue);
    if (Number.isNaN(anchorMs)) {
      throw new DomainInvariantError(
        `Recurrence policy ${policy.rule_key} received an invalid anchor date.`
      );
    }

    return {
      configured: true,
      next_due_at: new Date(anchorMs + policy.interval_minutes * 60_000).toISOString()
    };
  }
}

export function parseClinicalTaskRecurrencePolicies(
  raw: string | undefined
): ClinicalTaskRecurrencePolicy[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new DomainInvariantError('MINDOS_TASK_RECURRENCE_POLICIES_JSON must contain valid JSON.');
  }
  if (!Array.isArray(value)) {
    throw new DomainInvariantError('MINDOS_TASK_RECURRENCE_POLICIES_JSON must be a JSON array.');
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new DomainInvariantError(`Recurrence policy at index ${index} must be an object.`);
    }
    const candidate = entry as Record<string, unknown>;
    const anchor = candidate.anchor;
    if (anchor !== 'PRIOR_DUE_AT' && anchor !== 'COMPLETED_AT') {
      throw new DomainInvariantError(
        `Recurrence policy at index ${index} must explicitly set anchor to PRIOR_DUE_AT or COMPLETED_AT.`
      );
    }
    return {
      rule_key: String(candidate.rule_key || ''),
      interval_minutes: Number(candidate.interval_minutes),
      anchor,
      max_occurrences:
        candidate.max_occurrences === undefined
          ? undefined
          : Number(candidate.max_occurrences),
      policy_version: String(candidate.policy_version || '')
    };
  });
}
