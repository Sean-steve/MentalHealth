import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DataClassification } from '../mindos/platform/shared/data_classification.js';
import { DomainInvariantError } from '../mindos/platform/errors/index.js';
import { DatabaseManager } from '../mindos/platform/database/index.js';
import {
  AnalyticsAggregationService,
  AnalyticsEventContractRegistry,
  AnalyticsExperimentPolicy,
  AnalyticsMetricRegistry,
  AnalyticsRepository,
  GovernedAnalyticsDashboardService,
  GovernedAnalyticsIngestionService
} from '../mindos/analytics/index.js';
import { configureSprint25Runtime, resetSprint25RuntimeForTesting } from '../mindos/sprint25/runtime.js';

const envelope=(id:string,type:string,userId:string,classification=DataClassification.HEALTH_SENSITIVE,payload:Record<string,unknown>={})=>({
  event_id:id,event_type:type,schema_version:1,occurred_at:'2026-10-31T08:00:00.000Z',
  producer:type.split('.')[0],producer_version:'1.0.0',aggregate_type:'test',
  aggregate_id:'aggregate-'+id,correlation_id:'corr-'+id,causation_id:'cause-'+id,
  classification,jurisdiction:'KE',metadata:{},
  payload:{user_id:userId,...payload}
});

describe('MindOS Sprint 25 — Analytics & Operational Intelligence',()=>{
  beforeEach(async()=>{
    resetSprint25RuntimeForTesting();
    await configureSprint25Runtime({usePostgres:false});
  });

  after(async()=>{
    resetSprint25RuntimeForTesting();
    await DatabaseManager.shutdown();
  });

  it('reconciles the canonical analytics catalogue with outcome/safety alongside engagement metrics',async()=>{
    const codes=new Set((await AnalyticsMetricRegistry.list()).map(x=>x.code));
    for(const code of ['AI_USEFULNESS','AI_SAFETY_INTERVENTION_RATE','MSC','SAFETY_WORKFLOW_COMPLETION','COMMUNITY_HELPFULNESS','HARMFUL_CONTENT_RATE']){
      assert.equal(codes.has(code),true,code);
    }
  });

  it('minimizes health-sensitive domain events before ordinary analytics persistence',async()=>{
    const event=await GovernedAnalyticsIngestionService.ingestDomainEvent(envelope(
      '00000000-0000-4000-8000-000000000001','assessment.completed','user-private-123',
      DataClassification.HEALTH_SENSITIVE,
      {score:19,journal_text:'private narrative',email:'person@example.com'}
    ));
    assert.ok(event);
    assert.notEqual(event!.subject_pseudonym,'user-private-123');
    const serialized=JSON.stringify(event);
    assert.equal(serialized.includes('user-private-123'),false);
    assert.equal(serialized.includes('private narrative'),false);
    assert.equal(serialized.includes('person@example.com'),false);
    assert.equal(serialized.includes('"score":19'),false);
  });

  it('does not ingest uncontracted events into governed analytics',async()=>{
    const event=await GovernedAnalyticsIngestionService.ingestDomainEvent(envelope(
      '00000000-0000-4000-8000-000000000002','unknown.private_event','user-x'
    ));
    assert.equal(event,null);
    assert.equal((await AnalyticsRepository.listEvents()).length,0);
  });

  it('keeps metric methodology versions immutable and historical',async()=>{
    const v1=await AnalyticsMetricRegistry.get('ASSESSMENT_COMPLETION',1);
    const {id:_id,...base}=v1;
    const v2=await AnalyticsMetricRegistry.registerVersion({
      ...base,version:2,effective_from:'2026-11-01T00:00:00.000Z',
      governance_note:'Version 2 acceptance denominator governed separately.'
    });
    assert.equal(v2.version,2);
    assert.equal((await AnalyticsMetricRegistry.get('ASSESSMENT_COMPLETION',1)).governance_note,v1.governance_note);
    await assert.rejects(()=>AnalyticsMetricRegistry.registerVersion({...base,version:2,effective_from:'2026-11-02T00:00:00.000Z'}),DomainInvariantError);
  });

  it('rejects individual identifiers from aggregate dimensions',async()=>{
    await assert.rejects(()=>AnalyticsAggregationService.record({
      metric_code:'ASSESSMENT_COMPLETION',metric_version:1,
      window_start:'2026-10-01T00:00:00.000Z',window_end:'2026-11-01T00:00:00.000Z',
      dimensions:{user_id:'user-1'},numerator:1,denominator:1,cohort_count:20
    }),DomainInvariantError);
  });

  it('prevents a descriptive metric from being silently upgraded to causal evidence',async()=>{
    await assert.rejects(()=>AnalyticsAggregationService.record({
      metric_code:'ASSESSMENT_COMPLETION',metric_version:1,
      window_start:'2026-10-01T00:00:00.000Z',window_end:'2026-11-01T00:00:00.000Z',
      numerator:8,denominator:10,cohort_count:10,evidence_level:'CAUSAL'
    }),DomainInvariantError);
  });

  it('materializes a governed assessment completion rate when the cohort meets suppression policy',async()=>{
    for(let i=0;i<12;i++){
      const suffix=String(i+10).padStart(12,'0');
      await GovernedAnalyticsIngestionService.ingestDomainEvent(envelope(
        `10000000-0000-4000-8000-${suffix}`,'assessment.started',`user-${i}`
      ));
      if(i<9){
        await GovernedAnalyticsIngestionService.ingestDomainEvent(envelope(
          `20000000-0000-4000-8000-${suffix}`,'assessment.completed',`user-${i}`
        ));
      }
    }
    const all=await AnalyticsAggregationService.materializeKnownEventMetrics(
      '2026-10-01T00:00:00.000Z','2026-11-01T00:00:00.000Z'
    );
    const metric=all.find(x=>x.metric_code==='ASSESSMENT_COMPLETION')!;
    assert.equal(metric.suppressed,false);
    assert.equal(metric.numerator,9);
    assert.equal(metric.denominator,12);
    assert.equal(metric.value,0.75);

    const dashboard:any=await GovernedAnalyticsDashboardService.get('PRODUCT');
    const card=dashboard.metrics.find((x:any)=>x.code==='ASSESSMENT_COMPLETION');
    assert.equal(card.status,'AVAILABLE');
    assert.equal(card.value,0.75);
    assert.equal(dashboard.individual_profiles_exposed,false);
    assert.equal(dashboard.causal_claims_enabled,false);
  });

  it('suppresses small cohorts instead of leaking low-count mental-health analytics',async()=>{
    for(let i=0;i<3;i++){
      const suffix=String(i+50).padStart(12,'0');
      await GovernedAnalyticsIngestionService.ingestDomainEvent(envelope(
        `30000000-0000-4000-8000-${suffix}`,'assessment.started',`small-user-${i}`
      ));
      await GovernedAnalyticsIngestionService.ingestDomainEvent(envelope(
        `40000000-0000-4000-8000-${suffix}`,'assessment.completed',`small-user-${i}`
      ));
    }
    const values=await AnalyticsAggregationService.materializeKnownEventMetrics(
      '2026-10-01T00:00:00.000Z','2026-11-01T00:00:00.000Z'
    );
    const metric=values.find(x=>x.metric_code==='ASSESSMENT_COMPLETION')!;
    assert.equal(metric.suppressed,true);
    assert.equal(metric.value,undefined);
  });

  it('does not fabricate business dashboard values when finance-owned aggregates are absent',async()=>{
    const dashboard:any=await GovernedAnalyticsDashboardService.get('BUSINESS');
    assert.equal(dashboard.metrics.every((x:any)=>x.status==='NO_GOVERNED_DATA'&&x.value===null),true);
  });

  it('keeps safety false-positive/false-negative metrics governed rather than inferred from ordinary events',async()=>{
    const dashboard:any=await GovernedAnalyticsDashboardService.get('SAFETY');
    const fn=dashboard.metrics.find((x:any)=>x.code==='SAFETY_FALSE_NEGATIVE');
    const fp=dashboard.metrics.find((x:any)=>x.code==='SAFETY_FALSE_POSITIVE');
    assert.equal(fn.status,'NO_GOVERNED_DATA');
    assert.equal(fp.status,'NO_GOVERNED_DATA');
  });

  it('prohibits ordinary experiments from withholding crisis/safety controls',()=>{
    assert.throws(()=>AnalyticsExperimentPolicy.validate({
      key:'exp-safety',feature_area:'crisis resource presentation',primary_metric:'RESOURCE_USEFULNESS',
      harm_guardrail_metrics:['SAFETY_WORKFLOW_COMPLETION'],sample_eligibility:'all adults',
      duration_or_stopping_rule:'14 days',privacy_classification:DataClassification.INTERNAL
    }),DomainInvariantError);
  });

  it('prohibits pricing experiments from targeting inferred distress or vulnerability',()=>{
    assert.throws(()=>AnalyticsExperimentPolicy.validate({
      key:'exp-price',feature_area:'subscription pricing',primary_metric:'MRR',
      harm_guardrail_metrics:['CARE_CONNECTION_RATE'],sample_eligibility:'eligible subscribers',
      duration_or_stopping_rule:'14 days',privacy_classification:DataClassification.INTERNAL,
      pricing_experiment:true,targeting_dimensions:['inferred_distress_level']
    }),DomainInvariantError);
  });

  it('publishes a bounded analytics event-contract catalogue rather than accepting arbitrary domain payloads',()=>{
    const contracts=AnalyticsEventContractRegistry.list();
    assert.ok(contracts.find(x=>x.source_event_type==='assessment.completed'));
    assert.ok(contracts.find(x=>x.source_event_type==='safety.state_changed'));
    assert.equal(contracts.some(x=>x.allow_payload_properties),false);
  });
});
