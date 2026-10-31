import { PgValidationRepository,resetValidationRepository,setValidationRepository } from '../validation/index.js';

export interface Sprint27RuntimeStatus{
  configured:boolean;
  persistence:'POSTGRES'|'IN_MEMORY_DEFAULT';
  production_release_assurance_enforced:boolean;
  synthetic_human_approvals_allowed:boolean;
}

let status:Sprint27RuntimeStatus={
  configured:false,persistence:'IN_MEMORY_DEFAULT',
  production_release_assurance_enforced:false,synthetic_human_approvals_allowed:false
};

export function configureSprint27Runtime(options:{usePostgres?:boolean}={}):Sprint27RuntimeStatus{
  const usePostgres=options.usePostgres??process.env.NODE_ENV==='production';
  if(usePostgres)setValidationRepository(new PgValidationRepository());
  else resetValidationRepository();
  status={
    configured:true,
    persistence:usePostgres?'POSTGRES':'IN_MEMORY_DEFAULT',
    production_release_assurance_enforced:process.env.NODE_ENV==='production'||String(process.env.STRICT_RELEASE_ASSURANCE||'').toLowerCase()==='true',
    synthetic_human_approvals_allowed:false
  };
  return {...status};
}

export function getSprint27RuntimeStatus():Sprint27RuntimeStatus{return {...status};}
export function resetSprint27RuntimeForTesting():void{
  resetValidationRepository();
  status={configured:false,persistence:'IN_MEMORY_DEFAULT',production_release_assurance_enforced:false,synthetic_human_approvals_allowed:false};
}
