import { ReliabilityCriticality } from '../domain/types.js';

export type DependencyKey='AI_PROVIDER'|'PAYMENT_PROVIDER'|'NOTIFICATION_PROVIDER'|'SEARCH'|'ANALYTICS'|'COMMUNITY'|'PRIMARY_DB';
export type DependencyState='UP'|'DEGRADED'|'DOWN';

export interface DegradationDecision{
  dependency:DependencyKey;
  state:DependencyState;
  safety_static_path_available:boolean;
  primary_behavior:string;
  write_mode:'NORMAL'|'SAFE_MODE'|'UNCHANGED';
  shed_criticalities:ReliabilityCriticality[];
  prohibited_claims:string[];
}

const HIERARCHY:ReliabilityCriticality[]=[
  'SAFETY','DATA_INTEGRITY','PRIVACY_SECURITY','IDENTITY_CORE','CARE','AI_COMMUNITY','ANALYTICS_EXPERIMENTS'
];

export class ReliabilityPolicyEngine{
  static hierarchy():ReliabilityCriticality[]{return [...HIERARCHY];}

  static evaluate(dependency:DependencyKey,state:DependencyState):DegradationDecision{
    if(state==='UP')return {
      dependency,state,safety_static_path_available:true,primary_behavior:'NORMAL_OPERATION',
      write_mode:'NORMAL',shed_criticalities:[],prohibited_claims:[]
    };
    const common={dependency,state,safety_static_path_available:true as const};
    switch(dependency){
      case 'AI_PROVIDER': return {...common,primary_behavior:'APPROVED_NON_AI_SUPPORT_OR_ALTERNATE_ROUTE',write_mode:'UNCHANGED',shed_criticalities:['AI_COMMUNITY','ANALYTICS_EXPERIMENTS'],prohibited_claims:['AI_REQUIRED_FOR_SAFETY']};
      case 'PAYMENT_PROVIDER': return {...common,primary_behavior:'CHECKOUT_PENDING_RECONCILABLE_FREE_AND_SAFETY_ACCESS_CONTINUES',write_mode:'UNCHANGED',shed_criticalities:['ANALYTICS_EXPERIMENTS'],prohibited_claims:['PAYMENT_SUCCESS_WITHOUT_PROVIDER_CONFIRMATION']};
      case 'NOTIFICATION_PROVIDER': return {...common,primary_behavior:'IN_APP_STATE_AUTHORITATIVE_RETRY_OR_DLQ',write_mode:'UNCHANGED',shed_criticalities:['ANALYTICS_EXPERIMENTS'],prohibited_claims:['SENT_WITHOUT_DELIVERY_EVIDENCE']};
      case 'SEARCH': return {...common,primary_behavior:'DIRECT_DIRECTORY_OR_FILTER_FALLBACK_NO_STALE_ELIGIBILITY',write_mode:'UNCHANGED',shed_criticalities:['ANALYTICS_EXPERIMENTS'],prohibited_claims:['STALE_PROFESSIONAL_OR_RESOURCE_ELIGIBILITY']};
      case 'ANALYTICS': return {...common,primary_behavior:'TRANSACTIONAL_PRODUCT_CONTINUES_EVENTS_SPOOL_OR_DLQ',write_mode:'UNCHANGED',shed_criticalities:['ANALYTICS_EXPERIMENTS'],prohibited_claims:['ANALYTICS_REQUIRED_FOR_CORE_TRANSACTION']};
      case 'COMMUNITY': return {...common,primary_behavior:'CARE_SAFETY_AND_CONTENT_REMAIN_INDEPENDENT',write_mode:'UNCHANGED',shed_criticalities:['AI_COMMUNITY','ANALYTICS_EXPERIMENTS'],prohibited_claims:['COMMUNITY_REQUIRED_FOR_SAFETY']};
      case 'PRIMARY_DB': return {...common,primary_behavior:'FAILOVER_OR_MAINTENANCE_WITH_STATIC_SAFETY_PATH',write_mode:'SAFE_MODE',shed_criticalities:['ANALYTICS_EXPERIMENTS','AI_COMMUNITY'],prohibited_claims:['WRITE_SUCCESS_WHILE_CONSISTENCY_UNCERTAIN']};
    }
  }

  static mayAdmit(workload:ReliabilityCriticality,overload:boolean):boolean{
    if(!overload)return true;
    return workload!=='ANALYTICS_EXPERIMENTS';
  }

  static protectedUnderBackpressure(workload:ReliabilityCriticality):boolean{
    return workload==='SAFETY'||workload==='DATA_INTEGRITY'||workload==='PRIVACY_SECURITY';
  }
}
