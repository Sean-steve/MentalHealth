import { IHardeningRepository } from './interfaces.js';
import { DataLifecycleJob,DataLifecycleReceipt,RecoveryTarget,RestoreEvidence } from '../domain/types.js';

export class InMemoryHardeningRepository implements IHardeningRepository{
  private jobs=new Map<string,DataLifecycleJob>();
  private receipts=new Map<string,DataLifecycleReceipt>();
  private targets=new Map<string,RecoveryTarget>();
  private evidence=new Map<string,RestoreEvidence>();

  async saveLifecycleJob(v:DataLifecycleJob){this.jobs.set(v.id,structuredClone(v));}
  async getLifecycleJob(id:string){const v=this.jobs.get(id);return v?structuredClone(v):undefined;}
  async listLifecycleJobs(){return [...this.jobs.values()].map(x=>structuredClone(x));}
  async saveLifecycleReceipt(v:DataLifecycleReceipt){this.receipts.set(`${v.job_id}:${v.store_key}`,structuredClone(v));}
  async listLifecycleReceipts(jobId:string){return [...this.receipts.values()].filter(x=>x.job_id===jobId).map(x=>structuredClone(x));}
  async saveRecoveryTarget(v:RecoveryTarget){this.targets.set(v.service_key,structuredClone(v));}
  async getRecoveryTarget(serviceKey:string){const v=this.targets.get(serviceKey);return v?structuredClone(v):undefined;}
  async listRecoveryTargets(){return [...this.targets.values()].map(x=>structuredClone(x));}
  async saveRestoreEvidence(v:RestoreEvidence){this.evidence.set(v.id,structuredClone(v));}
  async listRestoreEvidence(serviceKey?:string){return [...this.evidence.values()].filter(x=>!serviceKey||x.service_key===serviceKey).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).map(x=>structuredClone(x));}
  reset(){this.jobs.clear();this.receipts.clear();this.targets.clear();this.evidence.clear();}
}
