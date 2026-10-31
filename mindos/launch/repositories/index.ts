import { ILaunchRepository } from './interfaces.js';
import { InMemoryLaunchRepository } from './in_memory.js';
let active:ILaunchRepository=new InMemoryLaunchRepository();
export const LaunchRepository:ILaunchRepository={
 saveProgram:v=>active.saveProgram(v),getProgram:x=>active.getProgram(x),listPrograms:()=>active.listPrograms(),
 saveParticipant:v=>active.saveParticipant(v),getParticipantByHash:(p,h)=>active.getParticipantByHash(p,h),listParticipants:p=>active.listParticipants(p),
 saveEvidencePackage:v=>active.saveEvidencePackage(v),getLatestEvidencePackage:p=>active.getLatestEvidencePackage(p),
 saveMonitoringSnapshot:v=>active.saveMonitoringSnapshot(v),listMonitoringSnapshots:p=>active.listMonitoringSnapshots(p),
 saveDecision:v=>active.saveDecision(v),listDecisions:p=>active.listDecisions(p),
 savePostLaunchReview:v=>active.savePostLaunchReview(v),listPostLaunchReviews:p=>active.listPostLaunchReviews(p),
 reset:()=>active.reset?.()
};
export function setLaunchRepository(repo:ILaunchRepository){active=repo;}
export function resetLaunchRepository(){active=new InMemoryLaunchRepository();}
export * from './interfaces.js';
export * from './in_memory.js';
export * from './pg_launch_repository.js';
