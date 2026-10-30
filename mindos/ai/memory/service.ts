/**
 * MindOS Governed AI Memory Service
 * Authority: Volumes IV, XV & Appendices B / C / H (Kenya Data Protection Act 2019)
 * 
 * Provides governed storage, retrieval, modification, and erasure for AI user memories.
 * Memory operations require active 'AI_MEMORY' consent and pass through strict clinical boundary checks.
 */

import { AIMemoryEntity, AIMemoryCategory } from '../domain/types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { ConsentService } from '../../consent/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { EventBus } from '../../platform/events/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { MemoryRepository } from '../repositories/memory_repository.js';
import { AIMemoryPolicyChecker } from './policies.js';
import { AIMemoryConsentRequiredError } from '../domain/errors.js';
import { ForbiddenError, NotFoundError } from '../../platform/errors/index.js';

export class AIMemoryService {
  public static async createMemory(params: {
    userId: string;
    category: AIMemoryCategory;
    memoryText: string;
    confidence?: number;
    sourceConversationId?: string;
    sourceMessageId?: string;
  }): Promise<AIMemoryEntity> {
    // 1. Enforce active AI_MEMORY consent
    const hasConsent = ConsentService.hasActiveConsent(params.userId, 'AI_MEMORY');
    if (!hasConsent) {
      throw new AIMemoryConsentRequiredError(
        'User has not granted active consent for AI memory persistence.'
      );
    }

    const consentReceipt = ConsentService.getConsentReceipt(params.userId, 'AI_MEMORY');
    const consentReceiptId = consentReceipt ? consentReceipt.id : generateUUIDv7();

    // 2. Validate memory against safety and clinical policies
    AIMemoryPolicyChecker.validateMemoryEntry({
      category: params.category,
      memoryText: params.memoryText
    });

    const now = new Date().toISOString();
    const memory: AIMemoryEntity = {
      id: generateUUIDv7(),
      user_id: params.userId,
      category: params.category,
      memory_text: params.memoryText,
      confidence: params.confidence ?? 1.0,
      source_conversation_id: params.sourceConversationId,
      source_message_id: params.sourceMessageId,
      consent_receipt_id: consentReceiptId,
      status: 'ACTIVE',
      created_at: now,
      updated_at: now
    };

    await MemoryRepository.saveMemory(memory);

    AuditService.record({
      actor_type: 'SERVICE',
      actor_id: 'AI_MEMORY_ENGINE',
      action: 'AI.MEMORY.CREATE',
      resource_type: 'AI_USER_MEMORY',
      resource_id: memory.id,
      purpose: 'User-Consented AI Memory Recording',
      authorization_basis: { consent_receipt_id: consentReceiptId },
      result: 'ALLOWED',
      metadata: { category: params.category }
    });

    EventBus.enqueue(
      'ai.memory_created',
      'AI_MEMORY',
      memory.id,
      DataClassification.SENSITIVE,
      {
        memory_id: memory.id,
        user_id: params.userId,
        category: params.category
      }
    );

    return memory;
  }

  public static async getUserMemories(userId: string): Promise<AIMemoryEntity[]> {
    const hasConsent = ConsentService.hasActiveConsent(userId, 'AI_MEMORY');
    if (!hasConsent) return [];
    return MemoryRepository.getActiveMemoriesForUser(userId);
  }

  public static async updateMemory(userId: string, memoryId: string, updatedText: string): Promise<AIMemoryEntity> {
    const mem = await MemoryRepository.getMemory(memoryId);
    if (!mem || mem.status === 'DELETED') {
      throw new NotFoundError(`AI Memory with ID ${memoryId} not found.`);
    }
    if (mem.user_id !== userId) {
      throw new ForbiddenError('Unauthorized access to AI memory.');
    }

    AIMemoryPolicyChecker.validateMemoryEntry({
      category: mem.category,
      memoryText: updatedText
    });

    const updated = await MemoryRepository.updateMemory(memoryId, updatedText);

    AuditService.record({
      actor_type: 'USER',
      actor_id: userId,
      action: 'AI.MEMORY.UPDATE',
      resource_type: 'AI_USER_MEMORY',
      resource_id: memoryId,
      purpose: 'User AI Memory Edit',
      authorization_basis: { memory_id: memoryId },
      result: 'ALLOWED'
    });

    return updated;
  }

  public static async deleteMemory(userId: string, memoryId: string): Promise<void> {
    const mem = await MemoryRepository.getMemory(memoryId);
    if (!mem || mem.status === 'DELETED') return;
    if (mem.user_id !== userId) {
      throw new ForbiddenError('Unauthorized access to AI memory.');
    }

    await MemoryRepository.deleteMemory(memoryId);

    AuditService.record({
      actor_type: 'USER',
      actor_id: userId,
      action: 'AI.MEMORY.DELETE',
      resource_type: 'AI_USER_MEMORY',
      resource_id: memoryId,
      purpose: 'User AI Memory Deletion',
      authorization_basis: { memory_id: memoryId },
      result: 'ALLOWED'
    });

    EventBus.enqueue(
      'ai.memory_deleted',
      'AI_MEMORY',
      memoryId,
      DataClassification.SENSITIVE,
      { memory_id: memoryId, user_id: userId }
    );
  }

  public static async clearAllUserMemories(userId: string): Promise<number> {
    const count = await MemoryRepository.clearUserMemories(userId);

    AuditService.record({
      actor_type: 'USER',
      actor_id: userId,
      action: 'AI.MEMORY.CLEAR_ALL',
      resource_type: 'AI_USER_MEMORY',
      resource_id: userId,
      purpose: 'User AI Memory Erasure (Kenya DPA 2019 Right to Erasure)',
      authorization_basis: { user_id: userId },
      result: 'ALLOWED',
      metadata: { deleted_count: count }
    });

    return count;
  }
}
