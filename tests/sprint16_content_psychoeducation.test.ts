/**
 * MindOS Sprint 16 Verification Test Suite
 * Governed Content Registry, Psychoeducation, Guided Exercises, Localization, Publishing, Discovery & Safety-Aware Delivery
 * 
 * Authority: Master Architecture Index Section 8, Volumes I, III, XVI & Appendix B / C / Q
 * Clinical Safety Policy Catalogue: R-SAFE-001, R-SAFE-002, POL-SAFE-001
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ContentApplicationService,
  ContentService,
  ContentPersistenceStore,
  ContentType,
  ContentBlockType,
  ContentVersionState,
  ExerciseSessionState,
  ContentProgressState,
  ContentTargetAudience,
  ContentClinicalRelevance,
  ContentRiskClassification,
  GuidedExerciseType,
  ExerciseStepType,
  TranslationMethod,
  LocalizationReviewStatus,
  CollectionType,
  CollectionOrderingMode,
  CANONICAL_NON_DIAGNOSTIC_DISCLAIMER
} from '../mindos/content/index.js';
import {
  ContentClinicalApprovalRequiredError,
  ContentNotEligibleError,
  ContentIdorViolationError,
  ContentNotFoundError,
  ContentLocalizationUnavailableError,
  ContentVersionSuspendedError
} from '../mindos/platform/errors/index.js';
import { RiskState } from '../mindos/platform/shared/state_machines.js';
import { EventBus } from '../mindos/platform/events/index.js';
import { AuditService } from '../mindos/platform/audit/index.js';

describe('Sprint 16: Governed Content & Psychoeducation Engine', () => {
  beforeEach(() => {
    ContentApplicationService.resetForTesting();
  });

  describe('1. Content Registry & Seeded Content', () => {
    it('initializes canonical seeded psychoeducation, exercises, and pathways', () => {
      const results = ContentApplicationService.searchContent({});
      assert.ok(results.length >= 4, 'Expected at least 4 seeded items');

      const codes = results.map(r => r.code);
      assert.ok(codes.includes('EXERCISE_GROUNDING_54321'));
      assert.ok(codes.includes('EXERCISE_BOX_BREATHING'));
      assert.ok(codes.includes('PSYCHOED_PANIC_ANXIETY'));
      assert.ok(codes.includes('GUIDE_SLEEP_HYGIENE'));
    });

    it('stamps all discovered content with canonical statutory non-diagnostic disclaimer', () => {
      const results = ContentApplicationService.searchContent({ query: 'panic' });
      assert.ok(results.length >= 1);
      assert.equal(results[0].disclaimer, CANONICAL_NON_DIAGNOSTIC_DISCLAIMER);
      assert.ok(results[0].disclaimer.includes('do not constitute medical advice, clinical diagnosis'));
    });

    it('enforces unique content definition codes', () => {
      assert.throws(() => {
        ContentApplicationService.createDefinition({
          code: 'EXERCISE_GROUNDING_54321', // already seeded
          contentType: ContentType.ARTICLE,
          title: 'Duplicate Code',
          primaryTopic: 'GROUNDING_DEESCALATION'
        });
      });
    });
  });

  describe('2. Authoring, Clinical Review & Publishing Workflow', () => {
    it('enforces Clinical Governance prerequisite for psychoeducational and guided intervention content', () => {
      // Create clinical content definition
      const def = ContentApplicationService.createDefinition({
        code: 'CLINICAL_CBT_TEST',
        contentType: ContentType.PSYCHOEDUCATION,
        title: 'CBT Cognitive Restructuring',
        primaryTopic: 'ANXIETY_PANIC',
        riskClassification: ContentRiskClassification.PSYCHOEDUCATIONAL
      });

      // Create draft version WITHOUT clinical artifact reference
      const draft = ContentApplicationService.createVersion({
        contentDefinitionId: def.id,
        title: 'CBT Restructuring V1',
        summary: 'Cognitive reframing guidelines',
        blocks: [
          {
            id: 'b1',
            block_type: ContentBlockType.PARAGRAPH,
            position: 0,
            structured_content: { text: 'Identify automatic negative thoughts.' }
          }
        ],
        createdBy: 'cbt_author'
      });

      assert.equal(draft.status, ContentVersionState.DRAFT);

      // Attempting to approve or publish must fail due to missing clinical governance artifact linkage
      assert.throws(() => {
        ContentApplicationService.approveVersion(draft.id, 'clinical_director');
      }, (err: any) => err instanceof ContentClinicalApprovalRequiredError);
    });

    it('publishes content version when clinical governance approval is satisfied', async () => {
      const def = ContentApplicationService.createDefinition({
        code: 'GUIDED_CBT_APPROVED',
        contentType: ContentType.PSYCHOEDUCATION,
        title: 'CBT Thought Record',
        primaryTopic: 'ANXIETY_PANIC',
        riskClassification: ContentRiskClassification.PSYCHOEDUCATIONAL
      });

      const draft = ContentApplicationService.createVersion({
        contentDefinitionId: def.id,
        title: 'CBT Thought Record V1',
        summary: 'Approved guide to thought records',
        blocks: [
          {
            id: 'b1',
            block_type: ContentBlockType.PARAGRAPH,
            position: 0,
            structured_content: { text: 'Examine cognitive distortions.' }
          }
        ],
        clinicalArtifactId: 'art-cbt-001',
        clinicalArtifactVersion: 1,
        createdBy: 'cbt_author'
      });

      // Submit through editorial and clinical review
      const inEdReview = ContentApplicationService.submitForEditorialReview(draft.id, 'editor_1');
      assert.equal(inEdReview.status, ContentVersionState.EDITORIAL_REVIEW);

      const inClinReview = ContentApplicationService.submitForClinicalReview(draft.id, 'editor_1');
      assert.equal(inClinReview.status, ContentVersionState.CLINICAL_REVIEW_REQUIRED);

      const approved = ContentApplicationService.approveVersion(draft.id, 'clinical_lead');
      assert.equal(approved.status, ContentVersionState.APPROVED);

      const published = await ContentApplicationService.publishVersion(draft.id, 'clinical_lead');
      assert.equal(published.status, ContentVersionState.PUBLISHED);

      const updatedDef = ContentPersistenceStore.getDefinition(def.id);
      assert.equal(updatedDef?.active_version_id, published.id);

      // Verify outbox event emitted
      const outbox = EventBus.getOutbox();
      const pubEvent = outbox.find(e => e.event_type === 'content.published' && e.payload.includes(published.id));
      assert.ok(pubEvent, 'content.published event should be in outbox');
    });

    it('supersedes previous active version when new version is published', async () => {
      const def = ContentApplicationService.createDefinition({
        code: 'VERSIONED_MINDFULNESS',
        contentType: ContentType.ARTICLE,
        title: 'Mindfulness Primer',
        primaryTopic: 'STRESS_BURNOUT',
        riskClassification: ContentRiskClassification.INFORMATIONAL
      });

      const v1 = ContentApplicationService.createVersion({
        contentDefinitionId: def.id,
        title: 'Mindfulness Primer V1',
        summary: 'Version 1 summary',
        blocks: [],
        createdBy: 'author_1'
      });
      await ContentApplicationService.publishVersion(v1.id, 'publisher');

      // Create and publish v2
      const v2 = ContentApplicationService.createVersion({
        contentDefinitionId: def.id,
        title: 'Mindfulness Primer V2',
        summary: 'Version 2 updated summary',
        blocks: [],
        createdBy: 'author_2'
      });
      assert.equal(v2.version, 2);

      await ContentApplicationService.publishVersion(v2.id, 'publisher');

      // v1 must now be SUPERSEDED
      const v1Reloaded = ContentPersistenceStore.getVersion(v1.id);
      assert.equal(v1Reloaded?.status, ContentVersionState.SUPERSEDED);

      const v2Reloaded = ContentPersistenceStore.getVersion(v2.id);
      assert.equal(v2Reloaded?.status, ContentVersionState.PUBLISHED);

      const updatedDef = ContentPersistenceStore.getDefinition(def.id);
      assert.equal(updatedDef?.active_version_id, v2.id);
    });

    it('suspends active content and immediately blocks public delivery', async () => {
      const def = ContentPersistenceStore.getDefinition('PSYCHOED_PANIC_ANXIETY');
      assert.ok(def);

      const activeVer = ContentPersistenceStore.getActiveVersion(def!.id);
      assert.ok(activeVer);

      // Suspend version
      await ContentApplicationService.suspendVersion(activeVer!.id, 'safety_officer', 'Under safety review');

      const reloadedVer = ContentPersistenceStore.getVersion(activeVer!.id);
      assert.equal(reloadedVer?.status, ContentVersionState.SUSPENDED);

      // Def active_version_id should be cleared
      const reloadedDef = ContentPersistenceStore.getDefinition(def!.id);
      assert.equal(reloadedDef?.active_version_id, undefined);

      // Delivery must reject suspended content
      assert.throws(() => {
        ContentApplicationService.getContentDetail('PSYCHOED_PANIC_ANXIETY');
      }, (err: any) => err instanceof ContentNotFoundError);
    });
  });

  describe('3. Guided Exercise Engine & Clinical Safety Interceptor', () => {
    it('executes guided exercise step progression to 100% completion', async () => {
      const grounding = ContentPersistenceStore.getExerciseByDef(
        ContentPersistenceStore.getDefinition('EXERCISE_GROUNDING_54321')!.id
      );
      assert.ok(grounding);

      // Start session
      const session = await ContentApplicationService.startExerciseSession({
        userId: 'patient-401',
        exerciseId: grounding!.id,
        userAge: 25,
        userJurisdiction: 'KE'
      });

      assert.equal(session.status, ExerciseSessionState.IN_PROGRESS);
      assert.equal(session.current_step, 0);
      assert.equal(session.progress_percentage, 0);

      // Advance through steps 0, 1, 2, 3
      for (let i = 0; i < 4; i++) {
        const res = await ContentApplicationService.submitExerciseStep({
          sessionId: session.id,
          userId: 'patient-401',
          stepPosition: i,
          inputValue: `Step response ${i}`,
          durationSpentSeconds: 15
        });
        assert.equal(res.isComplete, false);
        assert.equal(res.safetyAlertTriggered, false);
      }

      // Final step (position 4)
      const finalRes = await ContentApplicationService.submitExerciseStep({
        sessionId: session.id,
        userId: 'patient-401',
        stepPosition: 4,
        durationSpentSeconds: 20
      });

      assert.equal(finalRes.isComplete, true);
      assert.equal(finalRes.session.status, ExerciseSessionState.COMPLETED);
      assert.equal(finalRes.session.progress_percentage, 100);

      // Verify user content progress is completed
      const progress = ContentApplicationService.getUserProgress(
        'patient-401',
        grounding!.content_definition_id
      );
      assert.equal(progress?.status, ContentProgressState.COMPLETED);
      assert.equal(progress?.progress_percentage, 100);

      // Verify outbox emitted content.completed
      const outbox = EventBus.getOutbox();
      const compEvent = outbox.find(e => e.event_type === 'content.completed' && e.payload.includes(grounding!.content_version_id));
      assert.ok(compEvent, 'content.completed event should be in outbox');
    });

    it('intercepts acute distress keywords in exercise response and triggers immediate safety override', async () => {
      const grounding = ContentPersistenceStore.getExerciseByDef(
        ContentPersistenceStore.getDefinition('EXERCISE_GROUNDING_54321')!.id
      );

      const session = await ContentApplicationService.startExerciseSession({
        userId: 'distressed-user-7',
        exerciseId: grounding!.id,
        userAge: 22
      });

      // Submit input containing acute crisis expression
      const result = await ContentApplicationService.submitExerciseStep({
        sessionId: session.id,
        userId: 'distressed-user-7',
        stepPosition: 0,
        inputValue: 'I feel like I want to die and kill myself right now'
      });

      assert.equal(result.safetyAlertTriggered, true);
      assert.ok(result.safetyOverride);
      assert.equal(result.safetyOverride?.requiresOverride, true);

      // Verified crisis resources must include Kenya emergency lines (e.g. 999, 1199)
      const hotlines = result.safetyOverride?.urgentResources.map(r => [r.contact_json?.phone, r.contact_json?.sms]).flat().filter(Boolean);
      assert.ok(hotlines?.includes('999'), 'Hotlines should include 999');
      assert.ok(hotlines?.includes('1199'), 'Hotlines should include 1199');
    });

    it('enforces IDOR isolation on exercise sessions', async () => {
      const grounding = ContentPersistenceStore.getExerciseByDef(
        ContentPersistenceStore.getDefinition('EXERCISE_GROUNDING_54321')!.id
      );

      const session = await ContentApplicationService.startExerciseSession({
        userId: 'legitimate-user',
        exerciseId: grounding!.id
      });

      // Malicious user attempts to submit step
      await assert.rejects(async () => {
        await ContentApplicationService.submitExerciseStep({
          sessionId: session.id,
          userId: 'malicious-attacker',
          stepPosition: 0
        });
      }, (err: any) => err instanceof ContentIdorViolationError);

      // Malicious user attempts to abandon session
      await assert.rejects(async () => {
        await ContentApplicationService.abandonExerciseSession(session.id, 'malicious-attacker');
      }, (err: any) => err instanceof ContentIdorViolationError);
    });

    it('enforces age and jurisdiction eligibility gating', async () => {
      const grounding = ContentPersistenceStore.getExerciseByDef(
        ContentPersistenceStore.getDefinition('EXERCISE_GROUNDING_54321')!.id
      );

      // Grounding minimum age is 13; user age 10 should be rejected
      await assert.rejects(async () => {
        await ContentApplicationService.startExerciseSession({
          userId: 'child-user',
          exerciseId: grounding!.id,
          userAge: 10
        });
      }, (err: any) => err instanceof ContentNotEligibleError);
    });
  });

  describe('4. Multi-lingual Localizations (Swahili sw-KE)', () => {
    it('retrieves approved Swahili localization for 5-4-3-2-1 Grounding', () => {
      const def = ContentPersistenceStore.getDefinition('EXERCISE_GROUNDING_54321');
      const swLoc = ContentApplicationService.getApprovedLocalization(def!.id, 'sw-KE');

      assert.ok(swLoc);
      assert.equal(swLoc.language, 'sw');
      assert.ok(swLoc.title.includes('Mbinu ya 5-4-3-2-1'));
      assert.equal(swLoc.review_status, LocalizationReviewStatus.APPROVED);
      assert.equal(swLoc.translation_method, TranslationMethod.HUMAN);
    });

    it('blocks retrieval of unapproved machine translations', () => {
      const def = ContentPersistenceStore.getDefinition('GUIDE_SLEEP_HYGIENE');

      // Create unreviewed localization
      const unreviewed = ContentApplicationService.createLocalization({
        contentDefinitionId: def!.id,
        sourceVersionId: def!.active_version_id!,
        locale: 'sw-KE',
        language: 'sw',
        title: 'Mwongozo wa Usingizi',
        summary: 'Tafsiri ya mashine bila uhakiki wa kimatibabu',
        blocks: [],
        translationMethod: TranslationMethod.AI_ASSISTED_REVIEWED
      });

      assert.equal(unreviewed.review_status, LocalizationReviewStatus.PENDING_CLINICAL_REVIEW);

      // Attempting to deliver unapproved translation must throw
      assert.throws(() => {
        ContentApplicationService.getApprovedLocalization(def!.id, 'sw-KE');
      }, (err: any) => err instanceof ContentLocalizationUnavailableError);
    });
  });

  describe('5. Curated Collections & Guided Pathways', () => {
    it('loads curated learning pathway with sequenced items', () => {
      const pathway = ContentApplicationService.getCollection('PATHWAY_ANXIETY_BASICS');
      assert.ok(pathway.collection);
      assert.equal(pathway.collection.collection_type, CollectionType.LEARNING_PATHWAY);
      assert.equal(pathway.items.length, 3);
      assert.equal(pathway.items[0].position, 1);
      assert.equal(pathway.items[1].position, 2);
      assert.equal(pathway.items[2].position, 3);
    });

    it('evaluates prerequisite completion status for gated items', () => {
      const pathway = ContentApplicationService.getCollection('PATHWAY_ANXIETY_BASICS');
      const item2 = pathway.items[1]; // Grounding exercise requires Panic Psychoed

      // User has not completed item 1
      const check1 = ContentApplicationService.verifyCollectionPrerequisites('novice-user', item2);
      assert.equal(check1.satisfied, false);
      assert.ok(check1.unmetDefinitionIds.length > 0);

      // User completes item 1
      ContentApplicationService.recordReadingProgress({
        userId: 'novice-user',
        contentDefinitionId: item2.prerequisite_rule!.prerequisite_content_definition_ids![0],
        percentage: 100,
        lastPosition: 10
      });

      const check2 = ContentApplicationService.verifyCollectionPrerequisites('novice-user', item2);
      assert.equal(check2.satisfied, true);
      assert.deepEqual(check2.unmetDefinitionIds, []);
    });
  });

  describe('6. Bookmarking & Reading Progress', () => {
    it('manages user bookmarks and lists saved content', () => {
      const def = ContentPersistenceStore.getDefinition('EXERCISE_BOX_BREATHING')!;

      ContentApplicationService.bookmarkContent('user-bm-1', def.id);
      const bms = ContentApplicationService.getUserBookmarks('user-bm-1');
      assert.equal(bms.length, 1);
      assert.equal(bms[0].code, 'EXERCISE_BOX_BREATHING');

      ContentApplicationService.removeBookmark('user-bm-1', def.id);
      const after = ContentApplicationService.getUserBookmarks('user-bm-1');
      assert.equal(after.length, 0);
    });
  });

  describe('7. Governed AI Retrieval Port & RAG Context Boundary', () => {
    it('extracts deterministic chunks stamped with clinical artifact ID and statutory disclaimer', () => {
      const def = ContentPersistenceStore.getDefinition('EXERCISE_GROUNDING_54321')!;
      const chunks = ContentApplicationService.extractRetrievalChunks(def.active_version_id!);

      assert.ok(chunks.length > 0);
      for (const chunk of chunks) {
        assert.equal(chunk.non_diagnostic_disclaimer, CANONICAL_NON_DIAGNOSTIC_DISCLAIMER);
        assert.equal(chunk.approved_clinical_artifact_id, 'c1111111-0000-0000-0000-000000000001');
        assert.equal(chunk.status, ContentVersionState.PUBLISHED);
      }
    });

    it('queries governed RAG context by topic and keywords', () => {
      const chunks = ContentApplicationService.queryGovernedContext({
        query: 'sensory nervous system',
        topic: 'GROUNDING_DEESCALATION'
      });

      assert.ok(chunks.length > 0);
      assert.ok(chunks[0].content_text.includes('sensory nervous system'));
      assert.equal(chunks[0].title, '5-4-3-2-1 Sensory Grounding Technique');
    });

    it('immediately suppresses suspended or retired content from AI retrieval boundary', async () => {
      const def = ContentPersistenceStore.getDefinition('GUIDE_SLEEP_HYGIENE')!;
      const ver = ContentPersistenceStore.getActiveVersion(def.id)!;

      // Ensure chunks available prior to suspension
      const chunksBefore = ContentApplicationService.extractRetrievalChunks(ver.id);
      assert.ok(chunksBefore.length > 0);

      // Suspend
      await ContentApplicationService.suspendVersion(ver.id, 'safety_officer', 'Safety hold');

      // Chunks extraction must return empty
      const chunksAfter = ContentApplicationService.extractRetrievalChunks(ver.id);
      assert.equal(chunksAfter.length, 0);
    });
  });

  describe('8. Backwards Compatibility for Legacy ContentService', () => {
    it('serves legacy ContentService.getArticles with seeded content', () => {
      const articles = ContentService.getArticles('en');
      assert.ok(articles.length > 0);
      assert.ok(articles[0].id);
      assert.ok(articles[0].title);
      assert.ok(articles[0].body_markdown);
    });
  });
});
