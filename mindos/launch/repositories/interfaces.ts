import {
  LaunchAuthorizationDecision,LaunchEvidencePackage,LaunchMonitoringSnapshot,LaunchParticipant,LaunchProgram,PostLaunchReview
} from '../domain/types.js';

export interface ILaunchRepository{
  saveProgram(v:LaunchProgram):Promise<void>;
  getProgram(idOrCode:string):Promise<LaunchProgram|undefined>;
  listPrograms():Promise<LaunchProgram[]>;
  saveParticipant(v:LaunchParticipant):Promise<void>;
  getParticipantByHash(programId:string,subjectHash:string):Promise<LaunchParticipant|undefined>;
  listParticipants(programId:string):Promise<LaunchParticipant[]>;
  saveEvidencePackage(v:LaunchEvidencePackage):Promise<void>;
  getLatestEvidencePackage(programId:string):Promise<LaunchEvidencePackage|undefined>;
  saveMonitoringSnapshot(v:LaunchMonitoringSnapshot):Promise<void>;
  listMonitoringSnapshots(programId:string):Promise<LaunchMonitoringSnapshot[]>;
  saveDecision(v:LaunchAuthorizationDecision):Promise<void>;
  listDecisions(programId:string):Promise<LaunchAuthorizationDecision[]>;
  savePostLaunchReview(v:PostLaunchReview):Promise<void>;
  listPostLaunchReviews(programId:string):Promise<PostLaunchReview[]>;
  reset?():void|Promise<void>;
}
