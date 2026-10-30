/**
 * MindOS Canonical Outcome Measure Definitions & Comparability Policies
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 23 Seed Registry
 */

import { OutcomeMeasureDefinition, MeasureComparabilityPolicy } from '../domain/entities.js';
import {
  OutcomeMeasureType,
  OutcomeValueType,
  OutcomeDirectionality
} from '../domain/types.js';

export function getCanonicalSeedMeasures(): {
  definitions: OutcomeMeasureDefinition[];
  policies: MeasureComparabilityPolicy[];
} {
  const policies: MeasureComparabilityPolicy[] = [
    {
      id: 'comp_policy_phq9',
      measure_code: 'PHQ9_TOTAL',
      allowed_version_pairs: [
        [1, 1],
        ['1.0.0', '1.0.0']
      ],
      unit_requirements: ['points'],
      population_constraints: ['ADULT_18_PLUS', 'ALL'],
      maximum_gap_days: 90,
      status: 'ACTIVE'
    },
    {
      id: 'comp_policy_gad7',
      measure_code: 'GAD7_TOTAL',
      allowed_version_pairs: [
        [1, 1],
        ['1.0.0', '1.0.0']
      ],
      unit_requirements: ['points'],
      population_constraints: ['ADULT_18_PLUS', 'ALL'],
      maximum_gap_days: 90,
      status: 'ACTIVE'
    },
    {
      id: 'comp_policy_who5',
      measure_code: 'WHO5_TOTAL',
      allowed_version_pairs: [
        [1, 1],
        ['1.0.0', '1.0.0']
      ],
      unit_requirements: ['points'],
      population_constraints: ['ALL'],
      maximum_gap_days: 90,
      status: 'ACTIVE'
    },
    {
      id: 'comp_policy_cssrs',
      measure_code: 'CSSRS_RISK_BAND',
      allowed_version_pairs: [
        [1, 1],
        ['1.0.0', '1.0.0']
      ],
      unit_requirements: ['band'],
      population_constraints: ['ALL'],
      maximum_gap_days: 30,
      status: 'ACTIVE'
    },
    {
      id: 'comp_policy_sleep',
      measure_code: 'SLEEP_HOURS_USER_REPORTED',
      allowed_version_pairs: [[1, 1]],
      unit_requirements: ['hours'],
      population_constraints: ['ALL'],
      maximum_gap_days: 14,
      status: 'ACTIVE'
    },
    {
      id: 'comp_policy_goal_conf',
      measure_code: 'GOAL_CONFIDENCE_RATING',
      allowed_version_pairs: [[1, 1]],
      unit_requirements: ['rating'],
      population_constraints: ['ALL'],
      maximum_gap_days: 60,
      status: 'ACTIVE'
    }
  ];

  const definitions: OutcomeMeasureDefinition[] = [
    {
      id: 'def_phq9_total',
      measure_code: 'PHQ9_TOTAL',
      name: 'PHQ-9 Depression Severity Score',
      description: 'Standardized 9-question patient health questionnaire total score (0-27).',
      measure_type: OutcomeMeasureType.ASSESSMENT_SCORE,
      unit: 'points',
      value_type: OutcomeValueType.INTEGER,
      directionality: OutcomeDirectionality.LOWER_IS_BETTER,
      population: 'ADULT_18_PLUS',
      jurisdiction: 'KE',
      source_domain: 'assessments',
      clinical_artifact_id: 'artifact_phq9',
      clinical_artifact_version: '1.0.0',
      comparability_policy_id: 'comp_policy_phq9',
      status: 'ACTIVE',
      min_value: 0,
      max_value: 27,
      created_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'def_gad7_total',
      measure_code: 'GAD7_TOTAL',
      name: 'GAD-7 Anxiety Severity Score',
      description: 'Generalized Anxiety Disorder 7-item scale total score (0-21).',
      measure_type: OutcomeMeasureType.ASSESSMENT_SCORE,
      unit: 'points',
      value_type: OutcomeValueType.INTEGER,
      directionality: OutcomeDirectionality.LOWER_IS_BETTER,
      population: 'ADULT_18_PLUS',
      jurisdiction: 'KE',
      source_domain: 'assessments',
      clinical_artifact_id: 'artifact_gad7',
      clinical_artifact_version: '1.0.0',
      comparability_policy_id: 'comp_policy_gad7',
      status: 'ACTIVE',
      min_value: 0,
      max_value: 21,
      created_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'def_who5_total',
      measure_code: 'WHO5_TOTAL',
      name: 'WHO-5 Wellbeing Index',
      description: 'World Health Organization 5-item Wellbeing Index (0-100).',
      measure_type: OutcomeMeasureType.ASSESSMENT_SCORE,
      unit: 'points',
      value_type: OutcomeValueType.INTEGER,
      directionality: OutcomeDirectionality.HIGHER_IS_BETTER,
      population: 'ALL',
      jurisdiction: 'KE',
      source_domain: 'assessments',
      clinical_artifact_id: 'artifact_who5',
      clinical_artifact_version: '1.0.0',
      comparability_policy_id: 'comp_policy_who5',
      status: 'ACTIVE',
      min_value: 0,
      max_value: 100,
      created_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'def_cssrs_risk_band',
      measure_code: 'CSSRS_RISK_BAND',
      name: 'C-SSRS Suicidality Risk Band',
      description: 'Columbia-Suicide Severity Rating Scale risk classification (0=None, 1=Low, 2=Moderate, 3=High).',
      measure_type: OutcomeMeasureType.SAFETY_RELATED_MEASURE,
      unit: 'band',
      value_type: OutcomeValueType.ORDINAL,
      directionality: OutcomeDirectionality.LOWER_IS_BETTER,
      population: 'ALL',
      jurisdiction: 'KE',
      source_domain: 'assessments',
      clinical_artifact_id: 'artifact_cssrs',
      clinical_artifact_version: '1.0.0',
      comparability_policy_id: 'comp_policy_cssrs',
      status: 'ACTIVE',
      min_value: 0,
      max_value: 3,
      created_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'def_sleep_hours',
      measure_code: 'SLEEP_HOURS_USER_REPORTED',
      name: 'Self-Reported Sleep Duration',
      description: 'Daily user-reported sleep duration in hours (target 7-9 hours).',
      measure_type: OutcomeMeasureType.USER_REPORTED_OUTCOME,
      unit: 'hours',
      value_type: OutcomeValueType.DECIMAL,
      directionality: OutcomeDirectionality.TARGET_RANGE,
      population: 'ALL',
      jurisdiction: 'KE',
      source_domain: 'user_reported',
      comparability_policy_id: 'comp_policy_sleep',
      status: 'ACTIVE',
      min_value: 0,
      max_value: 24,
      created_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'def_goal_confidence',
      measure_code: 'GOAL_CONFIDENCE_RATING',
      name: 'Care Goal Self-Efficacy Rating',
      description: 'Clinician- or user-rated confidence in achieving care plan goals (1-10 rating).',
      measure_type: OutcomeMeasureType.GOAL_MEASURE,
      unit: 'rating',
      value_type: OutcomeValueType.INTEGER,
      directionality: OutcomeDirectionality.HIGHER_IS_BETTER,
      population: 'ALL',
      jurisdiction: 'KE',
      source_domain: 'care_plans',
      comparability_policy_id: 'comp_policy_goal_conf',
      status: 'ACTIVE',
      min_value: 1,
      max_value: 10,
      created_at: '2026-01-01T00:00:00.000Z'
    }
  ];

  return { definitions, policies };
}
