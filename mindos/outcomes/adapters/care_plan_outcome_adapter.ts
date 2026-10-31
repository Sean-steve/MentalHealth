/**
 * Bridges OutcomeReview decisions into Sprint-22 Care Plans and Clinical Tasks.
 * Outcome review never rewrites the active Care Plan directly and never invents
 * a due date. Follow-up scheduling belongs to governed task/care-plan policy.
 */
import { CarePlanReviewService } from '../../care_plans/reviews/care_plan_review_service.js';
import { CarePlanReviewType } from '../../care_plans/domain/types.js';
import {
  ClinicalTaskService,
  ClinicalTaskType,
  ClinicalTaskAssigneeType,
  ClinicalTaskPriority,
  ClinicalTaskCompletionAuthority
} from '../../clinical_tasks/index.js';
import { OutcomeReview } from '../domain/entities.js';
import { OutcomeReviewDecision } from '../domain/types.js';

export class CarePlanOutcomeAdapter {
  public static async handleReviewCompletion(review: OutcomeReview): Promise<void> {
    if (!review.care_plan_id || !review.reviewer_id) return;

    if (
      review.decision === OutcomeReviewDecision.MODIFY_PLAN ||
      review.decision === OutcomeReviewDecision.ESCALATE_CARE
    ) {
      // A decision to alter/escalate care triggers a formal Care Plan review.
      // It does not mutate the active plan version in place.
      try {
        await CarePlanReviewService.scheduleReview({
          planId: review.care_plan_id,
          reviewType: CarePlanReviewType.ASSESSMENT_TRIGGERED,
          scheduledFor: new Date().toISOString(),
          reviewerId: review.reviewer_id
        });
      } catch {
        // CarePlan review scheduling is independently idempotent/reconcilable.
      }

      await ClinicalTaskService.createTask({
        care_relationship_id: review.care_relationship_id,
        care_plan_id: review.care_plan_id,
        task_type: ClinicalTaskType.CARE_REVIEW,
        assigned_to_type: ClinicalTaskAssigneeType.PROFESSIONAL,
        assigned_to_id: review.reviewer_id,
        priority: review.decision === OutcomeReviewDecision.ESCALATE_CARE
          ? ClinicalTaskPriority.HIGH
          : ClinicalTaskPriority.NORMAL,
        title: `Outcome review follow-up: ${review.decision}`,
        instruction_reference: `outcome-review:${review.id}:care-plan-review`,
        source_type: 'OUTCOME_REVIEW',
        source_reference: review.id,
        completion_authority: ClinicalTaskCompletionAuthority.PROFESSIONAL,
        policy_version: 'OUTCOME_REVIEW_ADAPTER_V1',
        idempotency_key: `outcome-review:${review.id}:care-review`,
        creator_professional_id: review.reviewer_id
      });
      return;
    }

    if (review.decision === OutcomeReviewDecision.REPEAT_MEASURE) {
      await ClinicalTaskService.createTask({
        care_relationship_id: review.care_relationship_id,
        care_plan_id: review.care_plan_id,
        task_type: ClinicalTaskType.ASSESSMENT,
        assigned_to_type: ClinicalTaskAssigneeType.PROFESSIONAL,
        assigned_to_id: review.reviewer_id,
        priority: ClinicalTaskPriority.NORMAL,
        title: 'Repeat governed outcome assessment',
        instruction_reference: `outcome-review:${review.id}:repeat-measure`,
        source_type: 'OUTCOME_REVIEW',
        source_reference: review.id,
        completion_authority: ClinicalTaskCompletionAuthority.OWNER_DOMAIN,
        owner_domain: 'assessments',
        policy_version: 'OUTCOME_REVIEW_ADAPTER_V1',
        idempotency_key: `outcome-review:${review.id}:repeat-measure`,
        creator_professional_id: review.reviewer_id
      });
    }
  }
}
