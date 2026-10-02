/**
 * MindOS Care Plan Lifecycle Management Service
 * Sprint 22
 */
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { DomainInvariantError, AuthorizationError, NotFoundError } from '../../platform/errors/index.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';
import { CarePlan, CarePlanVersion, CareGoal, CareIntervention } from '../domain/entities.js';
import { CarePlanType, CarePlanState, CarePlanVersionStatus } from '../domain/types.js';
import { ICarePlanRepository } from '../repositories/interfaces.js';
import { CarePlanEligibilityService } from '../application/eligibility_service.js';
import {
  RelationshipAccessEvaluator,
  CareRelationshipService,
  DataDomain,
  ActionPermission
} from '../../care_relationships/index.js';

export interface CreateDraftPlanParams {
  relationshipId: string;
  authorProfessionalId: string;
  planType: CarePlanType;
  summary: string;
  goals?: CareGoal[];
  interventions?: CareIntervention[];
  reviewFrequencyDays?: number;
  requiresUserAcknowledgement?: boolean;
  actorId: string;
}

export interface CreateNewVersionParams {
  planId: string;
  authorProfessionalId: string;
  summary: string;
  goals: CareGoal[];
  interventions: CareIntervention[];
  changeRationale: string;
  reviewFrequencyDays?: number;
  actorId: string;
}

export class CarePlanService {
  private static repository: ICarePlanRepository;

  public static setRepository(repo: ICarePlanRepository): void { CarePlanService.repository = repo; }
  public static getRepository(): ICarePlanRepository { return CarePlanService.repository; }

  private static async assertProfessionalWrite(plan: CarePlan, professionalId: string): Promise<void> {
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId: plan.care_relationship_id,
      professionalId,
      dataDomain: DataDomain.CARE_PLANS,
      action: ActionPermission.WRITE,
      purpose: 'CARE_DELIVERY'
    });
  }

  private static requireReviewFrequency(days?: number): number {
    if (!days || !Number.isFinite(days) || days <= 0) {
      throw new DomainInvariantError(
        'A governed care-plan review frequency is required; MindOS must not invent a clinical review cadence.',
        { errorCode: 'CARE_PLAN_REVIEW_POLICY_REQUIRED' }
      );
    }
    return days;
  }

  public static async createDraftPlan(params: CreateDraftPlanParams): Promise<CarePlan> {
    const eligibility = await CarePlanEligibilityService.evaluate({
      relationshipId: params.relationshipId,
      professionalId: params.authorProfessionalId,
      planType: params.planType
    });
    if (!eligibility.isEligible) {
      throw new DomainInvariantError(
        `Care Plan creation ineligible: ${eligibility.blockers.join(' ')}`,
        { safeUserMessage: 'Care plan cannot be created due to unmet eligibility requirements.' }
      );
    }

    await RelationshipAccessEvaluator.assertAccess({
      relationshipId: params.relationshipId,
      professionalId: params.authorProfessionalId,
      dataDomain: DataDomain.CARE_PLANS,
      action: ActionPermission.WRITE,
      purpose: 'CARE_DELIVERY'
    });

    const relationship = await CareRelationshipService.getRelationship(params.relationshipId);
    if (!relationship) throw new NotFoundError(`CareRelationship ${params.relationshipId} not found.`);

    const reviewFrequencyDays = CarePlanService.requireReviewFrequency(params.reviewFrequencyDays);
    const now = new Date().toISOString();
    const planId = generateUUIDv7();
    const versionId = generateUUIDv7();
    const nextReviewDue = new Date(Date.now() + reviewFrequencyDays * 86400000).toISOString();

    const version: CarePlanVersion = {
      id: versionId,
      care_plan_id: planId,
      version: 1,
      status: CarePlanVersionStatus.DRAFT,
      summary: params.summary,
      goals: params.goals || [],
      interventions: params.interventions || [],
      review_schedule: { frequency_days: reviewFrequencyDays, next_review_due: nextReviewDue },
      effective_from: now,
      authored_by: params.authorProfessionalId,
      created_at: now
    };

    const plan: CarePlan = {
      id: planId,
      subject_user_id: relationship.subject_user_id,
      care_relationship_id: params.relationshipId,
      primary_professional_id: params.authorProfessionalId,
      plan_type: params.planType,
      status: params.requiresUserAcknowledgement ? CarePlanState.PENDING_USER_ACKNOWLEDGEMENT : CarePlanState.DRAFT,
      current_version_id: versionId,
      started_at: now,
      created_at: now,
      updated_at: now,
      version: 1
    };

    // Required for PostgreSQL: care_plans.current_version_id and care_plan_versions.care_plan_id
    // are mutually related, so the repository must create both in one transaction.
    await CarePlanService.repository.createPlanWithInitialVersion(plan, version);

    for (const goal of params.goals || []) {
      goal.care_plan_version_id = versionId;
      await CarePlanService.repository.saveGoal(goal);
    }
    for (const intervention of params.interventions || []) {
      intervention.care_plan_version_id = versionId;
      await CarePlanService.repository.saveIntervention(intervention);
    }

    EventBus.enqueue('care.plan_created','care_plans',plan.id,DataClassification.RESTRICTED,{
      plan_id: plan.id,
      relationship_id: plan.care_relationship_id,
      status: plan.status,
      version: 1
    });
    AuditService.record({
      actor_type:'STAFF', actor_id:params.actorId, action:'CARE_PLAN.DRAFT_CREATED',
      resource_type:'care_plan', resource_id:plan.id, purpose:'Care Plan Formulation',
      authorization_basis:{relationshipId:plan.care_relationship_id}, result:'ALLOWED',
      metadata:{planType:plan.plan_type,version:1,goalsCount:(params.goals||[]).length}
    });
    return plan;
  }

  public static async activatePlan(planId: string, actorId: string): Promise<CarePlan> {
    const plan = await CarePlanService.requirePlan(planId);
    await CarePlanService.assertProfessionalWrite(plan, actorId);
    validateStateTransition('CarePlanState',plan.status,CarePlanState.ACTIVE,plan.id,actorId);

    const version = await CarePlanService.repository.findVersionById(plan.current_version_id);
    if (!version) throw new NotFoundError(`CarePlanVersion ${plan.current_version_id} not found.`);
    const now=new Date().toISOString();
    version.status=CarePlanVersionStatus.ACTIVE;
    version.approved_by=actorId;
    await CarePlanService.repository.saveVersion(version);
    plan.status=CarePlanState.ACTIVE; plan.updated_at=now; plan.version+=1;
    await CarePlanService.repository.savePlan(plan);

    EventBus.enqueue('care.plan_activated','care_plans',plan.id,DataClassification.RESTRICTED,{
      plan_id:plan.id,version_id:version.id,activated_at:now
    });
    AuditService.record({
      actor_type:'STAFF',actor_id:actorId,action:'CARE_PLAN.ACTIVATED',
      resource_type:'care_plan',resource_id:plan.id,purpose:'Care Strategy Activation',
      authorization_basis:{relationshipId:plan.care_relationship_id},result:'ALLOWED',
      metadata:{version:version.version}
    });
    return plan;
  }

  public static async userAcknowledgePlan(planId: string, userId: string): Promise<CarePlan> {
    const plan=await CarePlanService.requirePlan(planId);
    if(plan.subject_user_id!==userId){
      throw new AuthorizationError('Only the data subject user may acknowledge their care plan.',{errorCode:'AUTHZ_003'});
    }
    const version=await CarePlanService.repository.findVersionById(plan.current_version_id);
    if(!version) throw new NotFoundError(`CarePlanVersion ${plan.current_version_id} not found.`);
    const now=new Date().toISOString();
    version.acknowledged_by_user=true; version.acknowledged_at=now;

    if(plan.status===CarePlanState.PENDING_USER_ACKNOWLEDGEMENT){
      validateStateTransition('CarePlanState',plan.status,CarePlanState.ACTIVE,plan.id,userId);
      plan.status=CarePlanState.ACTIVE;
      version.status=CarePlanVersionStatus.ACTIVE;
    }
    await CarePlanService.repository.saveVersion(version);
    plan.updated_at=now; plan.version+=1;
    await CarePlanService.repository.savePlan(plan);

    AuditService.record({
      actor_type:'USER',actor_id:userId,action:'CARE_PLAN.USER_ACKNOWLEDGED',
      resource_type:'care_plan',resource_id:plan.id,purpose:'Patient Treatment Engagement',
      authorization_basis:{planId:plan.id},result:'ALLOWED',metadata:{acknowledgedAt:now}
    });
    return plan;
  }

  public static async createNewVersion(params: CreateNewVersionParams): Promise<CarePlanVersion> {
    const plan=await CarePlanService.requirePlan(params.planId);
    await CarePlanService.assertProfessionalWrite(plan,params.authorProfessionalId);

    const current=await CarePlanService.repository.findVersionById(plan.current_version_id);
    const reviewFrequencyDays=CarePlanService.requireReviewFrequency(
      params.reviewFrequencyDays ?? current?.review_schedule.frequency_days
    );
    const now=new Date().toISOString();
    const id=generateUUIDv7();
    const versionNumber=(current?.version||1)+1;

    if(current?.status===CarePlanVersionStatus.ACTIVE){
      current.status=CarePlanVersionStatus.SUPERSEDED;
      current.effective_until=now;
      await CarePlanService.repository.saveVersion(current);
    }

    const next:CarePlanVersion={
      id,care_plan_id:plan.id,version:versionNumber,status:CarePlanVersionStatus.ACTIVE,
      summary:params.summary,goals:params.goals,interventions:params.interventions,
      review_schedule:{
        frequency_days:reviewFrequencyDays,
        next_review_due:new Date(Date.now()+reviewFrequencyDays*86400000).toISOString()
      },
      effective_from:now,authored_by:params.authorProfessionalId,approved_by:params.actorId,
      supersedes_id:current?.id,created_at:now
    };
    await CarePlanService.repository.saveVersion(next);
    for(const goal of params.goals){goal.care_plan_version_id=id;await CarePlanService.repository.saveGoal(goal);}
    for(const intervention of params.interventions){intervention.care_plan_version_id=id;await CarePlanService.repository.saveIntervention(intervention);}

    plan.current_version_id=id; plan.status=CarePlanState.ACTIVE; plan.updated_at=now; plan.version+=1;
    await CarePlanService.repository.savePlan(plan);

    EventBus.enqueue('care.plan_updated','care_plans',plan.id,DataClassification.RESTRICTED,{
      plan_id:plan.id,new_version_id:id,new_version_number:versionNumber,superseded_version_id:current?.id
    });
    AuditService.record({
      actor_type:'STAFF',actor_id:params.actorId,action:'CARE_PLAN.NEW_VERSION_CREATED',
      resource_type:'care_plan',resource_id:plan.id,purpose:'Care Plan Clinical Revision',
      authorization_basis:{relationshipId:plan.care_relationship_id},result:'ALLOWED',
      metadata:{newVersion:versionNumber,rationale:params.changeRationale}
    });
    return next;
  }

  public static async pausePlan(planId:string,reason:string,actorId:string):Promise<CarePlan>{
    const plan=await CarePlanService.requirePlan(planId);
    await CarePlanService.assertProfessionalWrite(plan,actorId);
    validateStateTransition('CarePlanState',plan.status,CarePlanState.PAUSED,plan.id,actorId);
    plan.status=CarePlanState.PAUSED;plan.updated_at=new Date().toISOString();plan.version+=1;
    await CarePlanService.repository.savePlan(plan);
    EventBus.enqueue('care.plan_paused','care_plans',plan.id,DataClassification.RESTRICTED,{plan_id:plan.id,reason});
    return plan;
  }

  public static async completePlan(planId:string,actorId:string):Promise<CarePlan>{
    const plan=await CarePlanService.requirePlan(planId);
    await CarePlanService.assertProfessionalWrite(plan,actorId);
    validateStateTransition('CarePlanState',plan.status,CarePlanState.COMPLETED,plan.id,actorId);
    const now=new Date().toISOString();
    plan.status=CarePlanState.COMPLETED;plan.completed_at=now;plan.updated_at=now;plan.version+=1;
    await CarePlanService.repository.savePlan(plan);
    EventBus.enqueue('care.plan_completed','care_plans',plan.id,DataClassification.RESTRICTED,{plan_id:plan.id,completed_at:now});
    return plan;
  }

  public static async terminatePlan(planId:string,reason:string,actorId:string):Promise<CarePlan>{
    const plan=await CarePlanService.requirePlan(planId);
    await CarePlanService.assertProfessionalWrite(plan,actorId);
    validateStateTransition('CarePlanState',plan.status,CarePlanState.TERMINATED,plan.id,actorId);
    const now=new Date().toISOString();
    plan.status=CarePlanState.TERMINATED;plan.terminated_at=now;plan.updated_at=now;plan.version+=1;
    await CarePlanService.repository.savePlan(plan);
    EventBus.enqueue('care.plan_terminated','care_plans',plan.id,DataClassification.RESTRICTED,{plan_id:plan.id,reason,terminated_at:now});
    return plan;
  }

  private static async requirePlan(id:string):Promise<CarePlan>{
    const plan=await CarePlanService.repository.findPlanById(id);
    if(!plan) throw new NotFoundError(`CarePlan ${id} not found.`);
    return plan;
  }

  public static async getPlan(id:string):Promise<CarePlan|null>{return CarePlanService.repository.findPlanById(id);}
  public static async getActiveVersion(planId:string):Promise<CarePlanVersion|null>{return CarePlanService.repository.findActiveVersion(planId);}
  public static async listPlansForUser(userId:string,status?:CarePlanState):Promise<CarePlan[]>{return CarePlanService.repository.findPlansByUserId(userId,status);}
  public static async listPlansForProfessional(professionalId:string,status?:CarePlanState):Promise<CarePlan[]>{return CarePlanService.repository.findPlansByProfessionalId(professionalId,status);}
}
