/**
 * MindOS Care Plan Review Service
 */
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { NotFoundError } from '../../platform/errors/index.js';
import {
  RelationshipAccessEvaluator, DataDomain, ActionPermission
} from '../../care_relationships/index.js';
import { CarePlanReview, CareGoalReview } from '../domain/entities.js';
import { CarePlanReviewType, CarePlanReviewOutcome } from '../domain/types.js';
import { ICarePlanRepository } from '../repositories/interfaces.js';
import { CarePlanService, CreateNewVersionParams } from '../plans/care_plan_service.js';

export interface ScheduleReviewParams {
  planId:string; reviewType:CarePlanReviewType; scheduledFor:string; reviewerId:string;
}
export interface ExecuteReviewParams {
  reviewId:string; outcome:CarePlanReviewOutcome; goalReviews:CareGoalReview[];
  recommendedChanges?:string[];
  newVersionParams?:Omit<CreateNewVersionParams,'planId'|'authorProfessionalId'|'actorId'>;
  reviewerId:string;
}

export class CarePlanReviewService {
  private static repository:ICarePlanRepository;
  public static setRepository(repo:ICarePlanRepository):void{CarePlanReviewService.repository=repo;}

  private static async authorize(planId:string,professionalId:string):Promise<void>{
    const plan=await CarePlanService.getPlan(planId);
    if(!plan) throw new NotFoundError(`CarePlan ${planId} not found.`);
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId:plan.care_relationship_id,professionalId,
      dataDomain:DataDomain.CARE_PLANS,action:ActionPermission.WRITE,purpose:'CARE_DELIVERY'
    });
  }

  public static async scheduleReview(params:ScheduleReviewParams):Promise<CarePlanReview>{
    const plan=await CarePlanService.getPlan(params.planId);
    if(!plan) throw new NotFoundError(`CarePlan ${params.planId} not found.`);
    await CarePlanReviewService.authorize(plan.id,params.reviewerId);
    if(Number.isNaN(Date.parse(params.scheduledFor))) throw new Error('scheduledFor must be a valid ISO date-time.');

    const review:CarePlanReview={
      id:generateUUIDv7(),care_plan_id:plan.id,care_plan_version_id:plan.current_version_id,
      review_type:params.reviewType,scheduled_for:params.scheduledFor,reviewer_id:params.reviewerId,
      outcome:CarePlanReviewOutcome.CONTINUE,goal_reviews:[],created_at:new Date().toISOString()
    };
    await CarePlanReviewService.repository.savePlanReview(review);
    return review;
  }

  public static async executeReview(params:ExecuteReviewParams):Promise<CarePlanReview>{
    const review=await CarePlanReviewService.repository.findPlanReviewById(params.reviewId);
    if(!review) throw new NotFoundError(`CarePlanReview ${params.reviewId} not found.`);
    await CarePlanReviewService.authorize(review.care_plan_id,params.reviewerId);
    const plan=await CarePlanService.getPlan(review.care_plan_id);
    if(!plan) throw new NotFoundError(`CarePlan ${review.care_plan_id} not found.`);

    const now=new Date().toISOString();
    review.started_at=review.started_at||now;review.completed_at=now;review.reviewer_id=params.reviewerId;
    review.outcome=params.outcome;review.goal_reviews=params.goalReviews;review.recommended_changes=params.recommendedChanges;

    if(params.outcome===CarePlanReviewOutcome.MODIFY){
      if(!params.newVersionParams) throw new Error('MODIFY review requires newVersionParams.');
      const next=await CarePlanService.createNewVersion({
        planId:plan.id,authorProfessionalId:params.reviewerId,
        summary:params.newVersionParams.summary,goals:params.newVersionParams.goals,
        interventions:params.newVersionParams.interventions,
        changeRationale:params.newVersionParams.changeRationale||'Care plan review modification',
        reviewFrequencyDays:params.newVersionParams.reviewFrequencyDays,actorId:params.reviewerId
      });
      review.new_version_id=next.id;
    }else if(params.outcome===CarePlanReviewOutcome.COMPLETE){
      await CarePlanService.completePlan(plan.id,params.reviewerId);
    }else if(params.outcome===CarePlanReviewOutcome.PAUSE){
      await CarePlanService.pausePlan(plan.id,'Paused via care plan review',params.reviewerId);
    }else if(params.outcome===CarePlanReviewOutcome.TERMINATE){
      await CarePlanService.terminatePlan(plan.id,'Terminated via care plan review',params.reviewerId);
    }

    await CarePlanReviewService.repository.savePlanReview(review);
    EventBus.enqueue('care.plan_review_completed','care_plans',review.id,DataClassification.RESTRICTED,{
      review_id:review.id,plan_id:review.care_plan_id,outcome:review.outcome,new_version_id:review.new_version_id
    });
    AuditService.record({
      actor_type:'STAFF',actor_id:params.reviewerId,action:'CARE_PLAN.REVIEW_COMPLETED',
      resource_type:'care_plan_review',resource_id:review.id,purpose:'Formal Periodic Plan Reassessment',
      authorization_basis:{planId:review.care_plan_id},result:'ALLOWED',
      metadata:{outcome:review.outcome,newVersionCreated:Boolean(review.new_version_id)}
    });
    return review;
  }

  public static async listReviewsForPlan(planId:string):Promise<CarePlanReview[]>{
    return CarePlanReviewService.repository.findPlanReviewsByPlanId(planId);
  }
}
