import { getPool } from '../../platform/database/index.js';
import { IOutcomeRepository } from './interfaces.js';
import {
  OutcomeMeasurement,OutcomeBaseline,OutcomeReview,OutcomeAlert,OutcomeSnapshot
} from '../domain/entities.js';
import { OutcomeMeasurementValidity } from '../domain/types.js';

const parseJson=<T>(v:unknown,fallback:T):T=>{
  if(v===null||v===undefined)return fallback;
  if(typeof v!=='string')return v as T;
  try{return JSON.parse(v) as T;}catch{return fallback;}
};
const toMeasurement=(r:any):OutcomeMeasurement=>({
  id:r.id,subject_user_id:r.subject_user_id,measure_definition_id:r.measure_definition_id,
  measure_code:r.measure_code,value:parseJson(r.value_json,null as any),unit:r.unit,
  measured_at:r.measured_at,recorded_at:r.recorded_at,source_type:r.source_type,
  source_reference:r.source_reference,instrument_version:r.instrument_version||undefined,
  provenance:r.provenance,validity_status:r.validity_status as OutcomeMeasurementValidity,
  invalidation_reason:r.invalidation_reason||undefined,invalidated_at:r.invalidated_at||undefined,
  care_relationship_id:r.care_relationship_id||undefined,care_plan_id:r.care_plan_id||undefined,
  care_goal_id:r.care_goal_id||undefined,clinical_encounter_id:r.clinical_encounter_id||undefined,
  recorded_by:r.recorded_by||undefined,created_at:r.created_at
});
const toBaseline=(r:any):OutcomeBaseline=>({
  id:r.id,subject_user_id:r.subject_user_id,measure_code:r.measure_code,
  baseline_measurement_id:r.baseline_measurement_id,baseline_value:parseJson(r.baseline_value_json,null as any),
  baseline_type:r.baseline_type,established_at:r.established_at,established_by:r.established_by,
  override_reason:r.override_reason||undefined,created_at:r.created_at
});
const toReview=(r:any):OutcomeReview=>({
  id:r.id,subject_user_id:r.subject_user_id,care_relationship_id:r.care_relationship_id,
  care_plan_id:r.care_plan_id||undefined,review_type:r.review_type,status:r.status,
  reviewer_id:r.reviewer_id||undefined,measurement_refs:parseJson(r.measurement_refs,[]),
  trend_refs:parseJson(r.trend_refs,[]),scheduled_for:r.scheduled_for||undefined,
  started_at:r.started_at||undefined,completed_at:r.completed_at||undefined,
  decision:r.decision||undefined,reason_codes:parseJson(r.reason_codes,[]),
  clinical_notes:r.clinical_notes||undefined,recommended_actions:parseJson(r.recommended_actions,[]),
  snapshot_id:r.snapshot_id||undefined,created_at:r.created_at,updated_at:r.updated_at
});
const toAlert=(r:any):OutcomeAlert=>({
  id:r.id,subject_user_id:r.subject_user_id,care_relationship_id:r.care_relationship_id||undefined,
  alert_type:r.alert_type,severity:r.severity,measure_definition_id:r.measure_definition_id||undefined,
  measure_code:r.measure_code||undefined,measurement_id:r.measurement_id||undefined,trend_id:r.trend_id||undefined,
  status:r.status,generated_at:r.generated_at,review_due_at:r.review_due_at,assigned_to:r.assigned_to||undefined,
  policy_version:r.policy_version,resolution_notes:r.resolution_notes||undefined,
  resolved_at:r.resolved_at||undefined,resolved_by:r.resolved_by||undefined
});
const toSnapshot=(r:any):OutcomeSnapshot=>({
  id:r.id,review_id:r.review_id,subject_user_id:r.subject_user_id,
  measure_states:parseJson(r.measure_states,[]),trend_states:parseJson(r.trend_states,[]),
  care_plan_version_id:r.care_plan_version_id||undefined,frozen_at:r.frozen_at,hash:r.hash
});

export class PgOutcomeRepository implements IOutcomeRepository {
  async saveMeasurement(m:OutcomeMeasurement):Promise<void>{
    await getPool().query(
      `INSERT INTO outcome_measurements
       (id,subject_user_id,measure_definition_id,measure_code,value_json,unit,measured_at,recorded_at,
        source_type,source_reference,instrument_version,provenance,validity_status,invalidation_reason,invalidated_at,
        care_relationship_id,care_plan_id,care_goal_id,clinical_encounter_id,recorded_by,created_at)
       VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT(source_type,source_reference) DO NOTHING`,
      [m.id,m.subject_user_id,m.measure_definition_id,m.measure_code,JSON.stringify(m.value),m.unit,m.measured_at,
       m.recorded_at,m.source_type,m.source_reference,m.instrument_version===undefined?null:String(m.instrument_version),
       m.provenance,m.validity_status,m.invalidation_reason||null,m.invalidated_at||null,m.care_relationship_id||null,
       m.care_plan_id||null,m.care_goal_id||null,m.clinical_encounter_id||null,m.recorded_by||null,m.created_at]
    );
  }
  async findMeasurementById(id:string):Promise<OutcomeMeasurement|null>{
    const r=await getPool().query('SELECT * FROM outcome_measurements WHERE id=$1',[id]);
    return r.rows[0]?toMeasurement(r.rows[0]):null;
  }
  async findMeasurementBySource(sourceType:string,sourceReference:string):Promise<OutcomeMeasurement|null>{
    const r=await getPool().query('SELECT * FROM outcome_measurements WHERE source_type=$1 AND source_reference=$2',[sourceType,sourceReference]);
    return r.rows[0]?toMeasurement(r.rows[0]):null;
  }
  async findMeasurementsByUserAndMeasure(userId:string,measureCode:string,includeInvalidated=false):Promise<OutcomeMeasurement[]>{
    const r=await getPool().query(
      `SELECT * FROM outcome_measurements WHERE subject_user_id=$1 AND measure_code=$2
       ${includeInvalidated?'':'AND validity_status <> $3'} ORDER BY measured_at ASC,id ASC`,
      includeInvalidated?[userId,measureCode]:[userId,measureCode,OutcomeMeasurementValidity.INVALIDATED]
    );
    return r.rows.map(toMeasurement);
  }
  async findMeasurementsByUser(userId:string,includeInvalidated=false):Promise<OutcomeMeasurement[]>{
    const r=await getPool().query(
      `SELECT * FROM outcome_measurements WHERE subject_user_id=$1
       ${includeInvalidated?'':'AND validity_status <> $2'} ORDER BY measured_at ASC,id ASC`,
      includeInvalidated?[userId]:[userId,OutcomeMeasurementValidity.INVALIDATED]
    );
    return r.rows.map(toMeasurement);
  }
  async invalidateMeasurement(id:string,reason:string):Promise<boolean>{
    const r=await getPool().query(
      'UPDATE outcome_measurements SET validity_status=$2,invalidation_reason=$3,invalidated_at=NOW() WHERE id=$1 AND validity_status<>$2',
      [id,OutcomeMeasurementValidity.INVALIDATED,reason]
    );
    return (r.rowCount||0)>0;
  }
  async invalidateMeasurementBySource(sourceType:string,sourceReference:string,reason:string):Promise<boolean>{
    const r=await getPool().query(
      'UPDATE outcome_measurements SET validity_status=$3,invalidation_reason=$4,invalidated_at=NOW() WHERE source_type=$1 AND source_reference=$2 AND validity_status<>$3',
      [sourceType,sourceReference,OutcomeMeasurementValidity.INVALIDATED,reason]
    );
    return (r.rowCount||0)>0;
  }
  async saveBaseline(b:OutcomeBaseline):Promise<void>{
    await getPool().query(
      `INSERT INTO outcome_baselines
       (id,subject_user_id,measure_code,baseline_measurement_id,baseline_value_json,baseline_type,established_at,established_by,override_reason,created_at)
       VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10)
       ON CONFLICT(subject_user_id,measure_code) DO UPDATE SET
       baseline_measurement_id=EXCLUDED.baseline_measurement_id,baseline_value_json=EXCLUDED.baseline_value_json,
       baseline_type=EXCLUDED.baseline_type,established_at=EXCLUDED.established_at,
       established_by=EXCLUDED.established_by,override_reason=EXCLUDED.override_reason`,
      [b.id,b.subject_user_id,b.measure_code,b.baseline_measurement_id,JSON.stringify(b.baseline_value),
       b.baseline_type,b.established_at,b.established_by,b.override_reason||null,b.created_at]
    );
  }
  async findBaseline(userId:string,measureCode:string):Promise<OutcomeBaseline|null>{
    const r=await getPool().query('SELECT * FROM outcome_baselines WHERE subject_user_id=$1 AND measure_code=$2',[userId,measureCode]);
    return r.rows[0]?toBaseline(r.rows[0]):null;
  }
  async saveReview(v:OutcomeReview):Promise<void>{
    await getPool().query(
      `INSERT INTO outcome_reviews
       (id,subject_user_id,care_relationship_id,care_plan_id,review_type,status,reviewer_id,measurement_refs,trend_refs,
        scheduled_for,started_at,completed_at,decision,reason_codes,clinical_notes,recommended_actions,snapshot_id,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14::jsonb,$15,$16::jsonb,$17,$18,$19)
       ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,reviewer_id=EXCLUDED.reviewer_id,
       measurement_refs=EXCLUDED.measurement_refs,trend_refs=EXCLUDED.trend_refs,scheduled_for=EXCLUDED.scheduled_for,
       started_at=EXCLUDED.started_at,completed_at=EXCLUDED.completed_at,decision=EXCLUDED.decision,
       reason_codes=EXCLUDED.reason_codes,clinical_notes=EXCLUDED.clinical_notes,
       recommended_actions=EXCLUDED.recommended_actions,snapshot_id=EXCLUDED.snapshot_id,updated_at=EXCLUDED.updated_at`,
      [v.id,v.subject_user_id,v.care_relationship_id,v.care_plan_id||null,v.review_type,v.status,v.reviewer_id||null,
       JSON.stringify(v.measurement_refs),JSON.stringify(v.trend_refs),v.scheduled_for||null,v.started_at||null,
       v.completed_at||null,v.decision||null,JSON.stringify(v.reason_codes),v.clinical_notes||null,
       JSON.stringify(v.recommended_actions),v.snapshot_id||null,v.created_at,v.updated_at]
    );
  }
  async findReviewById(id:string):Promise<OutcomeReview|null>{
    const r=await getPool().query('SELECT * FROM outcome_reviews WHERE id=$1',[id]);
    return r.rows[0]?toReview(r.rows[0]):null;
  }
  async findReviewsByUser(userId:string):Promise<OutcomeReview[]>{
    const r=await getPool().query('SELECT * FROM outcome_reviews WHERE subject_user_id=$1 ORDER BY created_at DESC,id ASC',[userId]);
    return r.rows.map(toReview);
  }
  async saveAlert(a:OutcomeAlert):Promise<void>{
    await getPool().query(
      `INSERT INTO outcome_alerts
       (id,subject_user_id,care_relationship_id,alert_type,severity,measure_definition_id,measure_code,measurement_id,
        trend_id,status,generated_at,review_due_at,assigned_to,policy_version,resolution_notes,resolved_at,resolved_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,assigned_to=EXCLUDED.assigned_to,
       resolution_notes=EXCLUDED.resolution_notes,resolved_at=EXCLUDED.resolved_at,resolved_by=EXCLUDED.resolved_by`,
      [a.id,a.subject_user_id,a.care_relationship_id||null,a.alert_type,a.severity,a.measure_definition_id||null,
       a.measure_code||null,a.measurement_id||null,a.trend_id||null,a.status,a.generated_at,a.review_due_at,
       a.assigned_to||null,a.policy_version,a.resolution_notes||null,a.resolved_at||null,a.resolved_by||null]
    );
  }
  async findAlertById(id:string):Promise<OutcomeAlert|null>{
    const r=await getPool().query('SELECT * FROM outcome_alerts WHERE id=$1',[id]);
    return r.rows[0]?toAlert(r.rows[0]):null;
  }
  async findAlertsByUser(userId:string,status?:string):Promise<OutcomeAlert[]>{
    const values:any[]=[userId];let sql='SELECT * FROM outcome_alerts WHERE subject_user_id=$1';
    if(status){values.push(status);sql+=` AND status=$${values.length}`;}
    sql+=' ORDER BY generated_at DESC,id ASC';
    const r=await getPool().query(sql,values);return r.rows.map(toAlert);
  }
  async saveSnapshot(s:OutcomeSnapshot):Promise<void>{
    await getPool().query(
      `INSERT INTO outcome_snapshots
       (id,review_id,subject_user_id,measure_states,trend_states,care_plan_version_id,frozen_at,hash)
       VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8) ON CONFLICT(review_id) DO NOTHING`,
      [s.id,s.review_id,s.subject_user_id,JSON.stringify(s.measure_states),JSON.stringify(s.trend_states),
       s.care_plan_version_id||null,s.frozen_at,s.hash]
    );
  }
  async findSnapshotById(id:string):Promise<OutcomeSnapshot|null>{
    const r=await getPool().query('SELECT * FROM outcome_snapshots WHERE id=$1',[id]);
    return r.rows[0]?toSnapshot(r.rows[0]):null;
  }
  async clear():Promise<void>{
    await getPool().query(
      'DELETE FROM outcome_snapshots; DELETE FROM outcome_alerts; DELETE FROM outcome_reviews; DELETE FROM outcome_baselines; DELETE FROM outcome_measurements;'
    );
  }
}
