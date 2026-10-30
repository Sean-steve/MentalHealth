/**
 * MindOS Content Discovery, Search & Delivery Service
 * Authority: Master Architecture Index Section 8, Volumes I, III, XVI & Appendix B / Q
 * Clinical Safety Policy Catalogue: R-SAFE-001, POL-SAFE-001
 */

import {
  ContentSearchResult,
  ContentVersionState,
  ContentType,
  ContentTargetAudience,
  ContentIssue,
  ContentIssueState,
  ContentProgressState
} from '../domain/types.js';
import { ContentPersistenceStore } from '../infrastructure/persistence.ts';
import { ContentTaxonomyRegistry } from '../taxonomy/registry.ts';
import { CANONICAL_NON_DIAGNOSTIC_DISCLAIMER } from '../domain/invariants.ts';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { ContentOutboxDispatcher } from '../infrastructure/outbox_integration.ts';
import { ContentAuditLogger } from '../infrastructure/audit_integration.ts';
import {
  ContentNotFoundError,
  ContentVersionSuspendedError,
  DomainInvariantError
} from '../../platform/errors/index.js';

export interface SearchContentParams {
  query?: string;
  topic?: string;
  contentType?: ContentType;
  audience?: ContentTargetAudience;
  jurisdiction?: string;
  userId?: string;
}

export class ContentDiscoveryService {
  /**
   * Searches and discovers published mental health content and psychoeducation.
   */
  public static search(params: SearchContentParams): ContentSearchResult[] {
    const definitions = ContentPersistenceStore.listDefinitions();
    const results: ContentSearchResult[] = [];

    const queryLower = params.query ? params.query.toLowerCase().trim() : undefined;

    for (const def of definitions) {
      if (def.status !== 'ACTIVE') continue;

      const activeVersion = ContentPersistenceStore.getActiveVersion(def.id);
      if (!activeVersion || activeVersion.status !== ContentVersionState.PUBLISHED) {
        // Only PUBLISHED versions may be discovered by end users
        continue;
      }

      // Audience filter
      if (params.audience && def.audience !== params.audience) {
        continue;
      }

      // Content type filter
      if (params.contentType && def.content_type !== params.contentType) {
        continue;
      }

      // Topic filter
      if (params.topic && def.primary_topic !== params.topic) {
        continue;
      }

      // Text query match against title, summary, topic, or code
      if (queryLower) {
        const titleMatch = activeVersion.title.toLowerCase().includes(queryLower);
        const summaryMatch = activeVersion.summary.toLowerCase().includes(queryLower);
        const topicMatch = def.primary_topic.toLowerCase().includes(queryLower);
        const codeMatch = def.code.toLowerCase().includes(queryLower);

        if (!titleMatch && !summaryMatch && !topicMatch && !codeMatch) {
          continue;
        }
      }

      // Fetch taxonomy tags
      const terms = ContentTaxonomyRegistry.getTermsForDefinition(def.id);
      const tags = terms.map(t => t.name);

      results.push({
        definition_id: def.id,
        code: def.code,
        content_type: def.content_type,
        title: activeVersion.title,
        summary: activeVersion.summary,
        primary_topic: def.primary_topic,
        audience: def.audience,
        version: activeVersion.version,
        estimated_reading_time_minutes: activeVersion.estimated_reading_time_minutes,
        risk_classification: def.risk_classification,
        language: activeVersion.language,
        tags,
        disclaimer: CANONICAL_NON_DIAGNOSTIC_DISCLAIMER
      });
    }

    return results;
  }

  /**
   * Retrieves full details and blocks for a content item for delivery.
   */
  public static getContentDetail(idOrCode: string, userId?: string): {
    definition: ReturnType<typeof ContentPersistenceStore.getDefinition>;
    version: ReturnType<typeof ContentPersistenceStore.getActiveVersion>;
    blocks: ReturnType<typeof ContentPersistenceStore.getBlocks>;
    exercise?: ReturnType<typeof ContentPersistenceStore.getExerciseByDef>;
    claims: ReturnType<typeof ContentPersistenceStore.getClaims>;
    isBookmarked: boolean;
    userProgress?: ReturnType<typeof ContentPersistenceStore.getProgress>;
    disclaimer: string;
  } {
    const def = ContentPersistenceStore.getDefinition(idOrCode);
    if (!def) {
      throw new ContentNotFoundError(`Content item '${idOrCode}' not found`);
    }

    const version = ContentPersistenceStore.getActiveVersion(def.id);
    if (!version) {
      throw new ContentNotFoundError(`No published active version found for '${idOrCode}'`);
    }

    if (version.status === ContentVersionState.SUSPENDED) {
      throw new ContentVersionSuspendedError(`Content item '${idOrCode}' is currently suspended`);
    }

    const blocks = ContentPersistenceStore.getBlocks(version.id);
    const exercise = ContentPersistenceStore.getExerciseByDef(def.id);
    const claims = ContentPersistenceStore.getClaims(version.id);

    const isBookmarked = userId ? ContentPersistenceStore.isBookmarked(userId, def.id) : false;
    const userProgress = userId ? ContentPersistenceStore.getProgress(userId, def.id) : undefined;

    return {
      definition: def,
      version,
      blocks,
      exercise,
      claims,
      isBookmarked,
      userProgress,
      disclaimer: CANONICAL_NON_DIAGNOSTIC_DISCLAIMER
    };
  }

  /**
   * Reports a content issue or feedback.
   */
  public static async reportIssue(params: {
    contentVersionId: string;
    issueType: ContentIssue['issue_type'];
    severity: ContentIssue['severity'];
    reportedBy: string;
    description: string;
    source?: ContentIssue['source'];
  }): Promise<ContentIssue> {
    const version = ContentPersistenceStore.getVersion(params.contentVersionId);
    if (!version) {
      throw new ContentNotFoundError(`Content version '${params.contentVersionId}' not found`);
    }

    const issueId = generateUUIDv7();
    const issue: ContentIssue = {
      id: issueId,
      content_version_id: version.id,
      issue_type: params.issueType,
      severity: params.severity,
      reported_by: params.reportedBy,
      source: params.source || 'USER_FEEDBACK',
      description: params.description,
      status: ContentIssueState.REPORTED,
      created_at: new Date().toISOString()
    };

    ContentPersistenceStore.saveIssue(issue);

    await ContentAuditLogger.logIssueReported({
      reporterId: params.reportedBy,
      issueId,
      contentVersionId: version.id,
      issueType: params.issueType,
      severity: params.severity
    });

    await ContentOutboxDispatcher.emitContentIssueReported({
      issueId,
      contentVersionId: version.id,
      issueType: params.issueType,
      severity: params.severity
    });

    return issue;
  }
}
