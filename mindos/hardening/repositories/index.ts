import { IHardeningRepository } from './interfaces.js';
import { InMemoryHardeningRepository } from './in_memory.js';

let active:IHardeningRepository=new InMemoryHardeningRepository();

export const HardeningRepository:IHardeningRepository={
  saveLifecycleJob:v=>active.saveLifecycleJob(v),
  getLifecycleJob:id=>active.getLifecycleJob(id),
  listLifecycleJobs:()=>active.listLifecycleJobs(),
  saveLifecycleReceipt:v=>active.saveLifecycleReceipt(v),
  listLifecycleReceipts:id=>active.listLifecycleReceipts(id),
  saveRecoveryTarget:v=>active.saveRecoveryTarget(v),
  getRecoveryTarget:k=>active.getRecoveryTarget(k),
  listRecoveryTargets:()=>active.listRecoveryTargets(),
  saveRestoreEvidence:v=>active.saveRestoreEvidence(v),
  listRestoreEvidence:k=>active.listRestoreEvidence(k),
  reset:()=>active.reset?.()
};
export function setHardeningRepository(repo:IHardeningRepository){active=repo;}
export function resetHardeningRepository(){active=new InMemoryHardeningRepository();}

export * from './interfaces.js';
export * from './in_memory.js';
export * from './pg_hardening_repository.js';
