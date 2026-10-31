import { getPool } from '../../platform/database/index.js';
import { IHardeningRepository } from './interfaces.js';
import { DataLifecycleJob,DataLifecycleReceipt,RecoveryTarget,RestoreEvidence } from '../domain/types.js';

const parse=<T>(v:unknown,f:T):T=>{
  if(v===null||v===undefined)return f;
  if(typeof v!=='string')return v as T;
  try{return JSON.parse(v) as T;}catch{return f;}
};

export class PgHardeningRepository implements IHardeningRepository{
  async saveLifecycleJob(v:DataLifecycleJob){
    await getPool().query(`INSERT INTO privacy_lifecycle_jobs
      (id,subject_ref_hash,request_type,state,target_stores,reason_code,requested_at,completed_at,failure_reason)
      VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)
      ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state,completed_at=EXCLUDED.completed_at,failure_reason=EXCLUDED.failure_reason`,
      [v.id,v.subject_ref_hash,v.request_type,v.state,JSON.stringify(v.target_stores),v.reason_code,v.requested_at,v.completed_at||null,v.failure_reason||null]);
  }
  async getLifecycleJob(id:string){
    const r=await getPool().query('SELECT * FROM privacy_lifecycle_jobs WHERE id=$1',[id]);
    const x:any=r.rows[0]; if(!x)return undefined;
    return {...x,target_stores:parse(x.target_stores,[]),completed_at:x.completed_at||undefined,failure_reason:x.failure_reason||undefined} as DataLifecycleJob;
  }
  async listLifecycleJobs(){
    const r=await getPool().query('SELECT * FROM privacy_lifecycle_jobs ORDER BY requested_at DESC');
    return r.rows.map((x:any)=>({...x,target_stores:parse(x.target_stores,[]),completed_at:x.completed_at||undefined,failure_reason:x.failure_reason||undefined}));
  }
  async saveLifecycleReceipt(v:DataLifecycleReceipt){
    await getPool().query(`INSERT INTO privacy_lifecycle_receipts
      (id,job_id,store_key,status,evidence_ref,acknowledged_at,detail_code)
      VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(job_id,store_key) DO UPDATE SET status=EXCLUDED.status,evidence_ref=EXCLUDED.evidence_ref,acknowledged_at=EXCLUDED.acknowledged_at,detail_code=EXCLUDED.detail_code`,
      [v.id,v.job_id,v.store_key,v.status,v.evidence_ref,v.acknowledged_at,v.detail_code||null]);
  }
  async listLifecycleReceipts(jobId:string){
    const r=await getPool().query('SELECT * FROM privacy_lifecycle_receipts WHERE job_id=$1 ORDER BY store_key',[jobId]);
    return r.rows.map((x:any)=>({...x,detail_code:x.detail_code||undefined}));
  }
  async saveRecoveryTarget(v:RecoveryTarget){
    await getPool().query(`INSERT INTO reliability_recovery_targets
      (id,service_key,criticality,rpo_seconds,rto_seconds,configured_by,configured_at)
      VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(service_key) DO UPDATE SET criticality=EXCLUDED.criticality,rpo_seconds=EXCLUDED.rpo_seconds,rto_seconds=EXCLUDED.rto_seconds,configured_by=EXCLUDED.configured_by,configured_at=EXCLUDED.configured_at`,
      [v.id,v.service_key,v.criticality,v.rpo_seconds,v.rto_seconds,v.configured_by,v.configured_at]);
  }
  async getRecoveryTarget(serviceKey:string){
    const r=await getPool().query('SELECT * FROM reliability_recovery_targets WHERE service_key=$1',[serviceKey]);
    return r.rows[0] as RecoveryTarget|undefined;
  }
  async listRecoveryTargets(){
    const r=await getPool().query('SELECT * FROM reliability_recovery_targets ORDER BY service_key');
    return r.rows as RecoveryTarget[];
  }
  async saveRestoreEvidence(v:RestoreEvidence){
    await getPool().query(`INSERT INTO dr_restore_evidence
      (id,service_key,backup_created_at,restore_started_at,restore_completed_at,measured_rpo_seconds,measured_rto_seconds,
       integrity_passed,migration_compatible,backup_artifact_hash,evidence_json,status,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)`,
      [v.id,v.service_key,v.backup_created_at,v.restore_started_at,v.restore_completed_at,v.measured_rpo_seconds,v.measured_rto_seconds,
       v.integrity_passed,v.migration_compatible,v.backup_artifact_hash,JSON.stringify(v.evidence),v.status,v.created_at]);
  }
  async listRestoreEvidence(serviceKey?:string){
    const r=serviceKey
      ? await getPool().query('SELECT * FROM dr_restore_evidence WHERE service_key=$1 ORDER BY created_at DESC',[serviceKey])
      : await getPool().query('SELECT * FROM dr_restore_evidence ORDER BY created_at DESC');
    return r.rows.map((x:any)=>({...x,measured_rpo_seconds:Number(x.measured_rpo_seconds),measured_rto_seconds:Number(x.measured_rto_seconds),
      integrity_passed:Boolean(x.integrity_passed),migration_compatible:Boolean(x.migration_compatible),evidence:parse(x.evidence_json,{})}));
  }
}
