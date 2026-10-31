import { DatabaseManager, getPool } from '../mindos/platform/database/index.js';
import { DataClassification } from '../mindos/platform/shared/data_classification.js';
import {
  AnalyticsAggregationService,
  AnalyticsMetricRegistry,
  AnalyticsRepository,
  GovernedAnalyticsIngestionService
} from '../mindos/analytics/index.js';
import { configureSprint25Runtime } from '../mindos/sprint25/runtime.js';

const status=await configureSprint25Runtime({usePostgres:true});
if(status.persistence!=='POSTGRES'||status.event_bridge!=='ACTIVE'){
  throw new Error('Sprint 25 PostgreSQL analytics runtime was not fully enabled.');
}
if(status.canonical_metric_definitions<30){
  throw new Error('Canonical metric registry was not persisted.');
}

const pool=getPool();
for(const table of ['analytics_events','analytics_metric_versions','analytics_metric_aggregates']){
  const r=await pool.query('SELECT to_regclass($1) AS name',['public.'+table]);
  if(!r.rows[0]?.name)throw new Error('Missing Sprint 25 table: '+table);
}

await GovernedAnalyticsIngestionService.ingestDomainEvent({
  event_id:'550e8400-e29b-41d4-a716-446655440025',
  event_type:'assessment.started',
  schema_version:1,
  occurred_at:'2026-10-31T08:00:00.000Z',
  producer:'assessments',
  producer_version:'1.0.0',
  aggregate_type:'assessment_session',
  aggregate_id:'assessment-session-runtime-smoke',
  correlation_id:'corr-sprint25',
  causation_id:'cause-sprint25',
  classification:DataClassification.HEALTH_SENSITIVE,
  jurisdiction:'KE',
  payload:{user_id:'runtime-smoke-user',score:99,journal_text:'must never persist'},
  metadata:{}
});

const events=await AnalyticsRepository.listEvents({event_types:['assessment.started']});
if(events.length<1)throw new Error('Sprint 25 minimized analytics event was not persisted.');
const serialized=JSON.stringify(events[0]);
if(serialized.includes('runtime-smoke-user')||serialized.includes('must never persist')||serialized.includes('"score":99')){
  throw new Error('Sprint 25 privacy transformer leaked protected event payload data.');
}

const def=await AnalyticsMetricRegistry.get('ASSESSMENT_COMPLETION');
await AnalyticsAggregationService.record({
  metric_code:def.code,
  metric_version:def.version,
  window_start:'2026-10-01T00:00:00.000Z',
  window_end:'2026-11-01T00:00:00.000Z',
  numerator:1,
  denominator:1,
  cohort_count:1,
  source_snapshot_ref:'runtime-smoke'
});

const aggregates=await AnalyticsRepository.listAggregates('ASSESSMENT_COMPLETION');
if(!aggregates[0]?.suppressed||aggregates[0]?.value!==undefined){
  throw new Error('Sprint 25 cohort suppression did not survive PostgreSQL persistence.');
}

const defs=await pool.query('SELECT COUNT(*)::int AS count FROM analytics_metric_versions');
const storedEvents=await pool.query('SELECT COUNT(*)::int AS count FROM analytics_events');
const storedAggs=await pool.query('SELECT COUNT(*)::int AS count FROM analytics_metric_aggregates');
if(Number(defs.rows[0]?.count||0)<30||Number(storedEvents.rows[0]?.count||0)<1||Number(storedAggs.rows[0]?.count||0)<1){
  throw new Error('Sprint 25 PostgreSQL persistence counts are incomplete.');
}

console.log('SPRINT 25 POSTGRES SMOKE PASSED',status);
await DatabaseManager.shutdown();
