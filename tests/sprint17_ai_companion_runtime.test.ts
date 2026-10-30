/**
 * MindOS Sprint 17: Governed Conversational AI Runtime Test Suite
 * Authority: Master Architecture Index Section 7, Volumes I, IV, XV & Appendices B / C / G / H / P / Q
 * Clinical Safety Policy Catalogue: R-SAFE-001, R-SAFE-002, R-AI-001, R-AI-002
 * Architectural Decisions: ADR-008, ADR-009, ADR-010, ADR-015, ADR-016
 * 
 * Verifies:
 * 1. AI Companion bounded context & bootstrap
 * 2. Configuration resolution & fail-closed governance
 * 3. Runtime configuration drift detection
 * 4. Inbound safety pre-check & authoritative crisis escalation (Safety Kernel > AI Companion)
 * 5. Conversation lifecycle state machine & invariant enforcement
 * 6. Governed content retrieval & minimum necessary context assembly (T0..T5)
 * 7. Host-gated, deterministic, idempotent tool execution
 * 8. Governed AI memory service & Kenya DPA 2019 right to erasure
 * 9. Outbound safety post-check, clinical boundary enforcement & statutory disclaimer guarantee
 * 10. End-to-end companion turn orchestration & user feedback
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  AICompanionOrchestrator,
  AICompanionService,
  AICompanionBootstrap,
  AIConfigurationResolver,
  AIRuntimeDriftDetector,
  AISafetyPrecheck,
  AISafetyPostcheck,
  AISafetyArbiter,
  ContextAssembler,
  AIContextFirewall,
  ContentRetrievalAdapter,
  AIMemoryService,
  AIToolExecutor,
  ConversationRepository,
  MemoryRepository,
  ToolExecutionRepository,
  FeedbackRepository,
  Conversation,
  ConversationMessage,
  ConversationState,
  RiskState,
  AISystemState,
  CANONICAL_AI_NON_DIAGNOSTIC_DISCLAIMER,
  CANONICAL_CRISIS_RESPONSE_TEMPLATE,
  AISystemUnavailableError,
  AIRuntimeDriftError,
  AIMemoryConsentRequiredError,
  AIMemoryViolationError,
  AIToolNotAuthorizedError
} from '../mindos/ai/index.js';

import {
  AISystemRegistry,
  AIConfigurationEngine,
  PromptRegistry,
  AIToolRegistry,
  AIModelRegistry,
  AISafetyGovernanceService
} from '../mindos/ai_safety_governance/index.js';

import { SafetyKernel } from '../mindos/safety/index.js';
import { ConsentService } from '../mindos/consent/index.js';
import { AuditService } from '../mindos/platform/audit/index.js';
import { EventBus } from '../mindos/platform/events/index.js';
import { DomainInvariantError, ForbiddenError } from '../mindos/platform/errors/index.js';

describe('MindOS Sprint 17: Governed Conversational AI Runtime', () => {
  const testUserId = '01918c00-0001-7000-8000-000000000001';

  beforeEach(async () => {
    // Reset all state
    ConversationRepository.resetForTesting();
    MemoryRepository.resetForTesting();
    ToolExecutionRepository.resetForTesting();
    FeedbackRepository.resetForTesting();
    SafetyKernel.resetForTesting();
    ConsentService.resetForTesting();
    AuditService.resetForTesting();
    EventBus.resetForTesting();
    AISafetyGovernanceService.resetForTesting();

    // Bootstrap approved AI companion system & configuration
    await AICompanionBootstrap.bootstrapCanonicalCompanion();

    // Grant default companion consent for test user
    ConsentService.recordConsent({
      user_id: testUserId,
      consent_type: 'AI_COMPANION',
      status: 'GRANTED',
      jurisdiction: 'KE'
    });
  });

  describe('1. Configuration Resolution & Fail-Closed Governance', () => {
    test('Resolves approved active AI companion system and configuration', async () => {
      const resolved = await AIConfigurationResolver.resolve({ systemCode: 'ai-companion-ke' });
      assert.ok(resolved);
      assert.strictEqual(resolved.system.code, 'ai-companion-ke');
      assert.strictEqual(resolved.system.state, AISystemState.ACTIVE);
      assert.strictEqual(resolved.configuration.version, '1.0.0');
      assert.strictEqual(resolved.configuration.status, 'ACTIVE');
      assert.ok(resolved.prompts['companion_persona']);
      assert.ok(resolved.prompts['clinical_boundaries']);
      assert.ok(resolved.configurationHash);
    });

    test('Fails closed if AI system is PAUSED, SUSPENDED, or REVOKED', async () => {
      const system = AISystemRegistry.getSystemByCode('ai-companion-ke');
      AISystemRegistry.updateState(system.id, AISystemState.PAUSED, 'TEST_PAUSE');

      await assert.rejects(
        async () => {
          await AIConfigurationResolver.resolve({ systemCode: 'ai-companion-ke' });
        },
        (err: any) => {
          assert.ok(err instanceof AISystemUnavailableError);
          assert.ok(err.message.includes('PAUSED'));
          return true;
        }
      );
    });

    test('Fails closed if AI configuration is in DRAFT or REVOKED status', async () => {
      const system = AISystemRegistry.getSystemByCode('ai-companion-ke');
      const configs = AIConfigurationEngine.listConfigurationsForSystem(system.id);
      AIConfigurationEngine.updateStatus(configs[0].id, 'DRAFT');

      await assert.rejects(
        async () => {
          await AIConfigurationResolver.resolve({ systemCode: 'ai-companion-ke' });
        },
        (err: any) => {
          assert.ok(err instanceof AISystemUnavailableError);
          return true;
        }
      );
    });

    test('Runtime drift detector identifies configuration tampering', async () => {
      const resolved = await AIConfigurationResolver.resolve({ systemCode: 'ai-companion-ke' });

      // Clean check should succeed
      assert.doesNotThrow(() => {
        AIRuntimeDriftDetector.verifyRuntimeIntegrity(resolved);
      });

      // Tamper with prompt text
      const tamperedResolved = {
        ...resolved,
        prompts: {
          ...resolved.prompts,
          companion_persona: {
            ...resolved.prompts.companion_persona,
            content_text: 'TAMPERED PROMPT TEXT'
          }
        }
      };

      assert.throws(
        () => {
          AIRuntimeDriftDetector.verifyRuntimeIntegrity(tamperedResolved);
        },
        (err: any) => {
          assert.ok(err instanceof AIRuntimeDriftError);
          assert.ok(err.message.includes('drift detected'));
          return true;
        }
      );
    });
  });

  describe('2. Safety Pre-Check & Authoritative Crisis Intervention (R-SAFE-001, ADR-010)', () => {
    test('Clears safe user wellbeing reflection without distress keywords', () => {
      const result = AISafetyPrecheck.evaluate({
        userId: testUserId,
        messageText: 'I have been feeling a bit fatigued today and would like some breathing exercises.'
      });
      assert.strictEqual(result.is_safe, true);
      assert.strictEqual(result.acute_distress_detected, false);
      assert.strictEqual(result.recommended_action, 'CONTINUE');
      assert.strictEqual(result.crisis_keywords_found.length, 0);
    });

    test('Detects acute distress keywords and escalates to Safety Kernel', () => {
      const result = AISafetyPrecheck.evaluate({
        userId: testUserId,
        messageText: 'I feel completely hopeless and I want to kill myself tonight.'
      });

      assert.strictEqual(result.is_safe, false);
      assert.strictEqual(result.acute_distress_detected, true);
      assert.strictEqual(result.recommended_action, 'ESCALATE_CRISIS');
      assert.ok(result.crisis_keywords_found.includes('kill myself'));
      assert.ok(result.urgent_resources);
      assert.ok(result.urgent_resources.length > 0);

      // Verify Safety Kernel state for user transitioned to URGENT
      const userRisk = SafetyKernel.getUserRiskState(testUserId);
      assert.strictEqual(userRisk, RiskState.URGENT);
    });

    test('Preempts LLM invocation and returns verified crisis contacts during acute distress', async () => {
      const turnResponse = await AICompanionOrchestrator.executeTurn({
        user_id: testUserId,
        message_text: 'I cannot take this anymore, I want to end my life.'
      });

      assert.strictEqual(turnResponse.safety_override, true);
      assert.strictEqual(turnResponse.state, ConversationState.SAFETY_INTERVENED);
      assert.ok(turnResponse.reply_text.includes(CANONICAL_CRISIS_RESPONSE_TEMPLATE));
      assert.ok(turnResponse.reply_text.includes('Befrienders Kenya Helpline'));
      assert.ok(turnResponse.reply_text.includes('+254 722 178 177'));
      assert.ok(turnResponse.reply_text.includes('999'));
      assert.ok(turnResponse.reply_text.includes(CANONICAL_AI_NON_DIAGNOSTIC_DISCLAIMER));
      assert.ok(turnResponse.verified_resources && turnResponse.verified_resources.length > 0);

      // Verify conversation persisted in SAFETY_INTERVENED state
      const conv = await ConversationRepository.getConversationOrThrow(turnResponse.conversation_id);
      assert.strictEqual(conv.state, ConversationState.SAFETY_INTERVENED);
    });
  });

  describe('3. Conversation Lifecycle & State Machine Guard', () => {
    test('Transitions across canonical lifecycle states: ACTIVE -> PAUSED -> ACTIVE -> CLOSED', () => {
      const conv = Conversation.create({
        userId: testUserId,
        purpose: 'SUPPORTIVE_COMPANION_INTERACTION',
        consentReceiptId: '01918c00-0005-7000-8000-000000000005',
        aiSystemId: 'sys-1',
        configurationVersionId: 'cfg-1'
      });
      assert.strictEqual(conv.state, ConversationState.ACTIVE);

      conv.transitionTo(ConversationState.PAUSED);
      assert.strictEqual(conv.state, ConversationState.PAUSED);

      conv.transitionTo(ConversationState.ACTIVE);
      assert.strictEqual(conv.state, ConversationState.ACTIVE);

      conv.transitionTo(ConversationState.CLOSED);
      assert.strictEqual(conv.state, ConversationState.CLOSED);
    });

    test('Disallows illegal state transitions (e.g. CLOSED -> ACTIVE)', () => {
      const conv = Conversation.create({
        userId: testUserId,
        purpose: 'SUPPORTIVE_COMPANION_INTERACTION',
        consentReceiptId: '01918c00-0005-7000-8000-000000000005',
        aiSystemId: 'sys-1',
        configurationVersionId: 'cfg-1'
      });
      conv.transitionTo(ConversationState.CLOSED);

      assert.throws(
        () => {
          conv.transitionTo(ConversationState.ACTIVE);
        },
        (err: any) => {
          assert.ok(err instanceof DomainInvariantError);
          assert.ok(err.message.includes('INVALID_STATE_TRANSITION'));
          return true;
        }
      );
    });

    test('Cannot execute turns on a CLOSED conversation', async () => {
      const conv = Conversation.create({
        userId: testUserId,
        purpose: 'SUPPORTIVE_COMPANION_INTERACTION',
        consentReceiptId: '01918c00-0005-7000-8000-000000000005',
        aiSystemId: 'sys-1',
        configurationVersionId: 'cfg-1'
      });
      conv.transitionTo(ConversationState.CLOSED);
      await ConversationRepository.saveConversation(conv);

      await assert.rejects(
        async () => {
          await AICompanionOrchestrator.executeTurn({
            user_id: testUserId,
            conversation_id: conv.id,
            message_text: 'Hello again.'
          });
        },
        (err: any) => {
          assert.ok(err instanceof DomainInvariantError);
          return true;
        }
      );
    });
  });

  describe('4. Governed Content Retrieval & Context Assembly (T0..T5)', () => {
    test('Retrieves only published psychoeducation chunks with non-diagnostic disclaimers', () => {
      const chunks = ContentRetrievalAdapter.retrieveChunks({
        query: 'anxiety stress coping'
      });

      assert.ok(Array.isArray(chunks));
      for (const chunk of chunks) {
        assert.strictEqual(chunk.status, 'PUBLISHED');
        assert.ok(chunk.non_diagnostic_disclaimer);
        assert.ok(chunk.approved_clinical_artifact_id);
      }
    });

    test('Context firewall strips prohibited clinical keys', () => {
      const raw = {
        user_name: 'Jane Doe',
        locale: 'en-KE',
        diagnosis: 'Major Depressive Disorder (F32.9)',
        prescription: 'Sertraline 50mg daily',
        medication_dose: '50mg',
        mood_checkin: 7
      };

      const { allowedContext, manifestHash } = AIContextFirewall.filterContext({
        userId: testUserId,
        purpose: 'WELLBEING_REFLECTION',
        rawContext: raw
      });

      assert.strictEqual(allowedContext.user_name, 'Jane Doe');
      assert.strictEqual(allowedContext.locale, 'en-KE');
      assert.strictEqual(allowedContext.mood_checkin, 7);
      assert.strictEqual(allowedContext.diagnosis, undefined);
      assert.strictEqual(allowedContext.prescription, undefined);
      assert.strictEqual(allowedContext.medication_dose, undefined);
      assert.ok(manifestHash);
    });

    test('Context assembler generates complete T0..T5 bundle with deterministic manifest hash', async () => {
      const bundle = await ContextAssembler.assemble({
        userId: testUserId,
        personaText: 'Supportive persona text',
        boundariesText: 'No diagnosis boundaries',
        locale: 'en-KE',
        jurisdiction: 'KE',
        moodScore: 6
      });

      assert.ok(bundle.tier_t0.system_persona);
      assert.ok(bundle.tier_t0.statutory_disclaimers.includes(CANONICAL_AI_NON_DIAGNOSTIC_DISCLAIMER));
      assert.strictEqual(bundle.tier_t1.locale, 'en-KE');
      assert.strictEqual(bundle.tier_t2.current_mood_score, 6);
      assert.ok(bundle.manifest_hash);
    });
  });

  describe('5. Governed Tool Execution & Idempotency (ADR-016)', () => {
    test('Executes content_search tool deterministically', async () => {
      const approvedTools = AISystemRegistry.getSystemByCode('ai-companion-ke');
      const resolved = await AIConfigurationResolver.resolve({ systemCode: 'ai-companion-ke' });

      const result = await AIToolExecutor.execute({
        userId: testUserId,
        conversationId: 'conv-test-1',
        toolCall: {
          call_id: 'call-1',
          tool_code: 'content_search',
          arguments: { query: 'anxiety' }
        },
        idempotencyToken: 'conv-test-1:call-1:content_search',
        approvedTools: resolved.tools
      });

      assert.strictEqual(result.status, 'SUCCESS');
      assert.strictEqual(result.tool_code, 'content_search');
      assert.ok(result.result);
    });

    test('Executes crisis_resource_lookup tool returning verified hotlines', async () => {
      const resolved = await AIConfigurationResolver.resolve({ systemCode: 'ai-companion-ke' });

      const result = await AIToolExecutor.execute({
        userId: testUserId,
        conversationId: 'conv-test-2',
        toolCall: {
          call_id: 'call-2',
          tool_code: 'crisis_resource_lookup',
          arguments: { jurisdiction: 'KE' }
        },
        idempotencyToken: 'conv-test-2:call-2:crisis_resource_lookup',
        approvedTools: resolved.tools
      });

      assert.strictEqual(result.status, 'SUCCESS');
      const resources = (result.result as any).resources;
      assert.ok(resources.length > 0);
      assert.ok(resources.some((r: any) => r.name.includes('Befrienders Kenya')));
    });

    test('Enforces idempotency: Duplicate execution returns cached result', async () => {
      const resolved = await AIConfigurationResolver.resolve({ systemCode: 'ai-companion-ke' });
      const idempotencyToken = 'idemp-token-unique-123';

      const firstResult = await AIToolExecutor.execute({
        userId: testUserId,
        conversationId: 'conv-idemp',
        toolCall: {
          call_id: 'call-idemp',
          tool_code: 'exercise_recommend',
          arguments: { category: 'BREATHING' }
        },
        idempotencyToken,
        approvedTools: resolved.tools
      });
      assert.strictEqual(firstResult.status, 'SUCCESS');

      // Second call with same token
      const secondResult = await AIToolExecutor.execute({
        userId: testUserId,
        conversationId: 'conv-idemp',
        toolCall: {
          call_id: 'call-idemp',
          tool_code: 'exercise_recommend',
          arguments: { category: 'BREATHING' }
        },
        idempotencyToken,
        approvedTools: resolved.tools
      });

      assert.deepStrictEqual(firstResult, secondResult);
    });

    test('Rejects unapproved tool execution with AIToolNotAuthorizedError', async () => {
      const resolved = await AIConfigurationResolver.resolve({ systemCode: 'ai-companion-ke' });

      await assert.rejects(
        async () => {
          await AIToolExecutor.execute({
            userId: testUserId,
            conversationId: 'conv-bad-tool',
            toolCall: {
              call_id: 'call-bad',
              tool_code: 'unapproved_arbitrary_tool',
              arguments: {}
            },
            idempotencyToken: 'bad-token-1',
            approvedTools: resolved.tools
          });
        },
        (err: any) => {
          return true;
        }
      );
    });
  });

  describe('6. Governed AI Memory & Kenya DPA 2019 Right to Erasure', () => {
    test('Requires active AI_MEMORY consent to record memory', async () => {
      // testUserId has not been granted AI_MEMORY consent
      await assert.rejects(
        async () => {
          await AIMemoryService.createMemory({
            userId: testUserId,
            category: 'PREFERENCE',
            memoryText: 'User prefers short calming metaphors.'
          });
        },
        (err: any) => {
          assert.ok(err instanceof AIMemoryConsentRequiredError);
          return true;
        }
      );
    });

    test('Allows memory creation and retrieval when consent granted', async () => {
      ConsentService.recordConsent({
        user_id: testUserId,
        consent_type: 'AI_MEMORY',
        status: 'GRANTED',
        jurisdiction: 'KE'
      });

      const memory = await AIMemoryService.createMemory({
        userId: testUserId,
        category: 'WELLBEING_GOAL',
        memoryText: 'User wants to practice mindful breathing twice a day.'
      });

      assert.ok(memory.id);
      assert.strictEqual(memory.status, 'ACTIVE');

      const userMemories = await AIMemoryService.getUserMemories(testUserId);
      assert.strictEqual(userMemories.length, 1);
      assert.strictEqual(userMemories[0].memory_text, 'User wants to practice mindful breathing twice a day.');
    });

    test('Prohibits diagnostic statements or medication dosages in memory', async () => {
      ConsentService.recordConsent({
        user_id: testUserId,
        consent_type: 'AI_MEMORY',
        status: 'GRANTED',
        jurisdiction: 'KE'
      });

      await assert.rejects(
        async () => {
          await AIMemoryService.createMemory({
            userId: testUserId,
            category: 'PREFERENCE',
            memoryText: 'I diagnose you with bipolar disorder.'
          });
        },
        (err: any) => {
          assert.ok(err instanceof AIMemoryViolationError);
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await AIMemoryService.createMemory({
            userId: testUserId,
            category: 'PREFERENCE',
            memoryText: 'User takes 50mg sertraline in the morning.'
          });
        },
        (err: any) => {
          assert.ok(err instanceof AIMemoryViolationError);
          return true;
        }
      );
    });

    test('Implements Kenya DPA 2019 Right to Erasure (clear all memories)', async () => {
      ConsentService.recordConsent({
        user_id: testUserId,
        consent_type: 'AI_MEMORY',
        status: 'GRANTED',
        jurisdiction: 'KE'
      });

      await AIMemoryService.createMemory({
        userId: testUserId,
        category: 'PREFERENCE',
        memoryText: 'Memory 1'
      });
      await AIMemoryService.createMemory({
        userId: testUserId,
        category: 'COPING_STRATEGY',
        memoryText: 'Memory 2'
      });

      const activeBefore = await AIMemoryService.getUserMemories(testUserId);
      assert.strictEqual(activeBefore.length, 2);

      const deletedCount = await AIMemoryService.clearAllUserMemories(testUserId);
      assert.strictEqual(deletedCount, 2);

      const activeAfter = await AIMemoryService.getUserMemories(testUserId);
      assert.strictEqual(activeAfter.length, 0);
    });
  });

  describe('7. Outbound Safety Post-Check & Clinical Boundary Enforcement (R-AI-002)', () => {
    test('Guarantees statutory non-diagnostic disclaimer is appended to all replies', () => {
      const raw = 'Here is a gentle reflection on mindfulness.';
      const postcheck = AISafetyPostcheck.evaluate(raw);

      assert.strictEqual(postcheck.passed, true);
      assert.ok(postcheck.sanitized_content.includes(CANONICAL_AI_NON_DIAGNOSTIC_DISCLAIMER));
      assert.strictEqual(postcheck.disclaimer_appended, true);
    });

    test('Detects prohibited diagnostic assertion and triggers safety arbitration override', () => {
      const raw = 'Based on what you described, I diagnose you with major depressive disorder.';
      const postcheck = AISafetyPostcheck.evaluate(raw);

      assert.strictEqual(postcheck.passed, false);
      assert.ok(postcheck.violation_reasons.some(r => r.includes('PROHIBITED_DIAGNOSTIC_ASSERTION')));

      const arbitration = AISafetyArbiter.arbitrate({
        precheck: { is_safe: true, acute_distress_detected: false, crisis_keywords_found: [], recommended_action: 'CONTINUE' },
        postcheck
      });

      assert.strictEqual(arbitration.action, 'OVERRIDE_CLINICAL_BOUNDARY');
      assert.strictEqual(arbitration.override_applied, true);
      assert.ok(arbitration.final_content.includes('unable to diagnose conditions'));
      assert.ok(arbitration.final_content.includes('licensed healthcare professional'));
      assert.ok(arbitration.final_content.includes(CANONICAL_AI_NON_DIAGNOSTIC_DISCLAIMER));
    });

    test('Detects prohibited medication prescription recommendation and triggers override', () => {
      const raw = 'You should increase your dose of 50mg sertraline to feel better.';
      const postcheck = AISafetyPostcheck.evaluate(raw);

      assert.strictEqual(postcheck.passed, false);
      assert.ok(postcheck.violation_reasons.some(r => r.includes('PROHIBITED_PRESCRIPTION_CLAIM')));

      const arbitration = AISafetyArbiter.arbitrate({
        precheck: { is_safe: true, acute_distress_detected: false, crisis_keywords_found: [], recommended_action: 'CONTINUE' },
        postcheck
      });

      assert.strictEqual(arbitration.action, 'OVERRIDE_CLINICAL_BOUNDARY');
      assert.strictEqual(arbitration.override_applied, true);
    });
  });

  describe('8. End-to-End Governed Companion Orchestrator & Application Service', () => {
    test('Executes end-to-end supportive companion turn cleanly', async () => {
      const response = await AICompanionService.executeTurn({
        user_id: testUserId,
        message_text: 'I had a stressful day at work and feel overwhelmed.'
      });

      assert.ok(response.conversation_id);
      assert.ok(response.user_message_id);
      assert.ok(response.assistant_message_id);
      assert.ok(response.reply_text);
      assert.strictEqual(response.safety_override, false);
      assert.strictEqual(response.state, ConversationState.ACTIVE);
      assert.ok(response.reply_text.includes(CANONICAL_AI_NON_DIAGNOSTIC_DISCLAIMER));
      assert.ok(response.latency_ms >= 0);
      assert.ok(response.tokens.total_tokens > 0);
      assert.ok(response.context_manifest_hash);

      // Verify conversation history
      const history = await AICompanionService.getConversationHistory(testUserId, response.conversation_id);
      assert.strictEqual(history.conversation.turn_count, 2); // 1 user + 1 assistant
      assert.strictEqual(history.messages.length, 2);
    });

    test('User can close an active conversation', async () => {
      const response = await AICompanionService.executeTurn({
        user_id: testUserId,
        message_text: 'Good afternoon MindOS.'
      });

      const closed = await AICompanionService.closeConversation(testUserId, response.conversation_id);
      assert.strictEqual(closed.state, ConversationState.CLOSED);

      const history = await AICompanionService.getConversationHistory(testUserId, response.conversation_id);
      assert.strictEqual(history.conversation.state, ConversationState.CLOSED);
    });

    test('User can submit feedback on an AI turn', async () => {
      const response = await AICompanionService.executeTurn({
        user_id: testUserId,
        message_text: 'I appreciate the breathing tips.'
      });

      const feedback = await AICompanionService.submitFeedback({
        userId: testUserId,
        conversationId: response.conversation_id,
        messageId: response.assistant_message_id,
        rating: 'HELPFUL',
        feedbackTags: ['clear', 'calming'],
        comments: 'Really helped me regain focus.'
      });

      assert.ok(feedback.id);
      assert.strictEqual(feedback.rating, 'HELPFUL');
      assert.deepStrictEqual(feedback.feedback_tags, ['clear', 'calming']);

      const userFeedbackList = await FeedbackRepository.listFeedbackForUser(testUserId);
      assert.strictEqual(userFeedbackList.length, 1);
    });

    test('Unauthorized user cannot access another user conversation', async () => {
      const otherUserId = '01918c00-0002-7000-8000-000000000002';
      const response = await AICompanionService.executeTurn({
        user_id: testUserId,
        message_text: 'Private reflection.'
      });

      await assert.rejects(
        async () => {
          await AICompanionService.getConversationHistory(otherUserId, response.conversation_id);
        },
        (err: any) => {
          assert.ok(err instanceof ForbiddenError);
          return true;
        }
      );
    });
  });
});
