/**
 * MindOS Governed Content & Psychoeducation Bounded Context
 * Authority: Master Architecture Index Section 8, Volumes I, III, XVI & Appendix B / C / Q
 * 
 * Owns:
 * - Content Registry & Immutable Content Versions
 * - Taxonomy, Controlled Vocabularies & Categorization
 * - Editorial & Clinical Governance Publishing Lifecycles
 * - Guided Exercises & Stateful Exercise Sessions
 * - Content Collections & Guided Learning Pathways
 * - Multi-lingual Localizations (en-KE, sw-KE)
 * - Discovery, Search, Bookmarks, and Delivery
 * - Governed AI Context Retrieval Port & RAG Boundary
 * - Statutory Non-Diagnostic Disclaimers (R-SAFE-001, POL-SAFE-001)
 */

export * from './domain/types.js';
export * from './domain/invariants.ts';
export * from './taxonomy/registry.ts';
export * from './infrastructure/persistence.ts';
export * from './infrastructure/audit_integration.ts';
export * from './infrastructure/outbox_integration.ts';
export * from './infrastructure/safety_integration.ts';
export * from './authoring/service.ts';
export * from './publishing/workflow.ts';
export * from './localization/service.ts';
export * from './exercises/engine.ts';
export * from './collections/service.ts';
export * from './discovery/service.ts';
export * from './retrieval/boundary.ts';
export * from './application/service.ts';
export * from './api/routes.ts';
export * from './registry/seed.ts';

import { ContentApplicationService } from './application/service.ts';
import { ContentPersistenceStore } from './infrastructure/persistence.ts';
import { ContentSeedRegistry } from './registry/seed.ts';

/**
 * Backwards-compatibility adapter for legacy ContentService callers.
 */
export interface ContentArticleEntity {
  id: string;
  slug: string;
  title: string;
  body_markdown: string;
  category: 'SLEEP' | 'STRESS' | 'MOOD' | 'GROUNDING';
  language: string;
  clinical_artifact_id?: string;
  published_at: string;
}

export class ContentService {
  static {
    ContentApplicationService.initialize();
  }

  public static seedCanonicalContent(): void {
    ContentSeedRegistry.seedAll();
  }

  public static getArticles(language = 'en'): ContentArticleEntity[] {
    ContentApplicationService.initialize();
    const searchResults = ContentApplicationService.searchContent({ jurisdiction: 'KE' });
    return searchResults
      .filter(r => r.language === language || language === 'all')
      .map(r => ({
        id: r.definition_id,
        slug: r.code.toLowerCase(),
        title: r.title,
        body_markdown: r.summary,
        category: (r.primary_topic.includes('SLEEP') ? 'SLEEP' :
                   r.primary_topic.includes('STRESS') ? 'STRESS' :
                   r.primary_topic.includes('MOOD') ? 'MOOD' : 'GROUNDING') as any,
        language: r.language,
        published_at: new Date().toISOString()
      }));
  }

  public static resetForTesting(): void {
    ContentPersistenceStore.clearAllForTesting();
    ContentSeedRegistry.seedAll();
  }
}
