/**
 * MindOS Governed Mental Health Specialty Registry
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 * Invariant: Specialty improves directory matching, but does NOT expand or substitute for Scope of Practice.
 */

import { ProfessionalSpecialtyEntity } from '../domain/entities.js';

export class SpecialtyRegistry {
  private static readonly CANONICAL_SPECIALTIES: ProfessionalSpecialtyEntity[] = [
    {
      id: 'spec-dep-001',
      code: 'DEPRESSION',
      name: 'Depression & Mood Disorders',
      domain: 'CLINICAL_PSYCHOLOGY',
      description: 'Major depressive disorder, dysthymia, and persistent depressive mood patterns.',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'spec-anx-002',
      code: 'ANXIETY',
      name: 'Anxiety & Panic Disorders',
      domain: 'CLINICAL_PSYCHOLOGY',
      description: 'Generalized anxiety, panic attacks, social anxiety, and phobias.',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'spec-trauma-003',
      code: 'TRAUMA_PTSD',
      name: 'Trauma & PTSD',
      domain: 'CLINICAL_PSYCHOLOGY',
      description: 'Post-traumatic stress, acute stress disorder, complex trauma, and EMDR/trauma therapies.',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'spec-sub-004',
      code: 'SUBSTANCE_USE',
      name: 'Substance Use & Addictions',
      domain: 'ADDICTION_MEDICINE',
      description: 'Substance dependency, behavioral addictions, and harm-reduction recovery.',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'spec-child-005',
      code: 'CHILD_ADOLESCENT',
      name: 'Child & Adolescent Mental Health',
      domain: 'DEVELOPMENTAL_PSYCHOLOGY',
      description: 'Developmental milestones, youth emotional regulation, school behavioral challenges.',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'spec-peri-006',
      code: 'PERINATAL_MENTAL_HEALTH',
      name: 'Perinatal & Maternal Mental Health',
      domain: 'WOMENS_MENTAL_HEALTH',
      description: 'Postpartum depression, pregnancy anxiety, birth trauma, and maternal wellbeing.',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'spec-grief-007',
      code: 'GRIEF_LOSS',
      name: 'Grief & Bereavement',
      domain: 'COUNSELLING',
      description: 'Coping with loss, complicated bereavement, life transitions.',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'spec-eat-008',
      code: 'EATING_DISORDERS',
      name: 'Eating Disorders',
      domain: 'CLINICAL_PSYCHOLOGY',
      description: 'Anorexia, bulimia, binge-eating disorder, body dysmorphia.',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'spec-adhd-009',
      code: 'NEURODIVERGENCE_ADHD_ASD',
      name: 'Neurodivergence (ADHD & Autism)',
      domain: 'NEURODEVELOPMENTAL',
      description: 'Adult and pediatric ADHD, Autism Spectrum assessments and executive functioning coaching.',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'spec-bip-010',
      code: 'BIPOLAR_DISORDER',
      name: 'Bipolar & Related Disorders',
      domain: 'PSYCHIATRY',
      description: 'Bipolar I & II, cyclothymia, mood stabilization coordination.',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'spec-psych-011',
      code: 'PSYCHOSIS',
      name: 'Psychosis & Schizophrenia Spectrum',
      domain: 'PSYCHIATRY',
      description: 'First-episode psychosis, schizophrenia spectrum disorders, specialized psychiatric care.',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'spec-rel-012',
      code: 'RELATIONSHIPS_COUPLES',
      name: 'Couples & Family Therapy',
      domain: 'FAMILY_THERAPY',
      description: 'Relationship conflict resolution, marital counseling, family systemic therapy.',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'spec-stress-013',
      code: 'STRESS_BURNOUT',
      name: 'Workplace Stress & Burnout',
      domain: 'HEALTH_PSYCHOLOGY',
      description: 'Occupational exhaustion, work-life balance, somatic stress manifestations.',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'spec-lgbtq-014',
      code: 'LGBTQ_AFFIRMING',
      name: 'LGBTQ+ Affirming Care',
      domain: 'COUNSELLING',
      description: 'Affirmative psychological support for sexual and gender diverse communities.',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z'
    }
  ];

  public static getSpecialties(): ProfessionalSpecialtyEntity[] {
    return [...SpecialtyRegistry.CANONICAL_SPECIALTIES];
  }

  public static isValidSpecialty(code: string): boolean {
    return SpecialtyRegistry.CANONICAL_SPECIALTIES.some(s => s.code === code && s.is_active);
  }

  public static getSpecialty(code: string): ProfessionalSpecialtyEntity | undefined {
    return SpecialtyRegistry.CANONICAL_SPECIALTIES.find(s => s.code === code);
  }
}
