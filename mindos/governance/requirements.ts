/**
 * MindOS Governance Requirement Engine
 * Authority: Master Architecture Index Section 7, Volumes III, IV, XIV, XV & Appendices B / C
 * Sprint 9: Feature Risk Classification, Dynamic Review Mandates & Invariant Enforcement
 */

import {
  GovernanceDomain,
  ClinicalRiskClass,
  AIRiskClass,
  PrivacyRiskClass,
  RegulatoryRiskClass,
  RiskAssessmentResult
} from './types.js';
import { ValidationError, GovernanceBlockedError } from '../platform/errors/index.js';

export interface ResourceClassificationParams {
  resource_key: string;
  name: string;
  hasClinicalImpact?: boolean;
  clinicalDomain?: string;
  clinicalImpactClass?: ClinicalRiskClass;
  isDiagnosisOrPrescription?: boolean;
  dataCategories?: string[];
  hasAutomatedProfiling?: boolean;
  hasAIModelOrInference?: boolean;
  aiRiskClass?: AIRiskClass;
  aiAutonomyLevel?: 'ADVISORY' | 'AUTOMATED' | 'AUTONOMOUS';
  jurisdictions?: string[];
  targetEnvironments?: string[];
}

export class GovernanceRequirementEngine {
  /**
   * Deterministically classifies a resource, assesses multi-dimensional risks,
   * enforces domain invariants, and calculates the mandatory review domains.
   */
  public static classify(params: ResourceClassificationParams): RiskAssessmentResult {
    const reasons: string[] = [];
    const prohibitedFlags: string[] = [];
    const mandatedDomains = new Set<GovernanceDomain>();
    const requiredRoles = new Set<string>();

    // Always mandatory baseline domains for any production or governed release
    mandatedDomains.add(GovernanceDomain.SECURITY_GOVERNANCE);
    requiredRoles.add('ROLE_SECURITY_ENGINEER');

    mandatedDomains.add(GovernanceDomain.QA_GOVERNANCE);
    requiredRoles.add('ROLE_QA_LEAD');

    // 1. Clinical Risk Evaluation
    let clinicalRisk: ClinicalRiskClass = params.clinicalImpactClass || 'CR-0';
    if (params.hasClinicalImpact) {
      if (!params.clinicalImpactClass || params.clinicalImpactClass === 'CR-0') {
        clinicalRisk = 'CR-1';
      }
      mandatedDomains.add(GovernanceDomain.CLINICAL_GOVERNANCE);
      requiredRoles.add('ROLE_CLINICAL_DIRECTOR');
      reasons.push(`Clinical impact declared (${clinicalRisk}): Mandating CLINICAL_GOVERNANCE review.`);
    }

    // Invariant Check: Uncertified clinical diagnosis or medication prescription
    if (params.isDiagnosisOrPrescription) {
      if (params.hasAIModelOrInference) {
        prohibitedFlags.push('AI_DIAGNOSIS_OR_PRESCRIPTION_PROHIBITED');
        throw new GovernanceBlockedError(
          `AI systems SHALL NOT autonomously perform clinical diagnosis or medication prescription (R-AI-002, Kenya Digital Health Act 2023).`
        );
      }
      // If non-AI, it is maximum clinical risk CR-3 and requires formal medical board review
      clinicalRisk = 'CR-3';
      mandatedDomains.add(GovernanceDomain.CLINICAL_GOVERNANCE);
      mandatedDomains.add(GovernanceDomain.REGULATORY_GOVERNANCE);
      requiredRoles.add('ROLE_CLINICAL_DIRECTOR');
      requiredRoles.add('ROLE_REGULATORY_COUNSEL');
      reasons.push('High-risk diagnostic/prescriptive capability: Mandating CR-3 clinical and regulatory sign-offs.');
    }

    // 2. AI Safety Risk Evaluation
    let aiRisk: AIRiskClass = params.aiRiskClass || 'AI-R0';
    if (params.hasAIModelOrInference) {
      if (aiRisk === 'AI-R0') {
        aiRisk = 'AI-R2'; // Default moderate generative risk
      }
      if (params.aiAutonomyLevel === 'AUTONOMOUS') {
        aiRisk = 'AI-R4';
        prohibitedFlags.push('UNGOVERNED_AUTONOMOUS_INTERVENTION');
        throw new GovernanceBlockedError(
          'Autonomous unguided clinical intervention is prohibited under MindOS AI Safety Kernel (R-AI-001).'
        );
      }
      mandatedDomains.add(GovernanceDomain.AI_SAFETY_GOVERNANCE);
      requiredRoles.add('ROLE_AI_SAFETY_OFFICER');
      reasons.push(`AI inference model declared (${aiRisk}): Mandating AI_SAFETY_GOVERNANCE review.`);
    }

    // 3. Privacy Risk & DPIA Evaluation
    let privacyRisk: PrivacyRiskClass = 'LOW';
    const sensitiveCategories = [
      'HEALTH_SENSITIVE',
      'CLINICAL_RECORD',
      'CLINICAL_RECORDS',
      'ASSESSMENT',
      'JOURNAL',
      'AI_CONVERSATION',
      'AI_DERIVED_METADATA',
      'CARE_RELATIONSHIP',
      'BIOMETRIC',
      'FINANCIAL'
    ];
    const hasSensitiveData = params.dataCategories?.some(cat => sensitiveCategories.includes(cat));

    if (hasSensitiveData || params.hasAutomatedProfiling) {
      privacyRisk = params.hasAutomatedProfiling ? 'CRITICAL' : 'HIGH';
      mandatedDomains.add(GovernanceDomain.PRIVACY_GOVERNANCE);
      requiredRoles.add('ROLE_DATA_PROTECTION_OFFICER');
      reasons.push(
        `Sensitive health/biometric data or profiling detected: Mandating PRIVACY_GOVERNANCE (DPIA under KDPA 2019 Section 31).`
      );
    } else if (params.dataCategories && params.dataCategories.length > 0) {
      privacyRisk = 'MEDIUM';
    }

    // 4. Regulatory Governance Evaluation
    let regulatoryRisk: RegulatoryRiskClass = 'EXEMPT';
    const jurisdictions = params.jurisdictions || ['KE'];
    const affectsKenya = jurisdictions.includes('KE');

    if (affectsKenya && (clinicalRisk === 'CR-2' || clinicalRisk === 'CR-3' || hasSensitiveData || params.hasAIModelOrInference)) {
      regulatoryRisk = 'COMPLIANCE_MANDATED';
      mandatedDomains.add(GovernanceDomain.REGULATORY_GOVERNANCE);
      requiredRoles.add('ROLE_REGULATORY_COUNSEL');
      reasons.push('Kenya DHA 2023 & Health Act 2017 compliance triggers: Mandating REGULATORY_GOVERNANCE review.');
    }

    return {
      clinical_risk_class: clinicalRisk,
      ai_risk_class: aiRisk,
      privacy_risk_class: privacyRisk,
      regulatory_risk_class: regulatoryRisk,
      mandated_domains: Array.from(mandatedDomains),
      required_roles: Array.from(requiredRoles),
      reasons,
      prohibited_flags: prohibitedFlags
    };
  }
}
