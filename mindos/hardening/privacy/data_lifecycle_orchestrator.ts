import { createHash } from 'node:crypto';
import { DomainInvariantError, NotFoundError } from '../../platform/errors/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { DataLifecycleJob,DataLifecycleReceipt,LifecycleRequestType,LifecycleStoreKey,LifecycleReceiptStatus } from '../domain/types.js';
import { HardeningRepository } from '../repositories/index.js';

const ALL_STORES:LifecycleStoreKey[]=['PRIMARY_DB','OBJECT_STORAGE','VECTOR_STORE','SEARCH_INDEX','ANALYTICS','CACHE'];

function salt():string{
  const v=process.env.DATA_LIFECYCLE_HASH_SALT||process.env.AUDIT_INTEGRITY_SALT||process.env.SESSION_SECRET;
  if(!v&&process.env.NODE_ENV==='production')throw new DomainInvariantError('DATA_LIFECYCLE_HASH_SALT is required in production.');
  return v||'mindos-test-lifecycle-salt';
}
function subjectHash(subjectId:string):string{
  return createHash('sha256').update(`${salt()}|lifecycle|${subjectId}`).digest('hex');
}

export class DataLifecycleOrchestrator{
  static async request(input:{
    subject_id:string;
    request_type:LifecycleRequestType;
    reason_code:string;
    target_stores?:LifecycleStoreKey[];
  }):Promise<DataLifecycleJob>{
    if(!input.subject_id||!input.reason_code)throw new DomainInvariantError('Lifecycle request requires subject and reason.');
    const targets=[...new Set(input.target_stores?.length?input.target_stores:ALL_STORES)];
    const job:DataLifecycleJob={
      id:generateUUIDv7(),subject_ref_hash:subjectHash(input.subject_id),request_type:input.request_type,
      state:'REQUESTED',target_stores:targets,reason_code:input.reason_code,requested_at:new Date().toISOString()
    };
    await HardeningRepository.saveLifecycleJob(job);
    return job;
  }

  static async acknowledge(input:{
    job_id:string;
    store_key:LifecycleStoreKey;
    status:LifecycleReceiptStatus;
    evidence_ref:string;
    detail_code?:string;
  }):Promise<{job:DataLifecycleJob;receipt:DataLifecycleReceipt}>{
    const job=await HardeningRepository.getLifecycleJob(input.job_id);
    if(!job)throw new NotFoundError('Data lifecycle job not found.');
    if(!job.target_stores.includes(input.store_key))throw new DomainInvariantError('Store is not part of the lifecycle dependency graph for this job.');
    if(!input.evidence_ref)throw new DomainInvariantError('Lifecycle acknowledgement requires evidence reference.');
    const receipt:DataLifecycleReceipt={
      id:generateUUIDv7(),job_id:job.id,store_key:input.store_key,status:input.status,
      evidence_ref:input.evidence_ref,acknowledged_at:new Date().toISOString(),detail_code:input.detail_code
    };
    await HardeningRepository.saveLifecycleReceipt(receipt);
    const receipts=await HardeningRepository.listLifecycleReceipts(job.id);
    const byStore=new Map(receipts.map(x=>[x.store_key,x]));
    const failed=[...byStore.values()].find(x=>x.status==='FAILED');
    const blocked=[...byStore.values()].find(x=>x.status==='BLOCKED');
    if(failed){
      job.state='FAILED';job.failure_reason=failed.detail_code||'DEPENDENT_STORE_FAILED';
    }else if(blocked){
      job.state='BLOCKED';job.failure_reason=blocked.detail_code||'DEPENDENT_STORE_BLOCKED';
    }else if(job.target_stores.every(x=>byStore.get(x)?.status==='ACKNOWLEDGED')){
      job.state='COMPLETE';job.completed_at=new Date().toISOString();job.failure_reason=undefined;
    }else{
      job.state='IN_PROGRESS';job.completed_at=undefined;job.failure_reason=undefined;
    }
    await HardeningRepository.saveLifecycleJob(job);
    return {job,receipt};
  }

  static async status(jobId:string):Promise<{job:DataLifecycleJob;receipts:DataLifecycleReceipt[];pending_stores:LifecycleStoreKey[]}>{
    const job=await HardeningRepository.getLifecycleJob(jobId);
    if(!job)throw new NotFoundError('Data lifecycle job not found.');
    const receipts=await HardeningRepository.listLifecycleReceipts(jobId);
    const acknowledged=new Set(receipts.filter(x=>x.status==='ACKNOWLEDGED').map(x=>x.store_key));
    return {job,receipts,pending_stores:job.target_stores.filter(x=>!acknowledged.has(x))};
  }

  static async assertNoFalseCompletion(jobId:string):Promise<void>{
    const {job,pending_stores}=await this.status(jobId);
    if(job.state==='COMPLETE'&&pending_stores.length)throw new DomainInvariantError('Lifecycle job falsely marked complete while dependent stores remain pending.');
  }
}
