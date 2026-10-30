/**
 * MindOS Content Collections & Guided Pathways Service
 * Authority: Master Architecture Index Section 8, Volume XVI
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import {
  ContentCollection,
  ContentCollectionItem,
  CollectionType,
  CollectionOrderingMode,
  ContentTargetAudience,
  ContentProgressState
} from '../domain/types.js';
import { ContentPersistenceStore } from '../infrastructure/persistence.ts';
import {
  ContentNotFoundError,
  ContentPrerequisiteNotMetError,
  DomainInvariantError
} from '../../platform/errors/index.js';

export interface CreateCollectionInput {
  code: string;
  name: string;
  description?: string;
  collectionType?: CollectionType;
  orderingMode?: CollectionOrderingMode;
  audience?: ContentTargetAudience;
  jurisdiction?: string;
}

export interface AddCollectionItemInput {
  collectionId: string;
  contentDefinitionId: string;
  position: number;
  required?: boolean;
  prerequisiteContentDefinitionIds?: string[];
}

export class ContentCollectionsService {
  public static createCollection(input: CreateCollectionInput): ContentCollection {
    const existing = ContentPersistenceStore.getCollection(input.code);
    if (existing) {
      throw new DomainInvariantError(`Collection code '${input.code}' already exists`);
    }

    const now = new Date().toISOString();
    const collection: ContentCollection = {
      id: generateUUIDv7(),
      code: input.code.toUpperCase(),
      name: input.name,
      description: input.description,
      collection_type: input.collectionType || CollectionType.CURATED,
      ordering_mode: input.orderingMode || CollectionOrderingMode.FREE_ORDER,
      audience: input.audience || ContentTargetAudience.GENERAL_ADULT,
      jurisdiction: input.jurisdiction || 'KE',
      status: 'ACTIVE',
      version: 1,
      created_at: now,
      updated_at: now
    };

    ContentPersistenceStore.saveCollection(collection);
    return collection;
  }

  public static addItem(input: AddCollectionItemInput): ContentCollectionItem {
    const collection = ContentPersistenceStore.getCollection(input.collectionId);
    if (!collection) {
      throw new ContentNotFoundError(`Collection '${input.collectionId}' not found`);
    }

    const def = ContentPersistenceStore.getDefinition(input.contentDefinitionId);
    if (!def) {
      throw new ContentNotFoundError(`Content definition '${input.contentDefinitionId}' not found`);
    }

    const item: ContentCollectionItem = {
      id: generateUUIDv7(),
      collection_id: collection.id,
      content_definition_id: def.id,
      position: input.position,
      required: input.required ?? true,
      prerequisite_rule: input.prerequisiteContentDefinitionIds ? {
        prerequisite_content_definition_ids: input.prerequisiteContentDefinitionIds
      } : undefined,
      created_at: new Date().toISOString()
    };

    ContentPersistenceStore.saveCollectionItem(item);
    return item;
  }

  public static getCollection(idOrCode: string): {
    collection: ContentCollection;
    items: ContentCollectionItem[];
  } {
    const collection = ContentPersistenceStore.getCollection(idOrCode);
    if (!collection) {
      throw new ContentNotFoundError(`Collection '${idOrCode}' not found`);
    }
    const items = ContentPersistenceStore.getCollectionItems(collection.id);
    return { collection, items };
  }

  public static listCollections(): ContentCollection[] {
    return ContentPersistenceStore.listCollections();
  }

  /**
   * Verifies whether a user meets prerequisites for an item in a prerequisite-gated collection.
   */
  public static verifyPrerequisites(userId: string, item: ContentCollectionItem): {
    satisfied: boolean;
    unmetDefinitionIds: string[];
  } {
    if (!item.prerequisite_rule || !item.prerequisite_rule.prerequisite_content_definition_ids) {
      return { satisfied: true, unmetDefinitionIds: [] };
    }

    const unmet: string[] = [];
    for (const prereqId of item.prerequisite_rule.prerequisite_content_definition_ids) {
      const progress = ContentPersistenceStore.getProgress(userId, prereqId);
      if (!progress || progress.status !== ContentProgressState.COMPLETED) {
        unmet.push(prereqId);
      }
    }

    return {
      satisfied: unmet.length === 0,
      unmetDefinitionIds: unmet
    };
  }
}
