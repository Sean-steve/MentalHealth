import { DomainInvariantError,NotFoundError } from '../../platform/errors/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { HardeningReadinessService } from '../../hardening/application/hardening_readiness_service.js';
import { ClinicalOperationsRepository } from '../../clinical_ops/repositories/index.js';
import { SafetyKernel } from '../../safety/index.js';
import { LaunchMonitoringSnapshot } from '../domain/types.js';
import { LaunchRepository } from '../repositories/index.js';

export class LaunchMonitoringService{
  static async capture(programId:string,capturedBy:string,environment:'production'|'staging'='production'):Promise<LaunchMonitoringSnapshot>{
    const p=await LaunchRepository.getProgram(programId);if(!p)throw new NotFoundError('Launch program not found.');
    if(!['RELEASE_CANDIDATE_LOCKED','BETA_READY','BETA_ACTIVE','BETA_PAUSED','LIMITED_LAUNCH_REVIEW','LIMITED_LAUNCH_AUTHORIZED','LIMITED_LAUNCH_ACTIVE','LAUNCH_PAUSED'].includes(p.state))throw new DomainInvariantError('Operational launch monitoring requires a launch-ready or active program.');
    const [hardening,incidents,pkg]=await Promise.all([
      HardeningReadinessService.snapshot('PRIMARY_POSTGRES'),
      ClinicalOperationsRepository.listIncidents(),
      LaunchRepository.getLatestEvidencePackage(p.id)
    ]);
    const h=hardening as any;
    const active=incidents.filter(x=>x.state!=='CLOSED');
    const openCritical=active.filter(x=>x.severity==='CRITICAL').length;
    const resources=SafetyKernel.getVerifiedCrisisResources('KE');
    const safetyResourcesValid=resources.length>0&&resources.every(x=>x.verification_status==='VERIFIED'&&(!x.next_verify_at||Date.parse(x.next_verify_at)>Date.now()));
    const categories=new Set((pkg?.items||[]).map(x=>x.category));
    const incidentReady=categories.has('INCIDENT_RUNBOOK');
    const rollbackReady=categories.has('ROLLBACK_KILL_SWITCH');
    const databaseHealthy=Boolean(h.database?.healthy);
    const drReady=Boolean(h.disaster_recovery?.ready);
    const privacyClear=Number(h.privacy_lifecycle?.blocked_or_failed||0)===0;
    const notes:string[]=[];
    if(!databaseHealthy)notes.push('DATABASE_UNHEALTHY');
    if(!drReady)notes.push('DR_NOT_READY');
    if(!privacyClear)notes.push('PRIVACY_LIFECYCLE_BLOCKED');
    if(!safetyResourcesValid)notes.push('VERIFIED_CRISIS_RESOURCE_UNAVAILABLE');
    if(!incidentReady)notes.push('INCIDENT_RUNBOOK_EVIDENCE_MISSING');
    if(!rollbackReady)notes.push('ROLLBACK_KILL_SWITCH_EVIDENCE_MISSING');
    if(openCritical>0)notes.push('OPEN_CRITICAL_INCIDENT');
    const criticalBlockers=notes.length;
    const status:LaunchMonitoringSnapshot['status']=criticalBlockers>0?'RED':active.length>0?'AMBER':'GREEN';
    const snapshot:LaunchMonitoringSnapshot={
      id:generateUUIDv7(),program_id:p.id,build_sha:p.build_sha,environment,status,
      critical_launch_blockers:criticalBlockers,open_critical_incidents:openCritical,
      safety_resources_valid:safetyResourcesValid,incident_response_ready:incidentReady,rollback_ready:rollbackReady,
      database_healthy:databaseHealthy,dr_ready:drReady,privacy_lifecycle_clear:privacyClear,
      notes_codes:notes,captured_by:capturedBy,captured_at:new Date().toISOString()
    };
    await LaunchRepository.saveMonitoringSnapshot(snapshot);
    return snapshot;
  }
}
