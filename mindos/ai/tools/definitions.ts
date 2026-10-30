/**
 * MindOS Governed AI Companion Tool Declarations
 * Authority: Master Architecture Index Section 7, ADR-016
 */

import { AIToolDeclaration } from '../domain/types.js';

export const COMPANION_TOOLS: Record<string, AIToolDeclaration> = {
  content_search: {
    code: 'content_search',
    name: 'Psychoeducation Library Search',
    description: 'Searches published supportive psychoeducation articles and self-help guides.',
    category: 'READ_ONLY',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term or topic' },
        topic: { type: 'string', description: 'Optional topic filter' }
      },
      required: ['query']
    },
    required_consents: [],
    required_authorizations: []
  },

  exercise_recommend: {
    code: 'exercise_recommend',
    name: 'Guided Exercise Discovery',
    description: 'Finds verified guided breathing, grounding, and mindfulness exercises.',
    category: 'READ_ONLY',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['BREATHING', 'GROUNDING', 'MINDFULNESS', 'JOURNALING'] },
        max_duration_seconds: { type: 'number' }
      },
      required: ['category']
    },
    required_consents: [],
    required_authorizations: []
  },

  crisis_resource_lookup: {
    code: 'crisis_resource_lookup',
    name: 'Verified Emergency & Crisis Resources',
    description: 'Fetches verified crisis hotlines and resources from the authoritative Safety Kernel.',
    category: 'READ_ONLY',
    input_schema: {
      type: 'object',
      properties: {
        jurisdiction: { type: 'string', default: 'KE' }
      }
    },
    required_consents: [],
    required_authorizations: []
  },

  save_user_reflection: {
    code: 'save_user_reflection',
    name: 'Save Personal Reflection to Memory',
    description: 'Stores a user-provided supportive reflection, goal, or coping preference.',
    category: 'INTERNAL_STATE_MUTATION',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['PREFERENCE', 'LIFE_EVENT', 'WELLBEING_GOAL', 'COPING_STRATEGY'] },
        reflection_text: { type: 'string' }
      },
      required: ['category', 'reflection_text']
    },
    required_consents: ['AI_MEMORY'],
    required_authorizations: []
  },

  start_care_navigation: {
    code: 'start_care_navigation',
    name: 'Care Navigation Support Matching',
    description: 'Initiates a care navigation session to guide the user towards stepped-care support options.',
    category: 'INTERNAL_STATE_MUTATION',
    input_schema: {
      type: 'object',
      properties: {
        declared_domain: { type: 'string', description: 'Primary area of support need' },
        declared_concerns: { type: 'array', items: { type: 'string' } }
      }
    },
    required_consents: [],
    required_authorizations: []
  },

  get_care_options: {
    code: 'get_care_options',
    name: 'Get Stepped-Care Support Options',
    description: 'Fetches evaluated care pathway options and stepped-care levels for the current session.',
    category: 'READ_ONLY',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Care navigation session ID' }
      },
      required: ['session_id']
    },
    required_consents: [],
    required_authorizations: []
  },

  get_pathway_details: {
    code: 'get_pathway_details',
    name: 'Care Pathway Details',
    description: 'Retrieves details, eligibility criteria, and interventions for a specific care pathway.',
    category: 'READ_ONLY',
    input_schema: {
      type: 'object',
      properties: {
        pathway_code: { type: 'string' }
      },
      required: ['pathway_code']
    },
    required_consents: [],
    required_authorizations: []
  }
};
