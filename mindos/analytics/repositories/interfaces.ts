import {
  AnalyticsMetricAggregate,
  AnalyticsMetricDefinitionVersion,
  GovernedAnalyticsEvent
} from '../domain/types.js';

export interface AnalyticsEventCriteria{
  event_types?:string[];
  start_at?:string;
  end_at?:string;
}

export interface IAnalyticsRepository{
  saveEvent(event:GovernedAnalyticsEvent):Promise<void>;
  listEvents(criteria?:AnalyticsEventCriteria):Promise<GovernedAnalyticsEvent[]>;
  saveMetricDefinition(definition:AnalyticsMetricDefinitionVersion):Promise<void>;
  listMetricDefinitions(code?:string):Promise<AnalyticsMetricDefinitionVersion[]>;
  saveAggregate(aggregate:AnalyticsMetricAggregate):Promise<void>;
  listAggregates(metricCode?:string):Promise<AnalyticsMetricAggregate[]>;
  reset?():void|Promise<void>;
}
