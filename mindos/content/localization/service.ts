/**
 * MindOS Content Localization Service
 * Authority: Master Architecture Index Section 8, Volume XVI & Appendix B / Q
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import {
  ContentLocalization,
  TranslationMethod,
  LocalizationReviewStatus,
  ContentBlock
} from '../domain/types.js';
import { ContentPersistenceStore } from '../infrastructure/persistence.ts';
import {
  ContentNotFoundError,
  ContentLocalizationUnavailableError,
  ContentPublicationBlockedError
} from '../../platform/errors/index.js';

export interface CreateLocalizationInput {
  contentDefinitionId: string;
  sourceVersionId: string;
  locale: string;
  language: string;
  jurisdiction?: string;
  title: string;
  summary: string;
  blocks: ContentBlock[];
  translationMethod: TranslationMethod;
  translatorReference?: string;
}

export class ContentLocalizationService {
  /**
   * Registers a new localized translation.
   */
  public static createLocalization(input: CreateLocalizationInput): ContentLocalization {
    const def = ContentPersistenceStore.getDefinition(input.contentDefinitionId);
    if (!def) {
      throw new ContentNotFoundError(`Content definition '${input.contentDefinitionId}' not found`);
    }

    const sourceVersion = ContentPersistenceStore.getVersion(input.sourceVersionId);
    if (!sourceVersion) {
      throw new ContentNotFoundError(`Source version '${input.sourceVersionId}' not found`);
    }

    const existingLocs = ContentPersistenceStore.listLocalizations(def.id);
    const existingForLocale = existingLocs.filter(l => l.locale === input.locale);
    const localizedVersionNum = existingForLocale.length > 0
      ? Math.max(...existingForLocale.map(l => l.localized_version)) + 1
      : 1;

    const now = new Date().toISOString();
    const loc: ContentLocalization = {
      id: generateUUIDv7(),
      content_definition_id: def.id,
      source_version_id: sourceVersion.id,
      locale: input.locale,
      language: input.language,
      jurisdiction: input.jurisdiction || 'KE',
      localized_version: localizedVersionNum,
      title: input.title,
      summary: input.summary,
      body_structure: {
        blocks: input.blocks
      },
      translation_method: input.translationMethod,
      review_status: LocalizationReviewStatus.PENDING_CLINICAL_REVIEW,
      translator_reference: input.translatorReference,
      created_at: now,
      updated_at: now
    };

    ContentPersistenceStore.saveLocalization(loc);
    return loc;
  }

  /**
   * Approves a localization following clinical semantic review.
   */
  public static approveLocalization(params: {
    contentDefinitionId: string;
    locale: string;
    reviewerReference: string;
  }): ContentLocalization {
    const loc = ContentPersistenceStore.getLocalization(params.contentDefinitionId, params.locale);
    if (!loc) {
      throw new ContentLocalizationUnavailableError(
        `Localization '${params.locale}' for content '${params.contentDefinitionId}' not found`
      );
    }

    loc.review_status = LocalizationReviewStatus.APPROVED;
    loc.reviewer_reference = params.reviewerReference;
    loc.updated_at = new Date().toISOString();
    ContentPersistenceStore.saveLocalization(loc);
    return loc;
  }

  /**
   * Retrieves an approved localization for delivery.
   */
  public static getApprovedLocalization(
    contentDefinitionId: string,
    locale: string
  ): ContentLocalization {
    const loc = ContentPersistenceStore.getLocalization(contentDefinitionId, locale);
    if (!loc) {
      throw new ContentLocalizationUnavailableError(
        `Localization '${locale}' not available for content '${contentDefinitionId}'`
      );
    }

    if (loc.review_status !== LocalizationReviewStatus.APPROVED) {
      throw new ContentLocalizationUnavailableError(
        `Localization '${locale}' is currently in state '${loc.review_status}' and has not completed clinical review`
      );
    }

    return loc;
  }
}
