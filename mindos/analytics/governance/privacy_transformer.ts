import { createHash } from 'node:crypto';
import { DomainInvariantError } from '../../platform/errors/index.js';
import { DomainEventEnvelope } from '../../platform/events/types.js';
import { isProhibitedFromOrdinaryAnalytics } from '../../platform/shared/data_classification.js';
import { GovernedAnalyticsEvent } from '../domain/types.js';
import { AnalyticsEventContractRegistry } from './event_contract_registry.js';

const FORBIDDEN_KEY=/(journal|message|content|note|answer|response_text|prompt|diagnosis|symptom|score|measurement|clinical_text|email|phone|address|token|secret|name)/i;
const IDENTIFIER_KEY=/^(user_id|subject_user_id|account_id|patient_id|client_id|professional_id)$/i;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE=/^\+?[0-9 ()-]{7,}$/;

function analyticsSalt():string{
  const value=process.env.ANALYTICS_PSEUDONYM_SALT||process.env.AUDIT_INTEGRITY_SALT||process.env.SESSION_SECRET;
  if(!value&&process.env.NODE_ENV==='production'){
    throw new DomainInvariantError('ANALYTICS_PSEUDONYM_SALT is required in production.');
  }
  return value||'mindos-test-analytics-salt';
}

function uuidFromHash(input:string):string{
  const h=createHash('sha256').update(input).digest('hex').slice(0,32).split('');
  h[12]='4';
  h[16]=((parseInt(h[16],16)&0x3)|0x8).toString(16);
  const x=h.join('');
  return `${x.slice(0,8)}-${x.slice(8,12)}-${x.slice(12,16)}-${x.slice(16,20)}-${x.slice(20)}`;
}

function refHash(input:string):string{
  return createHash('sha256').update(`${analyticsSalt()}|ref|${input}`).digest('hex');
}

function subjectId(payload:Record<string,unknown>):string|undefined{
  for(const [key,value] of Object.entries(payload)){
    if(IDENTIFIER_KEY.test(key)&&typeof value==='string'&&value)return value;
  }
  return undefined;
}

function sanitize(value:unknown,depth=0):unknown{
  if(depth>3)return undefined;
  if(value===null||typeof value==='number'||typeof value==='boolean')return value;
  if(typeof value==='string'){
    if(value.length>120||EMAIL.test(value)||PHONE.test(value))return undefined;
    return value;
  }
  if(Array.isArray(value))return value.map(v=>sanitize(v,depth+1)).filter(v=>v!==undefined).slice(0,20);
  if(typeof value==='object'){
    const out:Record<string,unknown>={};
    for(const [key,val] of Object.entries(value as Record<string,unknown>)){
      if(FORBIDDEN_KEY.test(key)||IDENTIFIER_KEY.test(key))continue;
      const clean=sanitize(val,depth+1);
      if(clean!==undefined)out[key]=clean;
    }
    return out;
  }
  return undefined;
}

export class AnalyticsPrivacyTransformer{
  static transform(event:DomainEventEnvelope<Record<string,unknown>>):GovernedAnalyticsEvent|null{
    const contract=AnalyticsEventContractRegistry.get(event.event_type);
    if(!contract)return null;

    const payload=event.payload||{};
    const sid=subjectId(payload);
    const prohibited=isProhibitedFromOrdinaryAnalytics(event.classification);
    const safePayload=(!prohibited&&contract.allow_payload_properties)
      ? (sanitize(payload) as Record<string,unknown>)
      : {};

    return {
      event_id:event.event_id,
      event_type:event.event_type,
      subject_pseudonym:sid?uuidFromHash(`${analyticsSalt()}|subject|${sid}`):undefined,
      session_id:undefined,
      domain:event.producer,
      object_ref_hash:event.aggregate_id?refHash(event.aggregate_id):undefined,
      properties:{
        ...safePayload,
        source_event_type:event.event_type,
        source_domain:event.producer,
        jurisdiction:event.jurisdiction,
        classification:event.classification,
        metric_codes:[...contract.metric_codes]
      },
      consent_context:{
        context_source:'DOMAIN_EVENT',
        consent_receipt_ref:null,
        processing_policy_version:'analytics-v1',
        purpose:contract.purpose
      },
      occurred_at:event.occurred_at,
      schema_version:event.schema_version
    };
  }
}
