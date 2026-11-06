import { getPool } from '../../platform/database/index.js';
import { IAvailabilityRepository } from './interfaces.js';
import { ProviderSchedulingProfile,AvailabilityRule,AvailabilityException,ScheduleBlock,AppointmentHold,CancellationPolicy } from '../domain/types.js';

type Kind='PROFILE'|'RULE'|'EXCEPTION'|'BLOCK'|'HOLD'|'CANCELLATION_POLICY';
const val=<T>(x:any):T=>(typeof x==='string'?JSON.parse(x):x) as T;

export class PgAvailabilityRepository implements IAvailabilityRepository{
  private async save(kind:Kind,id:string,v:any,meta:{provider?:string;service?:string;idem?:string;source?:string;start?:string;end?:string;status?:string}={}){
    await getPool().query(`INSERT INTO availability_runtime_entities(entity_type,entity_id,provider_id,service_offering_id,idempotency_key,source_reference,start_at,end_at,status,payload,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,NOW())
    ON CONFLICT(entity_type,entity_id) DO UPDATE SET provider_id=EXCLUDED.provider_id,service_offering_id=EXCLUDED.service_offering_id,idempotency_key=EXCLUDED.idempotency_key,source_reference=EXCLUDED.source_reference,start_at=EXCLUDED.start_at,end_at=EXCLUDED.end_at,status=EXCLUDED.status,payload=EXCLUDED.payload,updated_at=NOW()`,
    [kind,id,meta.provider||null,meta.service||null,meta.idem||null,meta.source||null,meta.start||null,meta.end||null,meta.status||null,JSON.stringify(v)]);return v;
  }
  private async one<T>(kind:Kind,id:string){const r=await getPool().query('SELECT payload FROM availability_runtime_entities WHERE entity_type=$1 AND entity_id=$2',[kind,id]);return r.rows[0]?val<T>(r.rows[0].payload):null;}
  async getProfileByProviderId(id:string){const r=await getPool().query("SELECT payload FROM availability_runtime_entities WHERE entity_type='PROFILE' AND provider_id=$1 LIMIT 1",[id]);return r.rows[0]?val<ProviderSchedulingProfile>(r.rows[0].payload):null;}
  async saveProfile(v:ProviderSchedulingProfile){return this.save('PROFILE',v.id,v,{provider:v.provider_id,status:v.status});}
  async getRulesByProviderId(id:string){const r=await getPool().query("SELECT payload FROM availability_runtime_entities WHERE entity_type='RULE' AND provider_id=$1 AND status='ACTIVE' ORDER BY entity_id",[id]);return r.rows.map((x:any)=>val<AvailabilityRule>(x.payload));}
  async saveRule(v:AvailabilityRule){return this.save('RULE',v.id,v,{provider:v.provider_id,service:v.service_offering_id,status:v.status});}
  async deleteRule(id:string){await getPool().query("DELETE FROM availability_runtime_entities WHERE entity_type='RULE' AND entity_id=$1",[id]);}
  async getExceptionsByProvider(id:string,start:string,end:string){const r=await getPool().query("SELECT payload FROM availability_runtime_entities WHERE entity_type='EXCEPTION' AND provider_id=$1 AND status='ACTIVE' AND start_at < $3 AND end_at > $2 ORDER BY start_at",[id,start,end]);return r.rows.map((x:any)=>val<AvailabilityException>(x.payload));}
  async saveException(v:AvailabilityException){return this.save('EXCEPTION',v.id,v,{provider:v.provider_id,service:v.service_offering_id,start:v.start_at,end:v.end_at,status:v.status});}
  async getScheduleBlocksByProvider(id:string,start:string,end:string){const r=await getPool().query("SELECT payload FROM availability_runtime_entities WHERE entity_type='BLOCK' AND provider_id=$1 AND status='ACTIVE' AND start_at < $3 AND end_at > $2 ORDER BY start_at",[id,start,end]);return r.rows.map((x:any)=>val<ScheduleBlock>(x.payload));}
  async saveScheduleBlock(v:ScheduleBlock){return this.save('BLOCK',v.id,v,{provider:v.provider_id,source:v.source_reference,start:v.start_at,end:v.end_at,status:String(v.status)});}
  async releaseScheduleBlockBySource(ref:string){const r=await getPool().query("SELECT entity_id,payload FROM availability_runtime_entities WHERE entity_type='BLOCK' AND source_reference=$1",[ref]);for(const x of r.rows){const v=val<ScheduleBlock>(x.payload) as any;v.status='RELEASED';await this.save('BLOCK',x.entity_id,v,{provider:v.provider_id,source:v.source_reference,start:v.start_at,end:v.end_at,status:'RELEASED'});}}
  async getHoldById(id:string){return this.one<AppointmentHold>('HOLD',id);}
  async getHoldByIdempotencyKey(key:string){const r=await getPool().query("SELECT payload FROM availability_runtime_entities WHERE entity_type='HOLD' AND idempotency_key=$1 LIMIT 1",[key]);return r.rows[0]?val<AppointmentHold>(r.rows[0].payload):null;}
  async getActiveHoldsByProvider(id:string,start:string,end:string){const r=await getPool().query("SELECT payload FROM availability_runtime_entities WHERE entity_type='HOLD' AND provider_id=$1 AND status='ACTIVE' AND start_at < $3 AND end_at > $2 AND (payload->>'expires_at')::timestamptz > NOW()",[id,start,end]);return r.rows.map((x:any)=>val<AppointmentHold>(x.payload));}
  async saveHold(v:AppointmentHold){return this.save('HOLD',v.id,v,{provider:v.provider_id,service:v.service_offering_id,idem:v.idempotency_key,start:v.start_at,end:v.end_at,status:String(v.status)});}
  async updateHold(v:AppointmentHold){return this.saveHold(v);}
  async getCancellationPolicy(id:string){return this.one<CancellationPolicy>('CANCELLATION_POLICY',id);}
  async getDefaultCancellationPolicy(){const r=await getPool().query("SELECT payload FROM availability_runtime_entities WHERE entity_type='CANCELLATION_POLICY' AND status='ACTIVE' ORDER BY updated_at LIMIT 1");if(r.rows[0])return val<CancellationPolicy>(r.rows[0].payload);const v:CancellationPolicy={id:'cp-standard-24h',policy_code:'STANDARD_24H',name:'Standard 24-Hour Notice Policy',user_cancellation_cutoff_hours:24,late_cancellation_fee_permitted:false,provider_cancellation_rules:{auto_reschedule_offered:true,continuity_alert:true},status:'ACTIVE',created_at:new Date().toISOString()};return this.saveCancellationPolicy(v);}
  async saveCancellationPolicy(v:CancellationPolicy){return this.save('CANCELLATION_POLICY',v.id,v,{status:v.status});}
}
