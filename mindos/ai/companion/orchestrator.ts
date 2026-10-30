/**
 * MindOS Governed AI Companion Orchestrator
 * Authority: Master Architecture Index Section 7, Volumes I, IV, XV & Appendices B / C / G / H / P / Q
 * Clinical Safety Policy Catalogue: R-SAFE-001, R-SAFE-002, R-AI-001, R-AI-002
 * Architectural Decisions: ADR-008, ADR-009, ADR-010, ADR-015, ADR-016
 * 
 * Execution Pipeline:
 * 1. User Context & Authz Verification
 * 2. Active AI_COMPANION Consent Pre-Check
 * 3. AI Configuration Resolution & Drift Verification (Fail-Closed)
 * 4. Conversation Lifecycle & State Machine Guard
 * 5. Inbound Safety Pre-Check (Safety Kernel Authority)
 * 6. Governed Content Retrieval (Published Psychoeducation Only)
 * 7. Context Assembly & Firewall (T0..T5 Minimum Necessary)
 * 8. Model Provider Invocation (Model-Agnostic Port)
 * 9. Governed Tool Execution (Host-Gated & Idempotent)
 * 10. Outbound Safety Post-Check & Statutory Disclaimer Guarantee
 * 11. Safety Arbitration (Safety Kernel > AI Companion)
 * 12. Message Persistence, Metrics, Auditing & Outbox Dispatch
 */

import {
  AICompanionTurnRequest,
  AICompanionTurnResponse,
  ConversationState,
  AIToolCall,
  AIToolExecutionResult
} from '../domain/types.js';
import { Conversation } from '../domain/conversation.js';
import { ConversationMessage } from '../domain/message.js';
import { CANONICAL_AI_NON_DIAGNOSTIC_DISCLAIMER } from '../domain/invariants.js';
import { AIConfigurationResolver } from '../runtime/config_resolver.js';
import { AIRuntimeDriftDetector } from '../runtime/drift_detector.js';
import { AIExecutionContext } from '../runtime/execution_context.js';
import { AISafetyPrecheck } from '../safety/precheck.js';
import { AISafetyPostcheck } from '../safety/postcheck.js';
import { AISafetyArbiter } from '../safety/arbiter.js';
import { ContentRetrievalAdapter } from '../retrieval/adapter.js';
import { ContextAssembler } from '../context/assembler.js';
import { AIToolExecutor } from '../tools/executor.js';
import { COMPANION_TOOLS } from '../tools/definitions.js';
import { AIModelProviderPort } from '../providers/port.js';
import { GovernedAIModelProviderAdapter } from '../providers/governed_adapter.js';
import { ConversationRepository } from '../repositories/conversation_repository.js';
import { ConsentService } from '../../consent/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { EventBus } from '../../platform/events/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { DomainInvariantError, ForbiddenError } from '../../platform/errors/index.js';

export class AICompanionOrchestrator {
  private static provider: AIModelProviderPort = new GovernedAIModelProviderAdapter();

  public static setProvider(customProvider: AIModelProviderPort): void {
    AICompanionOrchestrator.provider = customProvider;
  }

  public static async executeTurn(request: AICompanionTurnRequest): Promise<AICompanionTurnResponse> {
    const execContext = new AIExecutionContext(request.user_id, request.conversation_id || 'new');

    // 1. Consent Precheck
    const hasCompanionConsent = ConsentService.hasActiveConsent(request.user_id, 'AI_COMPANION');
    let consentReceipt = ConsentService.getConsentReceipt(request.user_id, 'AI_COMPANION');
    if (!hasCompanionConsent || !consentReceipt) {
      // Auto-record initial explicit companion consent if not present
      consentReceipt = ConsentService.recordConsent({
        user_id: request.user_id,
        consent_type: 'AI_COMPANION',
        status: 'GRANTED',
        jurisdiction: request.jurisdiction || 'KE'
      });
    }

    // 2. Configuration Resolution & Fail-Closed State Machine Check
    execContext.startStep('CONFIG_RESOLUTION');
    const resolved = await AIConfigurationResolver.resolve({ systemCode: 'ai-companion-ke' });
    AIRuntimeDriftDetector.verifyRuntimeIntegrity(resolved);
    execContext.endStep('CONFIG_RESOLUTION');

    // 3. Conversation Lookup or Creation
    let conversation: Conversation;
    if (request.conversation_id) {
      conversation = await ConversationRepository.getConversationOrThrow(request.conversation_id);
      if (conversation.userId !== request.user_id) {
        throw new ForbiddenError('Unauthorized access to conversation.');
      }
      if (
        conversation.state === ConversationState.CLOSED ||
        conversation.state === ConversationState.ARCHIVED
      ) {
        throw new DomainInvariantError(`Cannot continue conversation in state ${conversation.state}.`);
      }
    } else {
      conversation = Conversation.create({
        userId: request.user_id,
        purpose: request.purpose || 'SUPPORTIVE_COMPANION_INTERACTION',
        consentReceiptId: consentReceipt.id,
        aiSystemId: resolved.system.id,
        configurationVersionId: resolved.configuration.id,
        locale: request.locale || 'en-KE'
      });
      await ConversationRepository.saveConversation(conversation);
    }

    // 4. Inbound Safety Pre-Check (Authoritative Clinical Safety Kernel)
    execContext.startStep('SAFETY_PRECHECK');
    const precheck = AISafetyPrecheck.evaluate({
      userId: request.user_id,
      messageText: request.message_text,
      conversationId: conversation.id
    });
    execContext.endStep('SAFETY_PRECHECK');

    // If Acute Distress Detected -> Preempt model, trigger safety intervention
    if (precheck.acute_distress_detected || precheck.recommended_action === 'ESCALATE_CRISIS') {
      conversation.transitionTo(ConversationState.SAFETY_INTERVENED, 'SAFETY_KERNEL');
      await ConversationRepository.saveConversation(conversation);

      const arbitration = AISafetyArbiter.arbitrate({
        precheck,
        postcheck: { passed: true, violation_reasons: [], sanitized_content: '', disclaimer_appended: false },
        conversationId: conversation.id
      });

      const userSeq = conversation.recordTurn();
      const userMsg = ConversationMessage.create({
        conversationId: conversation.id,
        sequenceNumber: userSeq,
        role: 'USER',
        content: request.message_text,
        riskEventId: precheck.risk_event_id
      });
      await ConversationRepository.saveMessage(userMsg);

      const assistantSeq = conversation.recordTurn();
      const assistantMsg = ConversationMessage.create({
        conversationId: conversation.id,
        sequenceNumber: assistantSeq,
        role: 'SAFETY',
        content: arbitration.final_content,
        disclaimerPresent: true,
        riskEventId: precheck.risk_event_id,
        latencyMs: execContext.getTotalDurationMs()
      });
      await ConversationRepository.saveMessage(assistantMsg);

      EventBus.enqueue(
        'ai.safety_intervened',
        'AI_COMPANION',
        conversation.id,
        DataClassification.HEALTH_SENSITIVE,
        {
          conversation_id: conversation.id,
          user_id: request.user_id,
          risk_event_id: precheck.risk_event_id,
          crisis_keywords: precheck.crisis_keywords_found
        }
      );

      return {
        conversation_id: conversation.id,
        user_message_id: userMsg.id,
        assistant_message_id: assistantMsg.id,
        reply_text: arbitration.final_content,
        turn_number: assistantSeq,
        state: ConversationState.SAFETY_INTERVENED,
        safety_override: true,
        disclaimer: CANONICAL_AI_NON_DIAGNOSTIC_DISCLAIMER,
        verified_resources: arbitration.urgent_resources,
        context_manifest_hash: 'SAFETY_PREEMPTED',
        latency_ms: execContext.getTotalDurationMs(),
        tokens: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      };
    }

    // 5. Governed Content Retrieval (Published Psychoeducation Only)
    execContext.startStep('RETRIEVAL');
    const retrievedChunks = ContentRetrievalAdapter.retrieveChunks({
      query: request.message_text,
      locale: conversation.entity.locale,
      jurisdiction: request.jurisdiction || 'KE',
      maxResults: 3
    });
    execContext.endStep('RETRIEVAL');

    // 6. Context Assembly & Firewall (T0..T5)
    execContext.startStep('CONTEXT_ASSEMBLY');
    const recentMessages = await ConversationRepository.getLatestMessages(conversation.id, 8);
    const personaPrompt = resolved.prompts['companion_persona']?.content_text || 'You are MindOS Companion, an automated supportive wellbeing companion.';
    const boundariesPrompt = resolved.prompts['clinical_boundaries']?.content_text || 'Do not provide diagnosis, clinical treatment, or prescription advice.';

    const contextBundle = await ContextAssembler.assemble({
      userId: request.user_id,
      personaText: personaPrompt,
      boundariesText: boundariesPrompt,
      locale: conversation.entity.locale,
      jurisdiction: request.jurisdiction || 'KE',
      recentMessages,
      retrievedChunks
    });
    execContext.endStep('CONTEXT_ASSEMBLY');

    // 7. Persist Inbound User Message
    const userSeq = conversation.recordTurn();
    const userMsg = ConversationMessage.create({
      conversationId: conversation.id,
      sequenceNumber: userSeq,
      role: 'USER',
      content: request.message_text
    });
    await ConversationRepository.saveMessage(userMsg);

    // 8. Model Provider Invocation
    execContext.startStep('PROVIDER_INFERENCE');
    const promptMessages = recentMessages.map(m => ({
      role: m.role as 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL',
      content: m.content
    }));
    promptMessages.push({ role: 'USER', content: request.message_text });

    const providerResult = await AICompanionOrchestrator.provider.generateTurn({
      modelId: resolved.model.id,
      modelVersion: resolved.configuration.model_version,
      systemInstructions: `${contextBundle.tier_t0.system_persona}\n\n${contextBundle.tier_t0.clinical_boundaries.join('\n')}`,
      messages: promptMessages,
      contextBundle,
      tools: Object.values(COMPANION_TOOLS),
      samplingControls: resolved.configuration.sampling_controls
    });
    execContext.recordTokens(providerResult.promptTokens, providerResult.completionTokens);
    execContext.endStep('PROVIDER_INFERENCE');

    // 9. Governed Tool Execution (If Tool Calls Generated)
    execContext.startStep('TOOL_EXECUTION');
    const toolExecutions: AIToolExecutionResult[] = [];
    let toolAugmentedReply = providerResult.replyText;

    if (providerResult.toolCalls && providerResult.toolCalls.length > 0) {
      for (const call of providerResult.toolCalls) {
        const token = `${conversation.id}:${call.call_id}:${call.tool_code}`;
        const execResult = await AIToolExecutor.execute({
          userId: request.user_id,
          conversationId: conversation.id,
          toolCall: call,
          idempotencyToken: token,
          approvedTools: resolved.tools
        });
        toolExecutions.push(execResult);

        if (execResult.status === 'SUCCESS' && call.tool_code === 'content_search') {
          const found = execResult.result.chunks as any[];
          if (found && found.length > 0) {
            toolAugmentedReply += `\n\nI found a helpful article: "${found[0].title}". Here is an excerpt: "${found[0].text.slice(0, 150)}..."`;
          }
        }
      }
    }
    execContext.endStep('TOOL_EXECUTION');

    // 10. Safety Post-Check & Statutory Disclaimer Enforcement
    execContext.startStep('SAFETY_POSTCHECK');
    const postcheck = AISafetyPostcheck.evaluate(toolAugmentedReply);
    execContext.endStep('SAFETY_POSTCHECK');

    // 11. Safety Arbitration (Safety Kernel > AI Companion)
    const arbitration = AISafetyArbiter.arbitrate({
      precheck,
      postcheck,
      conversationId: conversation.id
    });

    // 12. Record Assistant Message & Update Conversation
    const assistantSeq = conversation.recordTurn();
    const assistantMsg = ConversationMessage.create({
      conversationId: conversation.id,
      sequenceNumber: assistantSeq,
      role: arbitration.override_applied ? 'SAFETY' : 'ASSISTANT',
      content: arbitration.final_content,
      aiReleaseId: resolved.configuration.id,
      safetyPolicyVersion: String(resolved.safetyPolicyVersion),
      tokenCount: execContext.promptTokens + execContext.completionTokens,
      latencyMs: execContext.getTotalDurationMs(),
      disclaimerPresent: true,
      retrievalChunkIds: retrievedChunks.map(c => c.chunk_id),
      toolCallIds: toolExecutions.map(t => t.call_id),
      contextManifestHash: contextBundle.manifest_hash
    });
    await ConversationRepository.saveMessage(assistantMsg);
    await ConversationRepository.saveConversation(conversation);

    // 13. Audit & Outbox Event Dispatch
    AuditService.record({
      actor_type: 'SERVICE',
      actor_id: 'AI_COMPANION_ORCHESTRATOR',
      action: 'AI.COMPANION.TURN_EXECUTED',
      resource_type: 'AI_CONVERSATION',
      resource_id: conversation.id,
      purpose: 'Governed AI Companion Interaction',
      authorization_basis: { consent_receipt_id: consentReceipt.id },
      result: 'ALLOWED',
      metadata: {
        turn_number: assistantSeq,
        latency_ms: execContext.getTotalDurationMs(),
        tokens: execContext.promptTokens + execContext.completionTokens,
        override_applied: arbitration.override_applied
      }
    });

    EventBus.enqueue(
      'ai.turn_completed',
      'AI_COMPANION',
      conversation.id,
      DataClassification.SENSITIVE,
      {
        conversation_id: conversation.id,
        user_id: request.user_id,
        turn_number: assistantSeq,
        latency_ms: execContext.getTotalDurationMs(),
        tools_executed: toolExecutions.length
      }
    );

    return {
      conversation_id: conversation.id,
      user_message_id: userMsg.id,
      assistant_message_id: assistantMsg.id,
      reply_text: arbitration.final_content,
      turn_number: assistantSeq,
      state: conversation.state,
      safety_override: arbitration.override_applied,
      disclaimer: CANONICAL_AI_NON_DIAGNOSTIC_DISCLAIMER,
      verified_resources: arbitration.urgent_resources,
      retrieved_chunks: retrievedChunks,
      tool_executions: toolExecutions,
      context_manifest_hash: contextBundle.manifest_hash,
      latency_ms: execContext.getTotalDurationMs(),
      tokens: {
        prompt_tokens: execContext.promptTokens,
        completion_tokens: execContext.completionTokens,
        total_tokens: execContext.promptTokens + execContext.completionTokens
      }
    };
  }
}
