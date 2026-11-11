import { getPool } from '../../platform/database/index.js';
import { ICareRelationshipRepository } from './interfaces.js';
import { CareRelationship,CareTeamMembership,CareRelationshipAuditRecord } from '../domain/entities.js';
import { CareRelationshipState,CareTeamMembershipState } from '../domain/types.js';

type Kind='RELATIONSHIP'|'MEMBERSHIP'|'AUDIT';
const val=<T>(x:any):T=>(typeof x==='string'?JSON.parse(x):x) as T;

export class PgCareRelationshipRepository implements ICareRelationshipRepository{
  private async save(kind:Kind,id:string,v:any,m:{relationship?:string;subject?:string;provider?:string;professional?:string;status?:string}={}){
    await getPool().query(`INSERT INTO care_relationship_runtime_entities(entity_type,entity_id,relationship_id,subject_user_id,provider_id,professional_id,status,payload,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW())
      ON CONFLICT(entity_type,entity_id) DO UPDATE SET relationship_id=EXCLUDED.relationship_id,subject_user_id=EXCLUDED.subject_user_id,provider_id=EXCLUDED.provider_id,professional_id=EXCLUDED.professional_id,status=EXCLUDED.status,payload=EXCLUDED.payload,updated_at=NOW()`,
      [kind,id,m.relationship||null,m.subject||null,m.provider||null,m.professional||null,m.status||null,JSON.stringify(v)]);
  }
  private async one<T>(kind:Kind,id:string){const r=await getPool().query('SELECT payload FROM care_relationship_runtime_entities WHERE entity_type=$1 AND entity_id=$2',[kind,id]);return r.rows[0]?val<T>(r.rows[0].payload):null;}
  async saveRelationship(v:CareRelationship){await this.save('RELATIONSHIP',v.id,v,{relationship:v.id,subject:v.subject_user_id,provider:v.primary_provider_id,status:String(v.status)});}
  async findRelationshipById(id:string){return this.one<CareRelationship>('RELATIONSHIP',id);}
  async findRelationshipsByUserId(id:string,status?:CareRelationshipState){const vals:any[]=[id];let sql="SELECT payload FROM care_relationship_runtime_entities WHERE entity_type='RELATIONSHIP' AND subject_user_id=$1";if(status){vals.push(status);sql+=` AND status=$${vals.length}`;}sql+=' ORDER BY updated_at';const r=await getPool().query(sql,vals);return r.rows.map((x:any)=>val<CareRelationship>(x.payload));}
  async findRelationshipsByProviderId(id:string,status?:CareRelationshipState){const vals:any[]=[id];let sql="SELECT payload FROM care_relationship_runtime_entities WHERE entity_type='RELATIONSHIP' AND provider_id=$1";if(status){vals.push(status);sql+=` AND status=$${vals.length}`;}sql+=' ORDER BY updated_at';const r=await getPool().query(sql,vals);return r.rows.map((x:any)=>val<CareRelationship>(x.payload));}
  async listRelationships(filter?:Partial<CareRelationship>){let x=(await getPool().query("SELECT payload FROM care_relationship_runtime_entities WHERE entity_type='RELATIONSHIP' ORDER BY updated_at")).rows.map((r:any)=>val<CareRelationship>(r.payload));if(filter?.subject_user_id)x=x.filter(v=>v.subject_user_id===filter.subject_user_id);if(filter?.primary_provider_id)x=x.filter(v=>v.primary_provider_id===filter.primary_provider_id);if(filter?.status)x=x.filter(v=>v.status===filter.status);if(filter?.relationship_type)x=x.filter(v=>v.relationship_type===filter.relationship_type);return x;}
  async saveMembership(v:CareTeamMembership){await this.save('MEMBERSHIP',v.id,v,{relationship:v.relationship_id,provider:v.provider_id,professional:v.professional_id,status:String(v.status)});}
  async findMembershipById(id:string){return this.one<CareTeamMembership>('MEMBERSHIP',id);}
  async findMembershipsByRelationshipId(id:string,status?:CareTeamMembershipState){const vals:any[]=[id];let sql="SELECT payload FROM care_relationship_runtime_entities WHERE entity_type='MEMBERSHIP' AND relationship_id=$1";if(status){vals.push(status);sql+=` AND status=$${vals.length}`;}const r=await getPool().query(sql,vals);return r.rows.map((x:any)=>val<CareTeamMembership>(x.payload));}
  async findMembershipsByProfessionalId(id:string,status?:CareTeamMembershipState){const vals:any[]=[id];let sql="SELECT payload FROM care_relationship_runtime_entities WHERE entity_type='MEMBERSHIP' AND professional_id=$1";if(status){vals.push(status);sql+=` AND status=$${vals.length}`;}const r=await getPool().query(sql,vals);return r.rows.map((x:any)=>val<CareTeamMembership>(x.payload));}
  async findMembership(rel:string,prof:string){const r=await getPool().query("SELECT payload FROM care_relationship_runtime_entities WHERE entity_type='MEMBERSHIP' AND relationship_id=$1 AND professional_id=$2 ORDER BY updated_at DESC LIMIT 1",[rel,prof]);return r.rows[0]?val<CareTeamMembership>(r.rows[0].payload):null;}
  async saveAuditRecord(v:CareRelationshipAuditRecord){await this.save('AUDIT',v.id,v,{relationship:v.relationship_id});}
  async listAuditRecords(id:string){const r=await getPool().query("SELECT payload FROM care_relationship_runtime_entities WHERE entity_type='AUDIT' AND relationship_id=$1 ORDER BY updated_at",[id]);return r.rows.map((x:any)=>val<CareRelationshipAuditRecord>(x.payload));}
  async clear(){await getPool().query('DELETE FROM care_relationship_runtime_entities');}
}
