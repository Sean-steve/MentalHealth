/**
 * MindOS Safety Bounded Context & Safety Kernel
 * Authority: Volumes I, V & Appendices B / C / G / P (ADR-003, ADR-010, ADR-018)
 * Owns: Risk state, safety policies, verified crisis resources, personal safety plans, trusted contacts
 * Invariant: Generative AI SHALL NOT be the sole authority for operational risk state/actions (R-SAFE-001).
 * Invariant: Only verified, unexpired crisis resources SHALL be presented as authoritative urgent contacts (R-SAFE-002).
 */

import { RiskState, SafetyEventState, validateStateTransition } from '../platform/shared/state_machines.js';
import { DataClassification } from '../platform/shared/data_classification.js';
import { generateUUIDv7 } from '../platform/database/uuid.js';
import { EventBus } from '../platform/events/index.js';
import { AuditService } from '../platform/audit/index.js';
import { DomainInvariantError, NotFoundError } from '../platform/errors/index.js';

// Export all comprehensive Clinical Safety Kernel modules
export * from './domain/types.js';
export * from './domain/errors.js';
export * from './signals/normalizer.js';
export * from './signals/deduplicator.js';
export * from './signals/taxonomy.js';
export * from './risk/hysteresis.js';
export * from './risk/state_machine.js';
export * from './policies/canonical_policies.js';
export * from './actions/action_generator.js';
export * from './actions/action_worker.js';
export * from './escalations/escalation_router.js';
export * from './escalations/escalation_queue.js';
export * from './review/reviewer_auth.js';
export * from './review/review_handler.js';
export * from './resources/resource_matcher.js';
export * from './resources/canonical_seed.js';
export * from './infrastructure/metrics.js';
export * from './infrastructure/alerts.js';
export * from './repositories/index.js';
export * from './application/signal_service.js';
export * from './application/risk_state_engine.js';
export * from './application/action_orchestrator.js';
export * from './application/escalation_service.js';
export * from './application/resource_registry_service.js';
export * from './application/break_glass_service.js';
export * from './application/reconciliation_service.js';
export * from './application/crisis_response_orchestrator.js';
export * from './adapters/index.js';
export * from './routes/safety_routes.js';

export interface CrisisResourceEntity {
  id: string; // UUIDv7
  country_code: string; // 'KE'
  region_code?: string;
  resource_type: 'EMERGENCY' | 'HOSPITAL' | 'CRISIS_LINE' | 'COMMUNITY_CRISIS';
  name: string;
  contact_json: {
    phone?: string;
    sms?: string;
    whatsapp?: string;
    website?: string;
    address?: string;
  };
  availability_json: {
    hours: string; // e.g. "24/7"
    free_of_charge: boolean;
    languages: string[];
  };
  languages: string[];
  verification_status: 'VERIFIED' | 'EXPIRED' | 'UNVERIFIED' | 'DISABLED';
  verified_at?: string;
  next_verify_at?: string;
  updated_at: string;
}

export interface RiskEventEntity {
  id: string; // UUIDv7
  user_id: string;
  source_domain: 'AI' | 'ASSESSMENT' | 'COMMUNITY' | 'USER_DIRECT';
  source_ref?: string;
  risk_category: 'SUICIDE_SELF_HARM' | 'HARM_TO_OTHERS' | 'ABUSE_COERCION' | 'PSYCHOSIS_EMERGENCY' | 'MEDICAL_EMERGENCY' | 'GENERAL_DISTRESS';
  previous_state?: RiskState;
  current_state: RiskState;
  signal_summary: Record<string, unknown>;
  policy_version: string;
  detected_at: string;
  resolved_at?: string;
}

export interface SafetyPlanEntity {
  id: string;
  user_id: string;
  version: number;
  encrypted_content: string;
  share_policy: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export class SafetyKernel {
  private static verifiedCrisisResources: Map<string, CrisisResourceEntity> = new Map();
  private static userRiskStates: Map<string, RiskState> = new Map();
  private static activeRiskEvents: Map<string, RiskEventEntity> = new Map();
  private static safetyPlans: Map<string, SafetyPlanEntity> = new Map();

  static {
    // Seed canonical verified Kenyan crisis resources (Appendix G & Volume V)
    SafetyKernel.seedCanonicalResources();
  }

  public static seedCanonicalResources(): void {
    const resources: Array<Omit<CrisisResourceEntity, 'id' | 'updated_at'>> = [
      {
        country_code: 'KE',
        resource_type: 'CRISIS_LINE',
        name: 'Befrienders Kenya Helpline',
        contact_json: {
          phone: '+254 722 178 177',
          website: 'https://www.befrienderskenya.org'
        },
        availability_json: {
          hours: '24/7',
          free_of_charge: true,
          languages: ['English', 'Swahili']
        },
        languages: ['English', 'Swahili'],
        verification_status: 'VERIFIED',
        verified_at: '2026-08-01T00:00:00.000Z',
        next_verify_at: '2026-11-01T00:00:00.000Z'
      },
      {
        country_code: 'KE',
        resource_type: 'EMERGENCY',
        name: 'National Emergency Response Helpline (Kenya)',
        contact_json: {
          phone: '999',
          sms: '1199'
        },
        availability_json: {
          hours: '24/7',
          free_of_charge: true,
          languages: ['English', 'Swahili']
        },
        languages: ['English', 'Swahili'],
        verification_status: 'VERIFIED',
        verified_at: '2026-08-01T00:00:00.000Z',
        next_verify_at: '2026-11-01T00:00:00.000Z'
      },
      {
        country_code: 'KE',
        resource_type: 'HOSPITAL',
        name: 'Mathari National Teaching and Referral Hospital',
        contact_json: {
          phone: '+254 20 233 7694',
          address: 'Thika Superhighway, Nairobi, Kenya'
        },
        availability_json: {
          hours: '24/7 Emergency Wing',
          free_of_charge: false,
          languages: ['English', 'Swahili']
        },
        languages: ['English', 'Swahili'],
        verification_status: 'VERIFIED',
        verified_at: '2026-08-01T00:00:00.000Z',
        next_verify_at: '2026-11-01T00:00:00.000Z'
      }
    ];

    for (const res of resources) {
      const id = generateUUIDv7();
      SafetyKernel.verifiedCrisisResources.set(id, {
        ...res,
        id,
        updated_at: new Date().toISOString()
      });
    }
  }

  /**
   * Evaluates input signals and enforces deterministic safety state transition
   * R-SAFE-001: Generative AI cannot determine final risk state
   */
  public static evaluateRiskSignal(params: {
    userId: string;
    sourceDomain: RiskEventEntity['source_domain'] | string;
    riskCategory: RiskEventEntity['risk_category'] | string;
    signals: Record<string, unknown>;
    policyVersion?: string;
  }): { event: RiskEventEntity; requiresSafetyOverride: boolean; urgentResources: CrisisResourceEntity[] } {
    const previousState = SafetyKernel.userRiskStates.get(params.userId) || RiskState.UNKNOWN;
    const policyVersion = params.policyVersion || '2.0.0';

    // Deterministic policy evaluation
    let targetState: RiskState = RiskState.NO_CONCERN;
    if (params.riskCategory === 'SUICIDE_SELF_HARM') {
      const explicitDanger = params.signals.immediate_danger === true || params.signals.intent === 'active';
      targetState = explicitDanger ? RiskState.URGENT : RiskState.HIGH;
    } else if (params.riskCategory === 'MEDICAL_EMERGENCY') {
      targetState = RiskState.URGENT;
    } else if (params.riskCategory === 'ABUSE_COERCION') {
      targetState = RiskState.ELEVATED;
    }

    // SP-004: Topic change alone must not reset active elevated/high/urgent risk state
    if (
      (previousState === RiskState.URGENT || previousState === RiskState.HIGH) &&
      targetState === RiskState.NO_CONCERN
    ) {
      // Must not silently drop without formal resolution
      targetState = previousState;
    }

    validateStateTransition('RiskState', previousState, targetState, params.userId);
    SafetyKernel.userRiskStates.set(params.userId, targetState);

    const eventId = generateUUIDv7();
    const now = new Date().toISOString();
    const event: RiskEventEntity = {
      id: eventId,
      user_id: params.userId,
      source_domain: params.sourceDomain as RiskEventEntity['source_domain'],
      risk_category: params.riskCategory as RiskEventEntity['risk_category'],
      previous_state: previousState,
      current_state: targetState,
      signal_summary: params.signals,
      policy_version: policyVersion,
      detected_at: now
    };

    SafetyKernel.activeRiskEvents.set(eventId, event);

    // Enqueue priority safety event
    EventBus.enqueue(
      'safety.state_changed',
      'safety',
      eventId,
      DataClassification.HEALTH_SENSITIVE,
      {
        risk_event_id: eventId,
        user_id: params.userId,
        from_state: previousState,
        to_state: targetState,
        policy_version: policyVersion
      }
    );

    AuditService.record({
      actor_type: 'SERVICE',
      action: 'SAFETY.STATE_TRANSITION',
      resource_type: 'risk_events',
      resource_id: eventId,
      purpose: 'Operational Safety Triage',
      authorization_basis: { policy_version: policyVersion },
      result: 'ALLOWED',
      metadata: { previousState, targetState, riskCategory: params.riskCategory }
    });

    const isUrgent = targetState === RiskState.URGENT || targetState === RiskState.HIGH;
    const urgentResources = isUrgent ? SafetyKernel.getVerifiedCrisisResources('KE') : [];

    return {
      event,
      requiresSafetyOverride: isUrgent,
      urgentResources
    };
  }

  /**
   * Retrieves verified unexpired crisis resources
   * R-SAFE-002: Only verified, unexpired resources can be presented
   */
  public static getVerifiedCrisisResources(countryCode = 'KE'): CrisisResourceEntity[] {
    const now = Date.now();
    const valid: CrisisResourceEntity[] = [];

    for (const res of SafetyKernel.verifiedCrisisResources.values()) {
      if (res.country_code === countryCode && res.verification_status === 'VERIFIED') {
        if (res.next_verify_at) {
          const expiry = new Date(res.next_verify_at).getTime();
          if (expiry <= now) {
            // Expired! Must not serve.
            continue;
          }
        }
        valid.push(res);
      }
    }

    return valid;
  }

  public static getUserRiskState(userId: string): RiskState {
    return SafetyKernel.userRiskStates.get(userId) || RiskState.UNKNOWN;
  }

  public static resetForTesting(): void {
    SafetyKernel.verifiedCrisisResources.clear();
    SafetyKernel.userRiskStates.clear();
    SafetyKernel.activeRiskEvents.clear();
    SafetyKernel.safetyPlans.clear();
    SafetyKernel.seedCanonicalResources();
  }
}
