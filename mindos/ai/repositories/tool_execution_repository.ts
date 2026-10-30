/**
 * MindOS Governed AI Tool Execution Repository
 * Authority: Master Architecture Index Section 7, ADR-016
 */

import { AIToolExecutionResult } from '../domain/types.js';

export interface StoredToolExecution {
  execution: AIToolExecutionResult;
  conversationId: string;
  messageId?: string;
  executedAt: string;
}

export class ToolExecutionRepository {
  private static executions: Map<string, StoredToolExecution> = new Map(); // by idempotency token
  private static executionsByConversation: Map<string, StoredToolExecution[]> = new Map();

  public static async saveExecution(
    execution: AIToolExecutionResult,
    conversationId: string,
    messageId?: string
  ): Promise<void> {
    const record: StoredToolExecution = {
      execution,
      conversationId,
      messageId,
      executedAt: new Date().toISOString()
    };
    ToolExecutionRepository.executions.set(execution.idempotency_token, record);

    const list = ToolExecutionRepository.executionsByConversation.get(conversationId) || [];
    list.push(record);
    ToolExecutionRepository.executionsByConversation.set(conversationId, list);
  }

  public static async getExecutionByToken(idempotencyToken: string): Promise<AIToolExecutionResult | null> {
    const record = ToolExecutionRepository.executions.get(idempotencyToken);
    return record ? record.execution : null;
  }

  public static async listExecutionsForConversation(conversationId: string): Promise<StoredToolExecution[]> {
    return ToolExecutionRepository.executionsByConversation.get(conversationId) || [];
  }

  public static resetForTesting(): void {
    ToolExecutionRepository.executions.clear();
    ToolExecutionRepository.executionsByConversation.clear();
  }
}
