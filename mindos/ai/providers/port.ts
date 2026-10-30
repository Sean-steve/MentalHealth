/**
 * MindOS Governed AI Model Provider Port
 * Authority: ADR-009, Volumes I, IV, XV
 * 
 * Model-agnostic port decoupling core MindOS business and safety logic
 * from concrete external AI model providers (Gemini, self-hosted, etc.).
 */

import { AIContextBundle, AIToolDeclaration, AIToolCall } from '../domain/types.js';

export interface GenerateTurnParams {
  modelId: string;
  modelVersion: string;
  systemInstructions: string;
  messages: Array<{ role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL'; content: string }>;
  contextBundle: AIContextBundle;
  tools?: AIToolDeclaration[];
  samplingControls?: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  };
}

export interface GenerateTurnResult {
  replyText: string;
  toolCalls?: AIToolCall[];
  promptTokens: number;
  completionTokens: number;
  finishReason: 'STOP' | 'TOOL_CALL' | 'LENGTH' | 'SAFETY';
}

export interface AIModelProviderPort {
  generateTurn(params: GenerateTurnParams): Promise<GenerateTurnResult>;
}
