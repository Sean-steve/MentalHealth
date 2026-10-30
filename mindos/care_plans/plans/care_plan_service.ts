/**
 * MindOS Care Plan Lifecycle Management Service
 * Sprint 22
 */
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { UnitOfWork } from '../../platform/database/index.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { CorrelationManager } from '../../platform/shared/correlation.js';
import { DomainInvariantError, AuthorizationError, NotFoundError } from '../../platform/errors/index.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';
import { CarePlan, CarePlanVersion, CareGoal, CareIntervention } from '../domain/entities.js';
import { CarePlanType, CarePlanState, CarePlanVersionStatus } from '../domain/types.js';
import { ICarePlanRepository } from '../repositories/interfaces.js';
import { CarePlanEligibilityService } from '../application/eligibility_service.js';
import { CarePlanInvariants } from '../domain/invariants.js';
import {
  RelationshipAccessEvaluator,
  CareRelationshipService,
  CareRelationshipState,
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

    const goals = params.goals || [];
    const interventions = params.interventions || [];
    for (const goal of goals) goal.care_plan_version_id = versionId;
    for (const intervention of interventions) {
      intervention.care_plan_version_id = versionId;
    }

    const createdEventPayload = {
      plan_id: plan.id,
      relationship_id: plan.care_relationship_id,
      status: plan.status,
      version: 1
    };

    if (CarePlanService.repository.requiresUnitOfWork()) {
      await UnitOfWork.run(async uow => {
        await CarePlanService.repository.createPlanAggregate(
          plan,
          version,
          goals,
          interventions,
          uow.getClient()
        );
        uow.registerOutboxEvent(
          'care.plan_created',
          'care_plans',
          plan.id,
          createdEventPayload,
          {
            correlation_id: CorrelationManager.getCorrelationId(),
            data_classification: DataClassification.CLINICAL_RECORD,
            producer_domain: 'care_plans'
          }
        );
      });
    } else {
      await CarePlanService.repository.createPlanAggregate(
        plan,
        version,
        goals,
        interventions
      );
      EventBus.enqueue(
        'care.plan_created',
        'care_plans',
        plan.id,
        DataClassification.CLINICAL_RECORD,
        createdEventPayload
      );
    }
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

    const version = await CarePlanService.repository.findVersionById(plan.current_version_id);
    if (!version) throw new NotFoundError(`CarePlanVersion ${plan.current_version_id} not found.`);
    if (
      plan.status === CarePlanState.PENDING_USER_ACKNOWLEDGEMENT &&
      !version.acknowledged_by_user
    ) {
      throw new DomainInvariantError(
        'Care Plan requires subject-user acknowledgement before activation.'
      );
    }
    validateStateTransition('CarePlanState',plan.status,CarePlanState.ACTIVE,plan.id,actorId);
    const now=new Date().toISOString();
    version.status=CarePlanVersionStatus.ACTIVE;
    version.approved_by=actorId;
    await CarePlanService.repository.saveVersion(version);
    plan.status=CarePlanState.ACTIVE; plan.updated_at=now; plan.version+=1;
    await CarePlanService.repository.savePlan(plan);

    EventBus.enqueue('care.plan_activated','care_plans',plan.id,DataClassification.CLINICAL_RECORD,{
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
    if([
      CarePlanState.COMPLETED,
      CarePlanState.TERMINATED,
      CarePlanState.SUPERSEDED,
      CarePlanState.REVOKED
    ].includes(plan.status)){
      throw new DomainInvariantError(
        `Care Plan ${plan.id} in ${plan.status} state cannot be newly acknowledged.`
      );
    }
    const relationship=await CareRelationshipService.getRelationship(plan.care_relationship_id);
    if(!relationship) throw new NotFoundError(`CareRelationship ${plan.care_relationship_id} not found.`);
    CarePlanInvariants.assertRelationshipEligible(relationship);

    const version=await CarePlanService.repository.findVersionById(plan.current_version_id);
    if(!version) throw new NotFoundError(`CarePlanVersion ${plan.current_version_id} not found.`);
    if(version.acknowledged_by_user) return plan;

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

    if(![CarePlanState.ACTIVE,CarePlanState.UNDER_REVIEW].includes(plan.status)){
      throw new DomainInvariantError(
        `Care Plan ${plan.id} in ${plan.status} state cannot create a replacement active version.`
      );
    }

    const current=await CarePlanService.repository.findVersionById(plan.current_version_id);
    if(!current) throw new NotFoundError(`CarePlanVersion ${plan.current_version_id} not found.`);
    if(current.status!==CarePlanVersionStatus.ACTIVE){
      throw new DomainInvariantError(
        `Current Care Plan version ${current.id} is ${current.status}; ACTIVE version required for revision.`
      );
    }
    const reviewFrequencyDays=CarePlanService.requireReviewFrequency(
      params.reviewFrequencyDays ?? current.review_schedule.frequency_days
    );
    const now=new Date().toISOString();
    const id=generateUUIDv7();
    const versionNumber=(current?.version||1)+1;

    const expectedPlanVersion = plan.version;
    current.status=CarePlanVersionStatus.SUPERSEDED;
    current.effective_until=now;

    const next:CarePlanVersion={
      id,care_plan_id:plan.id,version:versionNumber,status:CarePlanVersionStatus.ACTIVE,
      summary:params.summary,goals:params.goals,interventions:params.interventions,
      review_schedule:{
        frequency_days:reviewFrequencyDays,
        next_review_due:new Date(Date.now()+reviewFrequencyDays*86400000).toISOString()
      },
      effective_from:now,authored_by:params.authorProfessionalId,approved_by:params.actorId,
      supersedes_id:current.id,created_at:now
    };

    for(const goal of params.goals) goal.care_plan_version_id=id;
    for(const intervention of params.interventions) {
      intervention.care_plan_version_id=id;
    }

    plan.current_version_id=id;
    if(plan.status!==CarePlanState.ACTIVE){
      validateStateTransition('CarePlanState',plan.status,CarePlanState.ACTIVE,plan.id,params.actorId);
      plan.status=CarePlanState.ACTIVE;
    }
    plan.updated_at=now;
    plan.version=expectedPlanVersion+1;

    const updatedEventPayload = {
      plan_id:plan.id,
      new_version_id:id,
      new_version_number:versionNumber,
      superseded_version_id:current.id
    };

    if(CarePlanService.repository.requiresUnitOfWork()){
      await UnitOfWork.run(async uow=>{
        await CarePlanService.repository.replaceActiveVersionAggregate(
          {
            plan,
            current_version:current,
            next_version:next,
            goals:params.goals,
            interventions:params.interventions,
            expected_plan_version:expectedPlanVersion
          },
          uow.getClient()
        );
        uow.registerOutboxEvent(
          'care.plan_updated',
          'care_plans',
          plan.id,
          updatedEventPayload,
          {
            correlation_id:CorrelationManager.getCorrelationId(),
            data_classification:DataClassification.CLINICAL_RECORD,
            producer_domain:'care_plans'
          }
        );
      },'SERIALIZABLE');
    }else{
      await CarePlanService.repository.replaceActiveVersionAggregate({
        plan,
        current_version:current,
        next_version:next,
        goals:params.goals,
        interventions:params.interventions,
        expected_plan_version:expectedPlanVersion
      });
      EventBus.enqueue(
        'care.plan_updated',
        'care_plans',
        plan.id,
        DataClassification.CLINICAL_RECORD,
        updatedEventPayload
      );
    }
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
    EventBus.enqueue('care.plan_paused','care_plans',plan.id,DataClassification.CLINICAL_RECORD,{plan_id:plan.id,reason});
    AuditService.record({
      actor_type:'STAFF',actor_id:actorId,action:'CARE_PLAN.PAUSED',
      resource_type:'care_plan',resource_id:plan.id,purpose:'Care Plan Lifecycle',
      authorization_basis:{relationshipId:plan.care_relationship_id},result:'ALLOWED',
      metadata:{reason}
    });
    return plan;
  }

  public static async completePlan(planId:string,actorId:string):Promise<CarePlan>{
    const plan=await CarePlanService.requirePlan(planId);
    await CarePlanService.assertProfessionalWrite(plan,actorId);
    validateStateTransition('CarePlanState',plan.status,CarePlanState.COMPLETED,plan.id,actorId);
    const now=new Date().toISOString();
    plan.status=CarePlanState.COMPLETED;plan.completed_at=now;plan.updated_at=now;plan.version+=1;
    await CarePlanService.repository.savePlan(plan);
    EventBus.enqueue('care.plan_completed','care_plans',plan.id,DataClassification.CLINICAL_RECORD,{plan_id:plan.id,completed_at:now});
    AuditService.record({
      actor_type:'STAFF',actor_id:actorId,action:'CARE_PLAN.COMPLETED',
      resource_type:'care_plan',resource_id:plan.id,purpose:'Care Plan Lifecycle',
      authorization_basis:{relationshipId:plan.care_relationship_id},result:'ALLOWED',
      metadata:{completedAt:now}
    });
    return plan;
  }

  public static async terminatePlan(planId:string,reason:string,actorId:string):Promise<CarePlan>{
    const plan=await CarePlanService.requirePlan(planId);
    await CarePlanService.assertProfessionalWrite(plan,actorId);
    validateStateTransition('CarePlanState',plan.status,CarePlanState.TERMINATED,plan.id,actorId);
    const now=new Date().toISOString();
    plan.status=CarePlanState.TERMINATED;plan.terminated_at=now;plan.updated_at=now;plan.version+=1;
    await CarePlanService.repository.savePlan(plan);
    EventBus.enqueue('care.plan_terminated','care_plans',plan.id,DataClassification.CLINICAL_RECORD,{plan_id:plan.id,reason,terminated_at:now});
    AuditService.record({
      actor_type:'STAFF',actor_id:actorId,action:'CARE_PLAN.TERMINATED',
      resource_type:'care_plan',resource_id:plan.id,purpose:'Care Plan Lifecycle',
      authorization_basis:{relationshipId:plan.care_relationship_id},result:'ALLOWED',
      metadata:{reason,terminatedAt:now}
    });
    return plan;
  }

  public static async reconcileRelationshipClosure(
    relationshipId: string
  ): Promise<{ plan_id?: string; action: 'NONE' | 'TERMINATED' | 'REVOKED' }> {
    const relationship = await CareRelationshipService.getRelationship(relationshipId);
    if (!relationship ||
        ![CareRelationshipState.TERMINATED, CareRelationshipState.REVOKED].includes(relationship.status)) {
      return { action: 'NONE' };
    }

    const plan = await CarePlanService.repository.findPlanByRelationshipId(relationshipId);
    if (!plan ||
        [CarePlanState.COMPLETED, CarePlanState.TERMINATED, CarePlanState.REVOKED, CarePlanState.SUPERSEDED].includes(plan.status)) {
      return { plan_id: plan?.id, action: 'NONE' };
    }

    const shouldRevoke =
      relationship.status === CareRelationshipState.REVOKED ||
      [CarePlanState.DRAFT, CarePlanState.REVIEW_REQUIRED, CarePlanState.PENDING_USER_ACKNOWLEDGEMENT].includes(plan.status);
    const target = shouldRevoke ? CarePlanState.REVOKED : CarePlanState.TERMINATED;

    validateStateTransition('CarePlanState', plan.status, target, plan.id, 'system');
    const now = new Date().toISOString();
    plan.status = target;
    plan.updated_at = now;
    plan.version += 1;
    if (target === CarePlanState.TERMINATED) plan.terminated_at = now;
    await CarePlanService.repository.savePlan(plan);

    EventBus.enqueue(
      target === CarePlanState.TERMINATED ? 'care.plan_terminated' : 'care.plan_updated',
      'care_plans',
      plan.id,
      DataClassification.CLINICAL_RECORD,
      {
        plan_id: plan.id,
        relationship_id: relationshipId,
        status: target,
        reason: 'CARE_RELATIONSHIP_ENDED'
      }
    );
    AuditService.record({
      actor_type: 'SYSTEM',
      actor_id: 'sprint22-reconciliation',
      action: 'CARE_PLAN.RECONCILED_RELATIONSHIP_CLOSURE',
      resource_type: 'care_plan',
      resource_id: plan.id,
      purpose: 'Care Relationship Closure',
      authorization_basis: { relationshipId },
      result: 'ALLOWED',
      metadata: { targetStatus: target }
    });

    return {
      plan_id: plan.id,
      action: target === CarePlanState.TERMINATED ? 'TERMINATED' : 'REVOKED'
    };
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
