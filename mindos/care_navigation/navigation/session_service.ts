/**
 * MindOS Care Navigation Session Service
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
 * Clinical Safety Policy Catalogue (R-SAFE-001, R-NAV-001..010)
 */

import {
  NavigationSessionEntity,
  NavigationSessionState,
  CareLevel,
  CarePathwayState,
  RiskState
} from '../domain/types.js';
import { CareRecommender, NeedEvaluationInput } from './recommender.js';
import { CarePathwayRegistry } from '../registry/pathway_registry.js';
import { CareNavigationInvariants } from '../domain/invariants.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { AuditService } from '../../platform/audit/index.js';
import { NotFoundError, DomainInvariantError } from '../../platform/errors/index.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';
import { SafetyKernel } from '../../safety/index.js';

export class NavigationSessionService {
  private static sessions: Map<string, NavigationSessionEntity> = new Map();

  public static async startSession(params: {
    userId: string;
    declaredNeeds?: Record<string, unknown>;
    assessmentResultIds?: string[];
  }): Promise<NavigationSessionEntity> {
    const id = generateUUIDv7();
    const now = new Date().toISOString();
    const riskSnapshot = SafetyKernel.getUserRiskState(params.userId);

    const session: NavigationSessionEntity = {
      id,
      user_id: params.userId,
      status: NavigationSessionState.CREATED,
      risk_state_snapshot: riskSnapshot,
      declared_needs: params.declaredNeeds || {},
      assessment_result_ids: params.assessmentResultIds || [],
      recommended_pathways: [],
      safety_override: riskSnapshot === RiskState.URGENT || riskSnapshot === RiskState.HIGH,
      created_at: now,
      updated_at: now
    };

    NavigationSessionService.sessions.set(id, session);

    EventBus.enqueue(
      'care_navigation.session_started',
      'care_navigation',
      id,
      DataClassification.SENSITIVE,
      {
        session_id: id,
        user_id: params.userId,
        risk_snapshot: riskSnapshot,
        safety_override: session.safety_override
      }
    );

    AuditService.record({
      actor_type: 'USER',
      actor_id: params.userId,
      action: 'CARE_NAVIGATION.SESSION.STARTED',
      resource_type: 'navigation_session',
      resource_id: id,
      purpose: 'Care Navigation Initiation',
      authorization_basis: { user_id: params.userId },
      result: 'ALLOWED'
    });

    return session;
  }

  public static async evaluateSession(
    sessionId: string,
    inputs?: Partial<NeedEvaluationInput>
  ): Promise<NavigationSessionEntity> {
    const session = NavigationSessionService.requireSession(sessionId);

    // State transition to IN_PROGRESS if CREATED
    if (session.status === NavigationSessionState.CREATED) {
      validateStateTransition(
        'NavigationSessionState',
        session.status,
        NavigationSessionState.IN_PROGRESS,
        session.id
      );
      session.status = NavigationSessionState.IN_PROGRESS;
    }

    const declaredConcerns = inputs?.declaredConcerns || (session.declared_needs?.concerns as string[]) || [];
    const declaredDomain = inputs?.declaredDomain || (session.declared_needs?.domain as string);

    const classification = CareRecommender.classifySupportNeed({
      declaredDomain,
      declaredConcerns,
      assessmentBaselines: inputs?.assessmentBaselines || [],
      userPreferences: inputs?.userPreferences,
      userId: session.user_id
    });

    const isSafetyOverride = Boolean(
      classification.safety_override_triggered ||
      session.risk_state_snapshot === RiskState.URGENT ||
      session.risk_state_snapshot === RiskState.HIGH
    );

    session.classified_need = {
      user_id: session.user_id,
      primary_domain: classification.primary_domain,
      secondary_domains: classification.secondary_domains || [],
      acuity: classification.acuity || classification.assessed_acuity,
      recommended_care_level: classification.recommended_care_level,
      assessment_baselines: inputs?.assessmentBaselines || [],
      risk_state: isSafetyOverride ? RiskState.URGENT : session.risk_state_snapshot,
      user_preferences: inputs?.userPreferences || {},
      clinical_rationale: classification.clinical_rationale,
      evaluated_at: new Date().toISOString()
    };

    session.recommended_pathways = CareRecommender.recommendPathways(classification);
    session.safety_override = isSafetyOverride;
    session.urgent_escalation_required = isSafetyOverride;
    session.emergency_escalated = isSafetyOverride;

    // Transition to OPTIONS_READY / NEEDS_EVALUATED
    validateStateTransition(
      'NavigationSessionState',
      session.status,
      NavigationSessionState.OPTIONS_READY,
      session.id
    );
    session.status = NavigationSessionState.OPTIONS_READY;
    session.updated_at = new Date().toISOString();

    EventBus.enqueue(
      'care_navigation.support_need_classified',
      'care_navigation',
      session.id,
      DataClassification.SENSITIVE,
      {
        session_id: session.id,
        user_id: session.user_id,
        primary_domain: session.classified_need.primary_domain,
        care_level: session.classified_need.recommended_care_level,
        acuity: session.classified_need.acuity
      }
    );

    if (isSafetyOverride) {
      EventBus.enqueue(
        'care_navigation.escalated_to_safety',
        'care_navigation',
        session.id,
        DataClassification.CRITICAL,
        {
          session_id: session.id,
          user_id: session.user_id,
          risk_state: session.classified_need.risk_state,
          reason: 'Authoritative Safety Kernel crisis state engaged.'
        }
      );
    }

    return session;
  }

  public static async selectPathway(
    sessionId: string,
    pathwayId: string
  ): Promise<{
    session: NavigationSessionEntity;
    selectedPathway: any;
    referralRequired: boolean;
  }> {
    const session = NavigationSessionService.requireSession(sessionId);
    const pathway = CarePathwayRegistry.requirePathway(pathwayId);

    // Invariant: Must be ACTIVE pathway
    CareNavigationInvariants.assertPathwayActive(pathway);

    // Invariant: Safety override compatibility
    CareNavigationInvariants.assertSafetyStateCompatibility(
      session.classified_need?.risk_state || session.risk_state_snapshot,
      pathway.care_level
    );

    // State transition
    validateStateTransition(
      'NavigationSessionState',
      session.status,
      NavigationSessionState.PATHWAY_SELECTED,
      session.id
    );

    session.status = NavigationSessionState.PATHWAY_SELECTED;
    session.selected_pathway_id = pathway.id;
    session.updated_at = new Date().toISOString();

    const referralRequired =
      pathway.care_level === CareLevel.LEVEL_2 ||
      pathway.care_level === CareLevel.LEVEL_3 ||
      pathway.care_level === CareLevel.LEVEL_4 ||
      pathway.care_level === CareLevel.LEVEL_EMERGENCY;

    if (referralRequired) {
      validateStateTransition(
        'NavigationSessionState',
        session.status,
        NavigationSessionState.REFERRAL_REQUIRED,
        session.id
      );
      session.status = NavigationSessionState.REFERRAL_REQUIRED;
    } else {
      validateStateTransition(
        'NavigationSessionState',
        session.status,
        NavigationSessionState.COMPLETED,
        session.id
      );
      session.status = NavigationSessionState.COMPLETED;
      session.completed_at = new Date().toISOString();
    }

    EventBus.enqueue(
      'care_navigation.pathway_selected',
      'care_navigation',
      session.id,
      DataClassification.SENSITIVE,
      {
        session_id: session.id,
        user_id: session.user_id,
        pathway_id: pathway.id,
        care_level: pathway.care_level,
        referral_required: referralRequired
      }
    );

    return {
      session,
      selectedPathway: pathway,
      referralRequired
    };
  }

  public static getSession(sessionId: string): NavigationSessionEntity | undefined {
    return NavigationSessionService.sessions.get(sessionId);
  }

  public static requireSession(sessionId: string): NavigationSessionEntity {
    const s = NavigationSessionService.getSession(sessionId);
    if (!s) {
      throw new NotFoundError(`Care navigation session "${sessionId}" not found.`);
    }
    return s;
  }

  public static listUserSessions(userId: string): NavigationSessionEntity[] {
    return Array.from(NavigationSessionService.sessions.values())
      .filter(s => s.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public static reset(): void {
    NavigationSessionService.sessions.clear();
  }

  public static resetForTesting(): void {
    NavigationSessionService.sessions.clear();
  }
}
