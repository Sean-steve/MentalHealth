-- ==============================================================================
-- MINDOS CANONICAL MIGRATION: 016_canonical_ai_companion_runtime.sql
-- ==============================================================================
-- Purpose: Formalize Conversational AI Companion Runtime Persistence:
--          Governed Conversations, Messages, User Memory (AI_MEMORY Consent),
--          Deterministic Tool Execution Records, Safety Arbitration Logs,
--          and User Response Feedback.
-- Authority: Master Architecture Index Section 7, Volumes I, IV, XV & Appendices B / C / H / Q
--            Clinical Safety Policy Catalogue (R-SAFE-001, R-AI-001, R-AI-002, ADR-008, ADR-009, ADR-010)
--            Kenya Data Protection Act 2019, Digital Health Act 2023
-- Sprint 17: Governed Conversational AI Runtime, Context Assembly, Retrieval,
--            Safety Arbitration, Tool Execution, Memory, Response Generation
-- Strategy: Additive expand phase (100% backwards compatible).
-- ==============================================================================

-- UP --

-- 1. Extend ai_conversations with companion runtime metadata
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS ai_system_id UUID;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS configuration_version_id UUID;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS locale VARCHAR(20) DEFAULT 'en-KE';
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS risk_state VARCHAR(40) DEFAULT 'NO_CONCERN';
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS turn_count INT DEFAULT 0;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS safety_intervened_at TIMESTAMPTZ;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_state ON ai_conversations(user_id, state);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_last_active ON ai_conversations(last_active_at);

-- 2. Extend ai_messages with conversational runtime attributes
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS sequence_number INT DEFAULT 1;
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS token_count INT DEFAULT 0;
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS latency_ms INT DEFAULT 0;
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS disclaimer_present BOOLEAN DEFAULT FALSE;
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS retrieval_chunk_ids TEXT[] DEFAULT '{}';
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS tool_call_ids TEXT[] DEFAULT '{}';
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS context_manifest_hash VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conv_seq ON ai_messages(conversation_id, sequence_number);

-- 3. Governed User Memories (Requires explicit AI_MEMORY consent; user visible, editable, deletable)
CREATE TABLE IF NOT EXISTS ai_user_memories (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(60) NOT NULL, -- 'PREFERENCE', 'LIFE_EVENT', 'WELLBEING_GOAL', 'COPING_STRATEGY'
  memory_text TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  source_conversation_id UUID REFERENCES ai_conversations(id) ON DELETE SET NULL,
  source_message_id UUID,
  consent_receipt_id UUID NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'ARCHIVED', 'DELETED'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_user_memories_user_status ON ai_user_memories(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_user_memories_category ON ai_user_memories(category);

-- 4. Governed AI Tool Executions (Host-gated, deterministic, idempotent)
CREATE TABLE IF NOT EXISTS ai_tool_executions (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  message_id UUID,
  tool_code VARCHAR(100) NOT NULL,
  idempotency_token VARCHAR(120) NOT NULL UNIQUE,
  input_payload JSONB NOT NULL DEFAULT '{}',
  output_payload JSONB NOT NULL DEFAULT '{}',
  execution_status VARCHAR(30) NOT NULL, -- 'SUCCESS', 'FAILED', 'REJECTED'
  error_message TEXT,
  duration_ms INT NOT NULL DEFAULT 0,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_tool_executions_conv ON ai_tool_executions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_tool_executions_token ON ai_tool_executions(idempotency_token);

-- 5. AI Safety Arbitration Records (Audit trail for safety overrides and postcheck decisions)
CREATE TABLE IF NOT EXISTS ai_safety_arbitration_records (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  message_id UUID,
  rule_id VARCHAR(80) NOT NULL,
  precheck_outcome VARCHAR(40) NOT NULL,
  postcheck_outcome VARCHAR(40) NOT NULL,
  override_applied BOOLEAN NOT NULL DEFAULT FALSE,
  safety_kernel_event_id UUID,
  audit_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_arbitration_conv ON ai_safety_arbitration_records(conversation_id);

-- 6. User Feedback & Safety Reporting on AI Turns
CREATE TABLE IF NOT EXISTS ai_feedback (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating VARCHAR(20) NOT NULL, -- 'HELPFUL', 'UNHELPFUL', 'SAFETY_CONCERN'
  feedback_tags TEXT[] DEFAULT '{}',
  comments TEXT,
  safety_incident_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_conv_msg ON ai_feedback(conversation_id, message_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_user ON ai_feedback(user_id);

-- DOWN --

DROP TABLE IF EXISTS ai_feedback;
DROP TABLE IF EXISTS ai_safety_arbitration_records;
DROP TABLE IF EXISTS ai_tool_executions;
DROP TABLE IF EXISTS ai_user_memories;
