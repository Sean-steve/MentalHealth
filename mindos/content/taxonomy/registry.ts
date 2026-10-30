/**
 * MindOS Canonical Content Taxonomy Registry
 * Authority: Master Architecture Index Section 8, Volume XVI & Appendix B / Q
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import {
  ContentTaxonomy,
  ContentTaxonomyTerm,
  ContentTermAssignment
} from '../domain/types.js';
import { ContentPersistenceStore } from '../infrastructure/persistence.ts';

export class ContentTaxonomyRegistry {
  private static initialized = false;

  public static resetForTesting(): void {
    this.initialized = false;
  }

  public static initialize(): void {
    if (this.initialized) return;

    // 1. Topic Taxonomy
    const topicTax: ContentTaxonomy = {
      id: generateUUIDv7(),
      code: 'TOPIC',
      name: 'Clinical & Wellness Topics',
      taxonomy_type: 'TOPIC',
      description: 'Primary mental health domains and concerns',
      created_at: new Date().toISOString()
    };
    ContentPersistenceStore.saveTaxonomy(topicTax);

    const topics = [
      { code: 'ANXIETY_PANIC', name: 'Anxiety & Panic Management' },
      { code: 'STRESS_BURNOUT', name: 'Stress, Burnout & Work Wellbeing' },
      { code: 'SLEEP_HEALTH', name: 'Sleep Hygiene & Rest' },
      { code: 'MOOD_DEPRESSION', name: 'Mood Balance & Low Energy' },
      { code: 'GROUNDING_DEESCALATION', name: 'Acute Grounding & De-escalation' },
      { code: 'PERINATAL_WELLBEING', name: 'Maternal & Perinatal Mental Health' },
      { code: 'TRAUMA_RECOVERY', name: 'Trauma Coping & Somatic Safety' },
      { code: 'RELATIONSHIPS', name: 'Interpersonal Boundaries & Relationships' }
    ];

    for (const t of topics) {
      ContentPersistenceStore.saveTerm({
        id: generateUUIDv7(),
        taxonomy_id: topicTax.id,
        code: t.code,
        name: t.name,
        created_at: new Date().toISOString()
      });
    }

    // 2. Audience Taxonomy
    const audienceTax: ContentTaxonomy = {
      id: generateUUIDv7(),
      code: 'AUDIENCE',
      name: 'Target Population & Demographic',
      taxonomy_type: 'AUDIENCE',
      description: 'Intended readership and life contexts',
      created_at: new Date().toISOString()
    };
    ContentPersistenceStore.saveTaxonomy(audienceTax);

    const audiences = [
      { code: 'GENERAL_ADULT', name: 'General Adults (18+)' },
      { code: 'ADOLESCENT', name: 'Youth & Adolescents (13-17)' },
      { code: 'CAREGIVER', name: 'Caregivers & Healthcare Workers' },
      { code: 'PERINATAL', name: 'Pregnant & Postpartum Women' },
      { code: 'TRAUMA_SURVIVOR', name: 'Trauma Survivors' }
    ];

    for (const a of audiences) {
      ContentPersistenceStore.saveTerm({
        id: generateUUIDv7(),
        taxonomy_id: audienceTax.id,
        code: a.code,
        name: a.name,
        created_at: new Date().toISOString()
      });
    }

    // 3. Goal Taxonomy
    const goalTax: ContentTaxonomy = {
      id: generateUUIDv7(),
      code: 'GOAL',
      name: 'Intervention Goals',
      taxonomy_type: 'GOAL',
      description: 'Outcome objectives for exercises and psychoeducation',
      created_at: new Date().toISOString()
    };
    ContentPersistenceStore.saveTaxonomy(goalTax);

    const goals = [
      { code: 'ACUTE_CALMING', name: 'Immediate Acute Calming' },
      { code: 'SLEEP_HYGIENE', name: 'Sleep Hygiene & Bedtime Routine' },
      { code: 'SOMATIC_REGULATION', name: 'Somatic Down-Regulation' },
      { code: 'COGNITIVE_REFRAMING', name: 'Cognitive Reframing' },
      { code: 'CRISIS_SAFETY_PLANNING', name: 'Crisis Safety Planning' }
    ];

    for (const g of goals) {
      ContentPersistenceStore.saveTerm({
        id: generateUUIDv7(),
        taxonomy_id: goalTax.id,
        code: g.code,
        name: g.name,
        created_at: new Date().toISOString()
      });
    }

    this.initialized = true;
  }

  public static listTaxonomies(): ContentTaxonomy[] {
    this.initialize();
    return ContentPersistenceStore.listTaxonomies();
  }

  public static listTerms(taxonomyCode?: string): ContentTaxonomyTerm[] {
    this.initialize();
    if (taxonomyCode) {
      const tax = ContentPersistenceStore.getTaxonomy(taxonomyCode);
      if (!tax) return [];
      return ContentPersistenceStore.listTerms(tax.id);
    }
    return ContentPersistenceStore.listTerms();
  }

  public static assignTerm(params: {
    contentDefinitionId: string;
    termId: string;
    isPrimary?: boolean;
  }): ContentTermAssignment {
    const assignment: ContentTermAssignment = {
      id: generateUUIDv7(),
      content_definition_id: params.contentDefinitionId,
      term_id: params.termId,
      is_primary: params.isPrimary ?? false,
      created_at: new Date().toISOString()
    };
    ContentPersistenceStore.saveTermAssignment(assignment);
    return assignment;
  }

  public static getTermsForDefinition(defId: string): ContentTaxonomyTerm[] {
    const assignments = ContentPersistenceStore.getTermAssignments(defId);
    const terms: ContentTaxonomyTerm[] = [];
    for (const a of assignments) {
      const t = ContentPersistenceStore.getTerm(a.term_id);
      if (t) terms.push(t);
    }
    return terms;
  }
}
