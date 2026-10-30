/**
 * MindOS Governed Content Application Service
 * Authority: Master Architecture Index Section 8, Volumes I, III, XVI
 */

import { ContentSeedRegistry } from '../registry/seed.ts';
import { ContentPersistenceStore } from '../infrastructure/persistence.ts';
import { ContentAuthoringService } from '../authoring/service.ts';
import { ContentPublishingWorkflow } from '../publishing/workflow.ts';
import { ContentLocalizationService } from '../localization/service.ts';
import { GuidedExerciseEngine } from '../exercises/engine.ts';
import { ContentCollectionsService } from '../collections/service.ts';
import { ContentDiscoveryService } from '../discovery/service.ts';
import { GovernedContentRetrievalBoundary } from '../retrieval/boundary.ts';
import { ContentTaxonomyRegistry } from '../taxonomy/registry.ts';
import {
  ContentDefinition,
  ContentVersion,
  ContentLocalization,
  GuidedExercise,
  ExerciseSession,
  ContentCollection,
  ContentProgress,
  ContentIssue,
  ContentSearchResult,
  ContentRetrievalChunk,
  ContentProgressState
} from '../domain/types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';

export class ContentApplicationService {
  private static initialized = false;

  public static resetForTesting(): void {
    this.initialized = false;
    ContentTaxonomyRegistry.resetForTesting();
    ContentSeedRegistry.resetForTesting();
    ContentPersistenceStore.clearAllForTesting();
    this.initialize();
  }

  public static initialize(): void {
    if (!this.initialized) {
      ContentTaxonomyRegistry.initialize();
      ContentSeedRegistry.seedAll();
      this.initialized = true;
    }
  }

  // --- Discovery & Delivery ---
  public static searchContent(params: Parameters<typeof ContentDiscoveryService.search>[0]): ContentSearchResult[] {
    this.initialize();
    return ContentDiscoveryService.search(params);
  }

  public static getContentDetail(idOrCode: string, userId?: string) {
    this.initialize();
    return ContentDiscoveryService.getContentDetail(idOrCode, userId);
  }

  // --- Guided Exercises ---
  public static async startExerciseSession(params: Parameters<typeof GuidedExerciseEngine.startSession>[0]): Promise<ExerciseSession> {
    this.initialize();
    return GuidedExerciseEngine.startSession(params);
  }

  public static async submitExerciseStep(params: Parameters<typeof GuidedExerciseEngine.submitStep>[0]) {
    this.initialize();
    return GuidedExerciseEngine.submitStep(params);
  }

  public static async abandonExerciseSession(sessionId: string, userId: string): Promise<ExerciseSession> {
    this.initialize();
    return GuidedExerciseEngine.abandonSession(sessionId, userId);
  }

  public static getExerciseSession(sessionId: string): ExerciseSession | undefined {
    this.initialize();
    return ContentPersistenceStore.getSession(sessionId);
  }

  public static listUserExerciseSessions(userId: string): ExerciseSession[] {
    this.initialize();
    return ContentPersistenceStore.listSessionsByUser(userId);
  }

  // --- Collections & Pathways ---
  public static listCollections(): ContentCollection[] {
    this.initialize();
    return ContentCollectionsService.listCollections();
  }

  public static getCollection(idOrCode: string) {
    this.initialize();
    return ContentCollectionsService.getCollection(idOrCode);
  }

  public static verifyCollectionPrerequisites(userId: string, item: Parameters<typeof ContentCollectionsService.verifyPrerequisites>[1]) {
    this.initialize();
    return ContentCollectionsService.verifyPrerequisites(userId, item);
  }

  // --- User Bookmarks ---
  public static bookmarkContent(userId: string, contentDefinitionId: string): void {
    this.initialize();
    ContentPersistenceStore.saveBookmark(userId, contentDefinitionId);
  }

  public static removeBookmark(userId: string, contentDefinitionId: string): void {
    this.initialize();
    ContentPersistenceStore.deleteBookmark(userId, contentDefinitionId);
  }

  public static getUserBookmarks(userId: string): ContentSearchResult[] {
    this.initialize();
    const bookmarkedIds = ContentPersistenceStore.listBookmarks(userId);
    const results: ContentSearchResult[] = [];
    for (const id of bookmarkedIds) {
      try {
        const detail = ContentDiscoveryService.getContentDetail(id, userId);
        if (detail.definition && detail.version) {
          results.push({
            definition_id: detail.definition.id,
            code: detail.definition.code,
            content_type: detail.definition.content_type,
            title: detail.version.title,
            summary: detail.version.summary,
            primary_topic: detail.definition.primary_topic,
            audience: detail.definition.audience,
            version: detail.version.version,
            estimated_reading_time_minutes: detail.version.estimated_reading_time_minutes,
            risk_classification: detail.definition.risk_classification,
            language: detail.version.language,
            tags: [],
            disclaimer: detail.disclaimer
          });
        }
      } catch {
        // Ignore inactive or unfindable items
      }
    }
    return results;
  }

  // --- User Content Progress ---
  public static getUserProgress(userId: string, contentDefinitionId: string): ContentProgress | undefined {
    this.initialize();
    return ContentPersistenceStore.getProgress(userId, contentDefinitionId);
  }

  public static listUserProgress(userId: string): ContentProgress[] {
    this.initialize();
    return ContentPersistenceStore.listUserProgress(userId);
  }

  public static recordReadingProgress(params: {
    userId: string;
    contentDefinitionId: string;
    percentage: number;
    lastPosition: number;
  }): ContentProgress {
    this.initialize();
    const def = ContentPersistenceStore.getDefinition(params.contentDefinitionId);
    const activeVersion = def ? ContentPersistenceStore.getActiveVersion(def.id) : undefined;
    const now = new Date().toISOString();

    const existing = ContentPersistenceStore.getProgress(params.userId, params.contentDefinitionId);
    const isComplete = params.percentage >= 100;

    const progress: ContentProgress = existing ? {
      ...existing,
      progress_percentage: params.percentage,
      last_position: params.lastPosition,
      status: isComplete ? ContentProgressState.COMPLETED : ContentProgressState.IN_PROGRESS,
      completed_at: isComplete ? now : existing.completed_at,
      last_viewed_at: now,
      updated_at: now
    } : {
      id: generateUUIDv7(),
      subject_user_id: params.userId,
      content_definition_id: params.contentDefinitionId,
      content_version_id: activeVersion ? activeVersion.id : '',
      status: isComplete ? ContentProgressState.COMPLETED : ContentProgressState.IN_PROGRESS,
      progress_percentage: params.percentage,
      last_position: params.lastPosition,
      started_at: now,
      completed_at: isComplete ? now : undefined,
      last_viewed_at: now,
      created_at: now,
      updated_at: now
    };

    ContentPersistenceStore.saveProgress(progress);
    return progress;
  }

  // --- Authoring & Editorial Workflow ---
  public static createDefinition(input: Parameters<typeof ContentAuthoringService.createDefinition>[0]): ContentDefinition {
    this.initialize();
    return ContentAuthoringService.createDefinition(input);
  }

  public static createVersion(input: Parameters<typeof ContentAuthoringService.createVersion>[0]): ContentVersion {
    this.initialize();
    return ContentAuthoringService.createVersion(input);
  }

  public static diffVersions(v1Id: string, v2Id: string) {
    this.initialize();
    return ContentAuthoringService.diffVersions(v1Id, v2Id);
  }

  public static submitForEditorialReview(versionId: string, actorId: string): ContentVersion {
    this.initialize();
    return ContentPublishingWorkflow.submitForEditorialReview(versionId, actorId);
  }

  public static submitForClinicalReview(versionId: string, actorId: string): ContentVersion {
    this.initialize();
    return ContentPublishingWorkflow.submitForClinicalReview(versionId, actorId);
  }

  public static approveVersion(versionId: string, actorId: string): ContentVersion {
    this.initialize();
    return ContentPublishingWorkflow.approveVersion(versionId, actorId);
  }

  public static async publishVersion(versionId: string, actorId: string): Promise<ContentVersion> {
    this.initialize();
    return ContentPublishingWorkflow.publishVersion(versionId, actorId);
  }

  public static async suspendVersion(versionId: string, actorId: string, reason: string): Promise<ContentVersion> {
    this.initialize();
    return ContentPublishingWorkflow.suspendVersion(versionId, actorId, reason);
  }

  public static async retireVersion(versionId: string, actorId: string, reason?: string): Promise<ContentVersion> {
    this.initialize();
    return ContentPublishingWorkflow.retireVersion(versionId, actorId, reason);
  }

  // --- Localization ---
  public static createLocalization(input: Parameters<typeof ContentLocalizationService.createLocalization>[0]): ContentLocalization {
    this.initialize();
    return ContentLocalizationService.createLocalization(input);
  }

  public static approveLocalization(params: Parameters<typeof ContentLocalizationService.approveLocalization>[0]): ContentLocalization {
    this.initialize();
    return ContentLocalizationService.approveLocalization(params);
  }

  public static getApprovedLocalization(defId: string, locale: string): ContentLocalization {
    this.initialize();
    return ContentLocalizationService.getApprovedLocalization(defId, locale);
  }

  // --- Issues & Feedback ---
  public static async reportIssue(params: Parameters<typeof ContentDiscoveryService.reportIssue>[0]): Promise<ContentIssue> {
    this.initialize();
    return ContentDiscoveryService.reportIssue(params);
  }

  public static listIssues(versionId?: string): ContentIssue[] {
    this.initialize();
    return ContentPersistenceStore.listIssues(versionId);
  }

  // --- Governed AI Retrieval Port ---
  public static queryGovernedContext(params: Parameters<typeof GovernedContentRetrievalBoundary.queryGovernedContext>[0]): ContentRetrievalChunk[] {
    this.initialize();
    return GovernedContentRetrievalBoundary.queryGovernedContext(params);
  }

  public static extractRetrievalChunks(versionId: string): ContentRetrievalChunk[] {
    this.initialize();
    return GovernedContentRetrievalBoundary.extractChunks(versionId);
  }
}
