/**
 * MindOS Care Plan Progress Projection Service
 * Derived projection only; task completion is not clinical outcome.
 */
import { NotFoundError } from '../../platform/errors/index.js';
import { CarePlanProgressProjection } from '../domain/entities.js';
import { CareGoalStatus } from '../domain/types.js';
import { ICarePlanRepository } from '../repositories/interfaces.js';
import { CarePlanService } from '../plans/care_plan_service.js';
import { ClinicalTaskService, ClinicalTaskState } from '../../clinical_tasks/index.js';

export class CarePlanProgressService {
  private static repository:ICarePlanRepository;
  public static setRepository(repo:ICarePlanRepository):void{CarePlanProgressService.repository=repo;}

  public static async getProgress(planId:string):Promise<CarePlanProgressProjection>{
    const plan=await CarePlanService.getPlan(planId);
    if(!plan) throw new NotFoundError(`CarePlan ${planId} not found.`);
    const version=await CarePlanService.getActiveVersion(plan.id)||
      await CarePlanProgressService.repository.findVersionById(plan.current_version_id);
    const goals=version?await CarePlanProgressService.repository.findGoalsByVersionId(version.id):[];
    const interventions=version?await CarePlanProgressService.repository.findInterventionsByVersionId(version.id):[];
    const reviews=await CarePlanProgressService.repository.findPlanReviewsByPlanId(plan.id);
    const tasks=await ClinicalTaskService.listTasksForPlan(plan.id);
    const lastReview=reviews.filter(r=>r.completed_at).sort((a,b)=>
      Date.parse(a.completed_at||a.created_at)-Date.parse(b.completed_at||b.created_at)
    ).at(-1);

    return {
      care_plan_id:plan.id,current_version:version?.version||1,status:plan.status,
      goals_summary:{
        total:goals.length,
        achieved:goals.filter(g=>g.status===CareGoalStatus.ACHIEVED).length,
        on_track:goals.filter(g=>g.status===CareGoalStatus.ON_TRACK).length,
        at_risk:goals.filter(g=>g.status===CareGoalStatus.AT_RISK).length,
        in_progress:goals.filter(g=>g.status===CareGoalStatus.IN_PROGRESS).length,
        not_started:goals.filter(g=>g.status===CareGoalStatus.NOT_STARTED).length
      },
      tasks_summary:{
        total:tasks.length,
        completed:tasks.filter(t=>t.status===ClinicalTaskState.COMPLETED).length,
        pending:tasks.filter(t=>[
          ClinicalTaskState.PENDING,ClinicalTaskState.READY,ClinicalTaskState.IN_PROGRESS,ClinicalTaskState.BLOCKED
        ].includes(t.status)).length,
        overdue:tasks.filter(t=>t.status===ClinicalTaskState.OVERDUE).length
      },
      interventions_count:interventions.length,
      next_review_due:version?.review_schedule.next_review_due,
      last_review_at:lastReview?.completed_at,last_review_outcome:lastReview?.outcome,
      computed_at:new Date().toISOString()
    };
  }
}
