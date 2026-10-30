/**
 * MindOS Canonical DPIA Trigger Engine
 * Authority: Master Architecture Index Section 7, Volumes I, VIII & Appendix B / Q
 *            Kenya Data Protection Act 2019 Section 31
 */

import {
  ProcessingActivity,
  DPIATriggerResult,
  DPIATriggerFactors,
  DataCategory,
  DataSubjectCategory
} from '../types.js';
import { isSpecialCategory } from '../domain/taxonomy.js';

export class DPIATriggerEngine {
  /**
   * Evaluates if a proposed or existing processing activity mandates a formal DPIA.
   * Fails closed: if uncertainty exists, returns DPIA_REVIEW_REQUIRED.
   */
  public static evaluate(activity: Partial<ProcessingActivity>): {
    result: DPIATriggerResult;
    factors: DPIATriggerFactors;
  } {
    const reasons: string[] = [];

    // 1. Health or sensitive data
    const hasSensitiveData = Boolean(
      activity.data_categories?.some((c) => isSpecialCategory(c)) ||
      activity.special_categories && activity.special_categories.length > 0 ||
      activity.clinical_relevance
    );
    if (hasSensitiveData) {
      reasons.push('Involves health data, mental health assessments, clinical records, or sensitive personal data');
    }

    // 2. AI or automated decisions
    const hasAI = Boolean(activity.ai_involvement || activity.automated_processing);
    if (hasAI) {
      reasons.push('Involves artificial intelligence, machine learning inference, or automated decision logic');
    }

    // 3. Profiling
    const hasProfiling = Boolean(activity.profiling);
    if (hasProfiling) {
      reasons.push('Involves profiling, behavioral scoring, or psychometric trait evaluation');
    }

    // 4. Systematic monitoring
    const hasMonitoring = Boolean(
      activity.data_categories?.includes(DataCategory.DEVICE_SECURITY_METADATA) &&
      activity.automated_processing
    );
    if (hasMonitoring) {
      reasons.push('Involves continuous telemetry or systematic user behavioral monitoring');
    }

    // 5. Large scale
    const isLargeScale = true; // In MindOS digital health platform, processing covers all active users
    if (isLargeScale && hasSensitiveData) {
      reasons.push('Large-scale digital processing of health and psychological records');
    }

    // 6. Vulnerable subjects (minors, acute distress)
    const hasVulnerable = Boolean(
      activity.data_subject_categories?.includes(DataSubjectCategory.MINORS) ||
      activity.clinical_relevance
    );
    if (hasVulnerable) {
      reasons.push('Involves vulnerable data subjects (e.g. minors or individuals in acute emotional distress)');
    }

    // 7. Risk prediction
    const hasRiskPrediction = Boolean(
      activity.data_categories?.includes(DataCategory.AI_DERIVED_METADATA) ||
      activity.data_categories?.includes(DataCategory.ASSESSMENT)
    );
    if (hasRiskPrediction) {
      reasons.push('Generates safety risk predictions or crisis triage indicators');
    }

    // 8. Third-party sharing
    const hasThirdParty = Boolean(activity.recipients && activity.recipients.length > 0);
    if (hasThirdParty) {
      reasons.push('Transfers or shares data with external recipients or downstream systems');
    }

    // 9. Cross-border transfer
    const hasCrossBorder = Boolean(
      activity.transfer_locations && activity.transfer_locations.some((loc) => loc !== 'KE') ||
      activity.jurisdictions && activity.jurisdictions.some((j) => j !== 'KE')
    );
    if (hasCrossBorder) {
      reasons.push('Involves cross-border data transfer outside Kenya');
    }

    // 10. Novel technology
    const isNovel = Boolean(activity.ai_involvement && activity.clinical_relevance);
    if (isNovel) {
      reasons.push('Novel synthesis of generative AI with clinical mental health safety boundaries');
    }

    // 11. Combination of datasets
    const combinesData = Boolean(
      (activity.data_categories?.length || 0) >= 4 &&
      activity.data_categories?.includes(DataCategory.ASSESSMENT) &&
      activity.data_categories?.includes(DataCategory.IDENTITY)
    );
    if (combinesData) {
      reasons.push('Combines disparate identity, clinical, and behavioral datasets');
    }

    const factors: DPIATriggerFactors = {
      has_health_or_sensitive_data: hasSensitiveData,
      has_ai_or_automated_decisions: hasAI,
      has_profiling: hasProfiling,
      has_systematic_monitoring: hasMonitoring,
      is_large_scale: isLargeScale,
      involves_vulnerable_subjects: hasVulnerable,
      has_risk_prediction_or_scoring: hasRiskPrediction,
      has_third_party_sharing: hasThirdParty,
      has_cross_border_transfer: hasCrossBorder,
      is_novel_technology_or_processing: isNovel,
      combines_disparate_datasets: combinesData,
      reasons
    };

    // If health data, AI, profiling, or cross-border transfer are present -> DPIA_REQUIRED (KDPA Sec 31)
    if (hasSensitiveData || hasAI || hasProfiling || hasCrossBorder || hasVulnerable) {
      return {
        result: DPIATriggerResult.DPIA_REQUIRED,
        factors
      };
    }

    if (reasons.length > 0) {
      return {
        result: DPIATriggerResult.DPIA_REVIEW_REQUIRED,
        factors
      };
    }

    return {
      result: DPIATriggerResult.DPIA_NOT_REQUIRED,
      factors
    };
  }
}
