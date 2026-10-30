/**
 * MindOS Canonical Clinical Timeline Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 23 Bounded Context
 * 
 * Rules:
 * - Timeline is a projection/reference, never source of truth.
 * - Idempotent: replaying same source domain event returns existing entry.
 * - Immutability: historical entries are never updated in place. Invalidation preserves historical trace.
 * - Deterministic ordering by occurred_at, tie-break by recorded_at and ID.
 * - Visibility filtering: user vs professional vs safety operations.
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { DomainInvariantError, ClinicalTimelineAccessDeniedError } from '../../platform/errors/index.js';
import { IClinicalRecordRepository } from '../repositories/interfaces.js';
import { ClinicalTimelineEntry } from '../domain/entities.js';
import {
  TimelineFilterCriteria,
  TimelineVisibilityScope,
  ClinicalTimelineSourceType,
  ClinicalProvenance
} from '../domain/types.js';
import { ClinicalRecordInvariants } from '../domain/invariants.js';

export interface AppendTimelineEntryParams {
  subject_user_id: string;
  event_type: string;
  occurred_at: string;
  source_domain: string;
  source_type: ClinicalTimelineSourceType;
  source_id: string;
  provenance: ClinicalProvenance;
  clinical_significance?: 'ROUTINE' | 'SIGNIFICANT' | 'CRITICAL' | 'MONITORED';
  safety_significance?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  summary_reference?: string;
  visibility_scope?: TimelineVisibilityScope;
  care_relationship_id?: string;
  care_plan_id?: string;
  metadata?: Record<string, unknown>;
  actor_id?: string;
  actor_role?: string;
}

export class ClinicalTimelineService {
  private static repository: IClinicalRecordRepository;

  public static setRepository(repo: IClinicalRecordRepository): void {
    ClinicalTimelineService.repository = repo;
  }

  /**
   * Appends a timeline entry idempotently.
   * If an entry with matching (source_domain, source_type, source_id) exists, returns it.
   */
  public static async recordEvent(params: AppendTimelineEntryParams): Promise<ClinicalTimelineEntry> {
    if (!ClinicalTimelineService.repository) {
      throw new DomainInvariantError('ClinicalRecordRepository not initialized.');
    }

    // Provenance guard (Section 13, 26, 133)
    if (params.actor_role) {
      ClinicalRecordInvariants.assertProvenanceIntegrity(params.provenance, params.actor_role);
    }

    // Idempotency check (Section 126)
    const existing = await ClinicalTimelineService.repository.findTimelineEntryBySource(
      params.source_domain,
      params.source_type,
      params.source_id
    );

    if (existing) {
      return existing;
    }

    const recorded_at = new Date().toISOString();
    const entryId = generateUUIDv7();

    const entry: ClinicalTimelineEntry = {
      id: entryId,
      subject_user_id: params.subject_user_id,
      event_type: params.event_type,
      occurred_at: params.occurred_at,
      recorded_at,
      source_domain: params.source_domain,
      source_type: params.source_type,
      source_id: params.source_id,
      provenance: params.provenance,
      clinical_significance: params.clinical_significance || 'ROUTINE',
      safety_significance: params.safety_significance || 'NONE',
      summary_reference: params.summary_reference,
      visibility_scope: params.visibility_scope || TimelineVisibilityScope.PROFESSIONAL,
      care_relationship_id: params.care_relationship_id,
      care_plan_id: params.care_plan_id,
      metadata: params.metadata,
      created_at: recorded_at
    };

    ClinicalRecordInvariants.assertValidTimelineEntry(entry);

    await ClinicalTimelineService.repository.saveTimelineEntry(entry);

    EventBus.enqueue(
      'clinical.timeline_entry_created',
      'clinical_record',
      entryId,
      DataClassification.CLINICAL_RECORD,
      {
        timeline_entry_id: entryId,
        subject_user_id: entry.subject_user_id,
        event_type: entry.event_type,
        source_domain: entry.source_domain,
        source_type: entry.source_type,
        source_id: entry.source_id,
        occurred_at: entry.occurred_at,
        visibility_scope: entry.visibility_scope
      }
    );

    AuditService.record({
      actor_type: params.actor_id ? 'STAFF' : 'SYSTEM',
      actor_id: params.actor_id || 'system',
      action: 'CLINICAL_TIMELINE.ENTRY_CREATED',
      resource_type: 'clinical_timeline',
      resource_id: entryId,
      purpose: 'Longitudinal Clinical Timeline Tracking',
      authorization_basis: { sourceDomain: params.source_domain, sourceType: params.source_type },
      result: 'ALLOWED',
      metadata: { sourceId: params.source_id, eventType: params.event_type }
    });

    return entry;
  }

  /**
   * Retrieves timeline entries for a subject under strict visibility and authorization filtering.
   */
  public static async getTimeline(
    criteria: TimelineFilterCriteria,
    viewerScope: 'USER' | 'PROFESSIONAL' | 'SAFETY' = 'PROFESSIONAL'
  ): Promise<ClinicalTimelineEntry[]> {
    if (!ClinicalTimelineService.repository) {
      throw new DomainInvariantError('ClinicalRecordRepository not initialized.');
    }

    const rawEntries = await ClinicalTimelineService.repository.findTimelineEntries(criteria);

    // Apply strict visibility filter (Section 14, 68, 69)
    return rawEntries.filter((entry) => ClinicalRecordInvariants.filterEntryForViewer(entry, viewerScope));
  }

  /**
   * Propagates source record invalidation to the timeline projection (Section 10, 140, 148).
   */
  public static async invalidateBySource(
    sourceDomain: string,
    sourceType: string,
    sourceId: string,
    reason: string,
    actorId = 'system'
  ): Promise<boolean> {
    if (!ClinicalTimelineService.repository) {
      throw new DomainInvariantError('ClinicalRecordRepository not initialized.');
    }

    const success = await ClinicalTimelineService.repository.invalidateTimelineEntry(
      sourceDomain,
      sourceType,
      sourceId,
      reason
    );

    if (success) {
      AuditService.record({
        actor_type: 'STAFF',
        actor_id: actorId,
        action: 'CLINICAL_TIMELINE.ENTRY_INVALIDATED',
        resource_type: 'clinical_timeline',
        resource_id: sourceId,
        purpose: 'Clinical Invalidation Reconciliation',
        authorization_basis: { sourceDomain, sourceType },
        result: 'ALLOWED',
        metadata: { reason }
      });
    }

    return success;
  }
}
