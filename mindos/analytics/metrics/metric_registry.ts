import { DomainInvariantError, NotFoundError } from '../../platform/errors/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { AnalyticsMetricDefinitionVersion } from '../domain/types.js';
import { AnalyticsRepository } from '../repositories/index.js';
import { CANONICAL_METRIC_CATALOG } from './canonical_metric_catalog.js';

export class AnalyticsMetricRegistry{
  static async initializeCanonical():Promise<number>{
    let count=0;
    for(const seed of CANONICAL_METRIC_CATALOG){
      const existing=(await AnalyticsRepository.listMetricDefinitions(seed.code)).find(x=>x.version===1);
      if(existing)continue;
      await AnalyticsRepository.saveMetricDefinition({
        ...seed,id:generateUUIDv7(),version:1,effective_from:'2026-09-04T00:00:00.000Z'
      });
      count++;
    }
    return count;
  }

  static async registerVersion(input:Omit<AnalyticsMetricDefinitionVersion,'id'>):Promise<AnalyticsMetricDefinitionVersion>{
    if(input.min_cohort_size<1)throw new DomainInvariantError('Metric min_cohort_size must be at least 1.');
    if(!input.source_refs.length)throw new DomainInvariantError('Metric source_refs are required.');
    const versions=await AnalyticsRepository.listMetricDefinitions(input.code);
    const same=versions.find(x=>x.version===input.version);
    if(same)throw new DomainInvariantError('Metric definition version already exists and is immutable.');
    const latest=versions.sort((a,b)=>b.version-a.version)[0];
    if(latest&&input.version<=latest.version)throw new DomainInvariantError('Metric versions must increase monotonically.');
    const value={...input,id:generateUUIDv7()};
    await AnalyticsRepository.saveMetricDefinition(value);
    return value;
  }

  static async get(code:string,version?:number):Promise<AnalyticsMetricDefinitionVersion>{
    const values=await AnalyticsRepository.listMetricDefinitions(code);
    const value=version===undefined
      ? values.filter(x=>!x.retired_at).sort((a,b)=>b.version-a.version)[0]
      : values.find(x=>x.version===version);
    if(!value)throw new NotFoundError('Analytics metric definition not found.');
    return value;
  }

  static async list():Promise<AnalyticsMetricDefinitionVersion[]>{
    return AnalyticsRepository.listMetricDefinitions();
  }
}
