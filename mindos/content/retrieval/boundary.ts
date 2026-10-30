/**
 * MindOS Governed Content AI Retrieval Port & Boundary
 * Authority: Master Architecture Index Section 8, Volume XVI & Appendix B / Q
 * 
 * Invariants:
 * 1. ONLY approved, PUBLISHED content versions may be ingested or served to AI retrieval pipelines.
 * 2. Any SUSPENDED, EXPIRED, or RETIRED version is immediately suppressed from retrieval.
 * 3. Every chunk MUST be stamped with its approved clinical artifact ID, version number,
 *    and canonical non-diagnostic statutory disclaimer.
 * 4. AI models are strictly prohibited from generating dynamic unreviewed psychoeducational
 *    content; AI retrieval must only serve pre-governed immutable chunks.
 */

import {
  ContentRetrievalChunk,
  ContentVersionState,
  ContentBlockType
} from '../domain/types.js';
import { ContentPersistenceStore } from '../infrastructure/persistence.ts';
import { CANONICAL_NON_DIAGNOSTIC_DISCLAIMER } from '../domain/invariants.ts';
import { createHash } from 'crypto';

export class GovernedContentRetrievalBoundary {
  /**
   * Generates deterministic, governed retrieval chunks for a published content version.
   */
  public static extractChunks(versionId: string): ContentRetrievalChunk[] {
    const version = ContentPersistenceStore.getVersion(versionId);
    if (!version) return [];

    // Invariant: Never allow non-published content into AI retrieval context
    if (version.status !== ContentVersionState.PUBLISHED) {
      return [];
    }

    const def = ContentPersistenceStore.getDefinition(version.content_definition_id);
    if (!def || def.status !== 'ACTIVE') {
      return [];
    }

    const claims = ContentPersistenceStore.getClaims(version.id);
    const claimTexts = claims.map(c => c.claim_text);

    const chunks: ContentRetrievalChunk[] = [];
    const blocks = ContentPersistenceStore.getBlocks(version.id);

    let currentSection = version.title;

    for (const block of blocks) {
      if (block.block_type === ContentBlockType.HEADING) {
        currentSection = (block.structured_content.text as string) || currentSection;
        continue;
      }

      let text = '';
      if (block.structured_content.text) {
        text = block.structured_content.text as string;
      } else if (block.structured_content.items) {
        text = (block.structured_content.items as string[]).join('\n');
      }

      if (text.trim().length === 0) continue;

      const chunkHash = createHash('sha256')
        .update(`${version.id}:${block.id}:${block.position}`)
        .digest('hex')
        .substring(0, 16);

      chunks.push({
        chunk_id: `chunk_${chunkHash}`,
        content_definition_id: def.id,
        content_version_id: version.id,
        version_number: version.version,
        title: version.title,
        section_title: currentSection,
        content_text: text,
        claims: claimTexts,
        non_diagnostic_disclaimer: CANONICAL_NON_DIAGNOSTIC_DISCLAIMER,
        approved_clinical_artifact_id: version.clinical_artifact_id,
        locale: version.locale,
        jurisdiction: version.jurisdiction,
        status: version.status
      });
    }

    return chunks;
  }

  /**
   * Queries governed psychoeducational knowledge chunks for AI RAG or context grounding.
   */
  public static queryGovernedContext(params: {
    query: string;
    topic?: string;
    jurisdiction?: string;
    maxResults?: number;
  }): ContentRetrievalChunk[] {
    const definitions = ContentPersistenceStore.listDefinitions();
    const matchingChunks: ContentRetrievalChunk[] = [];
    const qLower = params.query.toLowerCase();

    for (const def of definitions) {
      if (def.status !== 'ACTIVE') continue;
      if (params.topic && def.primary_topic !== params.topic) continue;

      const activeVersion = ContentPersistenceStore.getActiveVersion(def.id);
      if (!activeVersion || activeVersion.status !== ContentVersionState.PUBLISHED) {
        continue;
      }

      const chunks = this.extractChunks(activeVersion.id);
      for (const chunk of chunks) {
        if (
          chunk.content_text.toLowerCase().includes(qLower) ||
          chunk.title.toLowerCase().includes(qLower) ||
          (chunk.section_title && chunk.section_title.toLowerCase().includes(qLower))
        ) {
          matchingChunks.push(chunk);
        }
      }
    }

    const limit = params.maxResults || 5;
    return matchingChunks.slice(0, limit);
  }
}
