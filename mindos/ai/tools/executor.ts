/**
 * MindOS Governed AI Tool Executor
 * Authority: Master Architecture Index Section 7, ADR-016
 * 
 * Invariants:
 * 1. Host-gated: Models never execute arbitrary or unchecked code.
 * 2. Strict authorization: Tools must be registered and active in the approved AI configuration.
 * 3. Consent enforcement: Tool operations requiring user consent (e.g. AI_MEMORY) are pre-checked.
 * 4. Idempotency: Duplicate executions with the same idempotency token return cached results.
 * 5. Full audit logging and outbox events for all side-effect mutations.
 */

import { AIToolCall, AIToolExecutionResult } from '../domain/types.js';
import { AIToolEntity } from '../../ai_safety_governance/domain/types.js';
import { COMPANION_TOOLS } from './definitions.js';
import { ToolExecutionRepository } from '../repositories/tool_execution_repository.js';
import { ContentRetrievalAdapter } from '../retrieval/adapter.js';
import { SafetyKernel } from '../../safety/index.js';
import { ConsentService } from '../../consent/index.js';
import { AIMemoryService } from '../memory/service.js';
import { AuditService } from '../../platform/audit/index.js';
import { AIToolNotAuthorizedError } from '../domain/errors.js';
import { AICareNavigationPort } from '../../care_navigation/ports/ai_companion_port.js';

export class AIToolExecutor {
  public static async execute(params: {
    userId: string;
    conversationId: string;
    toolCall: AIToolCall;
    idempotencyToken: string;
    approvedTools: AIToolEntity[];
  }): Promise<AIToolExecutionResult> {
    const startTime = Date.now();
    const { toolCall, idempotencyToken, userId, conversationId } = params;

    // 1. Idempotency check
    const cached = await ToolExecutionRepository.getExecutionByToken(idempotencyToken);
    if (cached) {
      return cached;
    }

    // 2. Validate authorization against approved tools in configuration
    const isApprovedInConfig = params.approvedTools.some(
      t => t.code === toolCall.tool_code && t.status === 'ACTIVE'
    );
    if (!isApprovedInConfig) {
      throw new AIToolNotAuthorizedError(
        `Tool "${toolCall.tool_code}" is not approved or active in the current AI configuration.`
      );
    }

    // 3. Validate tool definition
    const declaration = COMPANION_TOOLS[toolCall.tool_code];
    if (!declaration) {
      throw new AIToolNotAuthorizedError(
        `Tool "${toolCall.tool_code}" is not a recognized companion tool.`
      );
    }

    // 4. Consent verification
    for (const consentType of declaration.required_consents) {
      if (!ConsentService.hasActiveConsent(userId, consentType)) {
        const rejected: AIToolExecutionResult = {
          call_id: toolCall.call_id,
          tool_code: toolCall.tool_code,
          idempotency_token: idempotencyToken,
          status: 'REJECTED',
          result: {},
          error: `Execution denied: Active user consent "${consentType}" is required for tool "${toolCall.tool_code}".`,
          duration_ms: Date.now() - startTime
        };
        await ToolExecutionRepository.saveExecution(rejected, conversationId);
        return rejected;
      }
    }

    // 5. Deterministic Host Execution
    let resultPayload: Record<string, unknown> = {};
    let status: 'SUCCESS' | 'FAILED' = 'SUCCESS';
    let errorMessage: string | undefined;

    try {
      switch (toolCall.tool_code) {
        case 'content_search': {
          const query = String(toolCall.arguments.query || '');
          const topic = toolCall.arguments.topic ? String(toolCall.arguments.topic) : undefined;
          const chunks = ContentRetrievalAdapter.retrieveChunks({ query, topic });
          resultPayload = {
            query,
            total_found: chunks.length,
            chunks: chunks.map(c => ({
              chunk_id: c.chunk_id,
              title: c.title,
              text: c.content_text,
              disclaimer: c.non_diagnostic_disclaimer
            }))
          };
          break;
        }

        case 'exercise_recommend': {
          const category = String(toolCall.arguments.category || 'BREATHING');
          resultPayload = {
            category,
            exercises: [
              {
                exercise_code: 'EX-BOX-BREATHING-4-4',
                title: 'Box Breathing (4-4-4-4)',
                category: 'BREATHING',
                duration_seconds: 240,
                safety_contraindications: ['Severe respiratory distress']
              },
              {
                exercise_code: 'EX-GROUNDING-5-4-3-2-1',
                title: '5-4-3-2-1 Sensory Grounding',
                category: 'GROUNDING',
                duration_seconds: 300,
                safety_contraindications: []
              }
            ]
          };
          break;
        }

        case 'crisis_resource_lookup': {
          const jurisdiction = String(toolCall.arguments.jurisdiction || 'KE');
          const resources = SafetyKernel.getVerifiedCrisisResources(jurisdiction);
          resultPayload = {
            jurisdiction,
            resources: resources.map(r => ({
              id: r.id,
              name: r.name,
              contact: r.contact_json,
              availability: r.availability_json
            }))
          };
          break;
        }

        case 'save_user_reflection': {
          const category = toolCall.arguments.category as any;
          const reflectionText = String(toolCall.arguments.reflection_text || '');
          const memory = await AIMemoryService.createMemory({
            userId,
            category,
            memoryText: reflectionText,
            sourceConversationId: conversationId
          });
          resultPayload = {
            memory_id: memory.id,
            category: memory.category,
            status: 'RECORDED'
          };
          break;
        }

        case 'start_care_navigation': {
          const declaredDomain = toolCall.arguments.declared_domain ? String(toolCall.arguments.declared_domain) : undefined;
          const declaredConcerns = Array.isArray(toolCall.arguments.declared_concerns)
            ? toolCall.arguments.declared_concerns.map(String)
            : undefined;

          const navResult = await AICareNavigationPort.startNavigation({
            userId,
            declaredDomain,
            declaredConcerns
          });

          resultPayload = {
            session_id: navResult.sessionId,
            status: navResult.status,
            safety_override: navResult.safetyOverride,
            next_step: 'get_care_options'
          };
          break;
        }

        case 'get_care_options': {
          const sessionId = String(toolCall.arguments.session_id || '');
          const options = await AICareNavigationPort.getCareOptions(sessionId);
          resultPayload = {
            session_id: options.sessionId,
            primary_domain: options.primaryDomain,
            care_level: options.recommendedCareLevel,
            safety_override: options.safetyOverride,
            pathways: options.recommendations,
            disclaimer: options.statutoryDisclaimer
          };
          break;
        }

        case 'get_pathway_details': {
          const pathwayCode = String(toolCall.arguments.pathway_code || '');
          const pathway = AICareNavigationPort.getPathwayDetails(pathwayCode);
          resultPayload = {
            code: pathway.code,
            name: pathway.name,
            care_level: pathway.care_level,
            description: pathway.description,
            interventions: pathway.interventions
          };
          break;
        }

        default:
          throw new Error(`Unhandled tool execution code: ${toolCall.tool_code}`);
      }
    } catch (err: any) {
      status = 'FAILED';
      errorMessage = err.message || 'Tool execution encountered an internal error.';
    }

    const executionResult: AIToolExecutionResult = {
      call_id: toolCall.call_id,
      tool_code: toolCall.tool_code,
      idempotency_token: idempotencyToken,
      status,
      result: resultPayload,
      error: errorMessage,
      duration_ms: Date.now() - startTime
    };

    // 6. Record execution
    await ToolExecutionRepository.saveExecution(executionResult, conversationId);

    // 7. Audit
    AuditService.record({
      actor_type: 'SERVICE',
      actor_id: 'AI_TOOL_RUNNER',
      action: `AI.TOOL.${toolCall.tool_code.toUpperCase()}`,
      resource_type: 'AI_TOOL_EXECUTION',
      resource_id: idempotencyToken,
      purpose: 'Governed AI Tool Execution',
      authorization_basis: { tool_code: toolCall.tool_code },
      result: status === 'SUCCESS' ? 'ALLOWED' : 'DENIED',
      metadata: { duration_ms: executionResult.duration_ms, status }
    });

    return executionResult;
  }
}
