import { PgHardeningRepository, resetHardeningRepository, setHardeningRepository } from '../hardening/index.js';

export interface Sprint26RuntimeStatus{
  configured:boolean;
  persistence:'POSTGRES'|'IN_MEMORY_DEFAULT';
  recovery_targets_seeded:boolean;
  privacy_lifecycle_enforced:boolean;
  restore_evidence_required:boolean;
}
let status:Sprint26RuntimeStatus={
  configured:false,persistence:'IN_MEMORY_DEFAULT',recovery_targets_seeded:false,
  privacy_lifecycle_enforced:false,restore_evidence_required:false
};

export function configureSprint26Runtime(options:{usePostgres?:boolean}={}):Sprint26RuntimeStatus{
  const usePostgres=options.usePostgres??process.env.NODE_ENV==='production';
  if(usePostgres)setHardeningRepository(new PgHardeningRepository());
  else resetHardeningRepository();
  status={
    configured:true,persistence:usePostgres?'POSTGRES':'IN_MEMORY_DEFAULT',
    recovery_targets_seeded:false,
    privacy_lifecycle_enforced:true,
    restore_evidence_required:true
  };
  return {...status};
}
export function getSprint26RuntimeStatus():Sprint26RuntimeStatus{return {...status};}
export function resetSprint26RuntimeForTesting():void{
  resetHardeningRepository();
  status={configured:false,persistence:'IN_MEMORY_DEFAULT',recovery_targets_seeded:false,privacy_lifecycle_enforced:false,restore_evidence_required:false};
}
