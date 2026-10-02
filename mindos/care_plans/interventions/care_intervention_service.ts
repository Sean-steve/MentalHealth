/**
 * MindOS Care Intervention Service
 */
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { AuditService } from '../../platform/audit/index.js';
import { NotFoundError } from '../../platform/errors/index.js';
import { CareIntervention } from '../domain/entities.js';
import { CareInterventionType } from '../domain/types.js';
import { CarePlanInvariants } from '../domain/invariants.js';
import { ICarePlanRepository } from '../repositories/interfaces.js';

export interface CreateInterventionParams {
  carePlanVersionId:string; interventionType:CareInterventionType;
  referenceType:CareIntervention['reference_type']; referenceId:string; title:string;
  frequency:string; duration?:string; responsibleActorType:CareIntervention['responsible_actor_type'];
  responsibleActorId?:string; clinicalArtifactReference?:string; creatorId:string;
}

export class CareInterventionService {
  private static repository:ICarePlanRepository;
  public static setRepository(repo:ICarePlanRepository):void{CareInterventionService.repository=repo;}

  public static async createIntervention(params:CreateInterventionParams):Promise<CareIntervention>{
    const version=await CareInterventionService.repository.findVersionById(params.carePlanVersionId);
    if(!version) throw new NotFoundError(`CarePlanVersion ${params.carePlanVersionId} not found.`);
    CarePlanInvariants.assertVersionEditable(version);
    const intervention:CareIntervention={
      id:generateUUIDv7(),care_plan_version_id:params.carePlanVersionId,
      intervention_type:params.interventionType,reference_type:params.referenceType,reference_id:params.referenceId,
      title:params.title,frequency:params.frequency,duration:params.duration,
      responsible_actor_type:params.responsibleActorType,responsible_actor_id:params.responsibleActorId,
      status:'ACTIVE',clinical_artifact_reference:params.clinicalArtifactReference,created_at:new Date().toISOString()
    };
    await CareInterventionService.repository.saveIntervention(intervention);
    AuditService.record({
      actor_type:'STAFF',actor_id:params.creatorId,action:'CARE_INTERVENTION.CREATED',
      resource_type:'care_intervention',resource_id:intervention.id,purpose:'Intervention Planning',
      authorization_basis:{versionId:params.carePlanVersionId},result:'ALLOWED',
      metadata:{interventionType:params.interventionType,referenceType:params.referenceType}
    });
    return intervention;
  }
  public static async getInterventionsForVersion(versionId:string):Promise<CareIntervention[]>{
    return CareInterventionService.repository.findInterventionsByVersionId(versionId);
  }
}
