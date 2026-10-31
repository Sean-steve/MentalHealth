import { AuthorizationError,DomainInvariantError,NotFoundError } from '../../platform/errors/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { AuditService } from '../../platform/audit/index.js';
import { PostLaunchDecision,PostLaunchReview } from '../domain/types.js';
import { LaunchRepository } from '../repositories/index.js';

export class PostLaunchReviewService{
  static async review(input:{
    program_id:string;build_sha:string;window_started_at:string;window_ended_at:string;
    incident_refs:string[];monitoring_snapshot_refs:string[];evidence_refs:string[];
    reviewer_id:string;reviewer_role:string;decision:PostLaunchDecision;findings:string[];corrective_actions:string[];
  }):Promise<PostLaunchReview>{
    if(input.reviewer_role.toUpperCase()!=='RELEASE_AUTHORITY')throw new AuthorizationError('Post-launch review requires RELEASE_AUTHORITY.',{errorCode:'AUTHZ_002'});
    const p=await LaunchRepository.getProgram(input.program_id);if(!p)throw new NotFoundError('Launch program not found.');
    if(!['LIMITED_LAUNCH_ACTIVE','LAUNCH_PAUSED'].includes(p.state))throw new DomainInvariantError('Post-launch review requires a limited-launch period.');
    if(p.build_sha!==input.build_sha)throw new DomainInvariantError('Post-launch review build SHA must match the launched build.');
    const start=Date.parse(input.window_started_at),end=Date.parse(input.window_ended_at);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end>Date.now())throw new DomainInvariantError('Post-launch review requires a completed, valid observation window.');
    if(!input.monitoring_snapshot_refs.length||!input.evidence_refs.length)throw new DomainInvariantError('Post-launch review requires monitoring and evidence references.');
    const snapshots=await LaunchRepository.listMonitoringSnapshots(p.id);
    const validSnapshotIds=new Set(snapshots.filter(x=>x.build_sha===p.build_sha&&Date.parse(x.captured_at)>=start&&Date.parse(x.captured_at)<=end).map(x=>x.id));
    if(input.monitoring_snapshot_refs.some(x=>!validSnapshotIds.has(x)))throw new DomainInvariantError('Post-launch review references monitoring evidence outside the exact build/observation window.');
    const value:PostLaunchReview={
      id:generateUUIDv7(),program_id:p.id,build_sha:p.build_sha,window_started_at:input.window_started_at,window_ended_at:input.window_ended_at,
      incident_refs:[...new Set(input.incident_refs)],monitoring_snapshot_refs:[...new Set(input.monitoring_snapshot_refs)],evidence_refs:[...new Set(input.evidence_refs)],
      reviewer_id:input.reviewer_id,reviewer_role:'RELEASE_AUTHORITY',decision:input.decision,findings:input.findings,corrective_actions:input.corrective_actions,
      reviewed_at:new Date().toISOString()
    };
    await LaunchRepository.savePostLaunchReview(value);
    if(input.decision==='HOLD')p.state='LAUNCH_PAUSED';
    else if(input.decision==='ROLLBACK')p.state='BLOCKED';
    else p.state='CLOSED';
    p.updated_at=new Date().toISOString();await LaunchRepository.saveProgram(p);
    AuditService.record({
      actor_type:'STAFF',actor_id:input.reviewer_id,action:'LAUNCH.POST_LAUNCH_REVIEW',resource_type:'launch_program',resource_id:p.id,
      purpose:'Post-launch Review',authorization_basis:{build_sha:p.build_sha,window_start:input.window_started_at,window_end:input.window_ended_at},
      result:input.decision==='ROLLBACK'?'DENIED':'ALLOWED',metadata:{decision:input.decision,findings_count:input.findings.length,corrective_actions_count:input.corrective_actions.length}
    });
    return value;
  }
}
