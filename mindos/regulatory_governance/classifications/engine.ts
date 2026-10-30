/**
 * MindOS Regulatory Classification Engine
 * Authority: Volumes III, XV & Appendix I
 * Classifies governed resources against Kenya statutory baselines.
 * Fail-Closed Invariant: Unclassified or ambiguous capabilities involving health data,
 * clinical claims, or automated decisions mandate human regulatory review.
 */

import { RegulatoryClassification } from '../domain/types.js';
import {
  RegulatoryClassificationType
} from '../domain/taxonomy.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { JurisdictionRegistry } from '../jurisdictions/registry.js';
import { ValidationError } from '../../platform/errors/index.js';

export interface ClassificationInput {
  resource_id: string;
  resource_version?: string;
  resource_type: string; // 'feature' | 'processing_activity' | 'clinical_artifact' | 'ai_system' | 'platform'
  name: string;
  jurisdiction_code?: string;
  intended_use?: string;
  makes_clinical_claims?: boolean;
  processes_health_data?: boolean;
  ai_involvement?: boolean;
  automated_decisions?: boolean;
  professional_care_workflow?: boolean;
  is_cross_border?: boolean;
  data_exchange_active?: boolean;
  target_population?: 'ADULT' | 'MINOR' | 'VULNERABLE' | 'GENERAL';
  clinical_risk_class?: string; // from Clinical Governance
  data_categories?: string[]; // from Privacy Governance
}

export class RegulatoryClassificationEngine {
  private static classifications: Map<string, RegulatoryClassification> = new Map();

  public static classify(input: ClassificationInput): RegulatoryClassification {
    const jurCode = (input.jurisdiction_code || 'KE').toUpperCase();
    const jur = JurisdictionRegistry.get(jurCode);
    if (!jur) {
      throw new ValidationError(`Cannot classify for unknown jurisdiction: ${jurCode}`);
    }

    const version = input.resource_version || '1.0.0';
    const applicableReqs: string[] = [];
    const reasonCodes: string[] = [];
    let classificationType: RegulatoryClassificationType = RegulatoryClassificationType.EXEMPT;
    let classificationName = 'EXEMPT';
    let reviewRequired = false;
    let confidence = 1.0;

    // Detect health data sensitivity
    const isHealthSensitive =
      Boolean(input.processes_health_data) ||
      Boolean(input.name && /health|mental|psych|clinic|therapy|screening|diagnosis/i.test(input.name)) ||
      Boolean(input.resource_id && /health|mental|psych|clinic|therapy|screening|diagnosis/i.test(input.resource_id)) ||
      Boolean(input.intended_use && /health|mental|psych|clinic|therapy|screening|patient|medical/i.test(input.intended_use)) ||
      (input.data_categories &&
        input.data_categories.some((c) =>
          ['HEALTH_SENSITIVE', 'CLINICAL_RECORD', 'MENTAL_HEALTH', 'PSYCHIATRIC'].includes(c.toUpperCase())
        ));

    // Detect clinical claim involvement
    const hasClinicalClaims =
      Boolean(input.makes_clinical_claims) ||
      (input.clinical_risk_class && ['CLASS_II', 'CLASS_III', 'HIGH_RISK'].includes(input.clinical_risk_class.toUpperCase()));

    // Baseline security requirement always applies
    applicableReqs.push('KE-REQ-CYBER-001');
    reasonCodes.push('RC_CYBER_BASELINE');

    // Rule 1: Medical Device / Clinical Claim / High Clinical Risk
    if (hasClinicalClaims) {
      classificationType = RegulatoryClassificationType.REGULATED_HEALTH_SYSTEM;
      classificationName = 'REGULATED_HEALTH_SYSTEM (SAMD_CLINICAL)';
      reviewRequired = true;
      confidence = 0.95;

      applicableReqs.push(
        'KE-REQ-CLIN-001',
        'KE-REQ-HLTH-001',
        'KE-REQ-PRIV-001',
        'KE-REQ-PRIV-002',
        'KE-REQ-DHA-001',
        'KE-REQ-DHA-002'
      );
      reasonCodes.push('RC_CLINICAL_CLAIM_SAMD', 'RC_MANDATORY_DHA_REG', 'RC_HEALTH_DATA_SOVEREIGNTY');
    }
    // Rule 2: Health Data Processing / Digital Health Service
    else if (isHealthSensitive) {
      classificationType = RegulatoryClassificationType.REGULATED_HEALTH_SYSTEM;
      classificationName = 'REGULATED_HEALTH_SYSTEM (HEALTH_DATA_PROCESSOR)';
      reviewRequired = true;
      confidence = 0.98;

      applicableReqs.push(
        'KE-REQ-PRIV-001',
        'KE-REQ-PRIV-002',
        'KE-REQ-HLTH-001',
        'KE-REQ-DHA-001',
        'KE-REQ-DHA-002'
      );
      reasonCodes.push('RC_HEALTH_DATA_PROCESSING', 'RC_DPA_SEC_31_DPIA', 'RC_DHA_SYSTEM_REG');

      if (input.is_cross_border) {
        applicableReqs.push('KE-REQ-PRIV-003');
        reasonCodes.push('RC_CROSS_BORDER_TRANSFER');
      }

      if (input.data_exchange_active) {
        applicableReqs.push('KE-REQ-DHA-003');
        reasonCodes.push('RC_HEALTH_DATA_EXCHANGE');
      }
    }
    // Rule 3: AI involvement or automated decisions on personal data
    else if (input.ai_involvement || input.automated_decisions) {
      classificationType = RegulatoryClassificationType.WELLNESS_SUPPORT_SYSTEM;
      classificationName = 'WELLNESS_SUPPORT_SYSTEM (AI_ENABLED)';
      reviewRequired = true; // AI requires human regulatory inspection
      confidence = 0.9;

      applicableReqs.push('KE-REQ-PRIV-001', 'KE-REQ-PRIV-002');
      reasonCodes.push('RC_AI_AUTOMATED_PROCESSING', 'RC_DPIA_RECOMMENDED');
    }
    // Rule 4: Administrative / Internal Exempt
    else {
      classificationType = RegulatoryClassificationType.EXEMPT;
      classificationName = 'EXEMPT_ADMINISTRATIVE_UTILITY';
      reviewRequired = false;
      confidence = 1.0;
      applicableReqs.length = 0;
      reasonCodes.length = 0;
      reasonCodes.push('RC_NO_HEALTH_DATA_NO_CLINICAL_CLAIMS');
    }

    // Fail-closed invariant: If intended_use is missing and resource is non-exempt, require human review
    if (!input.intended_use && classificationType !== RegulatoryClassificationType.EXEMPT) {
      reviewRequired = true;
      confidence = 0.6;
      reasonCodes.push('RC_MISSING_INTENDED_USE_STATEMENT_FAIL_CLOSED');
    }

    const classificationId = generateUUIDv7();
    const result: RegulatoryClassification = {
      id: classificationId,
      resource_id: input.resource_id,
      resource_version: version,
      jurisdiction_code: jurCode,
      classification_type: classificationType,
      classification: classificationName,
      applicable_requirements: Array.from(new Set(applicableReqs)),
      confidence,
      review_required: reviewRequired,
      human_review_required: reviewRequired,
      reason_codes: reasonCodes,
      policy_version: '1.0.0',
      created_at: new Date().toISOString()
    };

    RegulatoryClassificationEngine.classifications.set(`${input.resource_id}_${jurCode}`, result);
    return result;
  }

  public static get(resourceId: string, jurisdictionCode = 'KE'): RegulatoryClassification | undefined {
    return RegulatoryClassificationEngine.classifications.get(`${resourceId}_${jurisdictionCode.toUpperCase()}`);
  }

  public static list(jurisdictionCode = 'KE'): RegulatoryClassification[] {
    return Array.from(RegulatoryClassificationEngine.classifications.values()).filter(
      (c) => c.jurisdiction_code === jurisdictionCode.toUpperCase()
    );
  }

  public static resetForTesting(): void {
    RegulatoryClassificationEngine.classifications.clear();
  }
}
