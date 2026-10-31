import {
  ClinicalOperationsStaffingRegistry,
  ClinicalOperationsSafetyKernelBridge,
  PgClinicalOperationsRepository,
  setClinicalOperationsRepository,
  resetClinicalOperationsRepository
} from '../clinical_ops/index.js';

export interface Sprint24RuntimeStatus{
  configured:boolean;
  persistence:'POSTGRES'|'IN_MEMORY_DEFAULT';
  staffing_truth_enforced:boolean;
  safety_kernel_bridge:'ACTIVE'|'INACTIVE';
}

let status:Sprint24RuntimeStatus={
  configured:false,
  persistence:'IN_MEMORY_DEFAULT',
  staffing_truth_enforced:false,
  safety_kernel_bridge:'INACTIVE'
};

export async function configureSprint24Runtime(options:{usePostgres?:boolean}={}):Promise<Sprint24RuntimeStatus>{
  const usePostgres=options.usePostgres??process.env.NODE_ENV==='production';
  if(usePostgres)setClinicalOperationsRepository(new PgClinicalOperationsRepository());
  else resetClinicalOperationsRepository();

  ClinicalOperationsStaffingRegistry.setEnforcementEnabled(true);
  ClinicalOperationsSafetyKernelBridge.start();

  status={
    configured:true,
    persistence:usePostgres?'POSTGRES':'IN_MEMORY_DEFAULT',
    staffing_truth_enforced:true,
    safety_kernel_bridge:'ACTIVE'
  };
  return {...status};
}

export function getSprint24RuntimeStatus():Sprint24RuntimeStatus{return {...status};}

export function resetSprint24RuntimeForTesting():void{
  ClinicalOperationsSafetyKernelBridge.stop();
  ClinicalOperationsStaffingRegistry.setEnforcementEnabled(false);
  resetClinicalOperationsRepository();
  status={
    configured:false,
    persistence:'IN_MEMORY_DEFAULT',
    staffing_truth_enforced:false,
    safety_kernel_bridge:'INACTIVE'
  };
}
