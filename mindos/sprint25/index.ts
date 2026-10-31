import { Router, Request } from 'express';
import { AuthorizationError } from '../platform/errors/index.js';
import {
  AnalyticsAggregationService,
  AnalyticsEventContractRegistry,
  AnalyticsMetricRegistry,
  GovernedAnalyticsDashboardService
} from '../analytics/index.js';
import { AnalyticsDashboardKind } from '../analytics/domain/types.js';
import { getSprint25RuntimeStatus } from './runtime.js';

export const sprint25Router=Router();

const ANALYTICS_ROLES=new Set(['ANALYTICS_VIEWER','ANALYTICS_ADMIN']);
const SAFETY_DASHBOARD_ROLES=new Set(['ANALYTICS_VIEWER','ANALYTICS_ADMIN','SAFETY_REVIEWER','CLINICAL_ADMIN']);

function actor(req:Request,allowed:Set<string>):{actor_id:string;actor_role:string}{
  const actor_id=String(req.headers['x-actor-id']||'');
  const actor_role=String(req.headers['x-actor-role']||'').toUpperCase();
  if(!actor_id||!allowed.has(actor_role)){
    throw new AuthorizationError('Governed analytics access requires an authorized analytics/operations role.',{errorCode:'AUTHZ_002'});
  }
  return {actor_id,actor_role};
}

sprint25Router.get('/analytics/event-contracts',(req,res,next)=>{
  try{
    actor(req,ANALYTICS_ROLES);
    res.json({contracts:AnalyticsEventContractRegistry.list()});
  }catch(e){next(e);}
});

sprint25Router.get('/analytics/metrics',async(req,res,next)=>{
  try{
    actor(req,ANALYTICS_ROLES);
    res.json({metrics:await AnalyticsMetricRegistry.list()});
  }catch(e){next(e);}
});

sprint25Router.post('/analytics/metrics',async(req,res,next)=>{
  try{
    const a=actor(req,ANALYTICS_ROLES);
    if(a.actor_role!=='ANALYTICS_ADMIN')throw new AuthorizationError('Only ANALYTICS_ADMIN may register metric methodology versions.',{errorCode:'AUTHZ_002'});
    const metric=await AnalyticsMetricRegistry.registerVersion(req.body);
    res.status(201).json({metric});
  }catch(e){next(e);}
});

sprint25Router.post('/analytics/materialize',async(req,res,next)=>{
  try{
    const a=actor(req,ANALYTICS_ROLES);
    if(a.actor_role!=='ANALYTICS_ADMIN')throw new AuthorizationError('Only ANALYTICS_ADMIN may materialize governed metric windows.',{errorCode:'AUTHZ_002'});
    const aggregates=await AnalyticsAggregationService.materializeKnownEventMetrics(
      String(req.body.window_start),String(req.body.window_end)
    );
    res.status(201).json({aggregates});
  }catch(e){next(e);}
});

sprint25Router.get('/analytics/dashboards/:kind',async(req,res,next)=>{
  try{
    const kind=String(req.params.kind||'').toUpperCase() as AnalyticsDashboardKind;
    if(!['SAFETY','PRODUCT','BUSINESS','OUTCOME'].includes(kind)){
      return res.status(404).json({error:'Unknown governed analytics dashboard.'});
    }
    actor(req,kind==='SAFETY'?SAFETY_DASHBOARD_ROLES:ANALYTICS_ROLES);
    res.json(await GovernedAnalyticsDashboardService.get(kind));
  }catch(e){next(e);}
});

sprint25Router.get('/sprint-25/status',(_req,res)=>{
  res.json({
    sprint:25,
    title:'Analytics & Operational Intelligence',
    status:'IN_PROGRESS',
    runtime:getSprint25RuntimeStatus(),
    implemented:[
      'privacy_minimizing_event_ingestion',
      'analytics_event_contract_registry',
      'versioned_metric_registry',
      'cohort_suppression',
      'evidence_level_governance',
      'product_safety_business_outcome_dashboards',
      'experiment_safety_policy'
    ],
    pending:['postgres_runtime_smoke','full_sprint25_certification']
  });
});

export * from './runtime.js';
