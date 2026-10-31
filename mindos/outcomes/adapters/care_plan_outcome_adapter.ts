/**
 * MindOS Care Plan Outcome Adapter
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 23 Bounded Context
 * 
 * Rules:
 * - Bridges OutcomeReview outcomes to CarePlanReview and ClinicalTasks (Sections 52, 54).
 * - Invariant (Section 52): Outcome review does NOT directly rewrite the active Care Plan; triggers new version review.
 */

import { CarePlanService } from '../../care_plans/plans/care_plan_service.js';
import { CarePlanReviewService } from '../../care_plans/reviews/care_plan_review_service.js';
import { CarePlanReviewType } from '../../care_plans/domain/types.js';
import { ClinicalTaskService } from '../../clinical_workspace/tasks/clinical_task_service.js';
import { ClinicalTaskType } from '../../clinical_workspace/domain/types.js';
import { OutcomeReview } from '../domain/entities.js';
import { OutcomeReviewDecision } from '../domain/types.js';

export class CarePlanOutcomeAdapter {
  public static async handleReviewCompletion(review: OutcomeReview): Promise<void> {
    if (!review.care_plan_id) return;

    if (
      review.decision === OutcomeReviewDecision.MODIFY_PLAN ||
      review.decision === OutcomeReviewDecision.ESCALATE_CARE
    ) {
      // Trigger formal care plan review
      try {
        await CarePlanReviewService.scheduleReview({
          planId: review.care_plan_id,
          reviewType: CarePlanReviewType.ASSESSMENT_TRIGGERED,
          scheduledFor: new Date().toISOString(),
          reviewerId: review.reviewer_id || 'system'
        });
      } catch {
        // Fallback or ignore if already scheduled
      }

      // Create clinical follow-up task
      try {
        await ClinicalTaskService.createTask({
          relationshipId: review.care_relationship_id,
          assignedToProfessionalId: review.reviewer_id,
          creatorProfessionalId: review.reviewer_id || 'system',
          actorId: review.reviewer_id || 'system',
          taskType: ClinicalTaskType.FOLLOW_UP_SCHEDULING,
          title: `Outcome Review Follow-up: ${review.decision}`,
          description: `Clinician completed outcome review with decision "${review.decision}". Recommended actions: ${review.recommended_actions.map((a) => a.description).join('; ')}`
        });
      } catch {
        // Log or handle task service unavailable
      }
    } else if (review.decision === OutcomeReviewDecision.REPEAT_MEASURE) {
      // Create task to repeat measurement
      try {
        await ClinicalTaskService.createTask({
          relationshipId: review.care_relationship_id,
          assignedToProfessionalId: review.reviewer_id,
          creatorProfessionalId: review.reviewer_id || 'system',
          actorId: review.reviewer_id || 'system',
          taskType: ClinicalTaskType.QUESTIONNAIRE,
          title: 'Repeat Outcome Assessment',
          description: 'Clinician requested a repeat outcome measurement to confirm stability/trajectory.'
        });
      } catch {
        // Fallback
      }
    }
  }
}
