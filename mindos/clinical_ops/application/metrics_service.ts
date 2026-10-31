import { ClinicalOperationsRepository } from '../repositories/index.js';

const avg=(values:number[]):number|null=>values.length
  ? Math.round(values.reduce((a,b)=>a+b,0)/values.length)
  : null;
const mins=(from?:string,to?:string):number|null=>{
  if(!from||!to)return null;
  const value=(Date.parse(to)-Date.parse(from))/60000;
  return Number.isFinite(value)&&value>=0?Math.round(value):null;
};

export class ClinicalOperationsMetricsService {
  static async snapshot():Promise<Record<string,unknown>>{
    const [escalations,followUps,incidents,capabilities]=await Promise.all([
      ClinicalOperationsRepository.listEscalations(),
      ClinicalOperationsRepository.listFollowUps(),
      ClinicalOperationsRepository.listIncidents(),
      ClinicalOperationsRepository.listCapabilities()
    ]);

    const staffedKeys=new Set(capabilities.filter(x=>x.staffing_state==='STAFFED').map(x=>`${x.jurisdiction}:${x.queue_key}`));
    const staffedEscalations=escalations.filter(x=>staffedKeys.has(`${x.jurisdiction}:${x.queue_key}`));
    const assignmentTimes=staffedEscalations.map(x=>mins(x.created_at,x.assigned_at)).filter((x):x is number=>x!==null);
    const reviewStartTimes=staffedEscalations.map(x=>mins(x.assigned_at,x.review_started_at)).filter((x):x is number=>x!==null);
    const resolutionTimes=staffedEscalations.map(x=>mins(x.created_at,x.resolved_at)).filter((x):x is number=>x!==null);

    return {
      staffing:{
        configured_capabilities:capabilities.length,
        actively_marked_staffed:capabilities.filter(x=>x.staffing_state==='STAFFED').length,
        unstaffed_or_paused:capabilities.filter(x=>x.staffing_state!=='STAFFED').length
      },
      escalations:{
        total:escalations.length,
        staffed_queue_total:staffedEscalations.length,
        by_level:Object.fromEntries(['L0','L1','L2','L3'].map(level=>[level,escalations.filter(x=>x.level===level).length])),
        by_state:Object.fromEntries([...new Set(escalations.map(x=>x.state))].map(state=>[state,escalations.filter(x=>x.state===state).length])),
        average_minutes_to_assignment:avg(assignmentTimes),
        average_minutes_assignment_to_review:avg(reviewStartTimes),
        average_minutes_to_resolution:avg(resolutionTimes)
      },
      follow_up:{
        total:followUps.length,
        completed:followUps.filter(x=>x.status==='COMPLETED').length,
        missed:followUps.filter(x=>x.status==='MISSED').length,
        scheduled:followUps.filter(x=>x.status==='SCHEDULED').length,
        missed_follow_up_changes_risk_state:false
      },
      incidents:{
        open_or_active:incidents.filter(x=>x.state!=='CLOSED').length,
        closed:incidents.filter(x=>x.state==='CLOSED').length,
        critical:incidents.filter(x=>x.severity==='CRITICAL').length
      },
      governed_review_metrics:{
        false_positive_negative_methodology:'NOT_CONFIGURED',
        note:'No false-positive/false-negative rate is emitted without a separately governed methodology.'
      }
    };
  }
}
