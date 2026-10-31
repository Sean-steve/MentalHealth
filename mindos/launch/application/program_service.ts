import { AuthorizationError,DomainInvariantError,NotFoundError } from '../../platform/errors/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { AuditService } from '../../platform/audit/index.js';
import { ReleaseAssuranceService } from '../../validation/index.js';
import { LaunchProgram,LaunchScope } from '../domain/types.js';
import { LaunchRepository } from '../repositories/index.js';

export class LaunchProgramService{
  static async create(input:{
    code:string;release_id:string;version:string;build_sha:string;owner_id:string;feature_keys:string[];
    scope:LaunchScope;beta_max_participants:number;limited_launch_max_participants:number;
    required_external_authorities?:string[];regulatory_scope_evidence_ref:string;
  }):Promise<LaunchProgram>{
    if(!input.code||!input.release_id||!input.version||!input.build_sha||!input.owner_id)throw new DomainInvariantError('Launch program identity, exact build SHA and owner are required.');
    if(!input.regulatory_scope_evidence_ref)throw new DomainInvariantError('Kenya launch scope requires an attributable regulatory applicability evidence reference.');
    if(!Number.isInteger(input.beta_max_participants)||input.beta_max_participants<=0)throw new DomainInvariantError('Controlled beta requires an explicit positive participant limit.');
    if(!Number.isInteger(input.limited_launch_max_participants)||input.limited_launch_max_participants<input.beta_max_participants)throw new DomainInvariantError('Limited-launch participant limit must be explicit and cannot be smaller than the beta limit.');
    if(!input.feature_keys.length)throw new DomainInvariantError('Launch scope must name at least one feature/capability key.');
    const existing=await LaunchRepository.getProgram(input.code);
    if(existing)throw new DomainInvariantError('Launch program code already exists.');
    const now=new Date().toISOString();
    const program:LaunchProgram={
      id:generateUUIDv7(),code:input.code,release_id:input.release_id,version:input.version,build_sha:input.build_sha,
      jurisdiction:'KE',state:'DRAFT',owner_id:input.owner_id,feature_keys:[...new Set(input.feature_keys)],
      scope:input.scope,beta_max_participants:input.beta_max_participants,limited_launch_max_participants:input.limited_launch_max_participants,
      required_external_authorities:[...new Set((input.required_external_authorities||[]).map(x=>x.toUpperCase()))],
      regulatory_scope_evidence_ref:input.regulatory_scope_evidence_ref,created_at:now,updated_at:now
    };
    await LaunchRepository.saveProgram(program);
    AuditService.record({
      actor_type:'STAFF',actor_id:input.owner_id,action:'LAUNCH.PROGRAM_CREATED',resource_type:'launch_program',
      resource_id:program.id,purpose:'Controlled Beta / Kenya Launch Planning',
      authorization_basis:{release_id:program.release_id,build_sha:program.build_sha,jurisdiction:'KE'},result:'ALLOWED',
      metadata:{code:program.code,beta_limit:program.beta_max_participants,limited_launch_limit:program.limited_launch_max_participants}
    });
    return program;
  }

  static async lockReleaseCandidate(programId:string,actor:{id:string;role:string}):Promise<LaunchProgram>{
    if(!['RELEASE_MANAGER','RELEASE_AUTHORITY'].includes(actor.role.toUpperCase()))throw new AuthorizationError('Release candidate lock requires release-management authority.',{errorCode:'AUTHZ_002'});
    const p=await LaunchRepository.getProgram(programId);
    if(!p)throw new NotFoundError('Launch program not found.');
    if(p.state!=='DRAFT')throw new DomainInvariantError('Release candidate can only be locked from DRAFT.');
    const assurance=await ReleaseAssuranceService.productionAuthorizationStatus(p.release_id,p.build_sha);
    if(!assurance.authorized)throw new DomainInvariantError(`RELEASE_CANDIDATE_NOT_CERTIFIED: ${assurance.reasons.join(',')}`);
    p.state='RELEASE_CANDIDATE_LOCKED';p.updated_at=new Date().toISOString();
    await LaunchRepository.saveProgram(p);
    return p;
  }

  static async get(idOrCode:string):Promise<LaunchProgram>{
    const p=await LaunchRepository.getProgram(idOrCode);
    if(!p)throw new NotFoundError('Launch program not found.');
    return p;
  }

  static async emergencyHold(programId:string,actor:{id:string;role:string},reason:string):Promise<LaunchProgram>{
    const role=actor.role.toUpperCase();
    if(!['RELEASE_AUTHORITY','INCIDENT_COMMANDER','SAFETY_LEAD','SECURITY_LEAD'].includes(role))throw new AuthorizationError('Launch hold requires incident/safety/security/release authority.',{errorCode:'AUTHZ_002'});
    if(!reason.trim())throw new DomainInvariantError('Emergency launch hold requires a reason.');
    const p=await this.get(programId);
    if(p.state==='BETA_ACTIVE')p.state='BETA_PAUSED';
    else if(p.state==='LIMITED_LAUNCH_ACTIVE')p.state='LAUNCH_PAUSED';
    else throw new DomainInvariantError('Emergency launch hold is only valid during an active beta or limited launch.');
    p.paused_reason=reason;p.updated_at=new Date().toISOString();
    await LaunchRepository.saveProgram(p);
    AuditService.record({
      actor_type:'STAFF',actor_id:actor.id,action:'LAUNCH.EMERGENCY_HOLD',resource_type:'launch_program',resource_id:p.id,
      purpose:'Launch Incident Containment',authorization_basis:{role,reason},result:'ALLOWED',
      metadata:{state:p.state,build_sha:p.build_sha}
    });
    return p;
  }
}
