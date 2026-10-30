/**
 * MindOS Care Navigation Recommender & Support Need Classifier
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
 * Clinical Safety Policy Catalogue (R-SAFE-001, R-NAV-001, R-NAV-005)
 */

import {
  SupportNeed,
  SupportNeedDomain,
  NeedAcuity,
  PathwayAcuity,
  CareLevel,
  ReferralUrgency,
  PathwayRecommendation,
  AssessmentBaseline,
  RiskState,
  CarePathwayEntity,
  CarePathwayState
} from '../domain/types.js';
import { CarePathwayRegistry } from '../registry/pathway_registry.js';
import { SafetyKernel } from '../../safety/index.js';
import { CareNavigationInvariants } from '../domain/invariants.js';

export interface NeedEvaluationInput {
  userId: string;
  declaredDomain?: string | SupportNeedDomain;
  declaredConcerns?: string[];
  assessmentBaselines?: AssessmentBaseline[];
  userPreferences?: {
    modality?: any;
    language?: string;
    jurisdiction?: string;
    urgency_preference?: ReferralUrgency;
  };
}

export class CareRecommender {
  /**
   * Deterministically classifies support need from declared concerns, domain, and screening baselines
   */
  public static classifySupportNeed(input: {
    declaredDomain?: SupportNeedDomain | string;
    declaredConcerns?: string[];
    assessmentBaselines?: AssessmentBaseline[];
    userPreferences?: any;
    userId?: string;
  }): {
    primary_domain: SupportNeedDomain;
    secondary_domains: SupportNeedDomain[];
    assessed_acuity: PathwayAcuity;
    acuity: PathwayAcuity;
    recommended_care_level: CareLevel;
    safety_override_triggered: boolean;
    clinical_rationale: string;
  } {
    const concerns = (input.declaredConcerns || []).map(c => String(c).toLowerCase());
    const domainStr = String(input.declaredDomain || '').toUpperCase();

    const hasCrisisIndicators =
      concerns.some(c =>
        c.includes('crisis') ||
        c.includes('suicid') ||
        c.includes('harm') ||
        c.includes('cannot go on') ||
        c.includes('kill')
      ) ||
      input.declaredDomain === SupportNeedDomain.TRAUMA_CRISIS ||
      input.declaredDomain === SupportNeedDomain.ACUTE_CRISIS ||
      domainStr.includes('CRISIS');

    if (hasCrisisIndicators) {
      return {
        primary_domain: (input.declaredDomain as SupportNeedDomain) || SupportNeedDomain.TRAUMA_CRISIS,
        secondary_domains: [SupportNeedDomain.DEPRESSION_MOOD],
        assessed_acuity: PathwayAcuity.ACUTE,
        acuity: PathwayAcuity.ACUTE,
        recommended_care_level: CareLevel.LEVEL_4,
        safety_override_triggered: true,
        clinical_rationale: 'Crisis safety markers detected in user declaration. Escalating to Level 4 acute response.'
      };
    }

    const baselines = input.assessmentBaselines || [];
    const phq9 = baselines.find(b => b.instrument_code === 'PHQ-9')?.score ?? 0;
    const gad7 = baselines.find(b => b.instrument_code === 'GAD-7')?.score ?? 0;

    let acuity = PathwayAcuity.MILD;
    let careLevel = CareLevel.LEVEL_0;

    if (phq9 >= 15 || gad7 >= 15) {
      acuity = PathwayAcuity.SEVERE;
      careLevel = CareLevel.LEVEL_3;
    } else if (phq9 >= 10 || gad7 >= 10) {
      acuity = PathwayAcuity.MODERATE;
      careLevel = CareLevel.LEVEL_2;
    } else if (concerns.length > 0) {
      acuity = PathwayAcuity.MILD;
      careLevel = CareLevel.LEVEL_1;
    } else {
      acuity = PathwayAcuity.MILD;
      careLevel = CareLevel.LEVEL_0;
    }

    let primaryDomain = (input.declaredDomain as SupportNeedDomain) || SupportNeedDomain.GENERAL_WELLBEING;
    if (!input.declaredDomain) {
      if (phq9 >= 10 && phq9 >= gad7) primaryDomain = SupportNeedDomain.DEPRESSION;
      else if (gad7 >= 10) primaryDomain = SupportNeedDomain.ANXIETY;
      else if (concerns.some(c => c.includes('burnout') || c.includes('work'))) primaryDomain = SupportNeedDomain.STRESS_BURNOUT;
    }

    return {
      primary_domain: primaryDomain,
      secondary_domains: [],
      assessed_acuity: acuity,
      acuity,
      recommended_care_level: careLevel,
      safety_override_triggered: false,
      clinical_rationale: `Classified ${acuity} acuity with recommended care level ${careLevel}.`
    };
  }

  /**
   * Generates scored and ranked pathway recommendations
   */
  public static recommendPathways(
    classification: any,
    pathways?: CarePathwayEntity[]
  ): PathwayRecommendation[] {
    const list = pathways || CarePathwayRegistry.listPathways();
    const recommendations: PathwayRecommendation[] = [];

    const isSafetyOverride = Boolean(
      classification.safety_override_triggered ||
      classification.safety_override ||
      classification.risk_state === RiskState.URGENT ||
      classification.assessed_acuity === PathwayAcuity.ACUTE ||
      classification.acuity === NeedAcuity.CRITICAL
    );

    for (const rawPathway of list) {
      const pathway: any = {
        ...rawPathway,
        primary_domains: rawPathway.primary_domains || rawPathway.target_need_domains || []
      };

      let score = 0;
      const reasons: string[] = [];

      if (isSafetyOverride) {
        if (
          pathway.care_level === CareLevel.LEVEL_4 ||
          pathway.care_level === CareLevel.LEVEL_EMERGENCY
        ) {
          if (pathway.emergency_escalation_targets?.includes('1199') || pathway.code === 'PATH-CRISIS-L4') {
            score = 100;
          } else {
            score = 90;
          }
          reasons.push('Immediate crisis intervention target with emergency escalations.');
        } else {
          score = 10;
          reasons.push('Secondary pathway available post-crisis stabilization.');
        }
      } else {
        const domain = classification.primary_domain || classification.primaryDomain;
        const pDomains = pathway.primary_domains || [];
        const isDomainMatch = pDomains.includes(domain) ||
          (domain === SupportNeedDomain.ANXIETY && (pDomains.includes(SupportNeedDomain.ANXIETY_STRESS) || pDomains.includes(SupportNeedDomain.ANXIETY))) ||
          (domain === SupportNeedDomain.DEPRESSION && (pDomains.includes(SupportNeedDomain.DEPRESSION_MOOD) || pDomains.includes(SupportNeedDomain.DEPRESSION))) ||
          (domain === SupportNeedDomain.STRESS_BURNOUT && (pDomains.includes(SupportNeedDomain.WORKPLACE_BURNOUT) || pDomains.includes(SupportNeedDomain.STRESS_BURNOUT)));

        if (isDomainMatch) {
          score += 50;
          reasons.push(`Direct primary need domain alignment (${domain}).`);
        }

        const recCareLevel = classification.recommended_care_level || classification.recommendedCareLevel;
        if (pathway.care_level === recCareLevel) {
          score += 40;
          reasons.push(`Direct stepped-care level match (${pathway.care_level}).`);
        } else if (
          (recCareLevel === CareLevel.LEVEL_1 && (pathway.care_level === CareLevel.LEVEL_0 || pathway.care_level === CareLevel.LEVEL_2)) ||
          (recCareLevel === CareLevel.LEVEL_2 && (pathway.care_level === CareLevel.LEVEL_1 || pathway.care_level === CareLevel.LEVEL_3)) ||
          (recCareLevel === CareLevel.LEVEL_3 && (pathway.care_level === CareLevel.LEVEL_2 || pathway.care_level === CareLevel.LEVEL_4))
        ) {
          score += 20;
          reasons.push(`Adjacent care level option (${pathway.care_level}).`);
        }

        if (score === 0) {
          score = 20;
          reasons.push('General stepped-care support option.');
        }
      }

      recommendations.push({
        pathway,
        match_score: score > 0 ? (score > 1 ? score / 100 : score) : 0.1,
        match_reasons: reasons
      });
    }

    return recommendations.sort((a, b) => b.match_score - a.match_score);
  }

  /**
   * Classifies user support need deterministically and evaluates matching pathways
   */
  public static evaluateNeed(input: NeedEvaluationInput): {
    classifiedNeed: SupportNeed;
    recommendations: PathwayRecommendation[];
    safetyOverrideActive: boolean;
  } {
    const riskState = SafetyKernel.getUserRiskState(input.userId);
    const baselines = input.assessmentBaselines || [];

    // 1. Resolve Primary & Secondary Need Domains
    const { primaryDomain, secondaryDomains } = this.resolveDomains(input);

    // 2. Classify Acuity from Risk State & Assessment Baselines
    const acuity = this.classifyAcuity(riskState, baselines);

    // 3. Determine Stepped Care Level
    const recommendedCareLevel = this.determineCareLevel(riskState, acuity, primaryDomain);

    // 4. Formulate Clinical Rationale
    const rationale = this.generateRationale(riskState, acuity, recommendedCareLevel, baselines);

    const classifiedNeed: SupportNeed = {
      user_id: input.userId,
      primary_domain: primaryDomain,
      secondary_domains: secondaryDomains,
      acuity,
      recommended_care_level: recommendedCareLevel,
      assessment_baselines: baselines,
      risk_state: riskState,
      user_preferences: input.userPreferences || {},
      clinical_rationale: rationale,
      evaluated_at: new Date().toISOString()
    };

    // 5. Match Pathways
    const isSafetyOverride = riskState === RiskState.URGENT || riskState === RiskState.HIGH;
    const recommendations = this.matchPathways(classifiedNeed, isSafetyOverride);

    return {
      classifiedNeed,
      recommendations,
      safetyOverrideActive: isSafetyOverride
    };
  }

  private static resolveDomains(input: NeedEvaluationInput): {
    primaryDomain: SupportNeedDomain;
    secondaryDomains: SupportNeedDomain[];
  } {
    if (input.declaredDomain && Object.values(SupportNeedDomain).includes(input.declaredDomain as SupportNeedDomain)) {
      return {
        primaryDomain: input.declaredDomain as SupportNeedDomain,
        secondaryDomains: []
      };
    }

    const concerns = (input.declaredConcerns || []).map(c => c.toLowerCase());
    if (concerns.some(c => c.includes('crisis') || c.includes('suicid') || c.includes('harm'))) {
      return { primaryDomain: SupportNeedDomain.ACUTE_CRISIS, secondaryDomains: [SupportNeedDomain.DEPRESSION_MOOD] };
    }
    if (concerns.some(c => c.includes('depress') || c.includes('sad') || c.includes('hopeless') || c.includes('mood'))) {
      return { primaryDomain: SupportNeedDomain.DEPRESSION_MOOD, secondaryDomains: [SupportNeedDomain.ANXIETY_STRESS] };
    }
    if (concerns.some(c => c.includes('anxi') || c.includes('panic') || c.includes('stress') || c.includes('worry'))) {
      return { primaryDomain: SupportNeedDomain.ANXIETY_STRESS, secondaryDomains: [SupportNeedDomain.SLEEP_HYGIENE] };
    }
    if (concerns.some(c => c.includes('burnout') || c.includes('work') || c.includes('exhaust'))) {
      return { primaryDomain: SupportNeedDomain.WORKPLACE_BURNOUT, secondaryDomains: [SupportNeedDomain.ANXIETY_STRESS] };
    }
    if (concerns.some(c => c.includes('sleep') || c.includes('insomnia'))) {
      return { primaryDomain: SupportNeedDomain.SLEEP_HYGIENE, secondaryDomains: [SupportNeedDomain.ANXIETY_STRESS] };
    }

    return {
      primaryDomain: SupportNeedDomain.GENERAL_WELLBEING,
      secondaryDomains: []
    };
  }

  private static classifyAcuity(riskState: RiskState, baselines: AssessmentBaseline[]): NeedAcuity {
    if (riskState === RiskState.URGENT) {
      return NeedAcuity.CRITICAL;
    }
    if (riskState === RiskState.HIGH) {
      return NeedAcuity.CRITICAL;
    }

    const phq9 = baselines.find(b => b.instrument_code === 'PHQ-9')?.score ?? 0;
    const gad7 = baselines.find(b => b.instrument_code === 'GAD-7')?.score ?? 0;

    if (phq9 >= 20 || gad7 >= 15) {
      return NeedAcuity.SEVERE;
    }
    if (phq9 >= 10 || gad7 >= 10) {
      return NeedAcuity.MODERATE;
    }
    return NeedAcuity.MILD;
  }

  private static determineCareLevel(riskState: RiskState, acuity: NeedAcuity, domain: SupportNeedDomain): CareLevel {
    if (riskState === RiskState.URGENT || domain === SupportNeedDomain.ACUTE_CRISIS) {
      return CareLevel.LEVEL_EMERGENCY;
    }
    if (riskState === RiskState.HIGH) {
      return CareLevel.LEVEL_EMERGENCY;
    }

    switch (acuity) {
      case NeedAcuity.CRITICAL:
        return CareLevel.LEVEL_EMERGENCY;
      case NeedAcuity.SEVERE:
        return CareLevel.LEVEL_3;
      case NeedAcuity.MODERATE:
        return CareLevel.LEVEL_2;
      case NeedAcuity.MILD:
      default:
        return CareLevel.LEVEL_0;
    }
  }

  private static generateRationale(
    riskState: RiskState,
    acuity: NeedAcuity,
    careLevel: CareLevel,
    baselines: AssessmentBaseline[]
  ): string {
    if (careLevel === CareLevel.LEVEL_EMERGENCY) {
      return 'Authoritative crisis protocol engaged due to elevated safety indicators. Immediate crisis line and emergency services are prioritized.';
    }

    const baselineStr = baselines.length > 0
      ? baselines.map(b => `${b.instrument_code} score of ${b.score} (${b.band})`).join(', ')
      : 'User self-report and symptom reflection';

    return `Based on ${baselineStr}, symptoms align with ${acuity.toLowerCase()} acuity. Stepped-care recommendation is ${careLevel}. ${CareNavigationInvariants.STATUTORY_DISCLAIMER}`;
  }

  private static matchPathways(need: SupportNeed, isSafetyOverride: boolean): PathwayRecommendation[] {
    const allPathways = CarePathwayRegistry.listPathways({ state: CarePathwayState.ACTIVE });
    const scored: PathwayRecommendation[] = [];

    for (const pathway of allPathways) {
      // Check exclusions
      if (pathway.exclusion_criteria.active_risk_states?.includes(need.risk_state)) {
        continue;
      }

      let score = 0;
      const reasons: string[] = [];

      // 1. Safety Override Priority
      if (isSafetyOverride) {
        if (pathway.care_level === CareLevel.LEVEL_EMERGENCY) {
          score = 100;
          reasons.push('Immediate crisis intervention required by Safety Kernel.');
        } else {
          // Down-rank non-emergency pathways during crisis
          score = 10;
          reasons.push('Secondary pathway available post-crisis resolution.');
        }
      } else {
        // 2. Care Level Alignment (up to 40 pts)
        if (pathway.care_level === need.recommended_care_level) {
          score += 40;
          reasons.push(`Direct stepped-care level match (${pathway.care_level}).`);
        } else if (
          (need.recommended_care_level === CareLevel.LEVEL_0 && pathway.care_level === CareLevel.LEVEL_1) ||
          (need.recommended_care_level === CareLevel.LEVEL_2 && pathway.care_level === CareLevel.LEVEL_3)
        ) {
          score += 25;
          reasons.push(`Adjacent care level option (${pathway.care_level}).`);
        }

        // 3. Need Domain Match (up to 30 pts)
        if (pathway.target_need_domains.includes(need.primary_domain)) {
          score += 30;
          reasons.push(`Addresses primary need domain (${need.primary_domain}).`);
        } else if (need.secondary_domains.some(d => pathway.target_need_domains.includes(d))) {
          score += 15;
          reasons.push('Addresses secondary wellbeing domain.');
        }

        // 4. Assessment Baseline Eligibility (up to 30 pts)
        const phq9 = need.assessment_baselines.find(b => b.instrument_code === 'PHQ-9')?.score;
        const gad7 = need.assessment_baselines.find(b => b.instrument_code === 'GAD-7')?.score;

        let meetsBaselineCriteria = true;
        if (phq9 !== undefined) {
          if (pathway.eligibility_criteria.min_phq9 !== undefined && phq9 < pathway.eligibility_criteria.min_phq9) {
            meetsBaselineCriteria = false;
          }
          if (pathway.eligibility_criteria.max_phq9 !== undefined && phq9 > pathway.eligibility_criteria.max_phq9) {
            meetsBaselineCriteria = false;
          }
        }
        if (gad7 !== undefined) {
          if (pathway.eligibility_criteria.min_gad7 !== undefined && gad7 < pathway.eligibility_criteria.min_gad7) {
            meetsBaselineCriteria = false;
          }
          if (pathway.eligibility_criteria.max_gad7 !== undefined && gad7 > pathway.eligibility_criteria.max_gad7) {
            meetsBaselineCriteria = false;
          }
        }

        if (meetsBaselineCriteria) {
          score += 30;
          reasons.push('Screening scores meet clinical eligibility criteria.');
        } else {
          score = Math.max(score - 20, 5);
          reasons.push('Screening scores fall outside primary target range.');
        }
      }

      scored.push({
        pathway,
        match_score: Math.min(score, 100),
        match_reasons: reasons
      });
    }

    // Sort descending by match score
    return scored.sort((a, b) => b.match_score - a.match_score);
  }
}
