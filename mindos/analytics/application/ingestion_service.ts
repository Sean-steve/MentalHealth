import { DomainEventEnvelope } from '../../platform/events/types.js';
import { AnalyticsRepository } from '../repositories/index.js';
import { AnalyticsPrivacyTransformer } from '../governance/privacy_transformer.js';
import { GovernedAnalyticsEvent } from '../domain/types.js';

export class GovernedAnalyticsIngestionService{
  static async ingestDomainEvent(event:DomainEventEnvelope<Record<string,unknown>>):Promise<GovernedAnalyticsEvent|null>{
    const transformed=AnalyticsPrivacyTransformer.transform(event);
    if(!transformed)return null;
    await AnalyticsRepository.saveEvent(transformed);
    return transformed;
  }
}
