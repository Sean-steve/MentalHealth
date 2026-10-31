import { AuthorizationError, DomainInvariantError, NotFoundError } from '../../platform/errors/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { AuditService } from '../../platform/audit/index.js';
import { ClinicalOperationsRepository } from '../repositories/index.js';
import { SafetyPlanShareGrant, SafetyPlanShareGranteeType } from '../domain/types.js';

const ALLOWED_SCOPES = new Set([
  'VIEW_WARNING_SIGNS',
  'VIEW_COPING_STRATEGIES',
  'VIEW_SAFE_PLACES',
  'VIEW_TRUSTED_PEOPLE',
  'VIEW_PROFESSIONALS',
  'VIEW_VERIFIED_RESOURCES'
]);

export class SafetyPlanSharingService {
  static async grant(input:{
    safety_plan_reference:string;
    subject_user_id:string;
    actor_user_id:string;
    grantee_type:SafetyPlanShareGranteeType;
    grantee_id:string;
    scopes:string[];
  }):Promise<SafetyPlanShareGrant>{
    if(input.actor_user_id!==input.subject_user_id){
      throw new AuthorizationError('Only the safety-plan owner may grant sharing permission.',{errorCode:'AUTHZ_003'});
    }
    if(!input.safety_plan_reference||!input.grantee_id||!Array.isArray(input.scopes)||input.scopes.length===0){
      throw new DomainInvariantError('safety_plan_reference, grantee_id and at least one explicit scope are required.');
    }
    const invalid=input.scopes.filter(x=>!ALLOWED_SCOPES.has(x));
    if(invalid.length>0){
      throw new DomainInvariantError('Safety-plan sharing contains an unsupported permission scope.');
    }
    const existing=(await ClinicalOperationsRepository.listSafetyPlanShares(input.subject_user_id,input.safety_plan_reference))
      .find(x=>x.status==='ACTIVE'&&x.grantee_type===input.grantee_type&&x.grantee_id===input.grantee_id);
    if(existing){
      existing.scopes=[...new Set(input.scopes)];
      await ClinicalOperationsRepository.saveSafetyPlanShare(existing);
      return existing;
    }
    const grant:SafetyPlanShareGrant={
      id:generateUUIDv7(),
      safety_plan_reference:input.safety_plan_reference,
      subject_user_id:input.subject_user_id,
      grantee_type:input.grantee_type,
      grantee_id:input.grantee_id,
      scopes:[...new Set(input.scopes)],
      status:'ACTIVE',
      granted_by:input.actor_user_id,
      granted_at:new Date().toISOString()
    };
    await ClinicalOperationsRepository.saveSafetyPlanShare(grant);
    this.audit('SAFETY_PLAN.SHARE_GRANTED',grant,input.actor_user_id);
    return grant;
  }

  static async revoke(input:{
    grant_id:string;
    subject_user_id:string;
    actor_user_id:string;
    reason:string;
  }):Promise<SafetyPlanShareGrant>{
    if(input.actor_user_id!==input.subject_user_id){
      throw new AuthorizationError('Only the safety-plan owner may revoke sharing permission.',{errorCode:'AUTHZ_003'});
    }
    if(!input.reason?.trim()) throw new DomainInvariantError('A revocation reason is required.');
    const all=await ClinicalOperationsRepository.listSafetyPlanShares(input.subject_user_id);
    const grant=all.find(x=>x.id===input.grant_id);
    if(!grant) throw new NotFoundError('Safety-plan share grant not found.');
    grant.status='REVOKED';
    grant.revoked_at=new Date().toISOString();
    grant.revocation_reason=input.reason;
    await ClinicalOperationsRepository.saveSafetyPlanShare(grant);
    this.audit('SAFETY_PLAN.SHARE_REVOKED',grant,input.actor_user_id);
    return grant;
  }

  static async canAccess(input:{
    subject_user_id:string;
    safety_plan_reference:string;
    grantee_type:SafetyPlanShareGranteeType;
    grantee_id:string;
    scope:string;
  }):Promise<boolean>{
    const grants=await ClinicalOperationsRepository.listSafetyPlanShares(input.subject_user_id,input.safety_plan_reference);
    return grants.some(x=>x.status==='ACTIVE'&&x.grantee_type===input.grantee_type&&
      x.grantee_id===input.grantee_id&&x.scopes.includes(input.scope));
  }

  private static audit(action:string,grant:SafetyPlanShareGrant,actorId:string):void{
    AuditService.record({
      actor_type:'USER',actor_id:actorId,action,resource_type:'safety_plan_share_grants',
      resource_id:grant.id,purpose:'USER_DIRECTED_SAFETY_PLAN_SHARING',
      authorization_basis:{owner_user_id:grant.subject_user_id},result:'ALLOWED',
      metadata:{grantee_type:grant.grantee_type,scopes:grant.scopes,status:grant.status}
    });
  }
}
