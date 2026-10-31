import { createHash } from 'node:crypto';
import { DomainInvariantError,NotFoundError } from '../../platform/errors/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { LaunchEvidenceCategory,LaunchEvidenceItem,LaunchEvidencePackage } from '../domain/types.js';
import { LaunchRepository } from '../repositories/index.js';

function requiredCategories(scope:{consumer:boolean;professional:boolean;community:boolean;payments:boolean;ai:boolean}):LaunchEvidenceCategory[]{
  const base:LaunchEvidenceCategory[]=[
    'RELEASE_VALIDATION','SECURITY','CLINICAL','PRIVACY_DPIA','KENYA_REGULATORY',
    'ACCESSIBILITY','PERFORMANCE','RELIABILITY_DR','INCIDENT_RUNBOOK','ROLLBACK_KILL_SWITCH','SUPPORT_OPERATIONS'
  ];
  if(scope.ai)base.push('AI_SAFETY');
  if(scope.professional)base.push('PROFESSIONAL_OPERATIONS');
  if(scope.community)base.push('COMMUNITY_OPERATIONS');
  if(scope.payments)base.push('PAYMENTS_OPERATIONS');
  return base;
}

export class LaunchEvidenceService{
  static requiredCategories=requiredCategories;

  static async generate(programId:string,items:LaunchEvidenceItem[],generatedBy:string):Promise<LaunchEvidencePackage>{
    const p=await LaunchRepository.getProgram(programId);if(!p)throw new NotFoundError('Launch program not found.');
    if(p.state!=='RELEASE_CANDIDATE_LOCKED'&&!['BETA_READY','BETA_ACTIVE','BETA_PAUSED','LIMITED_LAUNCH_REVIEW','LIMITED_LAUNCH_AUTHORIZED','LIMITED_LAUNCH_ACTIVE','LAUNCH_PAUSED'].includes(p.state))throw new DomainInvariantError('Launch evidence package requires a locked release candidate.');
    const now=Date.now();
    const byCategory=new Map(items.map(x=>[x.category,x]));
    const missing=requiredCategories(p.scope).filter(c=>!byCategory.has(c));
    if(missing.length)throw new DomainInvariantError(`Launch evidence package missing required categories: ${missing.join(',')}`);
    for(const item of items){
      if(!item.evidence_ref)throw new DomainInvariantError(`Launch evidence item ${item.category} requires an evidence reference.`);
      if(item.expires_at&&Date.parse(item.expires_at)<=now)throw new DomainInvariantError(`Launch evidence item ${item.category} is expired.`);
    }
    const normalized=[...items].sort((a,b)=>a.category.localeCompare(b.category));
    const generated_at=new Date().toISOString();
    const manifest_hash=createHash('sha256').update(JSON.stringify({program_id:p.id,release_id:p.release_id,build_sha:p.build_sha,items:normalized,generated_at})).digest('hex');
    const pkg:LaunchEvidencePackage={id:generateUUIDv7(),program_id:p.id,release_id:p.release_id,build_sha:p.build_sha,items:normalized,manifest_hash,generated_by:generatedBy,generated_at};
    await LaunchRepository.saveEvidencePackage(pkg);
    return pkg;
  }
}
