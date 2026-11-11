import { getPool } from '../../platform/database/index.js';
import { IAppointmentRepository } from './interfaces.js';
import {
  AppointmentEntity,AppointmentRescheduleEntity,AppointmentAttendanceEntity,AppointmentWaitlistEntryEntity,
  WaitlistOfferEntity,AppointmentReminderEntity,VirtualSessionEntity
} from '../domain/types.js';

type Kind='APPOINTMENT'|'RESCHEDULE'|'ATTENDANCE'|'WAITLIST_ENTRY'|'WAITLIST_OFFER'|'REMINDER'|'VIRTUAL_SESSION';
const val=<T>(x:any):T=>(typeof x==='string'?JSON.parse(x):x) as T;

export class PgAppointmentRepository implements IAppointmentRepository{
  private async save(kind:Kind,id:string,v:any,m:{provider?:string;subject?:string;appointment?:string;service?:string;idem?:string;start?:string;end?:string;scheduled?:string;expires?:string;status?:string}={}){
    await getPool().query(`INSERT INTO appointment_runtime_entities(entity_type,entity_id,provider_id,subject_user_id,appointment_id,service_offering_id,idempotency_key,start_at,end_at,scheduled_for,expires_at,status,payload,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,NOW())
    ON CONFLICT(entity_type,entity_id) DO UPDATE SET provider_id=EXCLUDED.provider_id,subject_user_id=EXCLUDED.subject_user_id,appointment_id=EXCLUDED.appointment_id,service_offering_id=EXCLUDED.service_offering_id,idempotency_key=EXCLUDED.idempotency_key,start_at=EXCLUDED.start_at,end_at=EXCLUDED.end_at,scheduled_for=EXCLUDED.scheduled_for,expires_at=EXCLUDED.expires_at,status=EXCLUDED.status,payload=EXCLUDED.payload,updated_at=NOW()`,
    [kind,id,m.provider||null,m.subject||null,m.appointment||null,m.service||null,m.idem||null,m.start||null,m.end||null,m.scheduled||null,m.expires||null,m.status||null,JSON.stringify(v)]);return v;
  }
  private async one<T>(kind:Kind,id:string){const r=await getPool().query('SELECT payload FROM appointment_runtime_entities WHERE entity_type=$1 AND entity_id=$2',[kind,id]);return r.rows[0]?val<T>(r.rows[0].payload):null;}
  async getAppointmentById(id:string){return this.one<AppointmentEntity>('APPOINTMENT',id);}
  async getAppointmentByIdempotencyKey(key:string){const r=await getPool().query("SELECT payload FROM appointment_runtime_entities WHERE entity_type='APPOINTMENT' AND idempotency_key=$1 LIMIT 1",[key]);return r.rows[0]?val<AppointmentEntity>(r.rows[0].payload):null;}
  async getAppointmentsByProvider(id:string,start?:string,end?:string){const vals:any[]=[id];let sql="SELECT payload FROM appointment_runtime_entities WHERE entity_type='APPOINTMENT' AND provider_id=$1";if(start){vals.push(start);sql+=` AND end_at > $${vals.length}`;}if(end){vals.push(end);sql+=` AND start_at < $${vals.length}`;}sql+=' ORDER BY start_at';const r=await getPool().query(sql,vals);return r.rows.map((x:any)=>val<AppointmentEntity>(x.payload));}
  async getAppointmentsBySubject(id:string){const r=await getPool().query("SELECT payload FROM appointment_runtime_entities WHERE entity_type='APPOINTMENT' AND subject_user_id=$1 ORDER BY start_at",[id]);return r.rows.map((x:any)=>val<AppointmentEntity>(x.payload));}
  async saveAppointment(v:AppointmentEntity){return this.save('APPOINTMENT',v.id,v,{provider:v.provider_id,subject:v.subject_user_id,service:v.service_offering_id,idem:v.idempotency_key,start:v.start_at,end:v.end_at,status:String(v.status)});}
  async updateAppointment(v:AppointmentEntity){return this.saveAppointment(v);}
  async saveReschedule(v:AppointmentRescheduleEntity){return this.save('RESCHEDULE',v.id,v,{appointment:v.appointment_id,start:v.new_start_at,end:v.new_end_at});}
  async getReschedulesByAppointment(id:string){const r=await getPool().query("SELECT payload FROM appointment_runtime_entities WHERE entity_type='RESCHEDULE' AND appointment_id=$1 ORDER BY updated_at",[id]);return r.rows.map((x:any)=>val<AppointmentRescheduleEntity>(x.payload));}
  async getAttendanceByAppointment(id:string){const r=await getPool().query("SELECT payload FROM appointment_runtime_entities WHERE entity_type='ATTENDANCE' AND appointment_id=$1 LIMIT 1",[id]);return r.rows[0]?val<AppointmentAttendanceEntity>(r.rows[0].payload):null;}
  async saveAttendance(v:AppointmentAttendanceEntity){return this.save('ATTENDANCE',v.id,v,{appointment:v.appointment_id,status:`${v.user_status}:${v.provider_status}`});}
  async updateAttendance(v:AppointmentAttendanceEntity){return this.saveAttendance(v);}
  async saveWaitlistEntry(v:AppointmentWaitlistEntryEntity){return this.save('WAITLIST_ENTRY',v.id,v,{provider:v.provider_id,subject:v.subject_user_id,service:v.service_offering_id,expires:v.expires_at,status:String(v.status)});}
  async getWaitlistEntryById(id:string){return this.one<AppointmentWaitlistEntryEntity>('WAITLIST_ENTRY',id);}
  async getActiveWaitlistEntries(providerId?:string,serviceId?:string){const vals:any[]=[];let sql="SELECT payload FROM appointment_runtime_entities WHERE entity_type='WAITLIST_ENTRY' AND status='ACTIVE'";if(providerId){vals.push(providerId);sql+=` AND provider_id=$${vals.length}`;}if(serviceId){vals.push(serviceId);sql+=` AND service_offering_id=$${vals.length}`;}sql+=" AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY updated_at";const r=await getPool().query(sql,vals);return r.rows.map((x:any)=>val<AppointmentWaitlistEntryEntity>(x.payload));}
  async updateWaitlistEntry(v:AppointmentWaitlistEntryEntity){return this.saveWaitlistEntry(v);}
  async saveWaitlistOffer(v:WaitlistOfferEntity){return this.save('WAITLIST_OFFER',v.id,v,{appointment:v.waitlist_entry_id,start:v.slot_start,end:v.slot_end,expires:v.expires_at,status:String(v.status)});}
  async getWaitlistOfferById(id:string){return this.one<WaitlistOfferEntity>('WAITLIST_OFFER',id);}
  async getActiveWaitlistOffer(id:string){const r=await getPool().query("SELECT payload FROM appointment_runtime_entities WHERE entity_type='WAITLIST_OFFER' AND appointment_id=$1 AND status='PENDING' AND expires_at>NOW() ORDER BY updated_at DESC LIMIT 1",[id]);return r.rows[0]?val<WaitlistOfferEntity>(r.rows[0].payload):null;}
  async updateWaitlistOffer(v:WaitlistOfferEntity){return this.saveWaitlistOffer(v);}
  async saveReminder(v:AppointmentReminderEntity){return this.save('REMINDER',v.id,v,{appointment:v.appointment_id,scheduled:v.scheduled_for,status:v.status});}
  async getRemindersByAppointment(id:string){const r=await getPool().query("SELECT payload FROM appointment_runtime_entities WHERE entity_type='REMINDER' AND appointment_id=$1 ORDER BY scheduled_for",[id]);return r.rows.map((x:any)=>val<AppointmentReminderEntity>(x.payload));}
  async getPendingReminders(upTo:string){const r=await getPool().query("SELECT payload FROM appointment_runtime_entities WHERE entity_type='REMINDER' AND status='SCHEDULED' AND scheduled_for <= $1 ORDER BY scheduled_for",[upTo]);return r.rows.map((x:any)=>val<AppointmentReminderEntity>(x.payload));}
  async updateReminder(v:AppointmentReminderEntity){return this.saveReminder(v);}
  async saveVirtualSession(v:VirtualSessionEntity){return this.save('VIRTUAL_SESSION',v.id,v,{appointment:v.appointment_id,expires:v.expires_at,status:v.status});}
  async getVirtualSessionByAppointment(id:string){const r=await getPool().query("SELECT payload FROM appointment_runtime_entities WHERE entity_type='VIRTUAL_SESSION' AND appointment_id=$1 LIMIT 1",[id]);return r.rows[0]?val<VirtualSessionEntity>(r.rows[0].payload):null;}
  async updateVirtualSession(v:VirtualSessionEntity){return this.saveVirtualSession(v);}
}
