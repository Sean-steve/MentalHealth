/**
 * MindOS Governed Conversation Message Aggregate Component
 * Authority: Master Architecture Index Section 7, Volumes I, IV, XV & Appendices B / C / H / Q
 */

import { ConversationMessageEntity, ConversationRole } from './types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { createHash } from 'crypto';

export class ConversationMessage {
  private _entity: ConversationMessageEntity;

  constructor(entity: ConversationMessageEntity) {
    this._entity = { ...entity };
  }

  public get entity(): Readonly<ConversationMessageEntity> {
    return this._entity;
  }

  public get id(): string {
    return this._entity.id;
  }

  public get role(): ConversationRole {
    return this._entity.role;
  }

  public get content(): string {
    return this._entity.content;
  }

  public static create(params: {
    conversationId: string;
    sequenceNumber: number;
    role: ConversationRole;
    content: string;
    aiReleaseId?: string;
    safetyPolicyVersion?: string;
    riskEventId?: string;
    tokenCount?: number;
    latencyMs?: number;
    disclaimerPresent?: boolean;
    retrievalChunkIds?: string[];
    toolCallIds?: string[];
    contextManifestHash?: string;
  }): ConversationMessage {
    const id = generateUUIDv7();
    const now = new Date().toISOString();

    const ciphertextHash = createHash('sha256')
      .update(params.content)
      .digest('hex');

    const entity: ConversationMessageEntity = {
      id,
      conversation_id: params.conversationId,
      sequence_number: params.sequenceNumber,
      role: params.role,
      content: params.content,
      ciphertext_hash: ciphertextHash,
      ai_release_id: params.aiReleaseId,
      safety_policy_version: params.safetyPolicyVersion,
      risk_event_id: params.riskEventId,
      token_count: params.tokenCount || 0,
      latency_ms: params.latencyMs || 0,
      disclaimer_present: Boolean(params.disclaimerPresent),
      retrieval_chunk_ids: params.retrievalChunkIds || [],
      tool_call_ids: params.toolCallIds || [],
      context_manifest_hash: params.contextManifestHash,
      created_at: now
    };

    return new ConversationMessage(entity);
  }

  public toEntity(): ConversationMessageEntity {
    return { ...this._entity };
  }
}
