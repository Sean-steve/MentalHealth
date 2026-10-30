/**
 * MindOS Governed Content Authoring Service
 * Authority: Master Architecture Index Section 8, Volumes III, XVI
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import {
  ContentDefinition,
  ContentVersion,
  ContentBlock,
  ContentClaim,
  ContentType,
  ContentTargetAudience,
  ContentClinicalRelevance,
  ContentRiskClassification,
  ContentVersionState
} from '../domain/types.js';
import { ContentPersistenceStore } from '../infrastructure/persistence.ts';
import {
  ContentNotFoundError,
  DomainInvariantError
} from '../../platform/errors/index.js';
import { ContentInvariants } from '../domain/invariants.ts';

export interface CreateDefinitionInput {
  code: string;
  contentType: ContentType;
  title: string;
  description?: string;
  ownerDomain?: string;
  ownerId?: string;
  primaryTopic: string;
  audience?: ContentTargetAudience;
  clinicalRelevance?: ContentClinicalRelevance;
  riskClassification?: ContentRiskClassification;
  defaultLocale?: string;
}

export interface CreateVersionInput {
  contentDefinitionId: string;
  title: string;
  summary: string;
  blocks: ContentBlock[];
  language?: string;
  locale?: string;
  jurisdiction?: string;
  audience?: ContentTargetAudience;
  estimatedReadingTimeMinutes?: number;
  clinicalArtifactId?: string;
  clinicalArtifactVersion?: number;
  privacyProcessingReference?: string;
  regulatoryReference?: string;
  createdBy: string;
  claims?: Omit<ContentClaim, 'id' | 'content_version_id' | 'created_at'>[];
}

export class ContentAuthoringService {
  /**
   * Registers a new logical Content Definition.
   */
  public static createDefinition(input: CreateDefinitionInput): ContentDefinition {
    const existing = ContentPersistenceStore.getDefinition(input.code);
    if (existing) {
      throw new DomainInvariantError(`Content definition code '${input.code}' already exists`);
    }

    const now = new Date().toISOString();
    const def: ContentDefinition = {
      id: generateUUIDv7(),
      code: input.code.toUpperCase(),
      content_type: input.contentType,
      canonical_title: input.title,
      description: input.description,
      owner_domain: input.ownerDomain || 'content',
      owner_id: input.ownerId || 'EDITORIAL_BOARD',
      primary_topic: input.primaryTopic,
      audience: input.audience || ContentTargetAudience.GENERAL_ADULT,
      clinical_relevance: input.clinicalRelevance || ContentClinicalRelevance.INFORMATIONAL,
      risk_classification: input.riskClassification || ContentRiskClassification.INFORMATIONAL,
      status: 'ACTIVE',
      default_locale: input.defaultLocale || 'en-KE',
      created_at: now,
      updated_at: now
    };

    ContentPersistenceStore.saveDefinition(def);
    return def;
  }

  /**
   * Creates an immutable Content Version draft.
   */
  public static createVersion(input: CreateVersionInput): ContentVersion {
    const def = ContentPersistenceStore.getDefinition(input.contentDefinitionId);
    if (!def) {
      throw new ContentNotFoundError(`Content definition '${input.contentDefinitionId}' not found`);
    }

    const existingVersions = ContentPersistenceStore.listVersions(def.id);
    const nextVersionNum = existingVersions.length > 0
      ? Math.max(...existingVersions.map(v => v.version)) + 1
      : 1;

    const previousActive = ContentPersistenceStore.getActiveVersion(def.id);
    const now = new Date().toISOString();
    const versionId = generateUUIDv7();

    const version: ContentVersion = {
      id: versionId,
      content_definition_id: def.id,
      version: nextVersionNum,
      status: ContentVersionState.DRAFT,
      title: input.title,
      summary: input.summary,
      language: input.language || 'en',
      locale: input.locale || def.default_locale,
      jurisdiction: input.jurisdiction || 'KE',
      audience: input.audience || def.audience,
      body_structure: {
        blocks: input.blocks
      },
      estimated_reading_time_minutes: input.estimatedReadingTimeMinutes || 3,
      clinical_artifact_id: input.clinicalArtifactId,
      clinical_artifact_version: input.clinicalArtifactVersion,
      privacy_processing_reference: input.privacyProcessingReference || 'DPA-KE-PR-001',
      regulatory_reference: input.regulatoryReference || 'DHA-KE-REG-2023',
      effective_at: now,
      created_by: input.createdBy,
      supersedes_id: previousActive ? previousActive.id : undefined,
      created_at: now,
      updated_at: now
    };

    ContentPersistenceStore.saveVersion(version);
    ContentPersistenceStore.saveBlocks(versionId, input.blocks);

    if (input.claims && input.claims.length > 0) {
      for (const c of input.claims) {
        const claim: ContentClaim = {
          id: generateUUIDv7(),
          content_version_id: versionId,
          claim_text: c.claim_text,
          claim_type: c.claim_type,
          strength_of_evidence: c.strength_of_evidence,
          clinical_artifact_id: c.clinical_artifact_id || input.clinicalArtifactId,
          evidence_references: c.evidence_references,
          non_diagnostic_limitation: c.non_diagnostic_limitation,
          created_at: now
        };
        ContentInvariants.validateClaimIntegrity(claim);
        ContentPersistenceStore.saveClaim(claim);
      }
    }

    return version;
  }

  /**
   * Computes differences between two content versions.
   */
  public static diffVersions(v1Id: string, v2Id: string): {
    version1: number;
    version2: number;
    titleChanged: boolean;
    summaryChanged: boolean;
    blockCountV1: number;
    blockCountV2: number;
    clinicalArtifactChanged: boolean;
  } {
    const v1 = ContentPersistenceStore.getVersion(v1Id);
    const v2 = ContentPersistenceStore.getVersion(v2Id);
    if (!v1 || !v2) {
      throw new ContentNotFoundError('One or both versions not found for diffing');
    }

    return {
      version1: v1.version,
      version2: v2.version,
      titleChanged: v1.title !== v2.title,
      summaryChanged: v1.summary !== v2.summary,
      blockCountV1: v1.body_structure.blocks.length,
      blockCountV2: v2.body_structure.blocks.length,
      clinicalArtifactChanged: v1.clinical_artifact_id !== v2.clinical_artifact_id
    };
  }
}
