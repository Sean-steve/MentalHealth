/**
 * MindOS Longitudinal Clinical Record Projection Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 23 Bounded Context
 * 
 * Rules:
 * - Composes authorized longitudinal context from canonical domain sources.
 * - Invariant (Section 66): No giant join object ("UserClinicalEverythingDTO") given blindly to callers.
 * - Uses purpose- and scope-aware projections.
 */

import { IClinicalRecordRepository } from '../repositories/interfaces.js';
import { ClinicalTimelineService } from '../timeline/clinical_timeline_service.js';
import { ClinicalTimelineEntry, LongitudinalClinicalRecord } from '../domain/entities.js';
import {
  LongitudinalContextOptions,
  TimelineFilterCriteria,
  TimelineVisibilityScope,
  LongitudinalClinicalRecordState
} from '../domain/types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { DomainInvariantError, AuthorizationError } from '../../platform/errors/index.js';
import { RelationshipAccessEvaluator } from '../../care_relationships/access/relationship_access_evaluator.js';

export interface LongitudinalRecordProjection {
  record: LongitudinalClinicalRecord;
  timeline: ClinicalTimelineEntry[];
  summary: {
    total_events: number;
    first_event_at?: string;
    latest_event_at?: string;
    source_counts: Record<string, number>;
  };
}

export class ClinicalRecordProjectionService {
  private static repository: IClinicalRecordRepository;

  public static setRepository(repo: IClinicalRecordRepository): void {
    ClinicalRecordProjectionService.repository = repo;
  }

  /**
   * Retrieves or provisions the longitudinal record entity for a subject.
   */
  public static async getOrCreateRecord(userId: string, jurisdiction = 'KE'): Promise<LongitudinalClinicalRecord> {
    if (!ClinicalRecordProjectionService.repository) {
      throw new DomainInvariantError('ClinicalRecordRepository not initialized.');
    }

    let record = await ClinicalRecordProjectionService.repository.findRecordByUserId(userId);
    if (!record) {
      const now = new Date().toISOString();
      record = {
        id: generateUUIDv7(),
        subject_user_id: userId,
        status: LongitudinalClinicalRecordState.ACTIVE,
        jurisdiction,
        created_at: now,
        updated_at: now,
        record_version: 1
      };
      await ClinicalRecordProjectionService.repository.saveRecord(record);
    }
    return record;
  }

  /**
   * Projects longitudinal clinical context for an authorized professional.
   * Enforces relationship and minimum necessary scope (Section 64, 66, 111, 113).
   */
  public static async projectForProfessional(params: {
    subject_user_id: string;
    professional_id: string;
    purpose: string;
    options?: LongitudinalContextOptions;
  }): Promise<LongitudinalRecordProjection> {
    // Relationship-scoped access check
    const authDecision = await RelationshipAccessEvaluator.evaluateProfessionalAccess({
      subjectUserId: params.subject_user_id,
      professionalId: params.professional_id,
      purpose: params.purpose,
      action: 'READ',
      dataDomain: 'CLINICAL_NOTES'
    });

    if (!authDecision.allowed) {
      throw new AuthorizationError(
        `Professional ${params.professional_id} is not authorized for longitudinal clinical record of user ${params.subject_user_id}: ${authDecision.reason}`,
        { errorCode: authDecision.reasonCode || 'AUTHZ_003' }
      );
    }

    const record = await ClinicalRecordProjectionService.getOrCreateRecord(params.subject_user_id);

    const filter: TimelineFilterCriteria = {
      subject_user_id: params.subject_user_id,
      visibility_scope: undefined // will filter in ClinicalTimelineService for PROFESSIONAL scope
    };

    if (params.options?.timeWindowDays) {
      const cutoff = new Date(Date.now() - params.options.timeWindowDays * 24 * 60 * 60 * 1000).toISOString();
      filter.start_date = cutoff;
    }

    const timeline = await ClinicalTimelineService.getTimeline(filter, 'PROFESSIONAL');

    const sourceCounts: Record<string, number> = {};
    for (const item of timeline) {
      sourceCounts[item.source_type] = (sourceCounts[item.source_type] || 0) + 1;
    }

    return {
      record,
      timeline,
      summary: {
        total_events: timeline.length,
        first_event_at: timeline.length > 0 ? timeline[timeline.length - 1].occurred_at : undefined,
        latest_event_at: timeline.length > 0 ? timeline[0].occurred_at : undefined,
        source_counts: sourceCounts
      }
    };
  }

  /**
   * Projects user-facing timeline and progress context.
   */
  public static async projectForUser(userId: string): Promise<LongitudinalRecordProjection> {
    const record = await ClinicalRecordProjectionService.getOrCreateRecord(userId);

    const timeline = await ClinicalTimelineService.getTimeline(
      { subject_user_id: userId },
      'USER'
    );

    const sourceCounts: Record<string, number> = {};
    for (const item of timeline) {
      sourceCounts[item.source_type] = (sourceCounts[item.source_type] || 0) + 1;
    }

    return {
      record,
      timeline,
      summary: {
        total_events: timeline.length,
        first_event_at: timeline.length > 0 ? timeline[timeline.length - 1].occurred_at : undefined,
        latest_event_at: timeline.length > 0 ? timeline[0].occurred_at : undefined,
        source_counts: sourceCounts
      }
    };
  }
}
