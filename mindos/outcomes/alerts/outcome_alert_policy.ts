import { DomainInvariantError } from '../../platform/errors/index.js';

export interface OutcomeAlertPolicy {
  id: string;
  version: number;
  review_due_minutes: Record<'LOW'|'MEDIUM'|'HIGH'|'CRITICAL', number>;
  clinical_artifact_id: string;
  clinical_artifact_version: string;
  approval_state: 'APPROVED'|'REVOKED'|'EXPIRED';
  approved_by: string;
  approved_at: string;
  effective_from: string;
  effective_until?: string;
}

export class OutcomeAlertPolicyRegistry {
  private static policies = new Map<string, OutcomeAlertPolicy>();

  static registerApprovedPolicy(policy:OutcomeAlertPolicy):void{
    if(policy.approval_state!=='APPROVED') throw new DomainInvariantError('Only APPROVED outcome alert policies may execute.');
    if(!policy.clinical_artifact_id||!policy.clinical_artifact_version||!policy.approved_by){
      throw new DomainInvariantError('Outcome alert policy requires Clinical Governance approval provenance.');
    }
    for(const severity of ['LOW','MEDIUM','HIGH','CRITICAL'] as const){
      const minutes=policy.review_due_minutes[severity];
      if(!Number.isFinite(minutes)||minutes<=0) throw new DomainInvariantError(`Outcome alert policy requires a positive ${severity} review window.`);
    }
    this.policies.set(`${policy.id}:${policy.version}`,{...policy,review_due_minutes:{...policy.review_due_minutes}});
  }

  static getApprovedPolicy(at=new Date()):OutcomeAlertPolicy|undefined{
    const found=Array.from(this.policies.values())
      .filter(p=>p.approval_state==='APPROVED')
      .filter(p=>Date.parse(p.effective_from)<=at.getTime())
      .filter(p=>!p.effective_until||Date.parse(p.effective_until)>at.getTime())
      .sort((a,b)=>b.version-a.version)[0];
    return found?{...found,review_due_minutes:{...found.review_due_minutes}}:undefined;
  }

  static listApprovedPolicies():OutcomeAlertPolicy[]{
    return Array.from(this.policies.values()).filter(p=>p.approval_state==='APPROVED')
      .map(p=>({...p,review_due_minutes:{...p.review_due_minutes}}));
  }

  static clear():void{this.policies.clear();}
}
