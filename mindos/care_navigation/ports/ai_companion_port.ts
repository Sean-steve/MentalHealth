/**
 * MindOS Care Navigation AI Companion Port
 * Authority: Master Architecture Index Section 7, Volumes I, IV, XV
 * Invariant: AI Companion runtime CANNOT autonomously create/dispatch referrals (R-NAV-008).
 * AI can only initiate navigation sessions, read recommended pathways, and explain stepped-care options.
 */

import { NavigationSessionService } from '../navigation/session_service.js';
import { CarePathwayRegistry } from '../registry/pathway_registry.js';
import { CarePathwayEntity, PathwayRecommendation, SupportNeedDomain } from '../domain/types.js';
import { DomainInvariantError } from '../../platform/errors/index.js';

export interface AICareOptionsResult {
  sessionId: string;
  primaryDomain: SupportNeedDomain;
  recommendedCareLevel: string;
  recommendations: Array<{
    code: string;
    name: string;
    careLevel: string;
    matchScore: number;
    reasons: string[];
    description: string;
  }>;
  safetyOverride: boolean;
  statutoryDisclaimer: string;
}

export class AICareNavigationPort {
  /**
   * Starts a care navigation session via the AI Companion
   */
  public static async startNavigation(params: {
    userId: string;
    declaredDomain?: string;
    declaredConcerns?: string[];
  }): Promise<{ sessionId: string; status: string; safetyOverride: boolean }> {
    const session = await NavigationSessionService.startSession({
      userId: params.userId,
      declaredNeeds: {
        domain: params.declaredDomain,
        concerns: params.declaredConcerns
      }
    });

    const evaluated = await NavigationSessionService.evaluateSession(session.id, {
      declaredDomain: params.declaredDomain as any,
      declaredConcerns: params.declaredConcerns
    });

    return {
      sessionId: evaluated.id,
      status: evaluated.status,
      safetyOverride: evaluated.safety_override
    };
  }

  /**
   * Retrieves recommended care options for the user
   */
  public static async getCareOptions(sessionId: string): Promise<AICareOptionsResult> {
    const session = NavigationSessionService.requireSession(sessionId);

    return {
      sessionId: session.id,
      primaryDomain: session.classified_need?.primary_domain || SupportNeedDomain.GENERAL_WELLBEING,
      recommendedCareLevel: session.classified_need?.recommended_care_level || 'LEVEL_0',
      recommendations: session.recommended_pathways.map(r => ({
        code: r.pathway.code,
        name: r.pathway.name,
        careLevel: r.pathway.care_level,
        matchScore: r.match_score,
        reasons: r.match_reasons,
        description: r.pathway.description
      })),
      safetyOverride: session.safety_override,
      statutoryDisclaimer: 'Notice: Stepped-care guidance provided by MindOS is not a medical diagnosis.'
    };
  }

  /**
   * Reads details of a specific care pathway
   */
  public static getPathwayDetails(pathwayCode: string): CarePathwayEntity {
    return CarePathwayRegistry.requirePathway(pathwayCode);
  }

  /**
   * Autonomous referral creation is STRICTLY FORBIDDEN for AI agents (R-NAV-008)
   */
  public static assertAIProhibitedFromReferralDispatch(): void {
    throw new DomainInvariantError(
      'R-NAV-008: AI Companion is strictly prohibited from autonomously dispatching clinical referrals or selecting unverified providers.'
    );
  }
}
