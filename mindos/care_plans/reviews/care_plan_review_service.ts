/**
 * MindOS Care Plan Review Service
 */
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { UnitOfWork } from '../../platform/database/index.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { CorrelationManager } from '../../platform/shared/correlation.js';
import { AuthorizationError, DomainInvariantError, NotFoundError } from '../../platform/errors/index.js';
import {
  RelationshipAccessEvaluator, DataDomain, ActionPermission
} from '../../care_relationships/index.js';
import { CarePlanReview, CareGoalReview } from '../domain/entities.js';
import { CarePlanReviewType, CarePlanReviewOutcome, CarePlanState } from '../domain/types.js';
import { ICarePlanRepository } from '../repositories/interfaces.js';
import { CarePlanService, CreateNewVersionParams } from '../plans/care_plan_service.js';

export interface ScheduleReviewParams {
  planId:string; reviewType:CarePlanReviewType; scheduledFor:string; reviewerId:string;
}
export interface ExecuteReviewParams {
  reviewId:string; outcome:CarePlanReviewOutcome; goalReviews:CareGoalReview[];
  recommendedChanges?:string[];
  newVersionParams?:Omit<CreateNewVersionParams,'planId'|'authorProfessionalId'|'actorId'|'versionId'>;
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

  private static async persistCompletedReview(review:CarePlanReview):Promise<boolean>{
    const eventPayload={
      review_id:review.id,
      plan_id:review.care_plan_id,
      outcome:review.outcome,
      new_version_id:review.new_version_id
    };

    if(CarePlanReviewService.repository.requiresUnitOfWork()){
      let finalized=false;
      await UnitOfWork.run(async uow=>{
        finalized=await CarePlanReviewService.repository.completePlanReviewTransactional(
          review,
          uow.getClient()
        );
        if(finalized){
          uow.registerOutboxEvent(
            'care.plan_review_completed',
            'care_plans',
            review.id,
            eventPayload,
            {
              correlation_id:CorrelationManager.getCorrelationId(),
              data_classification:DataClassification.CLINICAL_RECORD,
              producer_domain:'care_plans'
            }
          );
        }
      },'SERIALIZABLE');
      return finalized;
    }

    const finalized=await CarePlanReviewService.repository.completePlanReviewTransactional(review);
    if(finalized){
      EventBus.enqueue(
        'care.plan_review_completed',
        'care_plans',
        review.id,
        DataClassification.CLINICAL_RECORD,
        eventPayload
      );
    }
    return finalized;
  }

  public static async executeReview(params:ExecuteReviewParams):Promise<CarePlanReview>{
    let review=await CarePlanReviewService.repository.findPlanReviewById(params.reviewId);
    if(!review) throw new NotFoundError(`CarePlanReview ${params.reviewId} not found.`);
    await CarePlanReviewService.authorize(review.care_plan_id,params.reviewerId);
    if(review.completed_at) return review;

    let plan=await CarePlanService.getPlan(review.care_plan_id);
    if(!plan) throw new NotFoundError(`CarePlan ${review.care_plan_id} not found.`);

    const alreadyStarted=Boolean(review.started_at);
    if(alreadyStarted){
      if(review.reviewer_id!==params.reviewerId){
        throw new AuthorizationError(
          'A started Care Plan review may only be resumed by its assigned reviewer.',
          {errorCode:'AUTHZ_003'}
        );
      }
      if(review.outcome!==params.outcome){
        throw new DomainInvariantError(
          'A started Care Plan review cannot be retried with a different outcome.'
        );
      }
    }else{
      if(plan.current_version_id!==review.care_plan_version_id){
        throw new DomainInvariantError(
          'Care Plan review is stale because the current plan version has changed.'
        );
      }

      for(const goalReview of params.goalReviews){
        const goal=await CarePlanReviewService.repository.findGoalById(goalReview.goal_id);
        if(!goal) throw new NotFoundError(`CareGoal ${goalReview.goal_id} not found.`);
        if(goal.care_plan_version_id!==review.care_plan_version_id){
          throw new AuthorizationError(
            'Care Goal review does not belong to the Care Plan version under review.',
            {errorCode:'AUTHZ_003'}
          );
        }
        if(goalReview.reviewed_by!==params.reviewerId){
          throw new AuthorizationError(
            'Care Goal review author does not match the authorized Care Plan reviewer.',
            {errorCode:'AUTHZ_003'}
          );
        }
      }

      if(params.outcome===CarePlanReviewOutcome.MODIFY&&!params.newVersionParams){
        throw new DomainInvariantError('MODIFY review requires newVersionParams.');
      }

      review.started_at=new Date().toISOString();
      review.reviewer_id=params.reviewerId;
      review.outcome=params.outcome;
      review.goal_reviews=params.goalReviews;
      review.recommended_changes=params.recommendedChanges;
      if(params.outcome===CarePlanReviewOutcome.MODIFY){
        review.new_version_id=generateUUIDv7();
      }

      // Atomically claim the review intent before any plan mutation. This makes
      // reviewer/outcome selection deterministic under concurrent execution.
      const began=await CarePlanReviewService.repository.beginPlanReviewExecution(review);
      if(!began){
        const claimed=await CarePlanReviewService.repository.findPlanReviewById(review.id);
        if(!claimed) throw new NotFoundError(`CarePlanReview ${review.id} not found after concurrent start.`);
        if(claimed.completed_at) return claimed;
        if(claimed.reviewer_id!==params.reviewerId){
          throw new AuthorizationError(
            'Care Plan review was concurrently started by another reviewer.',
            {errorCode:'AUTHZ_003'}
          );
        }
        if(claimed.outcome!==params.outcome){
          throw new DomainInvariantError(
            'Care Plan review was concurrently started with a different outcome.'
          );
        }
        review=claimed;
      }
    }

    plan=await CarePlanService.getPlan(review.care_plan_id);
    if(!plan) throw new NotFoundError(`CarePlan ${review.care_plan_id} not found.`);

    if(review.outcome===CarePlanReviewOutcome.MODIFY){
      if(!review.new_version_id){
        throw new DomainInvariantError('Started MODIFY review is missing its preallocated Care Plan version ID.');
      }

      if(plan.current_version_id!==review.new_version_id){
        if(plan.current_version_id!==review.care_plan_version_id){
          throw new DomainInvariantError(
            'Care Plan review cannot resume because the plan changed outside this review.'
          );
        }
        if(!params.newVersionParams){
          throw new DomainInvariantError(
            'Resuming an unapplied MODIFY review requires the original newVersionParams.'
          );
        }
        await CarePlanService.createNewVersion({
          planId:plan.id,
          versionId:review.new_version_id,
          authorProfessionalId:params.reviewerId,
          summary:params.newVersionParams.summary,
          goals:params.newVersionParams.goals,
          interventions:params.newVersionParams.interventions,
          changeRationale:params.newVersionParams.changeRationale||'Care plan review modification',
          reviewFrequencyDays:params.newVersionParams.reviewFrequencyDays,
          actorId:params.reviewerId
        });
      }
    }else if(review.outcome===CarePlanReviewOutcome.COMPLETE){
      if(plan.status!==CarePlanState.COMPLETED){
        if(plan.current_version_id!==review.care_plan_version_id){
          throw new DomainInvariantError('Care Plan review is stale before completion action.');
        }
        await CarePlanService.completePlan(plan.id,params.reviewerId);
      }
    }else if(review.outcome===CarePlanReviewOutcome.PAUSE){
      if(plan.status!==CarePlanState.PAUSED){
        if(plan.current_version_id!==review.care_plan_version_id){
          throw new DomainInvariantError('Care Plan review is stale before pause action.');
        }
        await CarePlanService.pausePlan(plan.id,'Paused via care plan review',params.reviewerId);
      }
    }else if(review.outcome===CarePlanReviewOutcome.TERMINATE){
      if(plan.status!==CarePlanState.TERMINATED){
        if(plan.current_version_id!==review.care_plan_version_id){
          throw new DomainInvariantError('Care Plan review is stale before termination action.');
        }
        await CarePlanService.terminatePlan(plan.id,'Terminated via care plan review',params.reviewerId);
      }
    }else if(plan.current_version_id!==review.care_plan_version_id){
      throw new DomainInvariantError(
        'Care Plan review is stale because the current plan version has changed.'
      );
    }

    review.completed_at=new Date().toISOString();
    const finalized=await CarePlanReviewService.persistCompletedReview(review);
    if(!finalized){
      const completed=await CarePlanReviewService.repository.findPlanReviewById(review.id);
      if(completed?.completed_at) return completed;
      throw new DomainInvariantError(
        'Care Plan review completion lost its compare-and-set race without a completed record.'
      );
    }

    AuditService.record({
      actor_type:'STAFF',actor_id:params.reviewerId,action:'CARE_PLAN.REVIEW_COMPLETED',
      resource_type:'care_plan_review',resource_id:review.id,purpose:'Formal Periodic Plan Reassessment',
      authorization_basis:{planId:review.care_plan_id},result:'ALLOWED',
      metadata:{outcome:review.outcome,newVersionCreated:Boolean(review.new_version_id)}
    });
    return review;
  }

  public static async getReview(reviewId:string):Promise<CarePlanReview|null>{
    return CarePlanReviewService.repository.findPlanReviewById(reviewId);
  }

  public static async listReviewsForPlan(planId:string):Promise<CarePlanReview[]>{
    return CarePlanReviewService.repository.findPlanReviewsByPlanId(planId);
  }
}
