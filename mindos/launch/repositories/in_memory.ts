import { ILaunchRepository } from './interfaces.js';
import {
  LaunchAuthorizationDecision,LaunchEvidencePackage,LaunchMonitoringSnapshot,LaunchParticipant,LaunchProgram,PostLaunchReview
} from '../domain/types.js';

const clone=<T>(v:T):T=>structuredClone(v);
export class InMemoryLaunchRepository implements ILaunchRepository{
  private programs=new Map<string,LaunchProgram>();
  private byCode=new Map<string,string>();
  private participants=new Map<string,LaunchParticipant>();
  private packages=new Map<string,LaunchEvidencePackage>();
  private snapshots=new Map<string,LaunchMonitoringSnapshot>();
  private decisions=new Map<string,LaunchAuthorizationDecision>();
  private reviews=new Map<string,PostLaunchReview>();

  async saveProgram(v:LaunchProgram){this.programs.set(v.id,clone(v));this.byCode.set(v.code,v.id);}
  async getProgram(idOrCode:string){const id=this.byCode.get(idOrCode)||idOrCode;const v=this.programs.get(id);return v?clone(v):undefined;}
  async listPrograms(){return [...this.programs.values()].map(clone);}
  async saveParticipant(v:LaunchParticipant){this.participants.set(v.id,clone(v));}
  async getParticipantByHash(programId:string,subjectHash:string){const v=[...this.participants.values()].find(x=>x.program_id===programId&&x.subject_ref_hash===subjectHash);return v?clone(v):undefined;}
  async listParticipants(programId:string){return [...this.participants.values()].filter(x=>x.program_id===programId).map(clone);}
  async saveEvidencePackage(v:LaunchEvidencePackage){this.packages.set(v.id,clone(v));}
  async getLatestEvidencePackage(programId:string){return [...this.packages.values()].filter(x=>x.program_id===programId).sort((a,b)=>Date.parse(b.generated_at)-Date.parse(a.generated_at)).map(clone)[0];}
  async saveMonitoringSnapshot(v:LaunchMonitoringSnapshot){this.snapshots.set(v.id,clone(v));}
  async listMonitoringSnapshots(programId:string){return [...this.snapshots.values()].filter(x=>x.program_id===programId).sort((a,b)=>Date.parse(a.captured_at)-Date.parse(b.captured_at)).map(clone);}
  async saveDecision(v:LaunchAuthorizationDecision){this.decisions.set(v.id,clone(v));}
  async listDecisions(programId:string){return [...this.decisions.values()].filter(x=>x.program_id===programId).map(clone);}
  async savePostLaunchReview(v:PostLaunchReview){this.reviews.set(v.id,clone(v));}
  async listPostLaunchReviews(programId:string){return [...this.reviews.values()].filter(x=>x.program_id===programId).map(clone);}
  reset(){this.programs.clear();this.byCode.clear();this.participants.clear();this.packages.clear();this.snapshots.clear();this.decisions.clear();this.reviews.clear();}
}
