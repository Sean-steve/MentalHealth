/**
 * MindOS Canonical Seed Clinical Instruments
 * Authority: Master Architecture Index Section 7, Volumes I, XV
 * Sprint 15: PHQ-9, GAD-7, WHO-5, and C-SSRS Canonical Definitions
 */

import {
  AssessmentDefinition,
  AssessmentVersion,
  AssessmentSection,
  AssessmentQuestion,
  AssessmentOption,
  AssessmentScoringModel,
  AssessmentInterpretationModel,
  AssessmentScoreBand,
  AssessmentEligibilityPolicy,
  AssessmentRetakePolicy,
  AssessmentSafetyRule,
  AssessmentType,
  QuestionType,
  ScoringType,
  AssessmentVersionState
} from '../domain/types.js';

export interface SeedInstrumentBundle {
  definition: AssessmentDefinition;
  version: AssessmentVersion;
  sections: AssessmentSection[];
  questions: AssessmentQuestion[];
  scoringModel: AssessmentScoringModel;
  interpretationModel: AssessmentInterpretationModel;
  scoreBands: AssessmentScoreBand[];
  eligibilityPolicy: AssessmentEligibilityPolicy;
  retakePolicy: AssessmentRetakePolicy;
  safetyRules: AssessmentSafetyRule[];
}

export function getCanonicalSeedInstruments(): SeedInstrumentBundle[] {
  // --------------------------------------------------------------------------
  // 1. PHQ-9 (Patient Health Questionnaire-9)
  // --------------------------------------------------------------------------
  const phq9DefId = 'def-phq9-0000-0000-000000000001';
  const phq9VerId = 'ver-phq9-0000-0000-000000000001';
  const phq9SectionId = 'sec-phq9-0000-0000-000000000001';
  const phq9ScoringId = 'scm-phq9-0000-0000-000000000001';
  const phq9InterpId = 'inm-phq9-0000-0000-000000000001';

  const phq9LikertOptions: (qId: string) => AssessmentOption[] = (qId) => [
    { id: `${qId}-opt-0`, question_id: qId, option_code: '0', label: 'Not at all', position: 1, score_value: 0, created_at: new Date().toISOString() },
    { id: `${qId}-opt-1`, question_id: qId, option_code: '1', label: 'Several days', position: 2, score_value: 1, created_at: new Date().toISOString() },
    { id: `${qId}-opt-2`, question_id: qId, option_code: '2', label: 'More than half the days', position: 3, score_value: 2, created_at: new Date().toISOString() },
    { id: `${qId}-opt-3`, question_id: qId, option_code: '3', label: 'Nearly every day', position: 4, score_value: 3, created_at: new Date().toISOString() }
  ];

  const phq9Prompts = [
    { code: 'PHQ9_Q1', prompt: 'Little interest or pleasure in doing things' },
    { code: 'PHQ9_Q2', prompt: 'Feeling down, depressed, or hopeless' },
    { code: 'PHQ9_Q3', prompt: 'Trouble falling or staying asleep, or sleeping too much' },
    { code: 'PHQ9_Q4', prompt: 'Feeling tired or having little energy' },
    { code: 'PHQ9_Q5', prompt: 'Poor appetite or overeating' },
    { code: 'PHQ9_Q6', prompt: 'Feeling bad about yourself — or that you are a failure or have let yourself or your family down' },
    { code: 'PHQ9_Q7', prompt: 'Trouble concentrating on things, such as reading the newspaper or watching television' },
    { code: 'PHQ9_Q8', prompt: 'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual' },
    { code: 'PHQ9_Q9', prompt: 'Thoughts that you would be better off dead, or of hurting yourself in some way' }
  ];

  const phq9Questions: AssessmentQuestion[] = phq9Prompts.map((item, idx) => {
    const qId = `q-phq9-${idx + 1}`;
    return {
      id: qId,
      assessment_version_id: phq9VerId,
      section_id: phq9SectionId,
      question_code: item.code,
      position: idx + 1,
      prompt: item.prompt,
      help_text: 'Over the last 2 weeks, how often have you been bothered by this problem?',
      question_type: QuestionType.LIKERT,
      required: true,
      response_schema: { min: 0, max: 3, allowed_values: ['0', '1', '2', '3'] },
      clinical_significance: item.code === 'PHQ9_Q9' ? 'SUICIDE_RISK_INDICATOR' : 'DEPRESSION_SYMPTOM',
      safety_significance: item.code === 'PHQ9_Q9' ? 'ACUTE_SAFETY_TRIGGER' : undefined,
      scoring_key_reference: 'DEPRESSION_TOTAL',
      options: phq9LikertOptions(qId),
      created_at: new Date().toISOString()
    };
  });

  const phq9Bundle: SeedInstrumentBundle = {
    definition: {
      id: phq9DefId,
      code: 'PHQ-9',
      name: 'Patient Health Questionnaire-9',
      description: 'Standardized 9-item screening tool for depression severity and symptom tracking.',
      assessment_type: AssessmentType.SCREENING,
      owner_domain: 'clinical',
      owner: 'CLINICAL_GOVERNANCE_COMMITTEE',
      clinical_artifact_id: 'art-phq9-001',
      status: 'ACTIVE',
      default_language: 'en',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    version: {
      id: phq9VerId,
      assessment_definition_id: phq9DefId,
      version: 1,
      status: AssessmentVersionState.ACTIVE,
      clinical_artifact_version: 1,
      title: 'Patient Health Questionnaire (PHQ-9) - Canonical Edition',
      instructions: 'Over the last 2 weeks, how often have you been bothered by any of the following problems? Please select the option that best describes your experience.',
      population: { min_age: 18, max_age: 120 },
      jurisdictions: ['KE', 'US', 'GB'],
      estimated_duration_minutes: 4,
      scoring_model_version: '1.0.0',
      interpretation_model_version: '1.0.0',
      effective_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    },
    sections: [
      {
        id: phq9SectionId,
        assessment_version_id: phq9VerId,
        code: 'PHQ9_MAIN',
        title: 'Depressive Symptoms Screening',
        description: 'Responses reflect your feelings over the past 14 days.',
        position: 1,
        created_at: new Date().toISOString()
      }
    ],
    questions: phq9Questions,
    scoringModel: {
      id: phq9ScoringId,
      assessment_version_id: phq9VerId,
      version: '1.0.0',
      scoring_type: ScoringType.SUM,
      algorithm_reference: 'ALG_PHQ9_SUM',
      configuration: { min_score: 0, max_score: 27 },
      clinical_artifact_reference: 'art-phq9-001',
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    },
    interpretationModel: {
      id: phq9InterpId,
      assessment_version_id: phq9VerId,
      version: '1.0.0',
      clinical_artifact_reference: 'art-phq9-001',
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    },
    scoreBands: [
      {
        id: 'band-phq9-1',
        interpretation_model_id: phq9InterpId,
        code: 'MINIMAL',
        minimum: 0,
        maximum: 4,
        label: 'Minimal or None',
        user_message: 'Your responses suggest minimal or no depressive symptoms over the past two weeks.',
        clinical_significance: 'NO_SIGNIFICANT_SYMPTOMS',
        position: 1
      },
      {
        id: 'band-phq9-2',
        interpretation_model_id: phq9InterpId,
        code: 'MILD',
        minimum: 5,
        maximum: 9,
        label: 'Mild',
        user_message: 'Your responses indicate mild depressive symptoms. Consider wellness check-ins or supportive resources.',
        clinical_significance: 'MILD_DEPRESSION',
        position: 2
      },
      {
        id: 'band-phq9-3',
        interpretation_model_id: phq9InterpId,
        code: 'MODERATE',
        minimum: 10,
        maximum: 14,
        label: 'Moderate',
        user_message: 'Your responses indicate moderate depressive symptoms. A consultation with a qualified mental health clinician is recommended.',
        clinical_significance: 'MODERATE_DEPRESSION',
        position: 3
      },
      {
        id: 'band-phq9-4',
        interpretation_model_id: phq9InterpId,
        code: 'MODERATELY_SEVERE',
        minimum: 15,
        maximum: 19,
        label: 'Moderately Severe',
        user_message: 'Your responses indicate moderately severe depressive symptoms. Clinical evaluation and personalized support are strongly encouraged.',
        clinical_significance: 'MODERATELY_SEVERE_DEPRESSION',
        position: 4
      },
      {
        id: 'band-phq9-5',
        interpretation_model_id: phq9InterpId,
        code: 'SEVERE',
        minimum: 20,
        maximum: 27,
        label: 'Severe',
        user_message: 'Your responses indicate severe depressive symptoms. We encourage you to reach out to a healthcare professional or support service promptly.',
        clinical_significance: 'SEVERE_DEPRESSION',
        position: 5
      }
    ],
    eligibilityPolicy: {
      id: 'elp-phq9-001',
      assessment_definition_id: phq9DefId,
      min_age: 18,
      max_age: 120,
      allowed_jurisdictions: ['KE', 'US', 'GB'],
      required_consents: ['CONSENT_CLINICAL_SCREENING'],
      excluded_risk_states: [],
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    },
    retakePolicy: {
      id: 'rtp-phq9-001',
      assessment_definition_id: phq9DefId,
      minimum_interval_days: 14,
      recommended_interval_days: 14,
      allow_early_retake: true,
      early_retake_conditions: ['CLINICIAN_ORDERED', 'CRISIS_STABILIZATION'],
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    },
    safetyRules: [
      {
        id: 'rule-phq9-q9-high',
        assessment_version_id: phq9VerId,
        question_id: 'q-phq9-9',
        question_code: 'PHQ9_Q9',
        condition: { operator: 'equals', threshold_value: 1 },
        signal_code: 'SIG_SUICIDAL_IDEATION_PASSIVE',
        severity: 'HIGH',
        confidence: 'CONFIRMED',
        clinical_policy_reference: 'POL-SAFE-001',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      },
      {
        id: 'rule-phq9-q9-crit',
        assessment_version_id: phq9VerId,
        question_id: 'q-phq9-9',
        question_code: 'PHQ9_Q9',
        condition: { operator: 'greater_than_or_equal', threshold_value: 2 },
        signal_code: 'SIG_SUICIDAL_INTENT_ACTIVE',
        severity: 'CRITICAL',
        confidence: 'CONFIRMED',
        clinical_policy_reference: 'POL-SAFE-001',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      }
    ]
  };

  // --------------------------------------------------------------------------
  // 2. GAD-7 (Generalized Anxiety Disorder-7)
  // --------------------------------------------------------------------------
  const gad7DefId = 'def-gad7-0000-0000-000000000001';
  const gad7VerId = 'ver-gad7-0000-0000-000000000001';
  const gad7SectionId = 'sec-gad7-0000-0000-000000000001';
  const gad7ScoringId = 'scm-gad7-0000-0000-000000000001';
  const gad7InterpId = 'inm-gad7-0000-0000-000000000001';

  const gad7Prompts = [
    { code: 'GAD7_Q1', prompt: 'Feeling nervous, anxious, or on edge' },
    { code: 'GAD7_Q2', prompt: 'Not being able to stop or control worrying' },
    { code: 'GAD7_Q3', prompt: 'Worrying too much about different things' },
    { code: 'GAD7_Q4', prompt: 'Trouble relaxing' },
    { code: 'GAD7_Q5', prompt: 'Being so restless that it is hard to sit still' },
    { code: 'GAD7_Q6', prompt: 'Becoming easily annoyed or irritable' },
    { code: 'GAD7_Q7', prompt: 'Feeling afraid, as if something awful might happen' }
  ];

  const gad7Questions: AssessmentQuestion[] = gad7Prompts.map((item, idx) => {
    const qId = `q-gad7-${idx + 1}`;
    return {
      id: qId,
      assessment_version_id: gad7VerId,
      section_id: gad7SectionId,
      question_code: item.code,
      position: idx + 1,
      prompt: item.prompt,
      help_text: 'Over the last 2 weeks, how often have you been bothered by this problem?',
      question_type: QuestionType.LIKERT,
      required: true,
      response_schema: { min: 0, max: 3, allowed_values: ['0', '1', '2', '3'] },
      clinical_significance: 'ANXIETY_SYMPTOM',
      scoring_key_reference: 'ANXIETY_TOTAL',
      options: phq9LikertOptions(qId),
      created_at: new Date().toISOString()
    };
  });

  const gad7Bundle: SeedInstrumentBundle = {
    definition: {
      id: gad7DefId,
      code: 'GAD-7',
      name: 'Generalized Anxiety Disorder-7',
      description: 'Validated 7-item screening tool for generalized anxiety symptoms and severity.',
      assessment_type: AssessmentType.SCREENING,
      owner_domain: 'clinical',
      owner: 'CLINICAL_GOVERNANCE_COMMITTEE',
      clinical_artifact_id: 'art-gad7-001',
      status: 'ACTIVE',
      default_language: 'en',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    version: {
      id: gad7VerId,
      assessment_definition_id: gad7DefId,
      version: 1,
      status: AssessmentVersionState.ACTIVE,
      clinical_artifact_version: 1,
      title: 'Generalized Anxiety Disorder (GAD-7) - Canonical Edition',
      instructions: 'Over the last 2 weeks, how often have you been bothered by the following problems? Please select the option that best fits your experience.',
      population: { min_age: 18, max_age: 120 },
      jurisdictions: ['KE', 'US', 'GB'],
      estimated_duration_minutes: 3,
      scoring_model_version: '1.0.0',
      interpretation_model_version: '1.0.0',
      effective_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    },
    sections: [
      {
        id: gad7SectionId,
        assessment_version_id: gad7VerId,
        code: 'GAD7_MAIN',
        title: 'Anxiety Screening',
        description: 'Responses reflect your feelings over the past 14 days.',
        position: 1,
        created_at: new Date().toISOString()
      }
    ],
    questions: gad7Questions,
    scoringModel: {
      id: gad7ScoringId,
      assessment_version_id: gad7VerId,
      version: '1.0.0',
      scoring_type: ScoringType.SUM,
      algorithm_reference: 'ALG_GAD7_SUM',
      configuration: { min_score: 0, max_score: 21 },
      clinical_artifact_reference: 'art-gad7-001',
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    },
    interpretationModel: {
      id: gad7InterpId,
      assessment_version_id: gad7VerId,
      version: '1.0.0',
      clinical_artifact_reference: 'art-gad7-001',
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    },
    scoreBands: [
      {
        id: 'band-gad7-1',
        interpretation_model_id: gad7InterpId,
        code: 'MINIMAL',
        minimum: 0,
        maximum: 4,
        label: 'Minimal Anxiety',
        user_message: 'Your responses suggest minimal anxiety levels.',
        clinical_significance: 'NO_SIGNIFICANT_ANXIETY',
        position: 1
      },
      {
        id: 'band-gad7-2',
        interpretation_model_id: gad7InterpId,
        code: 'MILD',
        minimum: 5,
        maximum: 9,
        label: 'Mild Anxiety',
        user_message: 'Your responses indicate mild anxiety symptoms. Mindfulness or stress reduction practices may be helpful.',
        clinical_significance: 'MILD_ANXIETY',
        position: 2
      },
      {
        id: 'band-gad7-3',
        interpretation_model_id: gad7InterpId,
        code: 'MODERATE',
        minimum: 10,
        maximum: 14,
        label: 'Moderate Anxiety',
        user_message: 'Your responses indicate moderate anxiety symptoms. Exploring strategies with a professional may provide relief.',
        clinical_significance: 'MODERATE_ANXIETY',
        position: 3
      },
      {
        id: 'band-gad7-4',
        interpretation_model_id: gad7InterpId,
        code: 'SEVERE',
        minimum: 15,
        maximum: 21,
        label: 'Severe Anxiety',
        user_message: 'Your responses indicate severe anxiety symptoms. We recommend consulting a healthcare provider for comprehensive guidance.',
        clinical_significance: 'SEVERE_ANXIETY',
        position: 4
      }
    ],
    eligibilityPolicy: {
      id: 'elp-gad7-001',
      assessment_definition_id: gad7DefId,
      min_age: 18,
      max_age: 120,
      allowed_jurisdictions: ['KE', 'US', 'GB'],
      required_consents: ['CONSENT_CLINICAL_SCREENING'],
      excluded_risk_states: [],
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    },
    retakePolicy: {
      id: 'rtp-gad7-001',
      assessment_definition_id: gad7DefId,
      minimum_interval_days: 14,
      recommended_interval_days: 14,
      allow_early_retake: true,
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    },
    safetyRules: []
  };

  // --------------------------------------------------------------------------
  // 3. WHO-5 (WHO-5 Well-Being Index)
  // --------------------------------------------------------------------------
  const who5DefId = 'def-who5-0000-0000-000000000001';
  const who5VerId = 'ver-who5-0000-0000-000000000001';
  const who5SectionId = 'sec-who5-0000-0000-000000000001';
  const who5ScoringId = 'scm-who5-0000-0000-000000000001';
  const who5InterpId = 'inm-who5-0000-0000-000000000001';

  const who5Options: (qId: string) => AssessmentOption[] = (qId) => [
    { id: `${qId}-opt-5`, question_id: qId, option_code: '5', label: 'All of the time', position: 1, score_value: 5, created_at: new Date().toISOString() },
    { id: `${qId}-opt-4`, question_id: qId, option_code: '4', label: 'Most of the time', position: 2, score_value: 4, created_at: new Date().toISOString() },
    { id: `${qId}-opt-3`, question_id: qId, option_code: '3', label: 'More than half of the time', position: 3, score_value: 3, created_at: new Date().toISOString() },
    { id: `${qId}-opt-2`, question_id: qId, option_code: '2', label: 'Less than half of the time', position: 4, score_value: 2, created_at: new Date().toISOString() },
    { id: `${qId}-opt-1`, question_id: qId, option_code: '1', label: 'Some of the time', position: 5, score_value: 1, created_at: new Date().toISOString() },
    { id: `${qId}-opt-0`, question_id: qId, option_code: '0', label: 'At no time', position: 6, score_value: 0, created_at: new Date().toISOString() }
  ];

  const who5Prompts = [
    { code: 'WHO5_Q1', prompt: 'I have felt cheerful and in good spirits' },
    { code: 'WHO5_Q2', prompt: 'I have felt calm and relaxed' },
    { code: 'WHO5_Q3', prompt: 'I have felt active and vigorous' },
    { code: 'WHO5_Q4', prompt: 'I woke up feeling fresh and rested' },
    { code: 'WHO5_Q5', prompt: 'My daily life has been filled with things that interest me' }
  ];

  const who5Questions: AssessmentQuestion[] = who5Prompts.map((item, idx) => {
    const qId = `q-who5-${idx + 1}`;
    return {
      id: qId,
      assessment_version_id: who5VerId,
      section_id: who5SectionId,
      question_code: item.code,
      position: idx + 1,
      prompt: item.prompt,
      help_text: 'Please indicate for each of the five statements which is closest to how you have been feeling over the last two weeks.',
      question_type: QuestionType.LIKERT,
      required: true,
      response_schema: { min: 0, max: 5, allowed_values: ['0', '1', '2', '3', '4', '5'] },
      clinical_significance: 'WELLBEING_INDEX',
      scoring_key_reference: 'WELLBEING_TOTAL',
      options: who5Options(qId),
      created_at: new Date().toISOString()
    };
  });

  const who5Bundle: SeedInstrumentBundle = {
    definition: {
      id: who5DefId,
      code: 'WHO-5',
      name: 'WHO-5 Well-Being Index',
      description: 'World Health Organization 5-item index measuring subjective psychological well-being.',
      assessment_type: AssessmentType.WELLBEING_CHECK,
      owner_domain: 'clinical',
      owner: 'CLINICAL_GOVERNANCE_COMMITTEE',
      clinical_artifact_id: 'art-who5-001',
      status: 'ACTIVE',
      default_language: 'en',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    version: {
      id: who5VerId,
      assessment_definition_id: who5DefId,
      version: 1,
      status: AssessmentVersionState.ACTIVE,
      clinical_artifact_version: 1,
      title: 'WHO-5 Well-Being Index - Canonical Edition',
      instructions: 'Please indicate for each statement how you have felt over the past two weeks. Select the response that best matches your feelings.',
      population: { min_age: 18, max_age: 120 },
      jurisdictions: ['KE', 'US', 'GB'],
      estimated_duration_minutes: 2,
      scoring_model_version: '1.0.0',
      interpretation_model_version: '1.0.0',
      effective_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    },
    sections: [
      {
        id: who5SectionId,
        assessment_version_id: who5VerId,
        code: 'WHO5_MAIN',
        title: 'Psychological Well-Being',
        position: 1,
        created_at: new Date().toISOString()
      }
    ],
    questions: who5Questions,
    scoringModel: {
      id: who5ScoringId,
      assessment_version_id: who5VerId,
      version: '1.0.0',
      scoring_type: ScoringType.NORMALIZED_PERCENTAGE,
      algorithm_reference: 'ALG_WHO5_PERCENT',
      configuration: { multiplier: 4, min_percentage: 0, max_percentage: 100 },
      clinical_artifact_reference: 'art-who5-001',
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    },
    interpretationModel: {
      id: who5InterpId,
      assessment_version_id: who5VerId,
      version: '1.0.0',
      clinical_artifact_reference: 'art-who5-001',
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    },
    scoreBands: [
      {
        id: 'band-who5-low',
        interpretation_model_id: who5InterpId,
        code: 'REDUCED_WELLBEING',
        minimum: 0,
        maximum: 50,
        label: 'Reduced Well-Being',
        user_message: 'Your score indicates reduced subjective well-being over the past two weeks. Further clinical evaluation is recommended to explore contributing factors.',
        clinical_significance: 'LOW_WELLBEING_SCREEN_POSITIVE',
        position: 1
      },
      {
        id: 'band-who5-ok',
        interpretation_model_id: who5InterpId,
        code: 'SATISFACTORY_WELLBEING',
        minimum: 51,
        maximum: 100,
        label: 'Satisfactory Well-Being',
        user_message: 'Your responses indicate adequate subjective psychological well-being over the past two weeks.',
        clinical_significance: 'NORMAL_WELLBEING',
        position: 2
      }
    ],
    eligibilityPolicy: {
      id: 'elp-who5-001',
      assessment_definition_id: who5DefId,
      min_age: 18,
      max_age: 120,
      allowed_jurisdictions: ['KE', 'US', 'GB'],
      required_consents: ['CONSENT_CLINICAL_SCREENING'],
      excluded_risk_states: [],
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    },
    retakePolicy: {
      id: 'rtp-who5-001',
      assessment_definition_id: who5DefId,
      minimum_interval_days: 7,
      recommended_interval_days: 14,
      allow_early_retake: true,
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    },
    safetyRules: []
  };

  // --------------------------------------------------------------------------
  // 4. C-SSRS Screener (Columbia-Suicide Severity Rating Scale)
  // Demonstrates: Branching, Risk Screen, Multi-level acute safety rules
  // --------------------------------------------------------------------------
  const cssrsDefId = 'def-cssrs-0000-0000-000000000001';
  const cssrsVerId = 'ver-cssrs-0000-0000-000000000001';
  const cssrsSectionId = 'sec-cssrs-0000-0000-000000000001';
  const cssrsScoringId = 'scm-cssrs-0000-0000-000000000001';
  const cssrsInterpId = 'inm-cssrs-0000-0000-000000000001';

  const yesNoOptions: (qId: string, yesScore: number) => AssessmentOption[] = (qId, yesScore) => [
    { id: `${qId}-no`, question_id: qId, option_code: 'NO', label: 'No', position: 1, score_value: 0, created_at: new Date().toISOString() },
    { id: `${qId}-yes`, question_id: qId, option_code: 'YES', label: 'Yes', position: 2, score_value: yesScore, created_at: new Date().toISOString() }
  ];

  const cssrsQuestions: AssessmentQuestion[] = [
    {
      id: 'q-cssrs-1',
      assessment_version_id: cssrsVerId,
      section_id: cssrsSectionId,
      question_code: 'CSSRS_Q1',
      position: 1,
      prompt: 'Have you wished you were dead, or wished you could go to sleep and not wake up?',
      question_type: QuestionType.SINGLE_CHOICE,
      required: true,
      response_schema: { allowed_values: ['NO', 'YES'] },
      clinical_significance: 'PASSIVE_SUICIDAL_IDEATION',
      safety_significance: 'SAFETY_EVALUATION',
      options: yesNoOptions('q-cssrs-1', 1),
      created_at: new Date().toISOString()
    },
    {
      id: 'q-cssrs-2',
      assessment_version_id: cssrsVerId,
      section_id: cssrsSectionId,
      question_code: 'CSSRS_Q2',
      position: 2,
      prompt: 'Have you actually had any thoughts of killing yourself?',
      question_type: QuestionType.SINGLE_CHOICE,
      required: true,
      response_schema: { allowed_values: ['NO', 'YES'] },
      clinical_significance: 'ACTIVE_SUICIDAL_IDEATION',
      safety_significance: 'GATEWAY_FOR_BRANCHING',
      options: yesNoOptions('q-cssrs-2', 2),
      created_at: new Date().toISOString()
    },
    {
      id: 'q-cssrs-3',
      assessment_version_id: cssrsVerId,
      section_id: cssrsSectionId,
      question_code: 'CSSRS_Q3',
      position: 3,
      prompt: 'Have you thought about how you might do this?',
      question_type: QuestionType.SINGLE_CHOICE,
      required: true,
      response_schema: { allowed_values: ['NO', 'YES'] },
      clinical_significance: 'SUICIDAL_METHOD_THOUGHT',
      visibility_rule: {
        operator: 'AND',
        conditions: [{ question_code: 'CSSRS_Q2', operator: 'equals', value: 'YES' }]
      },
      options: yesNoOptions('q-cssrs-3', 3),
      created_at: new Date().toISOString()
    },
    {
      id: 'q-cssrs-4',
      assessment_version_id: cssrsVerId,
      section_id: cssrsSectionId,
      question_code: 'CSSRS_Q4',
      position: 4,
      prompt: 'Have you had these thoughts and had some intention of acting on them?',
      question_type: QuestionType.SINGLE_CHOICE,
      required: true,
      response_schema: { allowed_values: ['NO', 'YES'] },
      clinical_significance: 'SUICIDAL_INTENT',
      safety_significance: 'ACUTE_CRITICAL_TRIGGER',
      visibility_rule: {
        operator: 'AND',
        conditions: [{ question_code: 'CSSRS_Q2', operator: 'equals', value: 'YES' }]
      },
      options: yesNoOptions('q-cssrs-4', 4),
      created_at: new Date().toISOString()
    },
    {
      id: 'q-cssrs-5',
      assessment_version_id: cssrsVerId,
      section_id: cssrsSectionId,
      question_code: 'CSSRS_Q5',
      position: 5,
      prompt: 'Have you started to work out or worked out the details of how to kill yourself? Do you intend to carry out this plan?',
      question_type: QuestionType.SINGLE_CHOICE,
      required: true,
      response_schema: { allowed_values: ['NO', 'YES'] },
      clinical_significance: 'SUICIDAL_PLAN_AND_INTENT',
      safety_significance: 'ACUTE_CRITICAL_TRIGGER',
      visibility_rule: {
        operator: 'AND',
        conditions: [{ question_code: 'CSSRS_Q2', operator: 'equals', value: 'YES' }]
      },
      options: yesNoOptions('q-cssrs-5', 5),
      created_at: new Date().toISOString()
    },
    {
      id: 'q-cssrs-6',
      assessment_version_id: cssrsVerId,
      section_id: cssrsSectionId,
      question_code: 'CSSRS_Q6',
      position: 6,
      prompt: 'Have you ever done anything, started to do anything, or prepared to do anything to end your life?',
      question_type: QuestionType.SINGLE_CHOICE,
      required: true,
      response_schema: { allowed_values: ['NO', 'YES'] },
      clinical_significance: 'SUICIDAL_BEHAVIOR_PREPARATION',
      safety_significance: 'ACUTE_CRITICAL_TRIGGER',
      options: yesNoOptions('q-cssrs-6', 5),
      created_at: new Date().toISOString()
    }
  ];

  const cssrsBundle: SeedInstrumentBundle = {
    definition: {
      id: cssrsDefId,
      code: 'C-SSRS',
      name: 'Columbia-Suicide Severity Rating Scale (C-SSRS) Screener',
      description: 'Gold-standard risk screening instrument assessing suicide ideation, method, intent, and preparatory behavior.',
      assessment_type: AssessmentType.RISK_SCREEN,
      owner_domain: 'clinical',
      owner: 'CLINICAL_GOVERNANCE_COMMITTEE',
      clinical_artifact_id: 'art-cssrs-001',
      status: 'ACTIVE',
      default_language: 'en',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    version: {
      id: cssrsVerId,
      assessment_definition_id: cssrsDefId,
      version: 1,
      status: AssessmentVersionState.ACTIVE,
      clinical_artifact_version: 1,
      title: 'Columbia-Suicide Severity Rating Scale Screener',
      instructions: 'Please answer the following questions regarding thoughts or experiences over the past month. Your answers are strictly confidential and help ensure your safety.',
      population: { min_age: 18, max_age: 120 },
      jurisdictions: ['KE', 'US', 'GB'],
      estimated_duration_minutes: 3,
      scoring_model_version: '1.0.0',
      interpretation_model_version: '1.0.0',
      effective_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    },
    sections: [
      {
        id: cssrsSectionId,
        assessment_version_id: cssrsVerId,
        code: 'CSSRS_MAIN',
        title: 'Safety Risk Screener',
        position: 1,
        created_at: new Date().toISOString()
      }
    ],
    questions: cssrsQuestions,
    scoringModel: {
      id: cssrsScoringId,
      assessment_version_id: cssrsVerId,
      version: '1.0.0',
      scoring_type: ScoringType.SUM,
      algorithm_reference: 'ALG_CSSRS_SEVERITY',
      configuration: { min_score: 0, max_score: 20 },
      clinical_artifact_reference: 'art-cssrs-001',
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    },
    interpretationModel: {
      id: cssrsInterpId,
      assessment_version_id: cssrsVerId,
      version: '1.0.0',
      clinical_artifact_reference: 'art-cssrs-001',
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    },
    scoreBands: [
      {
        id: 'band-cssrs-none',
        interpretation_model_id: cssrsInterpId,
        code: 'LOW_RISK',
        minimum: 0,
        maximum: 0,
        label: 'Low / No Risk Identified',
        user_message: 'No immediate suicide risk indicators were reported on this screener.',
        clinical_significance: 'NO_IMMEDIATE_RISK',
        position: 1
      },
      {
        id: 'band-cssrs-mod',
        interpretation_model_id: cssrsInterpId,
        code: 'MODERATE_RISK',
        minimum: 1,
        maximum: 3,
        label: 'Moderate Risk Identified',
        user_message: 'Passive or mild ideation reported. Referral for clinical discussion and coping plan recommended.',
        clinical_significance: 'MODERATE_SUICIDE_RISK',
        position: 2
      },
      {
        id: 'band-cssrs-high',
        interpretation_model_id: cssrsInterpId,
        code: 'HIGH_RISK',
        minimum: 4,
        maximum: 20,
        label: 'High Risk / Clinical Support Prioritized',
        user_message: 'Active ideation, intent, or preparatory behavior reported. Immediate safety support resources prioritized.',
        clinical_significance: 'HIGH_ACUTE_SUICIDE_RISK',
        position: 3
      }
    ],
    eligibilityPolicy: {
      id: 'elp-cssrs-001',
      assessment_definition_id: cssrsDefId,
      min_age: 18,
      max_age: 120,
      allowed_jurisdictions: ['KE', 'US', 'GB'],
      required_consents: ['CONSENT_CLINICAL_SCREENING'],
      excluded_risk_states: [],
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    },
    retakePolicy: {
      id: 'rtp-cssrs-001',
      assessment_definition_id: cssrsDefId,
      minimum_interval_days: 1,
      recommended_interval_days: 7,
      allow_early_retake: true,
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    },
    safetyRules: [
      {
        id: 'rule-cssrs-q1',
        assessment_version_id: cssrsVerId,
        question_id: 'q-cssrs-1',
        question_code: 'CSSRS_Q1',
        condition: { operator: 'equals', threshold_value: 'YES' },
        signal_code: 'SIG_SUICIDAL_IDEATION_PASSIVE',
        severity: 'HIGH',
        confidence: 'CONFIRMED',
        clinical_policy_reference: 'POL-SAFE-001',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      },
      {
        id: 'rule-cssrs-q2',
        assessment_version_id: cssrsVerId,
        question_id: 'q-cssrs-2',
        question_code: 'CSSRS_Q2',
        condition: { operator: 'equals', threshold_value: 'YES' },
        signal_code: 'SIG_SUICIDAL_IDEATION_ACTIVE',
        severity: 'HIGH',
        confidence: 'CONFIRMED',
        clinical_policy_reference: 'POL-SAFE-001',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      },
      {
        id: 'rule-cssrs-q4',
        assessment_version_id: cssrsVerId,
        question_id: 'q-cssrs-4',
        question_code: 'CSSRS_Q4',
        condition: { operator: 'equals', threshold_value: 'YES' },
        signal_code: 'SIG_SUICIDAL_INTENT_ACTIVE',
        severity: 'CRITICAL',
        confidence: 'CONFIRMED',
        clinical_policy_reference: 'POL-SAFE-001',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      },
      {
        id: 'rule-cssrs-q5',
        assessment_version_id: cssrsVerId,
        question_id: 'q-cssrs-5',
        question_code: 'CSSRS_Q5',
        condition: { operator: 'equals', threshold_value: 'YES' },
        signal_code: 'SIG_SUICIDAL_INTENT_ACTIVE',
        severity: 'CRITICAL',
        confidence: 'CONFIRMED',
        clinical_policy_reference: 'POL-SAFE-001',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      },
      {
        id: 'rule-cssrs-q6',
        assessment_version_id: cssrsVerId,
        question_id: 'q-cssrs-6',
        question_code: 'CSSRS_Q6',
        condition: { operator: 'equals', threshold_value: 'YES' },
        signal_code: 'SIG_SUICIDAL_BEHAVIOR_ACTIVE',
        severity: 'CRITICAL',
        confidence: 'CONFIRMED',
        clinical_policy_reference: 'POL-SAFE-001',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      }
    ]
  };

  return [phq9Bundle, gad7Bundle, who5Bundle, cssrsBundle];
}
