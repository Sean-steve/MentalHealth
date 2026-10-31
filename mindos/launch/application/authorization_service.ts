import { AuthorizationError,DomainInvariantError,NotFoundError } from '../../platform/errors/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { AuditService } from '../../platform/audit/index.js';
import { ReleaseAssuranceService } from '../../validation/index.js';
import { RegulatoryCertificationService } from '../../regulatory_governance/certification/service.js';
import { LaunchAuthorizationDecision,LaunchDecisionType } from '../domain/types.js';
import { LaunchEvidenceService } from './evidence_service.js';
import { LaunchRepository } from '../repositories/index.js';

export class LaunchAuthorizationService{
  static async evaluate(programId:string):Promise<{ready:boolean;blockers:string[];evidence_package_id?:string}>{
    const p=await LaunchRepository.getProgram(programId);if(!p)throw new NotFoundError('Launch program not found.');
    const blockers:string[]=[];
    const assurance=await ReleaseAssuranceService.productionAuthorizationStatus(p.release_id,p.build_sha);
    if(!assurance.authorized)blockers.push(...assurance.reasons.map(x=>`RELEASE_ASSURANCE:${x}`));
    const pkg=await LaunchRepository.getLatestEvidencePackage(p.id);
    if(!pkg)blockers.push('LAUNCH_EVIDENCE_PACKAGE_MISSING');
    else{
      if(pkg.build_sha!==p.build_sha)blockers.push('LAUNCH_EVIDENCE_BUILD_MISMATCH');
      const categories=new Set(pkg.items.map(x=>x.category));
      for(const category of LaunchEvidenceService.requiredCategories(p.scope))if(!categories.has(category))blockers.push(`LAUNCH_EVIDENCE_MISSING:${category}`);
      for(const item of pkg.items)if(item.expires_at&&Date.parse(item.expires_at)<=Date.now())blockers.push(`LAUNCH_EVIDENCE_EXPIRED:${item.category}`);
    }
    if(!p.regulatory_scope_evidence_ref)blockers.push('KENYA_REGULATORY_SCOPE_DETERMINATION_MISSING');
    for(const authority of p.required_external_authorities){
      const status=RegulatoryCertificationService.getExternalStatus(authority,'KE');
      if(!status||!['REGISTERED','AUDITED','EXEMPT'].includes(status.status))blockers.push(`EXTERNAL_REGULATORY_EVIDENCE_MISSING:${authority}`);
      else if(status.renewal_due_date&&Date.parse(status.renewal_due_date)<=Date.now())blockers.push(`EXTERNAL_REGULATORY_EVIDENCE_EXPIRED:${authority}`);
    }
    const snapshots=await LaunchRepository.listMonitoringSnapshots(p.id);
    const latest=[...snapshots].sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at))[0];
    if(!latest)blockers.push('OPERATIONAL_MONITORING_SNAPSHOT_MISSING');
    else{
      if(latest.build_sha!==p.build_sha)blockers.push('MONITORING_BUILD_MISMATCH');
      if(latest.status!=='GREEN')blockers.push(`OPERATIONAL_MONITORING_${latest.status}`);
      if(latest.critical_launch_blockers>0)blockers.push('CRITICAL_LAUNCH_BLOCKERS_OPEN');
      if(latest.open_critical_incidents>0)blockers.push('OPEN_CRITICAL_INCIDENT');
      if(!latest.safety_resources_valid)blockers.push('CRISIS_RESOURCE_VALIDITY_FAILED');
      if(!latest.incident_response_ready)blockers.push('INCIDENT_RESPONSE_NOT_READY');
      if(!latest.rollback_ready)blockers.push('ROLLBACK_NOT_READY');
    }
    return {ready:blockers.length===0,blockers:[...new Set(blockers)],evidence_package_id:pkg?.id};
  }

  static async decide(input:{
    program_id:string;decision_type:LaunchDecisionType;reviewer_id:string;reviewer_role:string;
    decision:'APPROVED'|'APPROVED_WITH_CONDITIONS'|'BLOCKED';conditions?:string[];
  }):Promise<LaunchAuthorizationDecision>{
    if(input.reviewer_role.toUpperCase()!=='RELEASE_AUTHORITY')throw new AuthorizationError('Only RELEASE_AUTHORITY may authorize controlled beta or limited Kenya launch.',{errorCode:'AUTHZ_002'});
    const p=await LaunchRepository.getProgram(input.program_id);if(!p)throw new NotFoundError('Launch program not found.');
    if(p.owner_id===input.reviewer_id)throw new AuthorizationError('Launch program owner cannot be the sole launch authorizer.',{errorCode:'AUTHZ_004'});
    if(input.decision_type==='CONTROLLED_BETA'&&p.state!=='RELEASE_CANDIDATE_LOCKED')throw new DomainInvariantError('Controlled beta authorization requires a locked release candidate.');
    if(input.decision_type==='LIMITED_KENYA_LAUNCH'&&p.state!=='BETA_ACTIVE')throw new DomainInvariantError('Limited Kenya launch authorization requires an active controlled beta.');
    if(input.decision_type==='LIMITED_KENYA_LAUNCH'){
      const participants=await LaunchRepository.listParticipants(p.id);
      if(!participants.some(x=>x.state==='ENROLLED'))throw new DomainInvariantError('Limited Kenya launch requires evidence that the controlled beta actually enrolled participants.');
      const snapshots=await LaunchRepository.listMonitoringSnapshots(p.id);
      if(!p.beta_starts_at||!snapshots.some(x=>x.build_sha===p.build_sha&&x.status==='GREEN'&&Date.parse(x.captured_at)>=Date.parse(p.beta_starts_at))){
        throw new DomainInvariantError('Limited Kenya launch requires a GREEN operational monitoring snapshot captured during the active beta window.');
      }
    }
    const evaluation=await this.evaluate(p.id);
    if(input.decision!=='BLOCKED'&&!evaluation.ready)throw new DomainInvariantError(`KENYA_LAUNCH_GATE_BLOCKED: ${evaluation.blockers.join(',')}`);
    if(!evaluation.evidence_package_id)throw new DomainInvariantError('Launch authorization requires a launch evidence package.');
    const value:LaunchAuthorizationDecision={
      id:generateUUIDv7(),program_id:p.id,build_sha:p.build_sha,decision_type:input.decision_type,decision:input.decision,
      reviewer_id:input.reviewer_id,reviewer_role:'RELEASE_AUTHORITY',evidence_package_id:evaluation.evidence_package_id,
      conditions:input.conditions||[],decided_at:new Date().toISOString()
    };
    await LaunchRepository.saveDecision(value);
    if(input.decision==='BLOCKED')p.state='BLOCKED';
    else if(input.decision_type==='CONTROLLED_BETA')p.state='BETA_READY';
    else p.state='LIMITED_LAUNCH_AUTHORIZED';
    p.updated_at=new Date().toISOString();await LaunchRepository.saveProgram(p);
    AuditService.record({
      actor_type:'STAFF',actor_id:input.reviewer_id,action:'LAUNCH.AUTHORIZATION_DECIDED',resource_type:'launch_program',resource_id:p.id,
      purpose:input.decision_type,authorization_basis:{role:'RELEASE_AUTHORITY',build_sha:p.build_sha,evidence_package_id:evaluation.evidence_package_id},
      result:input.decision==='BLOCKED'?'DENIED':'ALLOWED',metadata:{decision:input.decision,conditions:value.conditions}
    });
    return value;
  }

  static async activateBeta(programId:string,actor:{id:string;role:string}){
    if(actor.role.toUpperCase()!=='RELEASE_AUTHORITY')throw new AuthorizationError('Beta activation requires RELEASE_AUTHORITY.',{errorCode:'AUTHZ_002'});
    const p=await LaunchRepository.getProgram(programId);if(!p)throw new NotFoundError('Launch program not found.');
    if(p.state!=='BETA_READY')throw new DomainInvariantError('Controlled beta is not authorized for activation.');
    const evaluation=await this.evaluate(p.id);if(!evaluation.ready)throw new DomainInvariantError(`BETA_ACTIVATION_BLOCKED: ${evaluation.blockers.join(',')}`);
    p.state='BETA_ACTIVE';p.beta_starts_at=new Date().toISOString();p.updated_at=p.beta_starts_at;await LaunchRepository.saveProgram(p);return p;
  }

  static async activateLimitedLaunch(programId:string,actor:{id:string;role:string}){
    if(actor.role.toUpperCase()!=='RELEASE_AUTHORITY')throw new AuthorizationError('Limited Kenya launch activation requires RELEASE_AUTHORITY.',{errorCode:'AUTHZ_002'});
    const p=await LaunchRepository.getProgram(programId);if(!p)throw new NotFoundError('Launch program not found.');
    if(p.state!=='LIMITED_LAUNCH_AUTHORIZED')throw new DomainInvariantError('Limited Kenya launch is not authorized for activation.');
    const evaluation=await this.evaluate(p.id);if(!evaluation.ready)throw new DomainInvariantError(`KENYA_LAUNCH_GATE_BLOCKED: ${evaluation.blockers.join(',')}`);
    p.state='LIMITED_LAUNCH_ACTIVE';p.limited_launch_starts_at=new Date().toISOString();p.updated_at=p.limited_launch_starts_at;await LaunchRepository.saveProgram(p);return p;
  }

  static async resume(programId:string,actor:{id:string;role:string}){
    if(actor.role.toUpperCase()!=='RELEASE_AUTHORITY')throw new AuthorizationError('Launch resume requires RELEASE_AUTHORITY.',{errorCode:'AUTHZ_002'});
    const p=await LaunchRepository.getProgram(programId);if(!p)throw new NotFoundError('Launch program not found.');
    if(!['BETA_PAUSED','LAUNCH_PAUSED'].includes(p.state))throw new DomainInvariantError('Launch program is not paused.');
    const evaluation=await this.evaluate(p.id);if(!evaluation.ready)throw new DomainInvariantError(`LAUNCH_RESUME_BLOCKED: ${evaluation.blockers.join(',')}`);
    p.state=p.state==='BETA_PAUSED'?'BETA_ACTIVE':'LIMITED_LAUNCH_ACTIVE';p.paused_reason=undefined;p.updated_at=new Date().toISOString();await LaunchRepository.saveProgram(p);return p;
  }
}
