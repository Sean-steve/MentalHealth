/**
 * MindOS Governed Conversation Aggregate Root
 * Authority: Master Architecture Index Section 7, Volumes I, IV, XV & Appendices B / C / H / Q
 */

import { ConversationEntity, ConversationState, RiskState } from './types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';
import { DomainInvariantError } from '../../platform/errors/index.js';

export class Conversation {
  private _entity: ConversationEntity;

  constructor(entity: ConversationEntity) {
    this._entity = { ...entity };
  }

  public get entity(): Readonly<ConversationEntity> {
    return this._entity;
  }

  public get id(): string {
    return this._entity.id;
  }

  public get userId(): string {
    return this._entity.user_id;
  }

  public get state(): ConversationState {
    return this._entity.state;
  }

  public get turnCount(): number {
    return this._entity.turn_count;
  }

  public get riskState(): RiskState {
    return this._entity.risk_state;
  }

  public static create(params: {
    userId: string;
    purpose: string;
    consentReceiptId: string;
    aiSystemId: string;
    configurationVersionId: string;
    locale?: string;
    riskState?: RiskState;
    metadata?: Record<string, unknown>;
  }): Conversation {
    if (!params.userId || !params.consentReceiptId || !params.aiSystemId || !params.configurationVersionId) {
      throw new DomainInvariantError('Missing required conversation creation parameters.');
    }

    const now = new Date().toISOString();
    const entity: ConversationEntity = {
      id: generateUUIDv7(),
      user_id: params.userId,
      purpose: params.purpose || 'SUPPORTIVE_COMPANION_INTERACTION',
      consent_receipt_id: params.consentReceiptId,
      state: ConversationState.ACTIVE,
      ai_system_id: params.aiSystemId,
      configuration_version_id: params.configurationVersionId,
      locale: params.locale || 'en-KE',
      risk_state: params.riskState || RiskState.NO_CONCERN,
      turn_count: 0,
      created_at: now,
      last_active_at: now,
      metadata: params.metadata || {}
    };

    return new Conversation(entity);
  }

  public transitionTo(nextState: ConversationState, actorId = 'AI_RUNTIME'): void {
    validateStateTransition('ConversationState', this._entity.state, nextState, this._entity.id, actorId);
    this._entity.state = nextState;
    this._entity.last_active_at = new Date().toISOString();

    if (nextState === ConversationState.SAFETY_INTERVENED || nextState === ConversationState.ESCALATED) {
      this._entity.safety_intervened_at = new Date().toISOString();
    } else if (nextState === ConversationState.CLOSED) {
      this._entity.closed_at = new Date().toISOString();
    } else if (nextState === ConversationState.ARCHIVED) {
      this._entity.archived_at = new Date().toISOString();
    }
  }

  public recordTurn(): number {
    if (this._entity.state === ConversationState.CLOSED || this._entity.state === ConversationState.ARCHIVED) {
      throw new DomainInvariantError(`Cannot execute turn on conversation ${this._entity.id} in state ${this._entity.state}`);
    }
    this._entity.turn_count += 1;
    this._entity.last_active_at = new Date().toISOString();
    return this._entity.turn_count;
  }

  public updateRiskState(newRiskState: RiskState): void {
    this._entity.risk_state = newRiskState;
    this._entity.last_active_at = new Date().toISOString();
  }

  public toEntity(): ConversationEntity {
    return { ...this._entity };
  }
}
