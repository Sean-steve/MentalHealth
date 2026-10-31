import {
  AnalyticsMetricAggregate,
  AnalyticsMetricDefinitionVersion,
  GovernedAnalyticsEvent
} from '../domain/types.js';
import { AnalyticsEventCriteria, IAnalyticsRepository } from './interfaces.js';

export class InMemoryAnalyticsRepository implements IAnalyticsRepository{
  private events=new Map<string,GovernedAnalyticsEvent>();
  private definitions=new Map<string,AnalyticsMetricDefinitionVersion>();
  private aggregates=new Map<string,AnalyticsMetricAggregate>();

  async saveEvent(event:GovernedAnalyticsEvent):Promise<void>{
    if(!this.events.has(event.event_id))this.events.set(event.event_id,structuredClone(event));
  }
  async listEvents(criteria:AnalyticsEventCriteria={}):Promise<GovernedAnalyticsEvent[]>{
    return [...this.events.values()]
      .filter(x=>!criteria.event_types?.length||criteria.event_types.includes(x.event_type))
      .filter(x=>!criteria.start_at||Date.parse(x.occurred_at)>=Date.parse(criteria.start_at))
      .filter(x=>!criteria.end_at||Date.parse(x.occurred_at)<Date.parse(criteria.end_at))
      .sort((a,b)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at))
      .map(x=>structuredClone(x));
  }
  async saveMetricDefinition(definition:AnalyticsMetricDefinitionVersion):Promise<void>{
    const key=`${definition.code}:v${definition.version}`;
    const existing=this.definitions.get(key);
    if(existing&&JSON.stringify(existing)!==JSON.stringify(definition)){
      throw new Error(`Conflicting metric definition version: ${key}`);
    }
    if(!existing)this.definitions.set(key,structuredClone(definition));
  }
  async listMetricDefinitions(code?:string):Promise<AnalyticsMetricDefinitionVersion[]>{
    return [...this.definitions.values()]
      .filter(x=>!code||x.code===code)
      .sort((a,b)=>a.code.localeCompare(b.code)||a.version-b.version)
      .map(x=>structuredClone(x));
  }
  async saveAggregate(aggregate:AnalyticsMetricAggregate):Promise<void>{
    if(!this.aggregates.has(aggregate.idempotency_key)){
      this.aggregates.set(aggregate.idempotency_key,structuredClone(aggregate));
    }
  }
  async listAggregates(metricCode?:string):Promise<AnalyticsMetricAggregate[]>{
    return [...this.aggregates.values()]
      .filter(x=>!metricCode||x.metric_code===metricCode)
      .sort((a,b)=>Date.parse(b.computed_at)-Date.parse(a.computed_at))
      .map(x=>structuredClone(x));
  }
  reset():void{
    this.events.clear();this.definitions.clear();this.aggregates.clear();
  }
}
