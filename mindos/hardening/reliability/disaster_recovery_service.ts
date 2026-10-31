import { DomainInvariantError, NotFoundError } from '../../platform/errors/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { RecoveryTarget,RestoreEvidence,ReliabilityCriticality } from '../domain/types.js';
import { HardeningRepository } from '../repositories/index.js';

export class DisasterRecoveryService{
  static async configureTarget(input:{
    service_key:string;criticality:ReliabilityCriticality;rpo_seconds:number;rto_seconds:number;configured_by:string;
  }):Promise<RecoveryTarget>{
    if(!input.service_key||!input.configured_by)throw new DomainInvariantError('Recovery target requires service_key and configured_by.');
    if(input.rpo_seconds<0||input.rto_seconds<=0)throw new DomainInvariantError('Recovery target requires measured RPO >= 0 and RTO > 0 seconds.');
    const target:RecoveryTarget={id:generateUUIDv7(),...input,configured_at:new Date().toISOString()};
    await HardeningRepository.saveRecoveryTarget(target);
    return target;
  }

  static async recordRestoreEvidence(input:Omit<RestoreEvidence,'id'|'status'|'created_at'>):Promise<RestoreEvidence>{
    const target=await HardeningRepository.getRecoveryTarget(input.service_key);
    if(!target)throw new NotFoundError('Recovery target must be configured before restore evidence is accepted.');
    const chronology=Date.parse(input.restore_started_at)>=Date.parse(input.backup_created_at)&&Date.parse(input.restore_completed_at)>=Date.parse(input.restore_started_at);
    const withinTarget=input.measured_rpo_seconds<=target.rpo_seconds&&input.measured_rto_seconds<=target.rto_seconds;
    const status:RestoreEvidence['status']=chronology&&withinTarget&&input.integrity_passed&&input.migration_compatible?'PASS':'FAIL';
    const evidence:RestoreEvidence={id:generateUUIDv7(),...input,status,created_at:new Date().toISOString()};
    await HardeningRepository.saveRestoreEvidence(evidence);
    return evidence;
  }

  static async launchReadiness(serviceKey:string):Promise<{
    ready:boolean;target?:RecoveryTarget;latest_restore?:RestoreEvidence;blockers:string[];
  }>{
    const target=await HardeningRepository.getRecoveryTarget(serviceKey);
    if(!target)return {ready:false,blockers:['RECOVERY_TARGET_NOT_CONFIGURED']};
    const latest=(await HardeningRepository.listRestoreEvidence(serviceKey))[0];
    const blockers:string[]=[];
    if(!latest)blockers.push('TESTED_RESTORE_EVIDENCE_MISSING');
    else{
      if(latest.status!=='PASS')blockers.push('LATEST_RESTORE_TEST_FAILED');
      if(!latest.integrity_passed)blockers.push('RESTORE_INTEGRITY_FAILED');
      if(!latest.migration_compatible)blockers.push('RESTORE_MIGRATION_COMPATIBILITY_FAILED');
      if(latest.measured_rpo_seconds>target.rpo_seconds)blockers.push('RPO_TARGET_BREACHED');
      if(latest.measured_rto_seconds>target.rto_seconds)blockers.push('RTO_TARGET_BREACHED');
    }
    return {ready:blockers.length===0,target,latest_restore:latest,blockers};
  }

  static async requireLaunchReady(serviceKey:string):Promise<void>{
    const r=await this.launchReadiness(serviceKey);
    if(!r.ready)throw new DomainInvariantError(`DR_LAUNCH_BLOCKED: ${r.blockers.join(',')}`);
  }
}
