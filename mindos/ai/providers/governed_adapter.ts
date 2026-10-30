/**
 * MindOS Governed AI Model Provider Adapter
 * Authority: ADR-008, ADR-009, Volumes I, IV, XV
 */

import { AIModelProviderPort, GenerateTurnParams, GenerateTurnResult } from './port.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';

export class GovernedAIModelProviderAdapter implements AIModelProviderPort {
  public async generateTurn(params: GenerateTurnParams): Promise<GenerateTurnResult> {
    const lastUserMsg = [...params.messages].reverse().find(m => m.role === 'USER')?.content || '';
    const userLower = lastUserMsg.toLowerCase();

    // 1. Tool-triggering patterns
    if (userLower.includes('search psychoeducation') || userLower.includes('find article') || userLower.includes('look up anxiety')) {
      return {
        replyText: 'Searching the psychoeducation library for evidence-based resources...',
        toolCalls: [
          {
            call_id: generateUUIDv7(),
            tool_code: 'content_search',
            arguments: { query: lastUserMsg }
          }
        ],
        promptTokens: 120,
        completionTokens: 25,
        finishReason: 'TOOL_CALL'
      };
    }

    if (userLower.includes('breathing exercise') || userLower.includes('recommend an exercise') || userLower.includes('grounding technique')) {
      return {
        replyText: 'Let me find a guided calming exercise for you...',
        toolCalls: [
          {
            call_id: generateUUIDv7(),
            tool_code: 'exercise_recommend',
            arguments: { category: userLower.includes('grounding') ? 'GROUNDING' : 'BREATHING' }
          }
        ],
        promptTokens: 110,
        completionTokens: 20,
        finishReason: 'TOOL_CALL'
      };
    }

    if (userLower.includes('emergency contacts') || userLower.includes('helpline number')) {
      return {
        replyText: 'Retrieving verified crisis contacts from our safety kernel...',
        toolCalls: [
          {
            call_id: generateUUIDv7(),
            tool_code: 'crisis_resource_lookup',
            arguments: { jurisdiction: 'KE' }
          }
        ],
        promptTokens: 90,
        completionTokens: 18,
        finishReason: 'TOOL_CALL'
      };
    }

    if (userLower.startsWith('remember that') || userLower.startsWith('save reflection:')) {
      const textToSave = lastUserMsg.replace(/^remember that:?|^save reflection:?/i, '').trim();
      return {
        replyText: 'I will save that reflection to your personal wellbeing memory.',
        toolCalls: [
          {
            call_id: generateUUIDv7(),
            tool_code: 'save_user_reflection',
            arguments: {
              category: 'PREFERENCE',
              reflection_text: textToSave
            }
          }
        ],
        promptTokens: 100,
        completionTokens: 25,
        finishReason: 'TOOL_CALL'
      };
    }

    // 2. Synthesize supportive reply incorporating retrieved chunks if present
    let supportiveReply = 'Thank you for sharing that with me. It takes real courage to pause and reflect on how you are feeling.';

    if (params.contextBundle.tier_t4.length > 0) {
      const topChunk = params.contextBundle.tier_t4[0];
      supportiveReply += `\n\nIn our library, the resource "${topChunk.title}" notes that: "${topChunk.content_text.slice(0, 180)}..."`;
    }

    if (params.contextBundle.tier_t5.length > 0) {
      const mem = params.contextBundle.tier_t5[0];
      supportiveReply += `\n\nI recall from your previous reflections that you value: "${mem.memory_text}".`;
    }

    supportiveReply += '\n\nHow does hearing that resonate with what you are experiencing right now?';

    const promptTokens = Math.max(50, Math.round(lastUserMsg.length / 4) + 150);
    const completionTokens = Math.max(30, Math.round(supportiveReply.length / 4));

    return {
      replyText: supportiveReply,
      promptTokens,
      completionTokens,
      finishReason: 'STOP'
    };
  }
}
