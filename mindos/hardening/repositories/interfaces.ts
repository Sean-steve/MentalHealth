import { DataLifecycleJob,DataLifecycleReceipt,RecoveryTarget,RestoreEvidence } from '../domain/types.js';

export interface IHardeningRepository{
  saveLifecycleJob(job:DataLifecycleJob):Promise<void>;
  getLifecycleJob(id:string):Promise<DataLifecycleJob|undefined>;
  listLifecycleJobs():Promise<DataLifecycleJob[]>;
  saveLifecycleReceipt(receipt:DataLifecycleReceipt):Promise<void>;
  listLifecycleReceipts(jobId:string):Promise<DataLifecycleReceipt[]>;
  saveRecoveryTarget(target:RecoveryTarget):Promise<void>;
  getRecoveryTarget(serviceKey:string):Promise<RecoveryTarget|undefined>;
  listRecoveryTargets():Promise<RecoveryTarget[]>;
  saveRestoreEvidence(evidence:RestoreEvidence):Promise<void>;
  listRestoreEvidence(serviceKey?:string):Promise<RestoreEvidence[]>;
  reset?():void|Promise<void>;
}
