/**
 * MindOS AI Risk Classification Engine
 * Authority: Master Architecture Index Section 7, Volumes I, III, IV, XV & Appendix C
 * Purpose: Determines canonical AI-R0..AI-R4 risk tier based on system type,
 * population vulnerability, clinical relevance, tool permissions, and autonomy.
 */

import { AIRiskClass, AISystemType, AIToolCategory } from './types.js';

export interface AIRiskClassificationInput {
  system_type: AISystemType;
  user_population: string[];
  jurisdictions: string[];
  data_categories: string[];
  tool_categories: AIToolCategory[];
  clinical_relevance: boolean;
  safety_relevance: boolean;
  autonomous_action: boolean;
}

export interface AIRiskClassificationResult {
  risk_class: AIRiskClass;
  reasons: string[];
  requires_clinical_review: boolean;
  requires_dpia: boolean;
  requires_regulatory_review: boolean;
  requires_ai_safety_review: boolean;
  requires_red_teaming: boolean;
  critical_failure_tolerance: number; // 0 for AI-R2, AI-R3, AI-R4
}

export class AIRiskClassificationEngine {
  public static classify(input: AIRiskClassificationInput): AIRiskClassificationResult {
    const reasons: string[] = [];
    let risk_class: AIRiskClass = 'AI-R0';

    const isVulnerable = input.user_population.some(p =>
      p.includes('VULNERABLE') || p.includes('ADOLESCENT') || p.includes('CHILD') || p.includes('CRISIS')
    );

    const hasClinicalData = input.data_categories.some(c =>
      c.includes('HEALTH') || c.includes('CLINICAL') || c.includes('CRISIS') || c.includes('DIAGNOSIS') || c.includes('SPECIAL_CATEGORY')
    );

    const hasHighRiskTool = input.tool_categories.includes(AIToolCategory.HIGH_RISK_ACTION) ||
      input.tool_categories.includes(AIToolCategory.EXTERNAL_SIDE_EFFECT);

    // Rule 1: Autonomous action or crisis interaction with vulnerable population -> AI-R4
    if (input.autonomous_action || (input.system_type === AISystemType.RISK_SIGNALING && isVulnerable)) {
      risk_class = 'AI-R4';
      reasons.push('Autonomous action or risk signaling targeting vulnerable/crisis populations mandates AI-R4 Critical Risk.');
    }
    // Rule 2: Mental health guidance, clinical relevance, or symptom interpretation -> AI-R3
    else if (
      input.clinical_relevance ||
      input.system_type === AISystemType.ASSESSMENT_ASSISTANCE ||
      input.system_type === AISystemType.RISK_SIGNALING ||
      input.system_type === AISystemType.PROFESSIONAL_ASSISTANCE ||
      (hasClinicalData && hasHighRiskTool)
    ) {
      risk_class = 'AI-R3';
      reasons.push('Clinical relevance, assessment assistance, or risk signaling mandates AI-R3 High Risk.');
    }
    // Rule 3: Care navigation, conversational support, or moderate data categories -> AI-R2
    else if (
      input.system_type === AISystemType.CARE_NAVIGATION ||
      input.system_type === AISystemType.CONVERSATIONAL_SUPPORT ||
      input.system_type === AISystemType.MODERATION_ASSISTANCE ||
      hasClinicalData
    ) {
      risk_class = 'AI-R2';
      reasons.push('Direct conversational support or care navigation with sensitive data mandates AI-R2 Moderate Risk.');
    }
    // Rule 4: Content recommendation, search retrieval, or non-clinical summarization -> AI-R1
    else if (
      input.system_type === AISystemType.CONTENT_RECOMMENDATION ||
      input.system_type === AISystemType.SEARCH_RETRIEVAL ||
      input.system_type === AISystemType.SUMMARIZATION ||
      input.system_type === AISystemType.CLASSIFICATION
    ) {
      risk_class = 'AI-R1';
      reasons.push('General information retrieval or summarization without clinical claims mandates AI-R1 Low Risk.');
    } else {
      risk_class = 'AI-R0';
      reasons.push('Administrative, governance, or operational utility qualifies for AI-R0 Negligible Risk.');
    }

    // Determine governance mandates based on risk class
    const isHighOrCritical = risk_class === 'AI-R3' || risk_class === 'AI-R4';
    const isModerateOrHigher = risk_class === 'AI-R2' || isHighOrCritical;

    return {
      risk_class,
      reasons,
      requires_clinical_review: isHighOrCritical || input.clinical_relevance,
      requires_dpia: isModerateOrHigher || hasClinicalData,
      requires_regulatory_review: isHighOrCritical,
      requires_ai_safety_review: isModerateOrHigher,
      requires_red_teaming: isHighOrCritical,
      critical_failure_tolerance: isModerateOrHigher ? 0 : 1
    };
  }
}
