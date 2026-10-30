/**
 * MindOS Governed Content Publishing Workflow & Governance Lifecycle
 * Authority: Master Architecture Index Section 8, Volumes I, III, XVI & Appendix B / C / Q
 * Clinical Safety Policy Catalogue: R-SAFE-001, POL-SAFE-001
 */

import {
  ContentVersion,
  ContentVersionState,
  ContentDefinition
} from '../domain/types.js';
import { ContentPersistenceStore } from '../infrastructure/persistence.ts';
import { ContentInvariants } from '../domain/invariants.ts';
import {
  ContentNotFoundError,
  ContentPublicationBlockedError,
  DomainInvariantError
} from '../../platform/errors/index.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';
import { ContentOutboxDispatcher } from '../infrastructure/outbox_integration.ts';
import { ContentAuditLogger } from '../infrastructure/audit_integration.ts';

export class ContentPublishingWorkflow {
  /**
   * Submits a draft content version for editorial review.
   */
  public static submitForEditorialReview(versionId: string, actorId: string): ContentVersion {
    const version = ContentPersistenceStore.getVersion(versionId);
    if (!version) {
      throw new ContentNotFoundError(`Content version '${versionId}' not found`);
    }

    validateStateTransition('ContentVersionState', version.status, ContentVersionState.EDITORIAL_REVIEW, version.id, actorId);
    version.status = ContentVersionState.EDITORIAL_REVIEW;
    version.updated_at = new Date().toISOString();
    ContentPersistenceStore.saveVersion(version);
    return version;
  }

  /**
   * Submits a content version for Clinical Governance review.
   */
  public static submitForClinicalReview(versionId: string, actorId: string): ContentVersion {
    const version = ContentPersistenceStore.getVersion(versionId);
    if (!version) {
      throw new ContentNotFoundError(`Content version '${versionId}' not found`);
    }

    validateStateTransition('ContentVersionState', version.status, ContentVersionState.CLINICAL_REVIEW_REQUIRED, version.id, actorId);
    version.status = ContentVersionState.CLINICAL_REVIEW_REQUIRED;
    version.updated_at = new Date().toISOString();
    ContentPersistenceStore.saveVersion(version);
    return version;
  }

  /**
   * Approves a content version after all editorial and clinical checks pass.
   */
  public static approveVersion(versionId: string, actorId: string): ContentVersion {
    const version = ContentPersistenceStore.getVersion(versionId);
    if (!version) {
      throw new ContentNotFoundError(`Content version '${versionId}' not found`);
    }

    const def = ContentPersistenceStore.getDefinition(version.content_definition_id);
    if (!def) {
      throw new ContentNotFoundError(`Content definition '${version.content_definition_id}' not found`);
    }

    // Invariant check: Clinical Governance prerequisite
    ContentInvariants.validateClinicalGovernancePrerequisite(def, version);

    validateStateTransition('ContentVersionState', version.status, ContentVersionState.APPROVED, version.id, actorId);
    version.status = ContentVersionState.APPROVED;
    version.updated_at = new Date().toISOString();
    ContentPersistenceStore.saveVersion(version);
    return version;
  }

  /**
   * Publishes an approved content version into the active registry.
   */
  public static async publishVersion(versionId: string, actorId: string): Promise<ContentVersion> {
    const version = ContentPersistenceStore.getVersion(versionId);
    if (!version) {
      throw new ContentNotFoundError(`Content version '${versionId}' not found`);
    }

    const def = ContentPersistenceStore.getDefinition(version.content_definition_id);
    if (!def) {
      throw new ContentNotFoundError(`Content definition '${version.content_definition_id}' not found`);
    }

    // Must be approved before publishing
    if (version.status !== ContentVersionState.APPROVED) {
      // If currently in review or draft, perform validation and approval step
      ContentInvariants.validateClinicalGovernancePrerequisite(def, version);
      validateStateTransition('ContentVersionState', version.status, ContentVersionState.APPROVED, version.id, actorId);
      version.status = ContentVersionState.APPROVED;
    }

    validateStateTransition('ContentVersionState', version.status, ContentVersionState.PUBLISHED, version.id, actorId);
    version.status = ContentVersionState.PUBLISHED;
    version.updated_at = new Date().toISOString();

    // Check if there is an existing active version to supersede
    const previousActive = def.active_version_id
      ? ContentPersistenceStore.getVersion(def.active_version_id)
      : undefined;

    if (previousActive && previousActive.id !== version.id) {
      validateStateTransition('ContentVersionState', previousActive.status, ContentVersionState.SUPERSEDED, previousActive.id, actorId);
      previousActive.status = ContentVersionState.SUPERSEDED;
      previousActive.updated_at = new Date().toISOString();
      ContentPersistenceStore.saveVersion(previousActive);

      await ContentOutboxDispatcher.emitContentVersionSuperseded({
        oldVersionId: previousActive.id,
        newVersionId: version.id,
        contentDefinitionId: def.id
      });
    }

    def.active_version_id = version.id;
    def.updated_at = new Date().toISOString();
    ContentPersistenceStore.saveDefinition(def);
    ContentPersistenceStore.saveVersion(version);

    // Audit and Outbox dispatch
    await ContentAuditLogger.logPublication({
      actorId,
      contentDefinitionId: def.id,
      contentVersionId: version.id,
      versionNumber: version.version,
      clinicalArtifactId: version.clinical_artifact_id
    });

    await ContentOutboxDispatcher.emitContentPublished({
      contentDefinitionId: def.id,
      contentVersionId: version.id,
      versionNumber: version.version,
      code: def.code,
      clinicalArtifactId: version.clinical_artifact_id
    });

    return version;
  }

  /**
   * Suspends a published content version immediately (e.g. safety review, recall).
   */
  public static async suspendVersion(versionId: string, actorId: string, reason: string): Promise<ContentVersion> {
    const version = ContentPersistenceStore.getVersion(versionId);
    if (!version) {
      throw new ContentNotFoundError(`Content version '${versionId}' not found`);
    }

    const def = ContentPersistenceStore.getDefinition(version.content_definition_id);
    if (!def) {
      throw new ContentNotFoundError(`Content definition '${version.content_definition_id}' not found`);
    }

    validateStateTransition('ContentVersionState', version.status, ContentVersionState.SUSPENDED, version.id, actorId);
    version.status = ContentVersionState.SUSPENDED;
    version.updated_at = new Date().toISOString();

    if (def.active_version_id === version.id) {
      def.active_version_id = undefined;
      def.updated_at = new Date().toISOString();
      ContentPersistenceStore.saveDefinition(def);
    }

    ContentPersistenceStore.saveVersion(version);

    await ContentAuditLogger.logSuspension({
      actorId,
      contentVersionId: version.id,
      reason
    });

    await ContentOutboxDispatcher.emitContentSuspended({
      contentDefinitionId: def.id,
      contentVersionId: version.id,
      reason
    });

    return version;
  }

  /**
   * Retires a content definition or version permanently.
   */
  public static async retireVersion(versionId: string, actorId: string, reason = 'End of lifecycle'): Promise<ContentVersion> {
    const version = ContentPersistenceStore.getVersion(versionId);
    if (!version) {
      throw new ContentNotFoundError(`Content version '${versionId}' not found`);
    }

    const def = ContentPersistenceStore.getDefinition(version.content_definition_id);
    validateStateTransition('ContentVersionState', version.status, ContentVersionState.RETIRED, version.id, actorId);
    version.status = ContentVersionState.RETIRED;
    version.updated_at = new Date().toISOString();

    if (def && def.active_version_id === version.id) {
      def.active_version_id = undefined;
      ContentPersistenceStore.saveDefinition(def);
    }

    ContentPersistenceStore.saveVersion(version);

    await ContentOutboxDispatcher.emitContentRetired({
      contentDefinitionId: version.content_definition_id,
      contentVersionId: version.id,
      reason
    });

    return version;
  }
}
