/**
 * MindOS AI System Registry
 * Authority: Volumes IV, XV & Appendices B / C / H
 * Governs AI System lifecycle, registration, version tracking, and link to GovernedResource.
 */

import { AISystemEntity, AISystemState, AISystemType } from '../domain/types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';
import { ValidationError, NotFoundError } from '../../platform/errors/index.js';
import { EventBus } from '../../platform/events/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { AIRiskClassificationEngine } from '../domain/risk_classifier.js';

export class AISystemRegistry {
  private static systems: Map<string, AISystemEntity> = new Map();
  private static systemsByCode: Map<string, string> = new Map();

  public static async registerSystem(params: {
    code: string;
    name: string;
    description: string;
    system_type: AISystemType;
    owner_domain: string;
    owner: string;
    purpose: string;
    user_population?: string[];
    jurisdictions?: string[];
    clinical_relevance?: boolean;
    safety_relevance?: boolean;
    data_categories?: string[];
  }): Promise<AISystemEntity> {
    if (!params.code || !params.name || !params.owner || !params.purpose) {
      throw new ValidationError('Missing required AI System registration fields (code, name, owner, purpose).');
    }

    if (AISystemRegistry.systemsByCode.has(params.code)) {
      throw new ValidationError(`AI System with code "${params.code}" is already registered.`);
    }

    const id = generateUUIDv7();
    const jurisdictions = params.jurisdictions || ['KE'];
    const user_population = params.user_population || ['ADULTS_18_PLUS'];
    const data_categories = params.data_categories || [];

    // Derive risk class using canonical classification engine
    const classification = AIRiskClassificationEngine.classify({
      system_type: params.system_type,
      user_population,
      jurisdictions,
      data_categories,
      tool_categories: [],
      clinical_relevance: Boolean(params.clinical_relevance),
      safety_relevance: params.safety_relevance !== false,
      autonomous_action: false
    });

    const now = new Date().toISOString();
    const system: AISystemEntity = {
      id,
      code: params.code,
      name: params.name,
      description: params.description,
      system_type: params.system_type,
      owner_domain: params.owner_domain || 'clinical',
      owner: params.owner,
      purpose: params.purpose,
      user_population,
      jurisdictions,
      risk_class: classification.risk_class,
      state: AISystemState.REGISTERED,
      clinical_relevance: Boolean(params.clinical_relevance),
      safety_relevance: params.safety_relevance !== false,
      data_categories,
      created_at: now,
      updated_at: now
    };

    AISystemRegistry.systems.set(id, system);
    AISystemRegistry.systemsByCode.set(system.code, id);

    // Emit domain event
    EventBus.enqueue(
      'ai.system_registered',
      'ai_safety_governance',
      id,
      DataClassification.INTERNAL,
      {
        system_id: id,
        system_code: system.code,
        system_type: system.system_type,
        risk_class: system.risk_class,
        owner: system.owner,
        jurisdictions: system.jurisdictions,
        occurred_at: now
      }
    );

    return system;
  }

  public static getSystem(idOrCode: string): AISystemEntity {
    const id = AISystemRegistry.systemsByCode.get(idOrCode) || idOrCode;
    const system = AISystemRegistry.systems.get(id);
    if (!system) {
      throw new NotFoundError(`AI System "${idOrCode}" not found in AI System Registry.`);
    }
    return system;
  }

  public static getSystemByCode(code: string): AISystemEntity {
    return AISystemRegistry.getSystem(code);
  }

  public static listSystems(): AISystemEntity[] {
    return Array.from(AISystemRegistry.systems.values());
  }

  public static transitionState(systemId: string, newState: AISystemState, actorId: string): AISystemEntity {
    const system = AISystemRegistry.getSystem(systemId);
    validateStateTransition('AISystemState', system.state, newState, system.id, actorId);
    system.state = newState;
    system.updated_at = new Date().toISOString();
    return system;
  }

  public static updateState(systemId: string, newState: AISystemState, actorId: string = 'SYSTEM'): AISystemEntity {
    const system = AISystemRegistry.getSystem(systemId);
    if (system.state === newState) return system;
    if (system.state === AISystemState.REGISTERED && newState === AISystemState.ACTIVE) {
      AISystemRegistry.transitionState(systemId, AISystemState.APPROVED, actorId);
      return AISystemRegistry.transitionState(systemId, AISystemState.ACTIVE, actorId);
    }
    return AISystemRegistry.transitionState(systemId, newState, actorId);
  }

  public static updateCurrentConfig(systemId: string, version: string): void {
    const system = AISystemRegistry.getSystem(systemId);
    system.current_configuration_version = version;
    system.updated_at = new Date().toISOString();
  }

  public static resetForTesting(): void {
    AISystemRegistry.systems.clear();
    AISystemRegistry.systemsByCode.clear();
  }
}
