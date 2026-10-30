/**
 * MindOS Canonical Consent Definitions & Baseline Policy Versions Seed
 * Authority: Master Architecture Index Section 14, Volume VIII, Appendix B / C & Kenya DPA 2019
 */

import {
  ConsentCategory,
  ConsentCode,
  ConsentDefinition,
  ConsentPolicyVersion,
  ConsentRequirementType
} from './types.js';

export interface SeedConsentPack {
  definition: ConsentDefinition;
  initialPolicyVersion: ConsentPolicyVersion;
}

export const CANONICAL_CONSENT_SEEDS: SeedConsentPack[] = [
  {
    definition: {
      id: '01918a00-0001-7000-8000-000000000001',
      code: ConsentCode.PLATFORM_TERMS,
      name: 'Platform Terms of Service',
      description: 'Core agreement governing the use of the MindOS mental health platform, security protocols, and Kenya Digital Health Act framework.',
      category: ConsentCategory.PLATFORM_TERMS,
      purpose: 'PLATFORM_OPERATION',
      data_categories: ['account', 'profile', 'security_telemetry'],
      required_or_optional: ConsentRequirementType.REQUIRED_FOR_SERVICE,
      withdrawal_allowed: false, // Account closure is required to terminate core terms
      expiry_policy: { has_expiry: false },
      jurisdiction_scope: ['KE', 'GLOBAL'],
      versioning_policy: { requires_reconsent_on_material_change: true },
      status: 'ACTIVE',
      processing_activity_id: 'PA-CORE-001',
      dpia_assessment_id: 'DPIA-CORE-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    },
    initialPolicyVersion: {
      id: '01918a00-0001-7001-8000-000000000001',
      consent_definition_id: '01918a00-0001-7000-8000-000000000001',
      consent_code: ConsentCode.PLATFORM_TERMS,
      version: '1.0.0',
      title: 'MindOS Standard Terms of Service v1.0',
      summary: 'Governs basic platform access, non-clinical boundaries, and security responsibilities.',
      full_text_reference: '/legal/terms-v1.0.md',
      effective_at: '2026-01-01T00:00:00.000Z',
      jurisdiction: 'KE',
      language: 'en',
      status: 'ACTIVE',
      is_material_change: false,
      approved_by: 'legal-counsel@mindos.dev',
      created_at: '2026-01-01T00:00:00.000Z'
    }
  },
  {
    definition: {
      id: '01918a00-0002-7000-8000-000000000002',
      code: ConsentCode.PRIVACY_PROCESSING,
      name: 'Essential Privacy Processing Notice',
      description: 'Lawful baseline data processing necessary to authenticate sessions, detect threats, and protect data subject rights.',
      category: ConsentCategory.PRIVACY_PROCESSING,
      purpose: 'PLATFORM_OPERATION',
      data_categories: ['account', 'profile', 'audit_logs'],
      required_or_optional: ConsentRequirementType.REQUIRED_FOR_SERVICE,
      withdrawal_allowed: false,
      expiry_policy: { has_expiry: false },
      jurisdiction_scope: ['KE', 'GLOBAL'],
      versioning_policy: { requires_reconsent_on_material_change: true },
      status: 'ACTIVE',
      processing_activity_id: 'PA-CORE-002',
      dpia_assessment_id: 'DPIA-CORE-002',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    },
    initialPolicyVersion: {
      id: '01918a00-0002-7001-8000-000000000002',
      consent_definition_id: '01918a00-0002-7000-8000-000000000002',
      consent_code: ConsentCode.PRIVACY_PROCESSING,
      version: '1.0.0',
      title: 'MindOS Essential Privacy Policy v1.0',
      summary: 'Outlines data controller duties under the Kenya Data Protection Act 2019 and security safeguards.',
      full_text_reference: '/legal/privacy-v1.0.md',
      effective_at: '2026-01-01T00:00:00.000Z',
      jurisdiction: 'KE',
      language: 'en',
      status: 'ACTIVE',
      is_material_change: false,
      approved_by: 'dpo@mindos.dev',
      created_at: '2026-01-01T00:00:00.000Z'
    }
  },
  {
    definition: {
      id: '01918a00-0003-7000-8000-000000000003',
      code: ConsentCode.AI_PROCESSING,
      name: 'AI Companion & Dialogue Processing',
      description: 'Explicit consent to send user input to MindOS validated AI models for real-time supportive conversation and psychoeducation.',
      category: ConsentCategory.AI_PROCESSING,
      purpose: 'AI_SUPPORT',
      data_categories: ['chat_input', 'ai_context', 'prompt_transient'],
      required_or_optional: ConsentRequirementType.OPTIONAL,
      withdrawal_allowed: true,
      expiry_policy: { has_expiry: false },
      jurisdiction_scope: ['KE', 'GLOBAL'],
      versioning_policy: { requires_reconsent_on_material_change: true },
      status: 'ACTIVE',
      processing_activity_id: 'PA-AI-001',
      dpia_assessment_id: 'DPIA-AI-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    },
    initialPolicyVersion: {
      id: '01918a00-0003-7001-8000-000000000003',
      consent_definition_id: '01918a00-0003-7000-8000-000000000003',
      consent_code: ConsentCode.AI_PROCESSING,
      version: '1.0.0',
      title: 'MindOS AI Companion Processing Terms v1.0',
      summary: 'Covers ephemeral dialogue processing with clinical safety guardrails. Never trains foundation models on raw user sessions.',
      full_text_reference: '/legal/ai-processing-v1.0.md',
      effective_at: '2026-01-01T00:00:00.000Z',
      jurisdiction: 'KE',
      language: 'en',
      status: 'ACTIVE',
      is_material_change: false,
      approved_by: 'ai-safety@mindos.dev',
      created_at: '2026-01-01T00:00:00.000Z'
    }
  },
  {
    definition: {
      id: '01918a00-0004-7000-8000-000000000004',
      code: ConsentCode.AI_PERSONALIZATION,
      name: 'AI Context Memory & Personalization',
      description: 'Permits the AI Companion to retain approved thematic highlights and wellbeing trends across sessions for personalized continuity.',
      category: ConsentCategory.AI_PERSONALIZATION,
      purpose: 'AI_PERSONALIZATION',
      data_categories: ['wellbeing_profile', 'ai_memory', 'conversation_themes'],
      required_or_optional: ConsentRequirementType.OPTIONAL,
      withdrawal_allowed: true,
      expiry_policy: { has_expiry: false },
      jurisdiction_scope: ['KE', 'GLOBAL'],
      versioning_policy: { requires_reconsent_on_material_change: true },
      status: 'ACTIVE',
      processing_activity_id: 'PA-AI-002',
      dpia_assessment_id: 'DPIA-AI-002',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    },
    initialPolicyVersion: {
      id: '01918a00-0004-7001-8000-000000000004',
      consent_definition_id: '01918a00-0004-7000-8000-000000000004',
      consent_code: ConsentCode.AI_PERSONALIZATION,
      version: '1.0.0',
      title: 'MindOS AI Long-Term Memory Policy v1.0',
      summary: 'Details how episodic memory and wellbeing reflections are stored and how you can purge individual memories at any time.',
      full_text_reference: '/legal/ai-memory-v1.0.md',
      effective_at: '2026-01-01T00:00:00.000Z',
      jurisdiction: 'KE',
      language: 'en',
      status: 'ACTIVE',
      is_material_change: false,
      approved_by: 'ai-safety@mindos.dev',
      created_at: '2026-01-01T00:00:00.000Z'
    }
  },
  {
    definition: {
      id: '01918a00-0005-7000-8000-000000000005',
      code: ConsentCode.COMMUNITY_PARTICIPATION,
      name: 'Peer Community Participation',
      description: 'Permits creating pseudonymous posts, sharing peer support in moderated forums, and interacting with the MindOS community.',
      category: ConsentCategory.COMMUNITY_PARTICIPATION,
      purpose: 'COMMUNITY_PARTICIPATION',
      data_categories: ['pseudonym', 'community_posts', 'community_comments'],
      required_or_optional: ConsentRequirementType.OPTIONAL,
      withdrawal_allowed: true,
      expiry_policy: { has_expiry: false },
      jurisdiction_scope: ['KE', 'GLOBAL'],
      versioning_policy: { requires_reconsent_on_material_change: true },
      status: 'ACTIVE',
      processing_activity_id: 'PA-COM-001',
      dpia_assessment_id: 'DPIA-COM-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    },
    initialPolicyVersion: {
      id: '01918a00-0005-7001-8000-000000000005',
      consent_definition_id: '01918a00-0005-7000-8000-000000000005',
      consent_code: ConsentCode.COMMUNITY_PARTICIPATION,
      version: '1.0.0',
      title: 'MindOS Community Guidelines & Privacy v1.0',
      summary: 'Explains pseudonymous identity isolation and strict moderator boundaries (R-COM-001).',
      full_text_reference: '/legal/community-guidelines-v1.0.md',
      effective_at: '2026-01-01T00:00:00.000Z',
      jurisdiction: 'KE',
      language: 'en',
      status: 'ACTIVE',
      is_material_change: false,
      approved_by: 'community-lead@mindos.dev',
      created_at: '2026-01-01T00:00:00.000Z'
    }
  },
  {
    definition: {
      id: '01918a00-0006-7000-8000-000000000006',
      code: ConsentCode.PROFESSIONAL_DATA_SHARING,
      name: 'Healthcare Professional Data Sharing',
      description: 'Allows sharing granular assessment summaries and care plans with designated verified mental health professionals.',
      category: ConsentCategory.PROFESSIONAL_DATA_SHARING,
      purpose: 'CARE_SHARING',
      data_categories: ['assessment_summary', 'care_summary'],
      required_or_optional: ConsentRequirementType.OPTIONAL,
      withdrawal_allowed: true,
      expiry_policy: { has_expiry: true, default_duration_days: 90 },
      jurisdiction_scope: ['KE', 'GLOBAL'],
      versioning_policy: { requires_reconsent_on_material_change: true },
      status: 'ACTIVE',
      processing_activity_id: 'PA-CARE-001',
      dpia_assessment_id: 'DPIA-CARE-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    },
    initialPolicyVersion: {
      id: '01918a00-0006-7001-8000-000000000006',
      consent_definition_id: '01918a00-0006-7000-8000-000000000006',
      consent_code: ConsentCode.PROFESSIONAL_DATA_SHARING,
      version: '1.0.0',
      title: 'MindOS Clinical Data Sharing Protocol v1.0',
      summary: 'Specifies recipient-bound sharing. Private journals and community activity are strictly excluded unless specifically authorized.',
      full_text_reference: '/legal/clinical-sharing-v1.0.md',
      effective_at: '2026-01-01T00:00:00.000Z',
      jurisdiction: 'KE',
      language: 'en',
      status: 'ACTIVE',
      is_material_change: false,
      approved_by: 'clinical-director@mindos.dev',
      created_at: '2026-01-01T00:00:00.000Z'
    }
  },
  {
    definition: {
      id: '01918a00-0007-7000-8000-000000000007',
      code: ConsentCode.TRUSTED_PERSON_SHARING,
      name: 'Trusted Contact Sharing',
      description: 'Allows sharing your safety plan or crisis escalation alert with a designated personal trusted contact.',
      category: ConsentCategory.TRUSTED_PERSON_SHARING,
      purpose: 'CARE_SHARING',
      data_categories: ['safety_plan_summary', 'crisis_alert_notification'],
      required_or_optional: ConsentRequirementType.OPTIONAL,
      withdrawal_allowed: true,
      expiry_policy: { has_expiry: true, default_duration_days: 180 },
      jurisdiction_scope: ['KE', 'GLOBAL'],
      versioning_policy: { requires_reconsent_on_material_change: true },
      status: 'ACTIVE',
      processing_activity_id: 'PA-CARE-002',
      dpia_assessment_id: 'DPIA-CARE-002',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    },
    initialPolicyVersion: {
      id: '01918a00-0007-7001-8000-000000000007',
      consent_definition_id: '01918a00-0007-7000-8000-000000000007',
      consent_code: ConsentCode.TRUSTED_PERSON_SHARING,
      version: '1.0.0',
      title: 'MindOS Trusted Contact Protocol v1.0',
      summary: 'Controls granular access for designated trusted contacts. Trusted contact status never grants access to health notes or chat history.',
      full_text_reference: '/legal/trusted-contact-v1.0.md',
      effective_at: '2026-01-01T00:00:00.000Z',
      jurisdiction: 'KE',
      language: 'en',
      status: 'ACTIVE',
      is_material_change: false,
      approved_by: 'safety-officer@mindos.dev',
      created_at: '2026-01-01T00:00:00.000Z'
    }
  },
  {
    definition: {
      id: '01918a00-0008-7000-8000-000000000008',
      code: ConsentCode.RESEARCH,
      name: 'De-identified Mental Health Research',
      description: 'Voluntary contribution of de-identified, aggregated wellbeing statistics to approved academic and public health studies.',
      category: ConsentCategory.RESEARCH,
      purpose: 'RESEARCH',
      data_categories: ['anonymized_metrics', 'deidentified_aggregate_responses'],
      required_or_optional: ConsentRequirementType.OPTIONAL,
      withdrawal_allowed: true,
      expiry_policy: { has_expiry: true, default_duration_days: 365 },
      jurisdiction_scope: ['KE', 'GLOBAL'],
      versioning_policy: { requires_reconsent_on_material_change: true },
      status: 'ACTIVE',
      processing_activity_id: 'PA-RES-001',
      dpia_assessment_id: 'DPIA-RES-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    },
    initialPolicyVersion: {
      id: '01918a00-0008-7001-8000-000000000008',
      consent_definition_id: '01918a00-0008-7000-8000-000000000008',
      consent_code: ConsentCode.RESEARCH,
      version: '1.0.0',
      title: 'MindOS Research Ethics & Data Use Agreement v1.0',
      summary: 'Voluntary academic research participation under IRB/ethical oversight. Declining never impairs access to MindOS care.',
      full_text_reference: '/legal/research-ethics-v1.0.md',
      effective_at: '2026-01-01T00:00:00.000Z',
      jurisdiction: 'KE',
      language: 'en',
      status: 'ACTIVE',
      is_material_change: false,
      approved_by: 'ethics-board@mindos.dev',
      created_at: '2026-01-01T00:00:00.000Z'
    }
  },
  {
    definition: {
      id: '01918a00-0009-7000-8000-000000000009',
      code: ConsentCode.PRODUCT_ANALYTICS,
      name: 'Product Analytics & Experience Improvement',
      description: 'Optional anonymous telemetry regarding navigation patterns and button responsiveness to improve platform usability.',
      category: ConsentCategory.PRODUCT_ANALYTICS,
      purpose: 'PRODUCT_IMPROVEMENT',
      data_categories: ['navigation_patterns', 'feature_usage_frequency'],
      required_or_optional: ConsentRequirementType.OPTIONAL,
      withdrawal_allowed: true,
      expiry_policy: { has_expiry: false },
      jurisdiction_scope: ['KE', 'GLOBAL'],
      versioning_policy: { requires_reconsent_on_material_change: false },
      status: 'ACTIVE',
      processing_activity_id: 'PA-ANL-001',
      dpia_assessment_id: 'DPIA-ANL-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    },
    initialPolicyVersion: {
      id: '01918a00-0009-7001-8000-000000000009',
      consent_definition_id: '01918a00-0009-7000-8000-000000000009',
      consent_code: ConsentCode.PRODUCT_ANALYTICS,
      version: '1.0.0',
      title: 'MindOS Usage Telemetry Policy v1.0',
      summary: 'Strictly anonymous interface analytics. Health records, journal notes, and assessments are mathematically isolated.',
      full_text_reference: '/legal/analytics-v1.0.md',
      effective_at: '2026-01-01T00:00:00.000Z',
      jurisdiction: 'KE',
      language: 'en',
      status: 'ACTIVE',
      is_material_change: false,
      approved_by: 'product-lead@mindos.dev',
      created_at: '2026-01-01T00:00:00.000Z'
    }
  },
  {
    definition: {
      id: '01918a00-0010-7000-8000-000000000010',
      code: ConsentCode.MARKETING,
      name: 'Health Updates & Educational Newsletter',
      description: 'Occasional emails highlighting new mental health resources, wellness webinars, and platform feature releases.',
      category: ConsentCategory.MARKETING,
      purpose: 'MARKETING',
      data_categories: ['contact_email', 'newsletter_preferences'],
      required_or_optional: ConsentRequirementType.OPTIONAL,
      withdrawal_allowed: true,
      expiry_policy: { has_expiry: false },
      jurisdiction_scope: ['KE', 'GLOBAL'],
      versioning_policy: { requires_reconsent_on_material_change: false },
      status: 'ACTIVE',
      processing_activity_id: 'PA-MKT-001',
      dpia_assessment_id: 'DPIA-MKT-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    },
    initialPolicyVersion: {
      id: '01918a00-0010-7001-8000-000000000010',
      consent_definition_id: '01918a00-0010-7000-8000-000000000010',
      consent_code: ConsentCode.MARKETING,
      version: '1.0.0',
      title: 'MindOS Communications Policy v1.0',
      summary: 'Direct marketing communications. Never sells email addresses to third parties. Single-click unsubscribe always available.',
      full_text_reference: '/legal/marketing-v1.0.md',
      effective_at: '2026-01-01T00:00:00.000Z',
      jurisdiction: 'KE',
      language: 'en',
      status: 'ACTIVE',
      is_material_change: false,
      approved_by: 'marketing-compliance@mindos.dev',
      created_at: '2026-01-01T00:00:00.000Z'
    }
  }
];
