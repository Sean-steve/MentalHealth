import { ClinicalOperationsMetricsService } from '../../clinical_ops/application/metrics_service.js';
import {
  AnalyticsDashboardKind,
  AnalyticsDashboardMetric
} from '../domain/types.js';
import { AnalyticsRepository } from '../repositories/index.js';
import { AnalyticsMetricRegistry } from '../metrics/metric_registry.js';

const codes:Record<AnalyticsDashboardKind,string[]>={
  SAFETY:['SAFETY_WORKFLOW_COMPLETION','SAFETY_FALSE_NEGATIVE','SAFETY_FALSE_POSITIVE','CRISIS_RESOURCE_VALIDITY','SAFETY_API_AVAILABILITY'],
  PRODUCT:['ASSESSMENT_COMPLETION','RESOURCE_USEFULNESS','ONBOARDING_ACTIVATION','AI_USEFULNESS','AI_ACTION_RATE','AI_SAFETY_INTERVENTION_RATE'],
  BUSINESS:['MRR','ARR','GMV','TAKE_RATE','CHURN','AI_COST_ACTIVE_USER'],
  OUTCOME:['MSC','MEANINGFUL_IMPROVEMENT','TIME_TO_SUPPORT','CARE_CONNECTION_RATE','APPOINTMENT_ATTENDANCE','CARE_CONTINUITY']
};

export class GovernedAnalyticsDashboardService{
  static async get(kind:AnalyticsDashboardKind):Promise<Record<string,unknown>>{
    const metrics:AnalyticsDashboardMetric[]=[];
    for(const code of codes[kind]){
      const def=await AnalyticsMetricRegistry.get(code);
      const latest=(await AnalyticsRepository.listAggregates(code))
        .filter(x=>x.metric_version===def.version)
        .sort((a,b)=>Date.parse(b.window_end)-Date.parse(a.window_end))[0];
      metrics.push({
        code:def.code,name:def.name,domain:def.domain,cadence:def.cadence,
        methodology_version:def.version,evidence_level:def.evidence_level,
        value:latest?.value??null,numerator:latest?.numerator??null,denominator:latest?.denominator??null,
        cohort_count:latest?.cohort_count??null,suppressed:Boolean(latest?.suppressed),
        status:latest?(latest.suppressed?'SUPPRESSED':'AVAILABLE'):'NO_GOVERNED_DATA',
        governance_note:def.governance_note,window_start:latest?.window_start,window_end:latest?.window_end
      });
    }
    return {
      dashboard:kind,
      generated_at:new Date().toISOString(),
      individual_profiles_exposed:false,
      causal_claims_enabled:false,
      metrics,
      ...(kind==='SAFETY'?{operational_context:await ClinicalOperationsMetricsService.snapshot()}:{})
    };
  }
}
