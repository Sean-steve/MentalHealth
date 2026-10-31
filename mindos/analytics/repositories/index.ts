import { IAnalyticsRepository } from './interfaces.js';
import { InMemoryAnalyticsRepository } from './in_memory.js';

let active:IAnalyticsRepository=new InMemoryAnalyticsRepository();

export const AnalyticsRepository:IAnalyticsRepository={
  saveEvent:e=>active.saveEvent(e),
  listEvents:c=>active.listEvents(c),
  saveMetricDefinition:d=>active.saveMetricDefinition(d),
  listMetricDefinitions:c=>active.listMetricDefinitions(c),
  saveAggregate:a=>active.saveAggregate(a),
  listAggregates:c=>active.listAggregates(c),
  reset:()=>active.reset?.()
};

export function setAnalyticsRepository(repo:IAnalyticsRepository):void{active=repo;}
export function resetAnalyticsRepository():void{active=new InMemoryAnalyticsRepository();}

export * from './interfaces.js';
export * from './in_memory.js';
export * from './pg_analytics_repository.js';
