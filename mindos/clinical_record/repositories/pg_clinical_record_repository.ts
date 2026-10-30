import { getPool } from '../../platform/database/index.js';
import { IClinicalRecordRepository } from './interfaces.js';
import { LongitudinalClinicalRecord, ClinicalTimelineEntry, ClinicalObservation } from '../domain/entities.js';
import {
  TimelineFilterCriteria,
  LongitudinalClinicalRecordState,
  ClinicalTimelineSourceType,
  ClinicalProvenance,
  TimelineVisibilityScope
} from '../domain/types.js';

const parseJson=<T>(v:unknown,fallback:T):T=>{
  if(v===null||v===undefined)return fallback;
  if(typeof v!=='string')return v as T;
  try{return JSON.parse(v) as T;}catch{return fallback;}
};
const toRecord=(r:any):LongitudinalClinicalRecord=>({
  id:r.id,subject_user_id:r.subject_user_id,status:r.status as LongitudinalClinicalRecordState,
  jurisdiction:r.jurisdiction,created_at:r.created_at,updated_at:r.updated_at,record_version:Number(r.record_version)
});
const toTimeline=(r:any):ClinicalTimelineEntry=>({
  id:r.id,subject_user_id:r.subject_user_id,event_type:r.event_type,occurred_at:r.occurred_at,
  recorded_at:r.recorded_at,source_domain:r.source_domain,source_type:r.source_type as ClinicalTimelineSourceType,
  source_id:r.source_id,provenance:r.provenance as ClinicalProvenance,clinical_significance:r.clinical_significance,
  safety_significance:r.safety_significance,summary_reference:r.summary_reference||undefined,
  visibility_scope:r.visibility_scope as TimelineVisibilityScope,care_relationship_id:r.care_relationship_id||undefined,
  care_plan_id:r.care_plan_id||undefined,is_invalidated:Boolean(r.is_invalidated),
  invalidation_reason:r.invalidation_reason||undefined,invalidated_at:r.invalidated_at||undefined,
  metadata:parseJson<Record<string,unknown>|undefined>(r.metadata,undefined),created_at:r.created_at
});
const toObservation=(r:any):ClinicalObservation=>({
  id:r.id,subject_user_id:r.subject_user_id,care_relationship_id:r.care_relationship_id||undefined,
  clinical_encounter_id:r.clinical_encounter_id||undefined,observation_code:r.observation_code,
  observation_name:r.observation_name,value:parseJson(r.value_json,null as any),unit:r.unit||undefined,
  observed_at:r.observed_at,recorded_at:r.recorded_at,recorded_by:r.recorded_by,
  provenance:r.provenance as ClinicalProvenance,clinical_significance:r.clinical_significance,
  is_invalidated:Boolean(r.is_invalidated),created_at:r.created_at
});

export class PgClinicalRecordRepository implements IClinicalRecordRepository {
  async saveRecord(record:LongitudinalClinicalRecord):Promise<void>{
    await getPool().query(
      `INSERT INTO longitudinal_clinical_records
       (id,subject_user_id,status,jurisdiction,created_at,updated_at,record_version)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(subject_user_id) DO UPDATE SET
       status=EXCLUDED.status,jurisdiction=EXCLUDED.jurisdiction,
       updated_at=EXCLUDED.updated_at,record_version=EXCLUDED.record_version`,
      [record.id,record.subject_user_id,record.status,record.jurisdiction,record.created_at,record.updated_at,record.record_version]
    );
  }
  async findRecordByUserId(userId:string):Promise<LongitudinalClinicalRecord|null>{
    const r=await getPool().query('SELECT * FROM longitudinal_clinical_records WHERE subject_user_id=$1',[userId]);
    return r.rows[0]?toRecord(r.rows[0]):null;
  }
  async findRecordById(id:string):Promise<LongitudinalClinicalRecord|null>{
    const r=await getPool().query('SELECT * FROM longitudinal_clinical_records WHERE id=$1',[id]);
    return r.rows[0]?toRecord(r.rows[0]):null;
  }
  async saveTimelineEntry(entry:ClinicalTimelineEntry):Promise<void>{
    await getPool().query(
      `INSERT INTO clinical_timeline_entries
       (id,subject_user_id,event_type,occurred_at,recorded_at,source_domain,source_type,source_id,
        provenance,clinical_significance,safety_significance,summary_reference,visibility_scope,
        care_relationship_id,care_plan_id,is_invalidated,invalidation_reason,invalidated_at,metadata,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20)
       ON CONFLICT(source_domain,source_type,source_id) DO NOTHING`,
      [entry.id,entry.subject_user_id,entry.event_type,entry.occurred_at,entry.recorded_at,entry.source_domain,
       entry.source_type,entry.source_id,entry.provenance,entry.clinical_significance,entry.safety_significance,
       entry.summary_reference||null,entry.visibility_scope,entry.care_relationship_id||null,entry.care_plan_id||null,
       Boolean(entry.is_invalidated),entry.invalidation_reason||null,entry.invalidated_at||null,
       entry.metadata?JSON.stringify(entry.metadata):null,entry.created_at]
    );
  }
  async findTimelineEntryById(id:string):Promise<ClinicalTimelineEntry|null>{
    const r=await getPool().query('SELECT * FROM clinical_timeline_entries WHERE id=$1',[id]);
    return r.rows[0]?toTimeline(r.rows[0]):null;
  }
  async findTimelineEntryBySource(sourceDomain:string,sourceType:string,sourceId:string):Promise<ClinicalTimelineEntry|null>{
    const r=await getPool().query(
      'SELECT * FROM clinical_timeline_entries WHERE source_domain=$1 AND source_type=$2 AND source_id=$3',
      [sourceDomain,sourceType,sourceId]
    );
    return r.rows[0]?toTimeline(r.rows[0]):null;
  }
  async findTimelineEntries(criteria:TimelineFilterCriteria):Promise<ClinicalTimelineEntry[]>{
    const clauses=['subject_user_id=$1'];
    const values:any[]=[criteria.subject_user_id];
    const add=(sql:string,value:any)=>{values.push(value);clauses.push(sql.replace('?',`$${values.length}`));};
    if(!criteria.include_invalidated)clauses.push('is_invalidated=FALSE');
    if(criteria.source_types?.length)add('source_type = ANY(?::text[])',criteria.source_types);
    if(criteria.source_domains?.length)add('source_domain = ANY(?::text[])',criteria.source_domains);
    if(criteria.start_date)add('occurred_at >= ?',criteria.start_date);
    if(criteria.end_date)add('occurred_at <= ?',criteria.end_date);
    if(criteria.visibility_scope)add('visibility_scope = ?',criteria.visibility_scope);
    if(criteria.provenance?.length)add('provenance = ANY(?::text[])',criteria.provenance);
    const direction=criteria.sort_direction==='ASC'?'ASC':'DESC';
    let sql=`SELECT * FROM clinical_timeline_entries WHERE ${clauses.join(' AND ')}
      ORDER BY occurred_at ${direction}, recorded_at ${direction}, id ASC`;
    if(criteria.limit && criteria.limit>0){values.push(criteria.limit);sql+=` LIMIT $${values.length}`;}
    if(criteria.offset && criteria.offset>0){values.push(criteria.offset);sql+=` OFFSET $${values.length}`;}
    const r=await getPool().query(sql,values);
    return r.rows.map(toTimeline);
  }
  async invalidateTimelineEntry(sourceDomain:string,sourceType:string,sourceId:string,reason:string):Promise<boolean>{
    const r=await getPool().query(
      `UPDATE clinical_timeline_entries SET is_invalidated=TRUE,invalidation_reason=$4,invalidated_at=NOW()
       WHERE source_domain=$1 AND source_type=$2 AND source_id=$3 AND is_invalidated=FALSE
       RETURNING id`,
      [sourceDomain,sourceType,sourceId,reason]
    );
    return r.rows.length>0;
  }
  async saveObservation(observation:ClinicalObservation):Promise<void>{
    await getPool().query(
      `INSERT INTO clinical_observations
       (id,subject_user_id,care_relationship_id,clinical_encounter_id,observation_code,observation_name,
        value_json,unit,observed_at,recorded_at,recorded_by,provenance,clinical_significance,is_invalidated,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT(id) DO NOTHING`,
      [observation.id,observation.subject_user_id,observation.care_relationship_id||null,
       observation.clinical_encounter_id||null,observation.observation_code,observation.observation_name,
       JSON.stringify(observation.value),observation.unit||null,observation.observed_at,observation.recorded_at,
       observation.recorded_by,observation.provenance,observation.clinical_significance,
       Boolean(observation.is_invalidated),observation.created_at]
    );
  }
  async findObservationsByUserId(userId:string):Promise<ClinicalObservation[]>{
    const r=await getPool().query(
      'SELECT * FROM clinical_observations WHERE subject_user_id=$1 AND is_invalidated=FALSE ORDER BY observed_at DESC,id ASC',
      [userId]
    );
    return r.rows.map(toObservation);
  }
  async clear():Promise<void>{
    await getPool().query('DELETE FROM clinical_observations; DELETE FROM clinical_timeline_entries; DELETE FROM longitudinal_clinical_records;');
  }
}
