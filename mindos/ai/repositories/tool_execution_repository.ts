/**
 * MindOS Governed AI Tool Execution Repository
 * Authority: Master Architecture Index Section 7, ADR-016
 */

import { AIToolExecutionResult } from '../domain/types.js';
import { B29MutableStateStore } from '../../b29/mutable_state_store.js';

export interface StoredToolExecution {
  execution: AIToolExecutionResult;
  conversationId: string;
  messageId?: string;
  executedAt: string;
}

export class ToolExecutionRepository {
  private static executions: Map<string, StoredToolExecution> = new Map(); // by idempotency token
  private static executionsByConversation: Map<string, StoredToolExecution[]> = new Map();
  private static durablePersistenceEnabled = false;

  public static async enableDurablePersistence(): Promise<void> {
    this.durablePersistenceEnabled = true;
    this.executions.clear();
    this.executionsByConversation.clear();
    for(const record of await B29MutableStateStore.list<StoredToolExecution>('AI','TOOL_EXECUTION')){
      const item=record.payload;
      this.executions.set(item.execution.idempotency_token,item);
      const list=this.executionsByConversation.get(item.conversationId)||[];
      list.push(item);
      this.executionsByConversation.set(item.conversationId,list);
    }
  }

  public static disableDurablePersistenceForTesting(): void {
    this.durablePersistenceEnabled=false;
  }

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
    const idx=list.findIndex(x=>x.execution.idempotency_token===execution.idempotency_token);
    if(idx>=0)list[idx]=record; else list.push(record);
    ToolExecutionRepository.executionsByConversation.set(conversationId, list);
    if(this.durablePersistenceEnabled){
      await B29MutableStateStore.put({
        domain:'AI',entity_type:'TOOL_EXECUTION',entity_id:execution.idempotency_token,
        parent_id:conversationId,status:'EXECUTED',payload:record
      });
    }
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
