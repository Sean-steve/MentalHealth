/**
 * MindOS Care Goal Management Service
 */
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { NotFoundError } from '../../platform/errors/index.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';
import { CareGoal, CareGoalReview } from '../domain/entities.js';
import { CareGoalType, CareGoalStatus, CareGoalProvenance, GoalPriority, GoalTargetType } from '../domain/types.js';
import { CarePlanInvariants } from '../domain/invariants.js';
import { ICarePlanRepository } from '../repositories/interfaces.js';

export interface CreateGoalParams {
  carePlanVersionId:string; goalCode:string; goalType:CareGoalType; title:string;
  descriptionReference:string; priority:GoalPriority; targetType:GoalTargetType;
  targetValue?:string|number; baselineReference?:string|number; provenance:CareGoalProvenance;
  targetDate?:string; creatorId:string; actorRole:string;
}
export interface ReviewGoalParams {
  goalId:string; newStatus:CareGoalStatus; currentValue?:string|number; reviewedBy:string;
  evidenceRefs:string[]; reasonCodes:string[]; notesReference?:string;
}

export class CareGoalService {
  private static repository:ICarePlanRepository;
  public static setRepository(repo:ICarePlanRepository):void{CareGoalService.repository=repo;}

  public static async createGoal(params:CreateGoalParams):Promise<CareGoal>{
    const version=await CareGoalService.repository.findVersionById(params.carePlanVersionId);
    if(!version) throw new NotFoundError(`CarePlanVersion ${params.carePlanVersionId} not found.`);
    CarePlanInvariants.assertVersionEditable(version);
    const now=new Date().toISOString();
    const goal:CareGoal={
      id:generateUUIDv7(),care_plan_version_id:params.carePlanVersionId,goal_code:params.goalCode,
      goal_type:params.goalType,title:params.title,description_reference:params.descriptionReference,
      priority:params.priority,target_type:params.targetType,target_value:params.targetValue,
      baseline_reference:params.baselineReference,status:CareGoalStatus.NOT_STARTED,provenance:params.provenance,
      started_at:now,target_date:params.targetDate,created_by:params.creatorId,created_at:now,updated_at:now
    };
    CarePlanInvariants.assertGoalActivationProvenance(goal,params.actorRole);
    await CareGoalService.repository.saveGoal(goal);
    AuditService.record({
      actor_type:params.actorRole==='USER'?'USER':'STAFF',actor_id:params.creatorId,action:'CARE_GOAL.CREATED',
      resource_type:'care_goal',resource_id:goal.id,purpose:'Goal Setting',
      authorization_basis:{versionId:params.carePlanVersionId},result:'ALLOWED',
      metadata:{goalType:params.goalType,priority:params.priority,provenance:params.provenance}
    });
    return goal;
  }

  public static async reviewGoal(params:ReviewGoalParams):Promise<{goal:CareGoal;review:CareGoalReview}>{
    const goal=await CareGoalService.repository.findGoalById(params.goalId);
    if(!goal) throw new NotFoundError(`CareGoal ${params.goalId} not found.`);
    const previous=goal.status;
    validateStateTransition('CareGoalStatus',previous,params.newStatus,goal.id,params.reviewedBy);
    const now=new Date().toISOString();
    goal.status=params.newStatus;
    if(params.currentValue!==undefined) goal.current_value=params.currentValue;
    if(params.newStatus===CareGoalStatus.ACHIEVED) goal.completed_at=now;
    goal.updated_at=now;
    await CareGoalService.repository.saveGoal(goal);
    const review:CareGoalReview={
      id:generateUUIDv7(),goal_id:goal.id,reviewed_by:params.reviewedBy,reviewed_at:now,
      status_before:previous,status_after:params.newStatus,evidence_refs:params.evidenceRefs,
      reason_codes:params.reasonCodes,notes_reference:params.notesReference
    };
    await CareGoalService.repository.saveGoalReview(review);
    EventBus.enqueue('care.goal_updated','care_plans',goal.id,DataClassification.CLINICAL_RECORD,{
      goal_id:goal.id,previous_status:previous,new_status:params.newStatus
    });
    return {goal,review};
  }

  public static async getGoalsForVersion(versionId:string,status?:CareGoalStatus):Promise<CareGoal[]>{
    return CareGoalService.repository.findGoalsByVersionId(versionId,status);
  }
  public static async getGoalReviews(goalId:string):Promise<CareGoalReview[]>{
    return CareGoalService.repository.findGoalReviews(goalId);
  }
}
