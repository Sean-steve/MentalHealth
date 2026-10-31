import { DomainInvariantError, NotFoundError } from '../../platform/errors/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { ClinicalOperationsRepository } from '../repositories/index.js';
import { ClinicalOperationsFollowUp, ClinicalOperationsFollowUpType } from '../domain/types.js';

export class ClinicalOperationsFollowUpService {
  static async schedule(input: {
    escalation_id: string;
    subject_user_id: string;
    type: ClinicalOperationsFollowUpType;
    scheduled_for: string;
    responsible_actor_id?: string;
    channel?: string;
  }): Promise<ClinicalOperationsFollowUp> {
    const escalation = await ClinicalOperationsRepository.getEscalation(input.escalation_id);
    if (!escalation) throw new NotFoundError('Clinical operations escalation not found.');
    if (!Number.isFinite(Date.parse(input.scheduled_for))) {
      throw new DomainInvariantError('scheduled_for must be a valid timestamp.');
    }
    if (input.type !== 'AUTOMATED_REMINDER' && !input.responsible_actor_id) {
      throw new DomainInvariantError('Human/professional follow-up requires an explicit responsible actor.');
    }
    const now = new Date().toISOString();
    const followUp: ClinicalOperationsFollowUp = {
      id: generateUUIDv7(),
      escalation_id: input.escalation_id,
      subject_user_id: input.subject_user_id,
      type: input.type,
      responsible_actor_id: input.responsible_actor_id,
      channel: input.channel,
      scheduled_for: input.scheduled_for,
      status: 'SCHEDULED',
      created_at: now,
      updated_at: now
    };
    await ClinicalOperationsRepository.saveFollowUp(followUp);
    return followUp;
  }

  static async markCompleted(id: string, outcomeReference: string): Promise<ClinicalOperationsFollowUp> {
    const item = (await ClinicalOperationsRepository.listFollowUps()).find(x => x.id === id);
    if (!item) throw new NotFoundError('Clinical operations follow-up not found.');
    if (!outcomeReference) throw new DomainInvariantError('outcomeReference is required.');
    item.status = 'COMPLETED';
    item.completed_at = new Date().toISOString();
    item.outcome_reference = outcomeReference;
    item.updated_at = item.completed_at;
    await ClinicalOperationsRepository.saveFollowUp(item);
    return item;
  }

  static async markMissed(id: string): Promise<ClinicalOperationsFollowUp> {
    const item = (await ClinicalOperationsRepository.listFollowUps()).find(x => x.id === id);
    if (!item) throw new NotFoundError('Clinical operations follow-up not found.');
    item.status = 'MISSED';
    item.updated_at = new Date().toISOString();
    await ClinicalOperationsRepository.saveFollowUp(item);
    // R-OPS-002: missed/no-response does not mutate RiskState. A new valid Safety signal is required.
    return item;
  }
}
