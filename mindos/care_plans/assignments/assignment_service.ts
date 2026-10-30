/**
 * MindOS Content & Assessment Assignment Service
 */
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { UnitOfWork } from '../../platform/database/index.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { CorrelationManager } from '../../platform/shared/correlation.js';
import { AuthorizationError, NotFoundError, DomainInvariantError } from '../../platform/errors/index.js';
import { RelationshipAccessEvaluator, DataDomain, ActionPermission } from '../../care_relationships/index.js';
import { ContentAssignment, AssessmentAssignment } from '../domain/entities.js';
import { ICarePlanRepository } from '../repositories/interfaces.js';
import { CarePlanService } from '../plans/care_plan_service.js';
import { CarePlanInvariants } from '../domain/invariants.js';
import { ContentApplicationService } from '../../content/index.js';
import { AssessmentRegistry } from '../../assessments/index.js';

export interface AssignContentParams {
  planId:string; interventionId?:string; contentId:string; contentVersion:number; assignedBy:string; dueDate?:string;
}
export interface AssignAssessmentParams {
  planId:string; interventionId?:string; instrumentType:string; instrumentVersion?:number;
  assignmentPurpose:string; dueWindow:{startDate:string;endDate:string}; assignedBy:string;
}

export class AssignmentService {
  private static repository:ICarePlanRepository;
  public static setRepository(repo:ICarePlanRepository):void{AssignmentService.repository=repo;}

  private static async persistAssignmentWithEvent(params:{
    assignment:ContentAssignment|AssessmentAssignment;
    assignmentType:'CONTENT'|'ASSESSMENT';
    eventPayload:Record<string,unknown>;
  }):Promise<void>{
    const persist=async(tx?:import('../../platform/database/index.js').DatabaseClient)=>{
      if(params.assignmentType==='CONTENT'){
        await AssignmentService.repository.saveContentAssignmentTransactional(
          params.assignment as ContentAssignment,
          tx
        );
      }else{
        await AssignmentService.repository.saveAssessmentAssignmentTransactional(
          params.assignment as AssessmentAssignment,
          tx
        );
      }
    };

    if(AssignmentService.repository.requiresUnitOfWork()){
      await UnitOfWork.run(async uow=>{
        await persist(uow.getClient());
        uow.registerOutboxEvent(
          'care.assignment_created',
          'care_plans',
          params.assignment.id,
          params.eventPayload,
          {
            correlation_id:CorrelationManager.getCorrelationId(),
            data_classification:DataClassification.CLINICAL_RECORD,
            producer_domain:'care_plans'
          }
        );
      },'SERIALIZABLE');
      return;
    }

    await persist();
    EventBus.enqueue(
      'care.assignment_created',
      'care_plans',
      params.assignment.id,
      DataClassification.CLINICAL_RECORD,
      params.eventPayload
    );
  }

  private static async assertAssignmentContext(params:{
    planId:string;
    assignedBy:string;
    interventionId?:string;
  }):Promise<NonNullable<Awaited<ReturnType<typeof CarePlanService.getPlan>>>>{
    const plan=await CarePlanService.getPlan(params.planId);
    if(!plan) throw new NotFoundError(`CarePlan ${params.planId} not found.`);

    await RelationshipAccessEvaluator.assertAccess({
      relationshipId:plan.care_relationship_id,
      professionalId:params.assignedBy,
      dataDomain:DataDomain.CARE_PLANS,
      action:ActionPermission.WRITE,
      purpose:'CARE_DELIVERY'
    });

    CarePlanInvariants.assertPlanActive(plan,'care assignment');

    if(params.interventionId){
      const intervention=await AssignmentService.repository.findInterventionById(params.interventionId);
      if(!intervention) throw new NotFoundError(`CareIntervention ${params.interventionId} not found.`);
      if(intervention.care_plan_version_id!==plan.current_version_id){
        throw new AuthorizationError(
          'Care assignment intervention does not belong to the current Care Plan version.',
          {errorCode:'AUTHZ_003'}
        );
      }
    }

    return plan;
  }

  public static async assignContent(params:AssignContentParams):Promise<ContentAssignment>{
    const plan=await AssignmentService.assertAssignmentContext({
      planId:params.planId,
      assignedBy:params.assignedBy,
      interventionId:params.interventionId
    });
    if(!Number.isInteger(params.contentVersion)||params.contentVersion<1){
      throw new DomainInvariantError('Content assignment requires a positive governed content version.');
    }
    if(params.dueDate!==undefined&&Number.isNaN(Date.parse(params.dueDate))){
      throw new DomainInvariantError('Content assignment due date must be a valid ISO date-time.');
    }

    const content=ContentApplicationService.getContentDetail(params.contentId);
    if(!content?.version) throw new DomainInvariantError(`Content ${params.contentId} has no active governed version.`);
    const activeVersion=Number((content.version as any).version ?? (content.version as any).version_number);
    if(Number.isFinite(activeVersion)&&activeVersion!==params.contentVersion){
      throw new DomainInvariantError(`Requested content version ${params.contentVersion} is not the active governed version ${activeVersion}.`);
    }

    const assignment:ContentAssignment={
      id:generateUUIDv7(),care_plan_id:plan.id,care_plan_version_id:plan.current_version_id,
      intervention_id:params.interventionId,subject_user_id:plan.subject_user_id,assigned_by:params.assignedBy,
      content_id:params.contentId,content_version:params.contentVersion,status:'ASSIGNED',
      due_date:params.dueDate,created_at:new Date().toISOString()
    };
    await AssignmentService.persistAssignmentWithEvent({
      assignment,
      assignmentType:'CONTENT',
      eventPayload:{
        assignment_id:assignment.id,
        plan_id:plan.id,
        assignment_type:'CONTENT',
        resource_id:params.contentId
      }
    });
    AuditService.record({
      actor_type:'STAFF',actor_id:params.assignedBy,action:'CARE_ASSIGNMENT.CONTENT_ASSIGNED',
      resource_type:'content_assignment',resource_id:assignment.id,purpose:'Psychoeducational Content Assignment',
      authorization_basis:{planId:plan.id},result:'ALLOWED',
      metadata:{contentId:params.contentId,contentVersion:params.contentVersion}
    });
    return assignment;
  }

  public static async assignAssessment(params:AssignAssessmentParams):Promise<AssessmentAssignment>{
    const plan=await AssignmentService.assertAssignmentContext({
      planId:params.planId,
      assignedBy:params.assignedBy,
      interventionId:params.interventionId
    });

    if(Number.isNaN(Date.parse(params.dueWindow.startDate))||
       Number.isNaN(Date.parse(params.dueWindow.endDate))){
      throw new DomainInvariantError('Assessment assignment due-window dates must be valid ISO date-times.');
    }

    const definition=AssessmentRegistry.getDefinition(params.instrumentType);
    const active=AssessmentRegistry.getActiveVersion(definition.id);
    if(params.instrumentVersion!==undefined){
      const requested=String(params.instrumentVersion);
      const canonical=String((active as any).version ?? (active as any).version_number ?? active.id);
      if(requested!==canonical&&requested!==active.id){
        throw new DomainInvariantError(`Requested assessment version ${requested} is not the active governed version for ${params.instrumentType}.`);
      }
    }

    if(Date.parse(params.dueWindow.startDate)>Date.parse(params.dueWindow.endDate)){
      throw new DomainInvariantError('Assessment assignment due-window start must be before end.');
    }

    const assignment:AssessmentAssignment={
      id:generateUUIDv7(),care_plan_id:plan.id,care_plan_version_id:plan.current_version_id,
      intervention_id:params.interventionId,subject_user_id:plan.subject_user_id,assigned_by:params.assignedBy,
      instrument_type:params.instrumentType,instrument_version:params.instrumentVersion,
      assignment_purpose:params.assignmentPurpose,
      due_window:{start_date:params.dueWindow.startDate,end_date:params.dueWindow.endDate},
      status:'PENDING',created_at:new Date().toISOString()
    };
    await AssignmentService.persistAssignmentWithEvent({
      assignment,
      assignmentType:'ASSESSMENT',
      eventPayload:{
        assignment_id:assignment.id,
        plan_id:plan.id,
        assignment_type:'ASSESSMENT',
        instrument_type:params.instrumentType
      }
    });
    AuditService.record({
      actor_type:'STAFF',actor_id:params.assignedBy,action:'CARE_ASSIGNMENT.ASSESSMENT_ASSIGNED',
      resource_type:'assessment_assignment',resource_id:assignment.id,purpose:params.assignmentPurpose,
      authorization_basis:{planId:plan.id},result:'ALLOWED',
      metadata:{instrumentType:params.instrumentType}
    });
    return assignment;
  }

  public static async listAssignmentsForPlan(planId:string):Promise<{content:ContentAssignment[];assessments:AssessmentAssignment[]}>{
    return {
      content:await AssignmentService.repository.findContentAssignmentsByPlanId(planId),
      assessments:await AssignmentService.repository.findAssessmentAssignmentsByPlanId(planId)
    };
  }
}
