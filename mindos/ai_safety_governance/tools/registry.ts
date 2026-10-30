/**
 * MindOS AI Tool Registry
 * Authority: ADR-016, Volumes IV, XV & Appendices B / C
 * Invariant: Every tool capability must be strictly registered, risk-classified,
 * schema-defined, and tied to required permissions and consent.
 */

import { AIToolEntity, AIToolCategory } from '../domain/types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { ValidationError, NotFoundError } from '../../platform/errors/index.js';

export class AIToolRegistry {
  private static tools: Map<string, AIToolEntity> = new Map();

  static {
    AIToolRegistry.seedDefaultTools();
  }

  public static seedDefaultTools(): void {
    // Seed standard tools
    const searchResourcesId = '01918c00-0020-7000-8000-000000000001';
    AIToolRegistry.tools.set('TOOL_SEARCH_CRISIS_RESOURCES', {
      id: searchResourcesId,
      code: 'TOOL_SEARCH_CRISIS_RESOURCES',
      name: 'Search Crisis Resources',
      description: 'Finds verified emergency crisis lines and mental health centers by location.',
      capability: 'READ_CRISIS_FACILITIES',
      risk_class: 'LOW',
      category: AIToolCategory.READ_ONLY,
      required_authorization: ['safety.crisis.read'],
      required_purpose: 'CRISIS_RESPONSE',
      required_consent: ['AI_PROCESSING'],
      input_schema: { type: 'object', properties: { county: { type: 'string' } } },
      output_schema: { type: 'object', properties: { facilities: { type: 'array' } } },
      side_effect_type: 'NONE',
      status: 'ACTIVE',
      version: '1.0.0',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z'
    });

    AIToolRegistry.tools.set('TOOL_FETCH_PSYCHOEDUCATION', {
      id: '01918c00-0020-7000-8000-000000000002',
      code: 'TOOL_FETCH_PSYCHOEDUCATION',
      name: 'Fetch Psychoeducation Content',
      description: 'Retrieves curated clinical psychoeducational materials (anxiety, sleep hygiene).',
      capability: 'READ_CURATED_CONTENT',
      risk_class: 'LOW',
      category: AIToolCategory.READ_ONLY,
      required_authorization: ['content.read'],
      required_purpose: 'CARE_NAVIGATION',
      required_consent: ['AI_PROCESSING'],
      input_schema: { type: 'object', properties: { topic: { type: 'string' } } },
      output_schema: { type: 'object', properties: { articles: { type: 'array' } } },
      side_effect_type: 'NONE',
      status: 'ACTIVE',
      version: '1.0.0',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z'
    });

    AIToolRegistry.tools.set('TOOL_SCHEDULE_CARE_APPOINTMENT', {
      id: '01918c00-0020-7000-8000-000000000003',
      code: 'TOOL_SCHEDULE_CARE_APPOINTMENT',
      name: 'Schedule Care Professional Appointment',
      description: 'Books a telehealth consultation slot with a licensed practitioner on behalf of the user.',
      capability: 'APPOINTMENT_MUTATION',
      risk_class: 'HIGH',
      category: AIToolCategory.EXTERNAL_SIDE_EFFECT,
      required_authorization: ['appointments.create'],
      required_purpose: 'CARE_DELIVERY',
      required_consent: ['AI_PROCESSING', 'APPOINTMENT_BOOKING'],
      input_schema: { type: 'object', properties: { professional_id: { type: 'string' }, slot: { type: 'string' } }, required: ['professional_id', 'slot'] },
      output_schema: { type: 'object', properties: { appointment_id: { type: 'string' }, status: { type: 'string' } } },
      side_effect_type: 'TRANSACTIONAL_BOOKING',
      status: 'ACTIVE',
      version: '1.0.0',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z'
    });

    AIToolRegistry.tools.set('start_care_navigation', {
      id: '01918c00-0020-7000-8000-000000000004',
      code: 'start_care_navigation',
      name: 'Care Navigation Support Matching',
      description: 'Initiates a care navigation session to guide the user towards stepped-care support options.',
      capability: 'CARE_NAVIGATION',
      risk_class: 'LOW',
      category: AIToolCategory.INTERNAL_STATE_MUTATION,
      required_authorization: ['care.navigate'],
      required_purpose: 'CARE_NAVIGATION',
      required_consent: ['AI_PROCESSING'],
      input_schema: { type: 'object' },
      output_schema: { type: 'object' },
      side_effect_type: 'SESSION_START',
      status: 'ACTIVE',
      version: '1.0.0',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z'
    });

    AIToolRegistry.tools.set('get_care_options', {
      id: '01918c00-0020-7000-8000-000000000005',
      code: 'get_care_options',
      name: 'Get Stepped-Care Support Options',
      description: 'Fetches evaluated care pathway options and stepped-care levels for the current session.',
      capability: 'CARE_NAVIGATION',
      risk_class: 'LOW',
      category: AIToolCategory.READ_ONLY,
      required_authorization: ['care.read'],
      required_purpose: 'CARE_NAVIGATION',
      required_consent: ['AI_PROCESSING'],
      input_schema: { type: 'object' },
      output_schema: { type: 'object' },
      side_effect_type: 'NONE',
      status: 'ACTIVE',
      version: '1.0.0',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z'
    });

    AIToolRegistry.tools.set('get_pathway_details', {
      id: '01918c00-0020-7000-8000-000000000006',
      code: 'get_pathway_details',
      name: 'Care Pathway Details',
      description: 'Retrieves details, eligibility criteria, and interventions for a specific care pathway.',
      capability: 'CARE_NAVIGATION',
      risk_class: 'LOW',
      category: AIToolCategory.READ_ONLY,
      required_authorization: ['care.read'],
      required_purpose: 'CARE_NAVIGATION',
      required_consent: ['AI_PROCESSING'],
      input_schema: { type: 'object' },
      output_schema: { type: 'object' },
      side_effect_type: 'NONE',
      status: 'ACTIVE',
      version: '1.0.0',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z'
    });
  }

  public static async registerTool(params: {
    code: string;
    name: string;
    description: string;
    capability: string;
    risk_class: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    category: AIToolCategory;
    required_authorization: string[];
    required_purpose: string;
    required_consent: string[];
    input_schema?: Record<string, unknown>;
    output_schema?: Record<string, unknown>;
    side_effect_type?: string;
    version?: string;
  }): Promise<AIToolEntity> {
    if (!params.code || !params.name || !params.capability) {
      throw new ValidationError('Missing required fields for tool registration.');
    }

    if (AIToolRegistry.tools.has(params.code)) {
      throw new ValidationError(`Tool with code "${params.code}" is already registered.`);
    }

    const id = generateUUIDv7();
    const now = new Date().toISOString();

    const tool: AIToolEntity = {
      id,
      code: params.code,
      name: params.name,
      description: params.description,
      capability: params.capability,
      risk_class: params.risk_class,
      category: params.category,
      required_authorization: params.required_authorization || [],
      required_purpose: params.required_purpose,
      required_consent: params.required_consent || [],
      input_schema: params.input_schema || {},
      output_schema: params.output_schema || {},
      side_effect_type: params.side_effect_type || 'NONE',
      status: 'ACTIVE',
      version: params.version || '1.0.0',
      created_at: now,
      updated_at: now
    };

    AIToolRegistry.tools.set(tool.code, tool);
    return tool;
  }

  public static getTool(code: string): AIToolEntity {
    const tool = AIToolRegistry.tools.get(code);
    if (!tool) {
      throw new NotFoundError(`AI Tool "${code}" not found.`);
    }
    return tool;
  }

  public static listTools(): AIToolEntity[] {
    return Array.from(AIToolRegistry.tools.values());
  }

  public static resetForTesting(): void {
    AIToolRegistry.tools.clear();
    AIToolRegistry.seedDefaultTools();
  }
}
