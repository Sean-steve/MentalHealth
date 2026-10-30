/**
 * MindOS Governed Conversational AI Runtime Domain Types
 * Authority: Master Architecture Index Section 7, Volumes I, IV, XV & Appendices B / C / H / Q
 * Clinical Safety Policy Catalogue (R-SAFE-001, R-SAFE-002, R-AI-001, R-AI-002, ADR-008, ADR-009, ADR-010)
 * 
 * Invariants:
 * 1. AI is not system of record, clinical authority, or safety authority.
 * 2. Canonical Safety state outranks conversational AI behavior (Safety Kernel > AI Companion).
 * 3. AI cannot create clinical diagnosis or medication prescription records.
 * 4. AI-generated emergency numbers are forbidden; only verified resources from Safety Kernel may be used.
 */

import { ConversationState, RiskState, AISystemState } from '../../platform/shared/state_machines.js';
import { CrisisResourceEntity } from '../../safety/index.js';
import { ContentRetrievalChunk } from '../../content/domain/types.js';

export { ConversationState, RiskState, AISystemState };

export type ConversationRole = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL' | 'SAFETY';

export interface ConversationEntity {
  id: string; // UUIDv7
  user_id: string;
  purpose: string;
  consent_receipt_id: string;
  state: ConversationState;
  ai_system_id: string;
  configuration_version_id: string;
  locale: string;
  risk_state: RiskState;
  turn_count: number;
  created_at: string;
  last_active_at: string;
  safety_intervened_at?: string;
  closed_at?: string;
  archived_at?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationMessageEntity {
  id: string; // UUIDv7
  conversation_id: string;
  sequence_number: number;
  role: ConversationRole;
  content: string;
  ciphertext_hash?: string;
  ai_release_id?: string;
  safety_policy_version?: string;
  risk_event_id?: string;
  token_count: number;
  latency_ms: number;
  disclaimer_present: boolean;
  retrieval_chunk_ids: string[];
  tool_call_ids: string[];
  context_manifest_hash?: string;
  created_at: string;
}

export enum ContextTier {
  T0_SYSTEM = 'T0_SYSTEM',
  T1_MINIMAL_USER = 'T1_MINIMAL_USER',
  T2_WELLBEING_STATE = 'T2_WELLBEING_STATE',
  T3_SESSION_HISTORY = 'T3_SESSION_HISTORY',
  T4_RETRIEVED_CONTENT = 'T4_RETRIEVED_CONTENT',
  T5_EXTENDED_PROFILE = 'T5_EXTENDED_PROFILE'
}

export interface AIContextBundle {
  tier_t0: {
    system_persona: string;
    statutory_disclaimers: string[];
    clinical_boundaries: string[];
  };
  tier_t1: {
    locale: string;
    jurisdiction: string;
    age_bracket?: string;
  };
  tier_t2: {
    current_mood_score?: number;
    non_clinical_checkin_summary?: string;
  };
  tier_t3: Array<{
    role: ConversationRole;
    content: string;
  }>;
  tier_t4: ContentRetrievalChunk[];
  tier_t5: AIMemoryEntity[];
  manifest_hash: string;
}

export type AIMemoryCategory = 'PREFERENCE' | 'LIFE_EVENT' | 'WELLBEING_GOAL' | 'COPING_STRATEGY';

export interface AIMemoryEntity {
  id: string; // UUIDv7
  user_id: string;
  category: AIMemoryCategory;
  memory_text: string;
  confidence: number;
  source_conversation_id?: string;
  source_message_id?: string;
  consent_receipt_id: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  created_at: string;
  updated_at: string;
}

export interface AIToolDeclaration {
  code: string;
  name: string;
  description: string;
  category: 'READ_ONLY' | 'INTERNAL_STATE_MUTATION' | 'EXTERNAL_SIDE_EFFECT' | 'HIGH_RISK_ACTION';
  input_schema: Record<string, unknown>;
  required_consents: string[];
  required_authorizations: string[];
}

export interface AIToolCall {
  call_id: string;
  tool_code: string;
  arguments: Record<string, unknown>;
}

export interface AIToolExecutionResult {
  call_id: string;
  tool_code: string;
  idempotency_token: string;
  status: 'SUCCESS' | 'FAILED' | 'REJECTED';
  result: Record<string, unknown>;
  error?: string;
  duration_ms: number;
}

export interface SafetyPrecheckResult {
  is_safe: boolean;
  acute_distress_detected: boolean;
  crisis_keywords_found: string[];
  recommended_action: 'CONTINUE' | 'ESCALATE_CRISIS' | 'REFUSE';
  urgent_resources?: CrisisResourceEntity[];
  risk_event_id?: string;
}

export interface SafetyPostcheckResult {
  passed: boolean;
  violation_reasons: string[];
  sanitized_content: string;
  disclaimer_appended: boolean;
}

export interface SafetyArbitrationResult {
  action: 'ALLOW' | 'OVERRIDE_CRISIS' | 'OVERRIDE_CLINICAL_BOUNDARY' | 'REFUSE';
  final_content: string;
  rule_id: string;
  override_applied: boolean;
  urgent_resources?: CrisisResourceEntity[];
}

export interface AICompanionTurnRequest {
  user_id: string;
  conversation_id?: string;
  message_text: string;
  purpose?: string;
  locale?: string;
  jurisdiction?: string;
  client_metadata?: Record<string, unknown>;
  idempotency_key?: string;
}

export interface AICompanionTurnResponse {
  conversation_id: string;
  user_message_id: string;
  assistant_message_id: string;
  reply_text: string;
  turn_number: number;
  state: ConversationState;
  safety_override: boolean;
  disclaimer: string;
  verified_resources?: CrisisResourceEntity[];
  retrieved_chunks?: ContentRetrievalChunk[];
  tool_executions?: AIToolExecutionResult[];
  memories_referenced?: string[];
  context_manifest_hash: string;
  latency_ms: number;
  tokens: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface AIFeedbackEntity {
  id: string;
  conversation_id: string;
  message_id: string;
  user_id: string;
  rating: 'HELPFUL' | 'UNHELPFUL' | 'SAFETY_CONCERN';
  feedback_tags: string[];
  comments?: string;
  safety_incident_id?: string;
  created_at: string;
}
