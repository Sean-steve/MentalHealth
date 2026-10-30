/**
 * MindOS Measurement-Based Care Outcome Review Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 23 Bounded Context
 * 
 * Rules:
 * - Measurement-Based Care review workflow (Section 34, 48, 49, 50, 51).
 * - Enforces active Care Relationship authorization.
 * - Invariant (Sections 84, 85, 154, 189): Review completion freezes an immutable OutcomeSnapshot.
 *   Subsequent measurements do NOT mutate completed reviews.
 * - Adapters notify Care Plans and Clinical Tasks (Sections 52, 54).
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { IOutcomeRepository } from '../repositories/interfaces.js';
import { OutcomeReview, OutcomeSnapshot } from '../domain/entities.js';
import {
  OutcomeReviewState,
  OutcomeReviewType,
  OutcomeReviewDecision,
  OutcomeTrendState
} from '../domain/types.js';
import { DomainInvariantError, NotFoundError, AuthorizationError } from '../../platform/errors/index.js';
import { RelationshipAccessEvaluator } from '../../care_relationships/access/relationship_access_evaluator.js';
import { OutcomeSeriesService } from '../series/outcome_series_service.js';
import { OutcomeTrendEngine } from '../trends/trend_engine.js';
import { CarePlanOutcomeAdapter } from '../adapters/care_plan_outcome_adapter.js';
import { CarePlanService } from '../../care_plans/index.js';
import { createHash } from 'node:crypto';

export interface ScheduleReviewParams {
  subject_user_id: string;
  care_relationship_id: string;
  care_plan_id?: string;
  review_type: OutcomeReviewType;
  scheduled_for?: string;
  reviewer_id?: string;
}

export interface CompleteReviewParams {
  review_id: string;
  reviewer_id: string;
  decision: OutcomeReviewDecision;
  reason_codes: string[];
  clinical_notes?: string;
  recommended_actions?: Array<{
    action_type: string;
    description: string;
    target_task_id?: string;
    target_care_plan_version?: string;
  }>;
}

export class OutcomeReviewService {
  private static repository: IOutcomeRepository;

  public static setRepository(repo: IOutcomeRepository): void {
    OutcomeReviewService.repository = repo;
    OutcomeSeriesService.setRepository(repo);
  }

  public static async scheduleReview(params: ScheduleReviewParams): Promise<OutcomeReview> {
    if (!OutcomeReviewService.repository) {
      throw new DomainInvariantError('OutcomeRepository not initialized.');
    }

    const reviewId = generateUUIDv7();
    const now = new Date().toISOString();

    const review: OutcomeReview = {
      id: reviewId,
      subject_user_id: params.subject_user_id,
      care_relationship_id: params.care_relationship_id,
      care_plan_id: params.care_plan_id,
      review_type: params.review_type,
      status: OutcomeReviewState.PENDING,
      reviewer_id: params.reviewer_id,
      measurement_refs: [],
      trend_refs: [],
      scheduled_for: params.scheduled_for || now,
      reason_codes: [],
      recommended_actions: [],
      created_at: now,
      updated_at: now
    };

    await OutcomeReviewService.repository.saveReview(review);

    EventBus.enqueue(
      'outcome.review_required',
      'outcomes',
      reviewId,
      DataClassification.CLINICAL_RECORD,
      {
        review_id: reviewId,
        subject_user_id: params.subject_user_id,
        care_relationship_id: params.care_relationship_id,
        review_type: params.review_type
      }
    );

    return review;
  }

  public static async completeReview(params: CompleteReviewParams): Promise<OutcomeReview> {
    if (!OutcomeReviewService.repository) {
      throw new DomainInvariantError('OutcomeRepository not initialized.');
    }

    const review = await OutcomeReviewService.repository.findReviewById(params.review_id);
    if (!review) {
      throw new NotFoundError(`Outcome review ${params.review_id} not found.`);
    }

    // Authorization: Evaluates relationship-scoped access (Sections 64, 111, 113)
    const authDecision = await RelationshipAccessEvaluator.evaluateProfessionalAccess({
      subjectUserId: review.subject_user_id,
      professionalId: params.reviewer_id,
      purpose: 'MEASUREMENT_BASED_CARE_REVIEW',
      action: 'WRITE',
      dataDomain: 'CLINICAL_NOTES'
    });

    if (!authDecision.allowed) {
      throw new AuthorizationError(
        `Professional ${params.reviewer_id} cannot complete outcome review for subject ${review.subject_user_id}: ${authDecision.reason}`,
        { errorCode: authDecision.reasonCode || 'AUTHZ_003' }
      );
    }

    // Freeze snapshot evidence (Sections 84, 85, 154, 189)
    const measurements = await OutcomeReviewService.repository.findMeasurementsByUser(review.subject_user_id, false);
    const measureCodes = Array.from(new Set(measurements.map((m) => m.measure_code)));

    const measureStates: OutcomeSnapshot['measure_states'] = [];
    const trendStates: OutcomeSnapshot['trend_states'] = [];

    for (const code of measureCodes) {
      const series = await OutcomeSeriesService.getSeries(review.subject_user_id, code);
      const trend = OutcomeTrendEngine.evaluateSeries(series);
      const baseline = await OutcomeReviewService.repository.findBaseline(review.subject_user_id, code);

      measureStates.push({
        measure_code: code,
        measurements: series.measurements,
        baseline: baseline || undefined
      });
      trendStates.push(trend);
    }

    const snapshotId = generateUUIDv7();
    const frozenAt = new Date().toISOString();
    const snapshotPayload = JSON.stringify({ reviewId: review.id, measureStates, trendStates, frozenAt });
    const hash = createHash('sha256').update(snapshotPayload).digest('hex');

    const activePlanVersion = review.care_plan_id
      ? await CarePlanService.getActiveVersion(review.care_plan_id)
      : null;

    const snapshot: OutcomeSnapshot = {
      id: snapshotId,
      review_id: review.id,
      subject_user_id: review.subject_user_id,
      measure_states: measureStates,
      trend_states: trendStates,
      care_plan_version_id: activePlanVersion?.id,
      frozen_at: frozenAt,
      hash
    };

    // Update review entity
    review.status = OutcomeReviewState.COMPLETED;
    review.reviewer_id = params.reviewer_id;
    review.decision = params.decision;
    review.reason_codes = params.reason_codes;
    review.clinical_notes = params.clinical_notes;
    review.recommended_actions = params.recommended_actions || [];
    review.measurement_refs = measurements.map((m) => m.id);
    review.trend_refs = trendStates.map((t) => ({
      measure_code: t.measure_code,
      trend_state: t.trend_state,
      change_amount: t.change_amount
    }));
    review.snapshot_id = snapshotId;
    review.completed_at = frozenAt;
    review.updated_at = frozenAt;

    await OutcomeReviewService.repository.saveCompletedReviewWithSnapshot(review, snapshot);

    // Enqueue review completion event
    EventBus.enqueue(
      'outcome.review_completed',
      'outcomes',
      review.id,
      DataClassification.CLINICAL_RECORD,
      {
        review_id: review.id,
        subject_user_id: review.subject_user_id,
        care_relationship_id: review.care_relationship_id,
        reviewer_id: params.reviewer_id,
        decision: params.decision,
        snapshot_id: snapshotId
      }
    );

    // Audit completion
    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.reviewer_id,
      action: 'OUTCOME_REVIEW.COMPLETED',
      resource_type: 'outcome_review',
      resource_id: review.id,
      purpose: 'Measurement-Based Care Review',
      authorization_basis: { relationshipId: review.care_relationship_id },
      result: 'ALLOWED',
      metadata: { decision: params.decision, snapshotId }
    });

    // Notify care plans & clinical tasks
    await CarePlanOutcomeAdapter.handleReviewCompletion(review);

    return review;
  }

  public static async getReview(reviewId: string): Promise<OutcomeReview | null> {
    if (!OutcomeReviewService.repository) {
      throw new DomainInvariantError('OutcomeRepository not initialized.');
    }
    return OutcomeReviewService.repository.findReviewById(reviewId);
  }

  public static async getSnapshot(snapshotId: string): Promise<OutcomeSnapshot | null> {
    if (!OutcomeReviewService.repository) {
      throw new DomainInvariantError('OutcomeRepository not initialized.');
    }
    return OutcomeReviewService.repository.findSnapshotById(snapshotId);
  }
}
