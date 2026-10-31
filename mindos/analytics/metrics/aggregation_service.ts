import { createHash } from 'node:crypto';
import { DomainInvariantError } from '../../platform/errors/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { AnalyticsMetricAggregate, AnalyticsEvidenceLevel } from '../domain/types.js';
import { AnalyticsRepository } from '../repositories/index.js';
import { AnalyticsMetricRegistry } from './metric_registry.js';

const ID_DIMENSION=/(user|subject|patient|client|professional|pseudonym|email|phone|account).*id|email|phone/i;
const evidenceRank:Record<AnalyticsEvidenceLevel,number>={DESCRIPTIVE:0,CORRELATIONAL:1,COMPARATIVE:2,CAUSAL:3};

const stable=(o:Record<string,string>):string=>JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b))));

export class AnalyticsAggregationService{
  static async record(input:{
    metric_code:string;
    metric_version:number;
    window_start:string;
    window_end:string;
    dimensions?:Record<string,string>;
    numerator?:number;
    denominator?:number;
    value?:number;
    cohort_count:number;
    evidence_level?:AnalyticsEvidenceLevel;
    source_snapshot_ref?:string;
  }):Promise<AnalyticsMetricAggregate>{
    const def=await AnalyticsMetricRegistry.get(input.metric_code,input.metric_version);
    if(Date.parse(input.window_end)<=Date.parse(input.window_start))throw new DomainInvariantError('Analytics window_end must be after window_start.');
    const dimensions=input.dimensions||{};
    if(Object.keys(dimensions).some(k=>ID_DIMENSION.test(k))){
      throw new DomainInvariantError('Individual identifiers are prohibited from dashboard aggregate dimensions.');
    }
    const evidence=input.evidence_level||def.evidence_level;
    if(evidenceRank[evidence]>evidenceRank[def.evidence_level]){
      throw new DomainInvariantError('Aggregate evidence level cannot exceed the governed metric definition.');
    }
    if(evidence==='CAUSAL'&&def.evidence_level!=='CAUSAL'){
      throw new DomainInvariantError('Causal language requires a metric definition explicitly governed for causal evidence.');
    }
    const suppressed=input.cohort_count<def.min_cohort_size;
    const computedValue=input.value!==undefined
      ? input.value
      : input.denominator!==undefined&&input.denominator>0&&input.numerator!==undefined
        ? input.numerator/input.denominator
        : input.numerator;
    const idempotencyKey=createHash('sha256').update([
      def.code,def.version,input.window_start,input.window_end,stable(dimensions)
    ].join('|')).digest('hex');
    const aggregate:AnalyticsMetricAggregate={
      id:generateUUIDv7(),idempotency_key:idempotencyKey,metric_code:def.code,metric_version:def.version,
      window_start:input.window_start,window_end:input.window_end,dimensions,
      numerator:input.numerator,denominator:input.denominator,
      value:suppressed?undefined:computedValue,cohort_count:input.cohort_count,
      suppressed,suppression_reason:suppressed?`COHORT_BELOW_MINIMUM_${def.min_cohort_size}`:undefined,
      evidence_level:evidence,computed_at:new Date().toISOString(),source_snapshot_ref:input.source_snapshot_ref
    };
    await AnalyticsRepository.saveAggregate(aggregate);
    return aggregate;
  }

  static async materializeKnownEventMetrics(windowStart:string,windowEnd:string):Promise<AnalyticsMetricAggregate[]>{
    const mappings=[
      {code:'ASSESSMENT_COMPLETION',num:['assessment.completed'],den:['assessment.started']},
      {code:'BOOKING_COMPLETION_RATE',num:['appointment.confirmed'],den:['appointment.created']},
      {code:'APPOINTMENT_ATTENDANCE',num:['appointment.completed'],den:['appointment.confirmed']}
    ];
    const output:AnalyticsMetricAggregate[]=[];
    for(const map of mappings){
      const def=await AnalyticsMetricRegistry.get(map.code);
      const events=await AnalyticsRepository.listEvents({event_types:[...map.num,...map.den],start_at:windowStart,end_at:windowEnd});
      const numerator=events.filter(x=>map.num.includes(x.event_type)).length;
      const denominator=events.filter(x=>map.den.includes(x.event_type)).length;
      const cohort=new Set(events.map(x=>x.subject_pseudonym).filter(Boolean)).size;
      output.push(await this.record({
        metric_code:def.code,metric_version:def.version,window_start:windowStart,window_end:windowEnd,
        numerator,denominator,cohort_count:cohort,evidence_level:'DESCRIPTIVE',
        source_snapshot_ref:`events:${map.num.join('+')}|${map.den.join('+')}`
      }));
    }
    return output;
  }
}
