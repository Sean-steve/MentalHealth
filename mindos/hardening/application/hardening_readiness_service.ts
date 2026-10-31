import { DatabaseManager } from '../../platform/database/index.js';
import { DisasterRecoveryService } from '../reliability/disaster_recovery_service.js';
import { HardeningRepository } from '../repositories/index.js';

export class HardeningReadinessService{
  static async snapshot(serviceKey='PRIMARY_POSTGRES'):Promise<Record<string,unknown>>{
    const database=await DatabaseManager.checkHealth();
    const dr=await DisasterRecoveryService.launchReadiness(serviceKey);
    const lifecycle=await HardeningRepository.listLifecycleJobs();
    const stuck=lifecycle.filter(x=>x.state==='FAILED'||x.state==='BLOCKED');
    return {
      ready:database&&dr.ready&&stuck.length===0,
      hierarchy:['SAFETY','DATA_INTEGRITY','PRIVACY_SECURITY','IDENTITY_CORE','CARE','AI_COMMUNITY','ANALYTICS_EXPERIMENTS'],
      database:{healthy:database},
      disaster_recovery:dr,
      privacy_lifecycle:{
        active:lifecycle.filter(x=>x.state==='REQUESTED'||x.state==='IN_PROGRESS').length,
        blocked_or_failed:stuck.length,
        false_completion_allowed:false
      },
      launch_blockers:[
        ...(!database?['DATABASE_UNHEALTHY']:[]),
        ...dr.blockers,
        ...(stuck.length?['PRIVACY_LIFECYCLE_BLOCKED_OR_FAILED']:[])
      ]
    };
  }
}
