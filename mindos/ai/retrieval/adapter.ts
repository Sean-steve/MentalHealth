/**
 * MindOS Governed AI Content Retrieval Adapter
 * Authority: Master Architecture Index Section 8, Volume XVI & Appendices B / Q
 * 
 * Invariants:
 * 1. ONLY approved, PUBLISHED content versions may be ingested or served to AI retrieval pipelines.
 * 2. Any SUSPENDED, EXPIRED, or RETIRED version is immediately suppressed from retrieval.
 * 3. Every chunk MUST be stamped with its approved clinical artifact ID and statutory non-diagnostic disclaimer.
 */

import { GovernedContentRetrievalBoundary } from '../../content/retrieval/boundary.js';
import { ContentRetrievalChunk } from '../../content/domain/types.js';

export class ContentRetrievalAdapter {
  public static retrieveChunks(params: {
    query: string;
    topic?: string;
    locale?: string;
    jurisdiction?: string;
    maxResults?: number;
  }): ContentRetrievalChunk[] {
    const rawChunks = GovernedContentRetrievalBoundary.queryGovernedContext({
      query: params.query,
      topic: params.topic,
      jurisdiction: params.jurisdiction || 'KE',
      maxResults: params.maxResults || 4
    });

    // Enforce locale filtering if requested
    const filtered = params.locale
      ? rawChunks.filter(c => c.locale === params.locale)
      : rawChunks;

    // Verify invariants: Published status and disclaimer presence
    return filtered.filter(c => c.status === 'PUBLISHED' && Boolean(c.non_diagnostic_disclaimer));
  }
}
