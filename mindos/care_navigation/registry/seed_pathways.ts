/**
 * MindOS Canonical Care Pathway Definitions
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
 * Kenyan Mental Health Policy 2014-2030, WHO Mental Health Gap Action Programme (mhGAP)
 */

import { CarePathwayEntity, CareLevel, SupportNeedDomain, CarePathwayState, RiskState } from '../domain/types.js';

export const CANONICAL_SEED_PATHWAYS: CarePathwayEntity[] = [
  {
    id: '01918d00-0030-7000-8000-000000000001',
    code: 'PATHWAY_SELF_MILD_MOOD',
    name: 'Mild Mood & Self-Guided Coping Pathway',
    version: 1,
    care_level: CareLevel.LEVEL_0,
    target_need_domains: [SupportNeedDomain.DEPRESSION_MOOD, SupportNeedDomain.GENERAL_WELLBEING],
    clinical_artifact_id: '01918a00-0010-7000-8000-000000000001',
    description: 'Evidence-based digital psychoeducation and self-directed behavioral activation for mild mood fluctuations.',
    eligibility_criteria: {
      min_phq9: 0,
      max_phq9: 9,
      required_consents: ['TERMS_OF_SERVICE']
    },
    exclusion_criteria: {
      active_risk_states: [RiskState.HIGH, RiskState.URGENT]
    },
    interventions: [
      {
        step_number: 1,
        title: 'Understanding Mood Fluctuations',
        intervention_type: 'DIGITAL_CONTENT',
        resource_ref: 'art-understanding-mood-patterns',
        description: 'Psychoeducational guide on identifying early emotional dip triggers.'
      },
      {
        step_number: 2,
        title: 'Behavioral Activation & Micro-Pacing',
        intervention_type: 'EXERCISE',
        resource_ref: 'ex-activity-scheduling',
        description: 'Small daily positive reinforcement routines to build momentum.'
      },
      {
        step_number: 3,
        title: 'Weekly PHQ-9 Wellbeing Check-In',
        intervention_type: 'ASSESSMENT',
        resource_ref: 'PHQ-9',
        description: 'Periodic symptom tracking to ensure care level remains appropriate.'
      }
    ],
    state: CarePathwayState.ACTIVE,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  },
  {
    id: '01918d00-0030-7000-8000-000000000002',
    code: 'PATHWAY_SELF_STRESS_ANXIETY',
    name: 'Stress Resilience & Grounding Pathway',
    version: 1,
    care_level: CareLevel.LEVEL_0,
    target_need_domains: [SupportNeedDomain.ANXIETY_STRESS, SupportNeedDomain.SLEEP_HYGIENE, SupportNeedDomain.WORKPLACE_BURNOUT],
    clinical_artifact_id: '01918a00-0010-7000-8000-000000000002',
    description: 'Self-guided somatic regulation, somatic grounding, and sleep hygiene practices for stress and mild anxiety.',
    eligibility_criteria: {
      min_gad7: 0,
      max_gad7: 9
    },
    exclusion_criteria: {
      active_risk_states: [RiskState.HIGH, RiskState.URGENT]
    },
    interventions: [
      {
        step_number: 1,
        title: 'Physiological Sigh & Box Breathing',
        intervention_type: 'EXERCISE',
        resource_ref: 'ex-box-breathing',
        description: 'Autonomic nervous system down-regulation for acute stress spikes.'
      },
      {
        step_number: 2,
        title: 'Cognitive Reframing of Stressors',
        intervention_type: 'DIGITAL_CONTENT',
        resource_ref: 'art-stress-reframing',
        description: 'Structured guide to categorizing controllable vs uncontrollable life stressors.'
      },
      {
        step_number: 3,
        title: 'Sleep Hygiene Routine Builder',
        intervention_type: 'EXERCISE',
        resource_ref: 'ex-sleep-winddown',
        description: 'Evening screen-free winddown and restorative rest hygiene.'
      }
    ],
    state: CarePathwayState.ACTIVE,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  },
  {
    id: '01918d00-0030-7000-8000-000000000003',
    code: 'PATHWAY_PEER_COMMUNITY_SUPPORT',
    name: 'Peer Circles & Community Wellness Pathway',
    version: 1,
    care_level: CareLevel.LEVEL_1,
    target_need_domains: [SupportNeedDomain.GENERAL_WELLBEING, SupportNeedDomain.GRIEF_LOSS, SupportNeedDomain.RELATIONSHIP_FAMILY, SupportNeedDomain.WORKPLACE_BURNOUT],
    description: 'Moderated peer circles and trained wellness navigators providing mutual psychosocial support in community safe spaces.',
    eligibility_criteria: {
      required_consents: ['COMMUNITY_PARTICIPATION']
    },
    exclusion_criteria: {
      active_risk_states: [RiskState.HIGH, RiskState.URGENT]
    },
    interventions: [
      {
        step_number: 1,
        title: 'Weekly Moderated Peer Support Circle',
        intervention_type: 'PEER_CIRCLE',
        resource_ref: 'circle-general-wellbeing',
        description: 'Facilitated group reflection led by certified community peer champion.'
      },
      {
        step_number: 2,
        title: 'Community Shared Coping Resources',
        intervention_type: 'DIGITAL_CONTENT',
        resource_ref: 'art-community-resilience',
        description: 'Local stories and practical resilience strategies from Kenyan community members.'
      }
    ],
    state: CarePathwayState.ACTIVE,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  },
  {
    id: '01918d00-0030-7000-8000-000000000004',
    code: 'PATHWAY_LOW_INTENSITY_COACHING',
    name: 'Low-Intensity Counseling & Skills Coaching Pathway',
    version: 1,
    care_level: CareLevel.LEVEL_2,
    target_need_domains: [SupportNeedDomain.DEPRESSION_MOOD, SupportNeedDomain.ANXIETY_STRESS, SupportNeedDomain.WORKPLACE_BURNOUT],
    clinical_artifact_id: '01918a00-0010-7000-8000-000000000003',
    description: 'Structured short-term counseling and psychological coaching delivered by registered psychological counselors.',
    eligibility_criteria: {
      min_phq9: 5,
      max_phq9: 14,
      min_gad7: 5,
      max_gad7: 14
    },
    exclusion_criteria: {
      active_risk_states: [RiskState.HIGH, RiskState.URGENT]
    },
    interventions: [
      {
        step_number: 1,
        title: 'Telehealth Intake & Problem-Solving Counseling',
        intervention_type: 'CONSULTATION',
        description: 'Structured 45-minute virtual counseling session with registered Kenyan counselor.'
      },
      {
        step_number: 2,
        title: 'Guided Cognitive Restructuring Exercises',
        intervention_type: 'EXERCISE',
        resource_ref: 'ex-thought-records',
        description: 'Self-guided thought diary and belief examination between sessions.'
      }
    ],
    state: CarePathwayState.ACTIVE,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  },
  {
    id: '01918d00-0030-7000-8000-000000000005',
    code: 'PATHWAY_HIGH_INTENSITY_PSYCHOTHERAPY',
    name: 'High-Intensity Clinical Psychotherapy Pathway',
    version: 1,
    care_level: CareLevel.LEVEL_3,
    target_need_domains: [SupportNeedDomain.DEPRESSION_MOOD, SupportNeedDomain.ANXIETY_STRESS, SupportNeedDomain.TRAUMA_PTSD],
    clinical_artifact_id: '01918a00-0010-7000-8000-000000000004',
    description: 'Comprehensive psychological treatment by licensed clinical psychologists for moderate-to-severe symptoms.',
    eligibility_criteria: {
      min_phq9: 10,
      min_gad7: 10
    },
    exclusion_criteria: {
      active_risk_states: [RiskState.URGENT]
    },
    interventions: [
      {
        step_number: 1,
        title: 'Comprehensive Clinical Psychological Intake',
        intervention_type: 'CONSULTATION',
        description: 'Detailed diagnostic assessment and formulation with licensed clinical psychologist.'
      },
      {
        step_number: 2,
        title: 'Individualized Evidence-Based Psychotherapy (CBT/EMDR)',
        intervention_type: 'CONSULTATION',
        description: 'Multi-week structured psychological intervention protocol.'
      },
      {
        step_number: 3,
        title: 'Standardized Outcome Monitoring',
        intervention_type: 'ASSESSMENT',
        resource_ref: 'PHQ-9',
        description: 'Regular re-assessment tracking clinical symptom reduction over time.'
      }
    ],
    state: CarePathwayState.ACTIVE,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  },
  {
    id: '01918d00-0030-7000-8000-000000000006',
    code: 'PATHWAY_SPECIALIST_PSYCHIATRIC',
    name: 'Specialist Psychiatric & Multidisciplinary Care Pathway',
    version: 1,
    care_level: CareLevel.LEVEL_4,
    target_need_domains: [SupportNeedDomain.DEPRESSION_MOOD, SupportNeedDomain.SUBSTANCE_ADDICTION, SupportNeedDomain.NEURODIVERSITY],
    clinical_artifact_id: '01918a00-0010-7000-8000-000000000005',
    description: 'Consultant psychiatrist medical evaluation, pharmacotherapy review, and coordinated multidisciplinary care.',
    eligibility_criteria: {
      min_phq9: 15
    },
    exclusion_criteria: {
      active_risk_states: [RiskState.URGENT]
    },
    interventions: [
      {
        step_number: 1,
        title: 'Psychiatric Medical Evaluation',
        intervention_type: 'CONSULTATION',
        description: 'Medical assessment, diagnostic confirmation, and medication suitability analysis.'
      },
      {
        step_number: 2,
        title: 'Multidisciplinary Team Care Coordination',
        intervention_type: 'CONSULTATION',
        description: 'Integrated care planning linking psychiatry, clinical psychology, and social care.'
      }
    ],
    state: CarePathwayState.ACTIVE,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  },
  {
    id: '01918d00-0030-7000-8000-000000000007',
    code: 'PATHWAY_CRISIS_EMERGENCY_RESPONSE',
    name: 'Acute Crisis & Emergency Intervention Pathway',
    version: 1,
    care_level: CareLevel.LEVEL_EMERGENCY,
    target_need_domains: [SupportNeedDomain.ACUTE_CRISIS, SupportNeedDomain.DEPRESSION_MOOD],
    clinical_artifact_id: '01918a00-0010-7000-8000-000000000006',
    description: 'Immediate crisis response pathway connecting to verified Kenyan 24/7 hotlines, casualty referral, and personal safety plans.',
    eligibility_criteria: {},
    exclusion_criteria: {},
    interventions: [
      {
        step_number: 1,
        title: 'Immediate 24/7 Crisis Hotline Connection',
        intervention_type: 'CONSULTATION',
        resource_ref: 'Befrienders Kenya Helpline (+254 722 178 177)',
        description: 'Direct access to toll-free verified crisis counseling and active listening.'
      },
      {
        step_number: 2,
        title: 'Emergency Services Notification (Kenya 999/1199)',
        intervention_type: 'CONSULTATION',
        resource_ref: 'Kenya Emergency 999 / 1199',
        description: 'Urgent emergency dispatch contact for immediate life safety.'
      },
      {
        step_number: 3,
        title: 'Tertiary Hospital Casualty Referral (Mathari National Hospital)',
        intervention_type: 'CONSULTATION',
        resource_ref: 'Mathari National Teaching and Referral Hospital',
        description: 'National psychiatric tertiary facility emergency casualty wing.'
      }
    ],
    state: CarePathwayState.ACTIVE,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  }
];
