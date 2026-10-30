/**
 * MindOS Governed AI Content Relevance Ranker
 * Authority: Volumes IV, XVI
 */

import { ContentRetrievalChunk } from '../../content/domain/types.js';

export class RetrievalRelevanceRanker {
  public static selectTopChunks(chunks: ContentRetrievalChunk[], limit = 3): ContentRetrievalChunk[] {
    // Return up to limit chunks, prioritizing unique topics and titles
    const seen = new Set<string>();
    const selected: ContentRetrievalChunk[] = [];

    for (const chunk of chunks) {
      if (!seen.has(chunk.title)) {
        seen.add(chunk.title);
        selected.push(chunk);
      }
      if (selected.length >= limit) break;
    }

    return selected;
  }
}
