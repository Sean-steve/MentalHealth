import crypto from 'node:crypto';
import { getPool,FieldEncryptor } from '../../platform/database/index.js';
import { IClinicalWorkspaceRepository } from './interfaces.js';
import { ClinicalEncounter,ClinicalNote,ClinicalTask,CarePlan,ProfessionalSafetyConcern } from '../domain/entities.js';
import { ClinicalEncounterState,ClinicalNoteState,ClinicalTaskStatus } from '../domain/types.js';

type Kind='ENCOUNTER'|'NOTE'|'TASK'|'CARE_PLAN'|'SAFETY_CONCERN';

export class PgClinicalWorkspaceRepository implements IClinicalWorkspaceRepository{
  private async save(kind:Kind,id:string,v:any,m:{relationship?:string;encounter?:string;subject?:string;professional?:string;status?:string}={}){
    const raw=JSON.stringify(v);
    const encrypted=await FieldEncryptor.encryptField('clinical_workspace_runtime','payload',raw,'clinical-records-master');
    const hash=crypto.createHash('sha256').update(raw).digest('hex');
    await getPool().query(`INSERT INTO clinical_workspace_runtime_entities(entity_type,entity_id,care_relationship_id,encounter_id,subject_user_id,professional_id,status,payload_ciphertext,integrity_hash,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
      ON CONFLICT(entity_type,entity_id) DO UPDATE SET care_relationship_id=EXCLUDED.care_relationship_id,encounter_id=EXCLUDED.encounter_id,subject_user_id=EXCLUDED.subject_user_id,professional_id=EXCLUDED.professional_id,status=EXCLUDED.status,payload_ciphertext=EXCLUDED.payload_ciphertext,integrity_hash=EXCLUDED.integrity_hash,updated_at=NOW()`,
      [kind,id,m.relationship||null,m.encounter||null,m.subject||null,m.professional||null,m.status||null,encrypted,hash]);
  }
  private async decode<T>(row:any):Promise<T>{
    const raw=await FieldEncryptor.decryptField<string>(row.payload_ciphertext);
    const text=typeof raw==='string'?raw:JSON.stringify(raw);
    const hash=crypto.createHash('sha256').update(text).digest('hex');
    if(hash!==row.integrity_hash)throw new Error('CLINICAL_WORKSPACE_INTEGRITY_MISMATCH');
    return JSON.parse(text) as T;
  }
  private async one<T>(kind:Kind,id:string){const r=await getPool().query('SELECT payload_ciphertext,integrity_hash FROM clinical_workspace_runtime_entities WHERE entity_type=$1 AND entity_id=$2',[kind,id]);return r.rows[0]?this.decode<T>(r.rows[0]):null;}
  private async rows<T>(sql:string,params:any[]=[]){const r=await getPool().query(sql,params);return Promise.all(r.rows.map((x:any)=>this.decode<T>(x)));}

  async saveEncounter(v:ClinicalEncounter){await this.save('ENCOUNTER',v.id,v,{relationship:v.care_relationship_id,encounter:v.id,subject:v.subject_user_id,professional:v.lead_professional_id,status:String(v.status)});}
  async findEncounterById(id:string){return this.one<ClinicalEncounter>('ENCOUNTER',id);}
  async findEncountersByRelationshipId(id:string,status?:ClinicalEncounterState){const vals:any[]=[id];let sql="SELECT payload_ciphertext,integrity_hash FROM clinical_workspace_runtime_entities WHERE entity_type='ENCOUNTER' AND care_relationship_id=$1";if(status){vals.push(status);sql+=` AND status=$${vals.length}`;}return this.rows<ClinicalEncounter>(sql,vals);}
  async findEncountersByProfessionalId(id:string,status?:ClinicalEncounterState){const vals:any[]=[id];let sql="SELECT payload_ciphertext,integrity_hash FROM clinical_workspace_runtime_entities WHERE entity_type='ENCOUNTER' AND professional_id=$1";if(status){vals.push(status);sql+=` AND status=$${vals.length}`;}return this.rows<ClinicalEncounter>(sql,vals);}

  async saveNote(v:ClinicalNote){await this.save('NOTE',v.id,v,{relationship:v.care_relationship_id,encounter:v.encounter_id,subject:v.subject_user_id,professional:v.author_professional_id,status:String(v.status)});}
  async findNoteById(id:string){return this.one<ClinicalNote>('NOTE',id);}
  async findNotesByRelationshipId(id:string,status?:ClinicalNoteState){const vals:any[]=[id];let sql="SELECT payload_ciphertext,integrity_hash FROM clinical_workspace_runtime_entities WHERE entity_type='NOTE' AND care_relationship_id=$1";if(status){vals.push(status);sql+=` AND status=$${vals.length}`;}return this.rows<ClinicalNote>(sql,vals);}
  async findNotesByEncounterId(id:string){return this.rows<ClinicalNote>("SELECT payload_ciphertext,integrity_hash FROM clinical_workspace_runtime_entities WHERE entity_type='NOTE' AND encounter_id=$1 ORDER BY updated_at",[id]);}
  async findAmendments(id:string){const all=await this.rows<ClinicalNote>("SELECT payload_ciphertext,integrity_hash FROM clinical_workspace_runtime_entities WHERE entity_type='NOTE' ORDER BY updated_at");return all.filter(x=>x.amendment_of_id===id);}

  async saveTask(v:ClinicalTask){await this.save('TASK',v.id,v,{relationship:v.care_relationship_id,subject:v.subject_user_id,professional:v.assigned_to_professional_id,status:String(v.status)});}
  async findTaskById(id:string){return this.one<ClinicalTask>('TASK',id);}
  async findTasksByRelationshipId(id:string,status?:ClinicalTaskStatus){const vals:any[]=[id];let sql="SELECT payload_ciphertext,integrity_hash FROM clinical_workspace_runtime_entities WHERE entity_type='TASK' AND care_relationship_id=$1";if(status){vals.push(status);sql+=` AND status=$${vals.length}`;}return this.rows<ClinicalTask>(sql,vals);}

  async saveCarePlan(v:CarePlan){await this.save('CARE_PLAN',v.id,v,{relationship:v.care_relationship_id,subject:v.subject_user_id,professional:v.author_professional_id,status:String(v.status)});}
  async findCarePlanById(id:string){return this.one<CarePlan>('CARE_PLAN',id);}
  async findCarePlanByRelationshipId(id:string){const x=await this.rows<CarePlan>("SELECT payload_ciphertext,integrity_hash FROM clinical_workspace_runtime_entities WHERE entity_type='CARE_PLAN' AND care_relationship_id=$1 ORDER BY updated_at DESC LIMIT 1",[id]);return x[0]||null;}

  async saveSafetyConcern(v:ProfessionalSafetyConcern){await this.save('SAFETY_CONCERN',v.id,v,{relationship:v.care_relationship_id,subject:v.subject_user_id,professional:v.reporting_professional_id,status:String(v.severity)});}
  async findSafetyConcernsByRelationshipId(id:string){return this.rows<ProfessionalSafetyConcern>("SELECT payload_ciphertext,integrity_hash FROM clinical_workspace_runtime_entities WHERE entity_type='SAFETY_CONCERN' AND care_relationship_id=$1 ORDER BY updated_at",[id]);}
  async clear(){await getPool().query('DELETE FROM clinical_workspace_runtime_entities');}
}
