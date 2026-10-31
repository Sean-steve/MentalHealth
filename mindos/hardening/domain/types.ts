export type LifecycleRequestType='ERASURE'|'ANONYMIZATION'|'CONSENT_WITHDRAWAL_RESTRICTION';
export type LifecycleJobState='REQUESTED'|'IN_PROGRESS'|'BLOCKED'|'FAILED'|'COMPLETE';
export type LifecycleStoreKey='PRIMARY_DB'|'OBJECT_STORAGE'|'VECTOR_STORE'|'SEARCH_INDEX'|'ANALYTICS'|'CACHE';
export type LifecycleReceiptStatus='ACKNOWLEDGED'|'BLOCKED'|'FAILED';

export interface DataLifecycleJob{
  id:string;
  subject_ref_hash:string;
  request_type:LifecycleRequestType;
  state:LifecycleJobState;
  target_stores:LifecycleStoreKey[];
  reason_code:string;
  requested_at:string;
  completed_at?:string;
  failure_reason?:string;
}
export interface DataLifecycleReceipt{
  id:string;
  job_id:string;
  store_key:LifecycleStoreKey;
  status:LifecycleReceiptStatus;
  evidence_ref:string;
  acknowledged_at:string;
  detail_code?:string;
}

export type ReliabilityCriticality='SAFETY'|'DATA_INTEGRITY'|'PRIVACY_SECURITY'|'IDENTITY_CORE'|'CARE'|'AI_COMMUNITY'|'ANALYTICS_EXPERIMENTS';
export interface RecoveryTarget{
  id:string;
  service_key:string;
  criticality:ReliabilityCriticality;
  rpo_seconds:number;
  rto_seconds:number;
  configured_by:string;
  configured_at:string;
}
export interface RestoreEvidence{
  id:string;
  service_key:string;
  backup_created_at:string;
  restore_started_at:string;
  restore_completed_at:string;
  measured_rpo_seconds:number;
  measured_rto_seconds:number;
  integrity_passed:boolean;
  migration_compatible:boolean;
  backup_artifact_hash:string;
  evidence:Record<string,unknown>;
  status:'PASS'|'FAIL';
  created_at:string;
}
