/**
 * MindOS Canonical Content Seed Registry
 * Authority: Master Architecture Index Section 8, Volumes I, III, XVI & Appendix B / Q
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import {
  ContentType,
  ContentBlock,
  ContentBlockType,
  ContentTargetAudience,
  ContentClinicalRelevance,
  ContentRiskClassification,
  ContentVersionState,
  GuidedExerciseType,
  ExerciseStepType,
  CollectionType,
  CollectionOrderingMode,
  TranslationMethod,
  LocalizationReviewStatus
} from '../domain/types.js';
import { ContentPersistenceStore } from '../infrastructure/persistence.ts';
import { ContentTaxonomyRegistry } from '../taxonomy/registry.ts';

export class ContentSeedRegistry {
  private static seeded = false;

  public static resetForTesting(): void {
    this.seeded = false;
  }

  public static seedAll(): void {
    if (this.seeded) return;

    ContentTaxonomyRegistry.initialize();

    const now = new Date().toISOString();

    // ========================================================================
    // 1. GUIDED EXERCISE: 5-4-3-2-1 Somatic Grounding
    // ========================================================================
    const groundingDefId = generateUUIDv7();
    const groundingVerId = generateUUIDv7();
    const groundingExId = generateUUIDv7();

    ContentPersistenceStore.saveDefinition({
      id: groundingDefId,
      code: 'EXERCISE_GROUNDING_54321',
      content_type: ContentType.GROUNDING_EXERCISE,
      canonical_title: '5-4-3-2-1 Sensory Grounding Technique',
      description: 'A structured somatic sensory exercise to rapidly reduce hyperarousal and anxiety.',
      owner_domain: 'content',
      owner_id: 'CLINICAL_BOARD',
      primary_topic: 'GROUNDING_DEESCALATION',
      audience: ContentTargetAudience.GENERAL_ADULT,
      clinical_relevance: ContentClinicalRelevance.SYMPTOM_MANAGEMENT,
      risk_classification: ContentRiskClassification.GUIDED_INTERVENTION,
      status: 'ACTIVE',
      active_version_id: groundingVerId,
      default_locale: 'en-KE',
      created_at: now,
      updated_at: now
    });

    const groundingBlocks = [
      {
        id: generateUUIDv7(),
        block_type: ContentBlockType.HEADING,
        position: 0,
        structured_content: { text: 'Overview: Grounding in the Present Moment', level: 2 }
      },
      {
        id: generateUUIDv7(),
        block_type: ContentBlockType.PARAGRAPH,
        position: 1,
        structured_content: {
          text: 'The 5-4-3-2-1 grounding technique activates your sensory nervous system to break the cycle of rumination or panic. It gently anchors your attention to physical reality.'
        }
      },
      {
        id: generateUUIDv7(),
        block_type: ContentBlockType.SAFETY_CARD,
        position: 2,
        structured_content: {
          text: 'Notice your breath. You can pause or stop this exercise at any time if you feel overwhelmed.'
        }
      }
    ];

    ContentPersistenceStore.saveVersion({
      id: groundingVerId,
      content_definition_id: groundingDefId,
      version: 1,
      status: ContentVersionState.PUBLISHED,
      title: '5-4-3-2-1 Sensory Grounding Technique',
      summary: 'Anchor yourself in the present moment by naming five sights, four textures, three sounds, two scents, and one taste.',
      language: 'en',
      locale: 'en-KE',
      jurisdiction: 'KE',
      audience: ContentTargetAudience.GENERAL_ADULT,
      body_structure: { blocks: groundingBlocks },
      estimated_reading_time_minutes: 2,
      estimated_completion_time_minutes: 5,
      clinical_artifact_id: 'c1111111-0000-0000-0000-000000000001',
      clinical_artifact_version: 1,
      privacy_processing_reference: 'DPA-KE-PR-001',
      regulatory_reference: 'DHA-KE-REG-2023',
      effective_at: now,
      created_by: 'clinical_lead',
      created_at: now,
      updated_at: now
    });

    ContentPersistenceStore.saveBlocks(groundingVerId, groundingBlocks);

    const groundingSteps = [
      {
        id: generateUUIDv7(),
        position: 0,
        step_type: ExerciseStepType.USER_INPUT,
        title: '5 Things You Can See',
        instruction: 'Look around you. Notice five things you can see right now (e.g. a shadow, a pattern on the wall, your shoes).',
        input_prompt: 'Name or type what you see:',
        input_placeholder: 'e.g. green leaves, blue pen, light reflection...',
        input_required: false
      },
      {
        id: generateUUIDv7(),
        position: 1,
        step_type: ExerciseStepType.USER_INPUT,
        title: '4 Things You Can Feel',
        instruction: 'Notice four physical sensations (e.g. feet on the floor, fabric of your shirt, the chair supporting your back).',
        input_prompt: 'What physical sensations do you notice?',
        input_placeholder: 'e.g. cool breeze, solid desk under my palms...',
        input_required: false
      },
      {
        id: generateUUIDv7(),
        position: 2,
        step_type: ExerciseStepType.USER_INPUT,
        title: '3 Things You Can Hear',
        instruction: 'Listen carefully for three distinct sounds around you (e.g. distant traffic, clock ticking, birds).',
        input_prompt: 'What sounds can you hear?',
        input_placeholder: 'e.g. wind outside, hum of refrigerator...',
        input_required: false
      },
      {
        id: generateUUIDv7(),
        position: 3,
        step_type: ExerciseStepType.USER_INPUT,
        title: '2 Things You Can Smell',
        instruction: 'Notice two scents in your environment or recall a calming fragrance (e.g. fresh rain, tea, soap).',
        input_prompt: 'What scents are present?',
        input_placeholder: 'e.g. coffee, fresh air...',
        input_required: false
      },
      {
        id: generateUUIDv7(),
        position: 4,
        step_type: ExerciseStepType.INSTRUCTION,
        title: '1 Thing You Can Taste',
        instruction: 'Notice one taste in your mouth, or take a slow sip of cool water. Take a gentle, deep breath and notice the ground beneath you.'
      }
    ];

    ContentPersistenceStore.saveExercise({
      id: groundingExId,
      content_definition_id: groundingDefId,
      content_version_id: groundingVerId,
      exercise_type: GuidedExerciseType.GROUNDING_54321,
      goal: 'Rapid somatic stabilization and nervous system down-regulation',
      estimated_duration_seconds: 300,
      steps: groundingSteps,
      eligibility_policy: {
        min_age: 13,
        allowed_jurisdictions: ['KE', 'GLOBAL']
      },
      safety_policy: {
        halt_on_crisis_signal: true,
        provide_crisis_hotline_on_interrupt: true
      },
      clinical_artifact_reference: 'c1111111-0000-0000-0000-000000000001',
      created_at: now
    });

    // Swahili Localization for 5-4-3-2-1
    ContentPersistenceStore.saveLocalization({
      id: generateUUIDv7(),
      content_definition_id: groundingDefId,
      source_version_id: groundingVerId,
      locale: 'sw-KE',
      language: 'sw',
      jurisdiction: 'KE',
      localized_version: 1,
      title: 'Mbinu ya 5-4-3-2-1 ya Kujituliza Kupitia Hisia',
      summary: 'Jitulize katika wakati wa sasa kwa kutambua vitu vitano unavyoona, vinne unavyogusa, vitatu unavyosikia, viwili unavyonusa, na kimoja unachoonja.',
      body_structure: {
        blocks: [
          {
            id: generateUUIDv7(),
            block_type: ContentBlockType.HEADING,
            position: 0,
            structured_content: { text: 'Muhtasari: Kujituliza Kupitia Hisia', level: 2 }
          },
          {
            id: generateUUIDv7(),
            block_type: ContentBlockType.PARAGRAPH,
            position: 1,
            structured_content: {
              text: 'Mbinu hii inakusaidia kupunguza msongo wa mawazo na wasiwasi kwa kuelekeza hisia zako kwenye mazingira yako halisi.'
            }
          }
        ]
      },
      translation_method: TranslationMethod.HUMAN,
      review_status: LocalizationReviewStatus.APPROVED,
      translator_reference: 'TRANSLATOR_SW_01',
      reviewer_reference: 'CLINICAL_REV_SW_01',
      created_at: now,
      updated_at: now
    });

    // ========================================================================
    // 2. GUIDED EXERCISE: Box Breathing (4x4)
    // ========================================================================
    const boxDefId = generateUUIDv7();
    const boxVerId = generateUUIDv7();
    const boxExId = generateUUIDv7();

    ContentPersistenceStore.saveDefinition({
      id: boxDefId,
      code: 'EXERCISE_BOX_BREATHING',
      content_type: ContentType.BREATHING_EXERCISE,
      canonical_title: 'Box Breathing (4-4-4-4 Paced Breathing)',
      description: 'Equal-cadence paced breathing to balance sympathetic and parasympathetic nervous response.',
      owner_domain: 'content',
      owner_id: 'CLINICAL_BOARD',
      primary_topic: 'ANXIETY_PANIC',
      audience: ContentTargetAudience.GENERAL_ADULT,
      clinical_relevance: ContentClinicalRelevance.SYMPTOM_MANAGEMENT,
      risk_classification: ContentRiskClassification.GUIDED_INTERVENTION,
      status: 'ACTIVE',
      active_version_id: boxVerId,
      default_locale: 'en-KE',
      created_at: now,
      updated_at: now
    });

    const boxBlocks = [
      {
        id: generateUUIDv7(),
        block_type: ContentBlockType.HEADING,
        position: 0,
        structured_content: { text: 'How Box Breathing Works', level: 2 }
      },
      {
        id: generateUUIDv7(),
        block_type: ContentBlockType.PARAGRAPH,
        position: 1,
        structured_content: {
          text: 'Box breathing uses four equal phases: inhale for 4 seconds, hold for 4 seconds, exhale for 4 seconds, and hold empty for 4 seconds.'
        }
      }
    ];

    ContentPersistenceStore.saveVersion({
      id: boxVerId,
      content_definition_id: boxDefId,
      version: 1,
      status: ContentVersionState.PUBLISHED,
      title: 'Box Breathing (4-4-4-4 Paced Breathing)',
      summary: 'Regulate your autonomic nervous system using rhythmic 4-second breath cycles.',
      language: 'en',
      locale: 'en-KE',
      jurisdiction: 'KE',
      audience: ContentTargetAudience.GENERAL_ADULT,
      body_structure: { blocks: boxBlocks },
      estimated_reading_time_minutes: 2,
      estimated_completion_time_minutes: 4,
      clinical_artifact_id: 'c2222222-0000-0000-0000-000000000002',
      clinical_artifact_version: 1,
      privacy_processing_reference: 'DPA-KE-PR-001',
      regulatory_reference: 'DHA-KE-REG-2023',
      effective_at: now,
      created_by: 'clinical_lead',
      created_at: now,
      updated_at: now
    });

    ContentPersistenceStore.saveBlocks(boxVerId, boxBlocks);

    const boxSteps = [
      {
        id: generateUUIDv7(),
        position: 0,
        step_type: ExerciseStepType.BREATH_PACER,
        title: 'Box Breathing Cycle 1',
        instruction: 'Follow the 4-second cadence: Inhale 4s, Hold 4s, Exhale 4s, Rest 4s.',
        duration_seconds: 16,
        pacer_pattern: {
          inhale_seconds: 4,
          hold_after_inhale_seconds: 4,
          exhale_seconds: 4,
          hold_after_exhale_seconds: 4,
          cycles: 1
        }
      },
      {
        id: generateUUIDv7(),
        position: 1,
        step_type: ExerciseStepType.BREATH_PACER,
        title: 'Box Breathing Cycle 2',
        instruction: 'Maintain relaxed shoulders. Inhale 4s, Hold 4s, Exhale 4s, Rest 4s.',
        duration_seconds: 16,
        pacer_pattern: {
          inhale_seconds: 4,
          hold_after_inhale_seconds: 4,
          exhale_seconds: 4,
          hold_after_exhale_seconds: 4,
          cycles: 1
        }
      },
      {
        id: generateUUIDv7(),
        position: 2,
        step_type: ExerciseStepType.INSTRUCTION,
        title: 'Session Complete',
        instruction: 'Notice how your chest and shoulders feel. Return to your natural breathing rhythm.'
      }
    ];

    ContentPersistenceStore.saveExercise({
      id: boxExId,
      content_definition_id: boxDefId,
      content_version_id: boxVerId,
      exercise_type: GuidedExerciseType.BOX_BREATHING,
      goal: 'Autonomic nervous system rebalancing and acute stress reduction',
      estimated_duration_seconds: 180,
      steps: boxSteps,
      clinical_artifact_reference: 'c2222222-0000-0000-0000-000000000002',
      created_at: now
    });

    // ========================================================================
    // 3. PSYCHOEDUCATION: Understanding Panic and Acute Anxiety
    // ========================================================================
    const panicDefId = generateUUIDv7();
    const panicVerId = generateUUIDv7();

    ContentPersistenceStore.saveDefinition({
      id: panicDefId,
      code: 'PSYCHOED_PANIC_ANXIETY',
      content_type: ContentType.PSYCHOEDUCATION,
      canonical_title: 'Understanding Panic and Acute Anxiety',
      description: 'Evidence-based psychoeducation explaining the physiology of panic attacks and effective coping strategies.',
      owner_domain: 'content',
      owner_id: 'CLINICAL_BOARD',
      primary_topic: 'ANXIETY_PANIC',
      audience: ContentTargetAudience.GENERAL_ADULT,
      clinical_relevance: ContentClinicalRelevance.PSYCHOEDUCATIONAL,
      risk_classification: ContentRiskClassification.PSYCHOEDUCATIONAL,
      status: 'ACTIVE',
      active_version_id: panicVerId,
      default_locale: 'en-KE',
      created_at: now,
      updated_at: now
    });

    const panicBlocks: ContentBlock[] = [
      {
        id: generateUUIDv7(),
        block_type: ContentBlockType.HEADING,
        position: 0,
        structured_content: { text: 'What Happens During a Panic Attack?', level: 2 }
      },
      {
        id: generateUUIDv7(),
        block_type: ContentBlockType.PARAGRAPH,
        position: 1,
        structured_content: {
          text: 'A panic attack is a sudden surge of intense fear or discomfort that reaches a peak within minutes. Although it feels dangerous, it is your body’s natural fight-or-flight alarm triggering prematurely.'
        }
      },
      {
        id: generateUUIDv7(),
        block_type: ContentBlockType.LIST,
        position: 2,
        structured_content: {
          items: [
            'Racing heart or palpitations (adrenaline preparing muscles to move)',
            'Shortness of breath or rapid breathing (hyperventilation)',
            'Trembling or shaking',
            'Feeling detached from reality (depersonalization)'
          ]
        }
      },
      {
        id: generateUUIDv7(),
        block_type: ContentBlockType.CALLOUT,
        position: 3,
        structured_content: {
          callout_type: 'TIP' as const,
          text: 'Key Fact: Panic attacks peak within 10 minutes and naturally subside as adrenaline breaks down.'
        }
      },
      {
        id: generateUUIDv7(),
        block_type: ContentBlockType.RESOURCE_CARD,
        position: 4,
        structured_content: {
          text: 'Kenya Red Cross Toll-Free Crisis Helpline',
          phone_number: '1199',
          operating_hours: '24/7 Free & Confidential'
        }
      }
    ];

    ContentPersistenceStore.saveVersion({
      id: panicVerId,
      content_definition_id: panicDefId,
      version: 1,
      status: ContentVersionState.PUBLISHED,
      title: 'Understanding Panic and Acute Anxiety',
      summary: 'Learn what causes panic attacks, why they are not medically harmful, and how to safely ride them out.',
      language: 'en',
      locale: 'en-KE',
      jurisdiction: 'KE',
      audience: ContentTargetAudience.GENERAL_ADULT,
      body_structure: { blocks: panicBlocks },
      estimated_reading_time_minutes: 4,
      clinical_artifact_id: 'c3333333-0000-0000-0000-000000000003',
      clinical_artifact_version: 1,
      privacy_processing_reference: 'DPA-KE-PR-001',
      regulatory_reference: 'DHA-KE-REG-2023',
      effective_at: now,
      created_by: 'clinical_lead',
      created_at: now,
      updated_at: now
    });

    ContentPersistenceStore.saveBlocks(panicVerId, panicBlocks);

    // Save clinical claim
    ContentPersistenceStore.saveClaim({
      id: generateUUIDv7(),
      content_version_id: panicVerId,
      claim_text: 'Somatic paced breathing down-regulates sympathetic autonomic hyperactivity during acute panic.',
      claim_type: 'MECHANISM_OF_ACTION',
      strength_of_evidence: 'SYSTEMATIC_REVIEW',
      clinical_artifact_id: 'c3333333-0000-0000-0000-000000000003',
      evidence_references: ['NICE Clinical Guidelines CG113 (Anxiety disorders)', 'DSM-5-TR Panic Criteria'],
      non_diagnostic_limitation: 'Psychoeducational information only; not a diagnostic consultation or psychiatric prescription.',
      created_at: now
    });

    // ========================================================================
    // 4. GUIDE: Sleep Hygiene & Circadian Health
    // ========================================================================
    const sleepDefId = generateUUIDv7();
    const sleepVerId = generateUUIDv7();

    ContentPersistenceStore.saveDefinition({
      id: sleepDefId,
      code: 'GUIDE_SLEEP_HYGIENE',
      content_type: ContentType.GUIDE,
      canonical_title: 'Sleep Hygiene & Bedtime Routine Guide',
      description: 'Practical evidence-based guidelines for improving sleep onset latency and sleep architecture.',
      owner_domain: 'content',
      owner_id: 'EDITORIAL_BOARD',
      primary_topic: 'SLEEP_HEALTH',
      audience: ContentTargetAudience.GENERAL_ADULT,
      clinical_relevance: ContentClinicalRelevance.INFORMATIONAL,
      risk_classification: ContentRiskClassification.INFORMATIONAL,
      status: 'ACTIVE',
      active_version_id: sleepVerId,
      default_locale: 'en-KE',
      created_at: now,
      updated_at: now
    });

    const sleepBlocks = [
      {
        id: generateUUIDv7(),
        block_type: ContentBlockType.HEADING,
        position: 0,
        structured_content: { text: 'The Four Pillars of Restful Sleep', level: 2 }
      },
      {
        id: generateUUIDv7(),
        block_type: ContentBlockType.LIST,
        position: 1,
        structured_content: {
          items: [
            'Consistent Wake Time: Anchors your circadian clock regardless of when you slept.',
            'Light Management: Seek morning sunlight; dim screens 60 minutes before bed.',
            'Caffeine Cutoff: Avoid caffeine within 8 hours of bedtime.',
            'Bedroom Conditioning: Reserve the bed strictly for sleep and intimacy.'
          ]
        }
      }
    ];

    ContentPersistenceStore.saveVersion({
      id: sleepVerId,
      content_definition_id: sleepDefId,
      version: 1,
      status: ContentVersionState.PUBLISHED,
      title: 'Sleep Hygiene & Bedtime Routine Guide',
      summary: 'Practical strategies to strengthen your natural circadian rhythm and improve sleep quality.',
      language: 'en',
      locale: 'en-KE',
      jurisdiction: 'KE',
      audience: ContentTargetAudience.GENERAL_ADULT,
      body_structure: { blocks: sleepBlocks },
      estimated_reading_time_minutes: 3,
      privacy_processing_reference: 'DPA-KE-PR-001',
      regulatory_reference: 'DHA-KE-REG-2023',
      effective_at: now,
      created_by: 'wellness_author',
      created_at: now,
      updated_at: now
    });

    ContentPersistenceStore.saveBlocks(sleepVerId, sleepBlocks);

    // ========================================================================
    // 5. CONTENT COLLECTION: Anxiety Fundamentals Pathway
    // ========================================================================
    const pathwayId = generateUUIDv7();
    ContentPersistenceStore.saveCollection({
      id: pathwayId,
      code: 'PATHWAY_ANXIETY_BASICS',
      name: 'Anxiety Coping & De-escalation Pathway',
      description: 'A curated 3-part guided learning and practice pathway to manage anxious thoughts and somatic tension.',
      collection_type: CollectionType.LEARNING_PATHWAY,
      ordering_mode: CollectionOrderingMode.ORDERED,
      audience: ContentTargetAudience.GENERAL_ADULT,
      jurisdiction: 'KE',
      status: 'ACTIVE',
      version: 1,
      created_at: now,
      updated_at: now
    });

    ContentPersistenceStore.saveCollectionItem({
      id: generateUUIDv7(),
      collection_id: pathwayId,
      content_definition_id: panicDefId,
      position: 1,
      required: true,
      created_at: now
    });

    ContentPersistenceStore.saveCollectionItem({
      id: generateUUIDv7(),
      collection_id: pathwayId,
      content_definition_id: groundingDefId,
      position: 2,
      required: true,
      prerequisite_rule: {
        prerequisite_content_definition_ids: [panicDefId]
      },
      created_at: now
    });

    ContentPersistenceStore.saveCollectionItem({
      id: generateUUIDv7(),
      collection_id: pathwayId,
      content_definition_id: boxDefId,
      position: 3,
      required: true,
      created_at: now
    });

    this.seeded = true;
  }
}
