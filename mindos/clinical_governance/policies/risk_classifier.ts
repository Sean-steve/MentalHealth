/**
 * MindOS Clinical Risk Classification Engine
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendix B
 * Evaluates structured clinical factors to determine exact Clinical Risk Class (CR-0 to CR-3)
 * with complete factor provenance and auditability.
 */

import { ClinicalArtifactType, ClinicalRiskClass, ClinicalRiskClassificationFactors } from '../types.js';

export interface ClassificationInput {
  artifact_type?: ClinicalArtifactType;
  intended_use?: string;
  clinical_interpretation_involved?: boolean;
  symptom_screening?: boolean;
  diagnosis_like_output?: boolean;
  treatment_recommendation?: boolean;
  risk_of_harm_consequence?: 'NONE' | 'LOW' | 'MODERATE' | 'SEVERE' | 'CATASTROPHIC';
  crisis_involvement?: boolean;
  vulnerable_population?: boolean;
  professional_decision_influence?: 'INFORMATIONAL' | 'DECISION_SUPPORT' | 'CRITICAL_TRIAGE';
  automated_scoring?: boolean;
  ai_involvement?: boolean;
  user_reliance_risk?: 'LOW' | 'MEDIUM' | 'HIGH';
  care_delay_risk?: boolean;
  is_crisis_related?: boolean;
  is_diagnostic_algorithm?: boolean;
  involves_prescribing?: boolean;
  involves_autonomous_intervention?: boolean;
  targets_minors?: boolean;
  [key: string]: any;
}

export class ClinicalRiskClassifier {
  public static classify(input: ClassificationInput): {
    clinical_risk_class: ClinicalRiskClass;
    risk_factors: ClinicalRiskClassificationFactors;
  } {
    const reasons: string[] = [];
    const factorsList: string[] = [];

    // Default factors derived from input
    const interpretation = Boolean(input.clinical_interpretation_involved || 
      (input.artifact_type && [ClinicalArtifactType.ASSESSMENT, ClinicalArtifactType.CLINICAL_DECISION_SUPPORT, ClinicalArtifactType.SCORING_ALGORITHM].includes(input.artifact_type)));
    
    const screening = Boolean(input.symptom_screening || 
      (input.artifact_type && [ClinicalArtifactType.SCREENING_TOOL, ClinicalArtifactType.QUESTIONNAIRE].includes(input.artifact_type)));

    const diagnosisLike = Boolean(input.diagnosis_like_output);
    const treatmentRec = Boolean(input.treatment_recommendation);
    const harm = input.risk_of_harm_consequence || 'LOW';
    const crisis = Boolean(input.crisis_involvement || 
      input.is_crisis_related ||
      (input.artifact_type && [ClinicalArtifactType.CRISIS_GUIDANCE, ClinicalArtifactType.ESCALATION_POLICY, ClinicalArtifactType.RISK_DETECTION_POLICY, ClinicalArtifactType.CRISIS_ESCALATION_PROTOCOL].includes(input.artifact_type)));
    
    const autonomous = Boolean(input.involves_autonomous_intervention);
    const vulnerable = Boolean(input.vulnerable_population || input.targets_minors);
    const profInfluence = input.professional_decision_influence || 
      (input.artifact_type === ClinicalArtifactType.CLINICAL_DECISION_SUPPORT ? 'DECISION_SUPPORT' : 'INFORMATIONAL');
    
    const automatedScoring = Boolean(input.automated_scoring || 
      input.is_diagnostic_algorithm ||
      (input.artifact_type && [ClinicalArtifactType.SCORING_ALGORITHM, ClinicalArtifactType.ASSESSMENT].includes(input.artifact_type)));
    
    const aiInvolvement = Boolean(input.ai_involvement || 
      (input.artifact_type && [ClinicalArtifactType.AI_CLINICAL_BEHAVIOR, ClinicalArtifactType.AI_SAFETY_BEHAVIOR, ClinicalArtifactType.AI_RECOMMENDATION_POLICY, ClinicalArtifactType.AI_CLINICAL_PROMPT].includes(input.artifact_type)));
    
    const userReliance = input.user_reliance_risk || (screening || interpretation ? 'HIGH' : 'LOW');
    const careDelay = Boolean(input.care_delay_risk || (diagnosisLike || treatmentRec || screening));

    if (automatedScoring || input.is_diagnostic_algorithm) {
      factorsList.push('DIAGNOSTIC_OR_SCREENING_ALGORITHM');
    }
    if (crisis || input.is_crisis_related) {
      factorsList.push('CRISIS_OR_SUICIDAL_IDEATION_TOUCHPOINT');
    }
    if (autonomous || input.involves_autonomous_intervention) {
      factorsList.push('AUTONOMOUS_CLINICAL_INTERVENTION');
    }
    if (input.involves_prescribing) {
      factorsList.push('PRESCRIBING_OR_MEDICATION_TITRATION');
    }
    if (screening) {
      factorsList.push('SYMPTOM_SCREENING');
    }
    if (interpretation) {
      factorsList.push('CLINICAL_INTERPRETATION');
    }
    if (diagnosisLike) {
      factorsList.push('DIAGNOSIS_LIKE_OUTPUT');
    }
    if (treatmentRec) {
      factorsList.push('TREATMENT_RECOMMENDATION');
    }
    if (vulnerable) {
      factorsList.push('VULNERABLE_POPULATION');
    }
    if (aiInvolvement) {
      factorsList.push('AI_INVOLVEMENT');
    }

    let riskClass: ClinicalRiskClass = 'CR-0';

    // 1. Critical / High-Risk Level (CR-3) Invariants
    if (diagnosisLike) {
      riskClass = 'CR-3';
      reasons.push('CRITICAL: Diagnosis-like clinical output requires maximum clinical oversight (CR-3).');
    }
    if (treatmentRec) {
      riskClass = 'CR-3';
      reasons.push('CRITICAL: Active treatment recommendation capability mandates CR-3 multi-reviewer approval.');
    }
    if (crisis && (autonomous || (aiInvolvement && !screening) || profInfluence === 'CRITICAL_TRIAGE')) {
      riskClass = 'CR-3';
      reasons.push('CRITICAL: Crisis guidance with autonomous intervention, AI interaction or emergency triage carries severe risk of harm (CR-3).');
    }
    if (harm === 'SEVERE' || harm === 'CATASTROPHIC') {
      riskClass = 'CR-3';
      reasons.push(`CRITICAL: Assessed harm consequence is ${harm}; strictly classified as CR-3.`);
    }
    if (careDelay && vulnerable && (screening || interpretation)) {
      riskClass = 'CR-3';
      reasons.push('CRITICAL: Screening/interpretation errors may directly delay care for vulnerable populations (CR-3).');
    }

    // 2. High Risk (CR-2) Invariants (if not already CR-3)
    if (riskClass !== 'CR-3') {
      if (screening && (automatedScoring || aiInvolvement)) {
        riskClass = 'CR-2';
        reasons.push('HIGH: Symptom screening involving automated scoring or AI inference requires enhanced clinical review (CR-2).');
      } else if (input.artifact_type === ClinicalArtifactType.ASSESSMENT || input.is_diagnostic_algorithm) {
        riskClass = 'CR-2';
        reasons.push('HIGH: Structured assessment or diagnostic algorithm requires enhanced clinical governance (CR-2).');
      } else if (aiInvolvement && input.artifact_type && [ClinicalArtifactType.AI_CLINICAL_BEHAVIOR, ClinicalArtifactType.AI_RECOMMENDATION_POLICY].includes(input.artifact_type)) {
        riskClass = 'CR-2';
        reasons.push('HIGH: AI clinical behavior or recommendation policies mandate CR-2 enhanced clinical governance.');
      } else if (profInfluence === 'DECISION_SUPPORT' || profInfluence === 'CRITICAL_TRIAGE') {
        riskClass = 'CR-2';
        reasons.push('HIGH: Clinical decision support influencing professional care delivery requires CR-2 review.');
      } else if (harm === 'MODERATE' || userReliance === 'HIGH') {
        riskClass = 'CR-2';
        reasons.push('HIGH: Moderate potential harm or high user reliance on mental-health output mandates CR-2.');
      }
    }

    // 3. Moderate Risk (CR-1) Invariants (if not CR-2 or CR-3)
    if (riskClass === 'CR-0') {
      if ((input.artifact_type && [
        ClinicalArtifactType.PSYCHOEDUCATIONAL_CONTENT,
        ClinicalArtifactType.GUIDED_EXERCISE,
        ClinicalArtifactType.SELF_HELP_INTERVENTION,
        ClinicalArtifactType.CARE_PATHWAY,
        ClinicalArtifactType.QUESTIONNAIRE
      ].includes(input.artifact_type)) || interpretation || screening) {
        riskClass = 'CR-1';
        reasons.push('MODERATE: Standard psychoeducational interventions and structured self-help content require standard clinical review (CR-1).');
      }
    }

    // 4. Minimal / Low Risk (CR-0)
    if (riskClass === 'CR-0') {
      reasons.push('MINIMAL: Educational copy or static administrative notification without diagnostic, therapeutic or clinical claims (CR-0).');
    }

    const risk_factors = factorsList as unknown as ClinicalRiskClassificationFactors;
    risk_factors.clinical_interpretation_involved = interpretation;
    risk_factors.symptom_screening = screening;
    risk_factors.diagnosis_like_output = diagnosisLike;
    risk_factors.treatment_recommendation = treatmentRec;
    risk_factors.risk_of_harm_consequence = harm;
    risk_factors.crisis_involvement = crisis;
    risk_factors.vulnerable_population = vulnerable;
    risk_factors.professional_decision_influence = profInfluence;
    risk_factors.automated_scoring = automatedScoring;
    risk_factors.ai_involvement = aiInvolvement;
    risk_factors.user_reliance_risk = userReliance;
    risk_factors.care_delay_risk = careDelay;
    risk_factors.reasons = reasons;

    return {
      clinical_risk_class: riskClass,
      risk_factors
    };
  }
}
