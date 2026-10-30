/**
 * MindOS Dead-Letter Management & Controlled Replay Service
 * Authority: Master Architecture Index Section 12, Volume IX & Appendix E & ADR-021
 */

import { DeadLetterRepository } from './repository.js';
import { DeadLetterRecord, DeadLetterResolutionAction, DomainEventEnvelope } from '../types.js';
import { EventTransport } from '../transport/types.js';
import { UUID } from '../../database/types.js';
import { SecurityError, NotFoundError, ValidationError } from '../../errors/index.js';
import { AuditService } from '../../audit/index.js';

export interface OperatorContext {
  userId: string;
  roles: string[];
}

export class DeadLetterService {
  private repository: DeadLetterRepository;
  private transport?: EventTransport;

  constructor(repository?: DeadLetterRepository, transport?: EventTransport) {
    this.repository = repository || new DeadLetterRepository();
    this.transport = transport;
  }

  public setTransport(transport: EventTransport): void {
    this.transport = transport;
  }

  public async recordPoisonEvent(
    event: DomainEventEnvelope,
    consumerId: string,
    attempts: number,
    failureCode: string,
    errorMessage: string
  ): Promise<DeadLetterRecord> {
    return this.repository.insert({
      event_id: event.event_id,
      event_type: event.event_type,
      consumer_id: consumerId,
      attempts,
      failure_code: failureCode,
      error_message: errorMessage,
      payload_summary: event.payload as Record<string, unknown>,
      correlation_id: event.correlation_id
    });
  }

  public async listDeadLetters(
    operator: OperatorContext,
    unresolvedOnly = false
  ): Promise<DeadLetterRecord[]> {
    this.assertAuthorizedOperator(operator, 'VIEW_DEAD_LETTERS');
    return this.repository.listAll(unresolvedOnly);
  }

  public async getDeadLetter(id: UUID, operator: OperatorContext): Promise<DeadLetterRecord> {
    this.assertAuthorizedOperator(operator, 'VIEW_DEAD_LETTERS');
    const record = await this.repository.findById(id);
    if (!record) {
      throw new NotFoundError(`DEAD_LETTER_NOT_FOUND: Record with id "${id}" was not found.`);
    }
    return record;
  }

  /**
   * Controlled Replay of quarantined event with authorization check and audit trail.
   */
  public replayDeadLetter(
    id: UUID,
    reason: string,
    operator: OperatorContext,
    targetEnvelope?: DomainEventEnvelope
  ): Promise<{ replayed: boolean; record: DeadLetterRecord }> {
    this.assertAuthorizedOperator(operator, 'REPLAY_DEAD_LETTER');

    return (async () => {
      if (!reason || reason.trim().length < 5) {
        throw new ValidationError('REPLAY_REASON_REQUIRED: A valid operational justification must be documented for event replay.');
      }

      const record = await this.repository.findById(id);
      if (!record) {
        throw new NotFoundError(`DEAD_LETTER_NOT_FOUND: Record with id "${id}" was not found.`);
      }

      if (record.resolved_at) {
        throw new ValidationError(`DEAD_LETTER_ALREADY_RESOLVED: Event "${record.event_id}" is already resolved via ${record.resolution_action}.`);
      }

      // Mark dead-letter resolved
      await this.repository.markResolved(
        id,
        DeadLetterResolutionAction.REPLAYED,
        reason,
        operator.userId
      );

      // Audit the replay action
      AuditService.record({
        event_type: 'EVENT_REPLAY_INITIATED',
        actor_type: 'STAFF',
        actor_id: operator.userId,
        action: 'REPLAY_DEAD_LETTER',
        resource_type: 'DEAD_LETTER_EVENT',
        resource_id: id,
        purpose: 'OPERATIONAL_RECOVERY',
        authorization_basis: { role: operator.roles[0] || 'OPERATIONS_ADMIN' },
        result: 'SUCCESS',
        reason_code: 'MANUAL_REPLAY_AUTHORIZED',
        metadata: {
          deadLetterId: id,
          eventId: record.event_id,
          eventType: record.event_type,
          consumerId: record.consumer_id,
          reason
        }
      });

      // Re-publish envelope
      if (this.transport) {
        const envelopeToPublish: DomainEventEnvelope = targetEnvelope || {
          event_id: record.event_id,
          event_type: record.event_type,
          schema_version: 1,
          occurred_at: new Date().toISOString(),
          producer: record.event_type.split('.')[0] || 'unknown',
          producer_version: '1.0.0',
          aggregate_type: 'entity',
          aggregate_id: record.event_id,
          correlation_id: record.correlation_id || record.event_id,
          causation_id: record.event_id,
          classification: 'RESTRICTED' as any,
          jurisdiction: 'KE',
          priority: 'NORMAL' as any,
          payload: (record.payload_summary || {}) as Record<string, unknown>,
          metadata: {}
        };
        await this.transport.publish(envelopeToPublish);
      }

      const updated = (await this.repository.findById(id))!;
      return { replayed: true, record: updated };
    })();
  }

  public discardDeadLetter(
    id: UUID,
    reason: string,
    operator: OperatorContext
  ): Promise<DeadLetterRecord> {
    this.assertAuthorizedOperator(operator, 'DISCARD_DEAD_LETTER');

    return (async () => {
      if (!reason || reason.trim().length < 5) {
        throw new ValidationError('DISCARD_REASON_REQUIRED: Operational rationale must be documented when discarding poison events.');
      }

      const record = await this.repository.findById(id);
      if (!record) {
        throw new NotFoundError(`DEAD_LETTER_NOT_FOUND: Record with id "${id}" was not found.`);
      }

      await this.repository.markResolved(
        id,
        DeadLetterResolutionAction.DISCARDED,
        reason,
        operator.userId
      );

      // Audit discard action
      AuditService.record({
        event_type: 'EVENT_DISCARD_INITIATED',
        actor_type: 'STAFF',
        actor_id: operator.userId,
        action: 'DISCARD_DEAD_LETTER',
        resource_type: 'DEAD_LETTER_EVENT',
        resource_id: id,
        purpose: 'OPERATIONAL_CLEANUP',
        authorization_basis: { role: operator.roles[0] || 'OPERATIONS_ADMIN' },
        result: 'SUCCESS',
        reason_code: 'POISON_EVENT_DISCARDED',
        metadata: {
          deadLetterId: id,
          eventId: record.event_id,
          reason
        }
      });

      return (await this.repository.findById(id))!;
    })();
  }

  private assertAuthorizedOperator(operator: OperatorContext, action: string): void {
    const allowedRoles = ['SYSTEM_ADMIN', 'OPERATIONS_ADMIN', 'SECURITY_OFFICER', 'PLATFORM_ADMIN'];
    const hasRole = operator.roles.some(r => allowedRoles.includes(r));
    if (!hasRole) {
      throw new SecurityError(
        `UNAUTHORIZED_OPERATOR: Operator "${operator.userId}" lacks required privileges [${allowedRoles.join(', ')}] to perform "${action}". (FORBIDDEN_OPERATIONAL_ACTION)`
      );
    }
  }
}
