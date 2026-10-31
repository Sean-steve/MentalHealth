import { getPool } from '../../platform/database/index.js';
import {
  AnalyticsMetricAggregate,
  AnalyticsMetricDefinitionVersion,
  GovernedAnalyticsEvent
} from '../domain/types.js';
import { AnalyticsEventCriteria, IAnalyticsRepository } from './interfaces.js';

const parse=<T>(v:unknown,fallback:T):T=>{
  if(v===null||v===undefined)return fallback;
  if(typeof v!=='string')return v as T;
  try{return JSON.parse(v) as T;}catch{return fallback;}
};

export class PgAnalyticsRepository implements IAnalyticsRepository{
  async saveEvent(e:GovernedAnalyticsEvent):Promise<void>{
    await getPool().query(
      `INSERT INTO analytics_events
       (event_id,event_type,subject_pseudonym,session_id,domain,object_ref_hash,properties,consent_context,occurred_at,schema_version)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10)
       ON CONFLICT(event_id) DO NOTHING`,
      [e.event_id,e.event_type,e.subject_pseudonym||null,e.session_id||null,e.domain,e.object_ref_hash||null,
       JSON.stringify(e.properties),JSON.stringify(e.consent_context),e.occurred_at,e.schema_version]
    );
  }
  async listEvents(criteria:AnalyticsEventCriteria={}):Promise<GovernedAnalyticsEvent[]>{
    const clauses:string[]=[];const values:any[]=[];
    const add=(sql:string,value:any)=>{values.push(value);clauses.push(sql.replace('?',`$${values.length}`));};
    if(criteria.event_types?.length)add('event_type = ANY(?::text[])',criteria.event_types);
    if(criteria.start_at)add('occurred_at >= ?',criteria.start_at);
    if(criteria.end_at)add('occurred_at < ?',criteria.end_at);
    const where=clauses.length?` WHERE ${clauses.join(' AND ')}`:'';
    const r=await getPool().query(`SELECT * FROM analytics_events${where} ORDER BY occurred_at ASC,event_id ASC`,values);
    return r.rows.map((x:any)=>({
      event_id:x.event_id,event_type:x.event_type,subject_pseudonym:x.subject_pseudonym||undefined,
      session_id:x.session_id||undefined,domain:x.domain,object_ref_hash:x.object_ref_hash||undefined,
      properties:parse(x.properties,{}),consent_context:parse(x.consent_context,{}),
      occurred_at:x.occurred_at,schema_version:Number(x.schema_version)
    }));
  }
  async saveMetricDefinition(d:AnalyticsMetricDefinitionVersion):Promise<void>{
    await getPool().query(
      `INSERT INTO analytics_metric_versions
       (id,code,version,name,definition,domain,cadence,governance_note,owner,source_refs,classification,
        evidence_level,min_cohort_size,effective_from,retired_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15)
       ON CONFLICT(code,version) DO NOTHING`,
      [d.id,d.code,d.version,d.name,d.definition,d.domain,d.cadence,d.governance_note,d.owner,
       JSON.stringify(d.source_refs),d.classification,d.evidence_level,d.min_cohort_size,d.effective_from,d.retired_at||null]
    );
  }
  async listMetricDefinitions(code?:string):Promise<AnalyticsMetricDefinitionVersion[]>{
    const r=code
      ? await getPool().query('SELECT * FROM analytics_metric_versions WHERE code=$1 ORDER BY version ASC',[code])
      : await getPool().query('SELECT * FROM analytics_metric_versions ORDER BY code ASC,version ASC');
    return r.rows.map((x:any)=>({...x,version:Number(x.version),min_cohort_size:Number(x.min_cohort_size),
      source_refs:parse(x.source_refs,[]),retired_at:x.retired_at||undefined}));
  }
  async saveAggregate(a:AnalyticsMetricAggregate):Promise<void>{
    await getPool().query(
      `INSERT INTO analytics_metric_aggregates
       (id,idempotency_key,metric_code,metric_version,window_start,window_end,dimensions,numerator,denominator,
        value,cohort_count,suppressed,suppression_reason,evidence_level,computed_at,source_snapshot_ref)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT(idempotency_key) DO NOTHING`,
      [a.id,a.idempotency_key,a.metric_code,a.metric_version,a.window_start,a.window_end,JSON.stringify(a.dimensions),
       a.numerator??null,a.denominator??null,a.value??null,a.cohort_count,a.suppressed,
       a.suppression_reason||null,a.evidence_level,a.computed_at,a.source_snapshot_ref||null]
    );
  }
  async listAggregates(metricCode?:string):Promise<AnalyticsMetricAggregate[]>{
    const r=metricCode
      ? await getPool().query('SELECT * FROM analytics_metric_aggregates WHERE metric_code=$1 ORDER BY computed_at DESC',[metricCode])
      : await getPool().query('SELECT * FROM analytics_metric_aggregates ORDER BY computed_at DESC');
    return r.rows.map((x:any)=>({...x,metric_version:Number(x.metric_version),dimensions:parse(x.dimensions,{}),
      numerator:x.numerator===null?undefined:Number(x.numerator),denominator:x.denominator===null?undefined:Number(x.denominator),
      value:x.value===null?undefined:Number(x.value),cohort_count:Number(x.cohort_count),suppressed:Boolean(x.suppressed),
      suppression_reason:x.suppression_reason||undefined,source_snapshot_ref:x.source_snapshot_ref||undefined}));
  }
}
