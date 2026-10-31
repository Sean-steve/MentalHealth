import { EventBus } from '../../platform/events/index.js';
import { AnalyticsEventContractRegistry } from '../governance/event_contract_registry.js';
import { GovernedAnalyticsIngestionService } from './ingestion_service.js';

let unsubscribe:(()=>void)|undefined;

export class AnalyticsEventBridge{
  static start():void{
    if(unsubscribe)return;
    unsubscribe=EventBus.subscribe<Record<string,unknown>>('*',async event=>{
      if(!AnalyticsEventContractRegistry.get(event.event_type))return;
      await GovernedAnalyticsIngestionService.ingestDomainEvent(event);
    });
  }
  static stop():void{
    if(unsubscribe){unsubscribe();unsubscribe=undefined;}
  }
}
