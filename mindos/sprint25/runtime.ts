import {
  AnalyticsEventBridge,
  AnalyticsMetricRegistry,
  PgAnalyticsRepository,
  resetAnalyticsRepository,
  setAnalyticsRepository
} from '../analytics/index.js';

export interface Sprint25RuntimeStatus{
  configured:boolean;
  persistence:'POSTGRES'|'IN_MEMORY_DEFAULT';
  event_bridge:'ACTIVE'|'INACTIVE';
  canonical_metric_definitions:number;
}

let status:Sprint25RuntimeStatus={
  configured:false,
  persistence:'IN_MEMORY_DEFAULT',
  event_bridge:'INACTIVE',
  canonical_metric_definitions:0
};

export async function configureSprint25Runtime(options:{usePostgres?:boolean}={}):Promise<Sprint25RuntimeStatus>{
  const usePostgres=options.usePostgres??process.env.NODE_ENV==='production';
  if(usePostgres)setAnalyticsRepository(new PgAnalyticsRepository());
  else resetAnalyticsRepository();
  await AnalyticsMetricRegistry.initializeCanonical();
  AnalyticsEventBridge.start();
  const defs=await AnalyticsMetricRegistry.list();
  status={
    configured:true,
    persistence:usePostgres?'POSTGRES':'IN_MEMORY_DEFAULT',
    event_bridge:'ACTIVE',
    canonical_metric_definitions:defs.length
  };
  return {...status};
}

export function getSprint25RuntimeStatus():Sprint25RuntimeStatus{return {...status};}

export function resetSprint25RuntimeForTesting():void{
  AnalyticsEventBridge.stop();
  resetAnalyticsRepository();
  status={
    configured:false,
    persistence:'IN_MEMORY_DEFAULT',
    event_bridge:'INACTIVE',
    canonical_metric_definitions:0
  };
}
