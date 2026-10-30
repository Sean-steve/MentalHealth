import { getPool } from '../../platform/database/index.js';
import { ClinicalChangeRule } from '../domain/types.js';
import { OutcomeMeasureDefinition, MeasureComparabilityPolicy } from '../domain/entities.js';

const parseJson=<T>(v:unknown,fallback:T):T=>{
  if(v===null||v===undefined)return fallback;
  if(typeof v!=='string')return v as T;
  try{return JSON.parse(v) as T;}catch{return fallback;}
};

export class PgOutcomeGovernanceRepository {
  async upsertMeasureDefinition(d:OutcomeMeasureDefinition):Promise<void>{
    await getPool().query(
      `INSERT INTO outcome_measure_definitions
       (id,measure_code,name,description,measure_type,unit,value_type,directionality,population,jurisdiction,
        source_domain,clinical_artifact_id,clinical_artifact_version,comparability_policy_id,status,min_value,max_value,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT(measure_code) DO UPDATE SET
       name=EXCLUDED.name,description=EXCLUDED.description,measure_type=EXCLUDED.measure_type,unit=EXCLUDED.unit,
       value_type=EXCLUDED.value_type,directionality=EXCLUDED.directionality,population=EXCLUDED.population,
       jurisdiction=EXCLUDED.jurisdiction,source_domain=EXCLUDED.source_domain,
       clinical_artifact_id=EXCLUDED.clinical_artifact_id,clinical_artifact_version=EXCLUDED.clinical_artifact_version,
       comparability_policy_id=EXCLUDED.comparability_policy_id,status=EXCLUDED.status,
       min_value=EXCLUDED.min_value,max_value=EXCLUDED.max_value`,
      [d.id,d.measure_code,d.name,d.description,d.measure_type,d.unit,d.value_type,d.directionality,d.population,
       d.jurisdiction,d.source_domain,d.clinical_artifact_id||null,d.clinical_artifact_version||null,
       d.comparability_policy_id,d.status,d.min_value??null,d.max_value??null,d.created_at]
    );
  }
  async upsertComparabilityPolicy(p:MeasureComparabilityPolicy):Promise<void>{
    await getPool().query(
      `INSERT INTO outcome_comparability_policies
       (id,measure_code,allowed_version_pairs,unit_requirements,population_constraints,maximum_gap_days,transformation_policy,status)
       VALUES($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7,$8)
       ON CONFLICT(measure_code) DO UPDATE SET allowed_version_pairs=EXCLUDED.allowed_version_pairs,
       unit_requirements=EXCLUDED.unit_requirements,population_constraints=EXCLUDED.population_constraints,
       maximum_gap_days=EXCLUDED.maximum_gap_days,transformation_policy=EXCLUDED.transformation_policy,status=EXCLUDED.status`,
      [p.id,p.measure_code,JSON.stringify(p.allowed_version_pairs),JSON.stringify(p.unit_requirements),
       p.population_constraints?JSON.stringify(p.population_constraints):null,p.maximum_gap_days??null,
       p.transformation_policy||null,p.status]
    );
  }
  async listApprovedClinicalChangeRules(at=new Date()):Promise<ClinicalChangeRule[]>{
    const r=await getPool().query(
      `SELECT * FROM outcome_clinical_change_rules
       WHERE approval_state='APPROVED' AND effective_from <= $1
       AND (effective_until IS NULL OR effective_until > $1)
       ORDER BY measure_code ASC,version DESC`,[at.toISOString()]
    );
    return r.rows.map((x:any)=>({
      id:x.id,measure_code:x.measure_code,version:Number(x.version),
      mcid:x.mcid===null?undefined:Number(x.mcid),
      reliable_change_threshold:x.reliable_change_threshold===null?undefined:Number(x.reliable_change_threshold),
      critical_worsening_threshold:x.critical_worsening_threshold===null?undefined:Number(x.critical_worsening_threshold),
      critical_safety_threshold:x.critical_safety_threshold===null?undefined:Number(x.critical_safety_threshold),
      target_min:x.target_min===null?undefined:Number(x.target_min),
      target_max:x.target_max===null?undefined:Number(x.target_max),
      clinical_artifact_id:x.clinical_artifact_id,clinical_artifact_version:x.clinical_artifact_version,
      approval_state:x.approval_state,approved_by:x.approved_by,approved_at:x.approved_at,
      effective_from:x.effective_from,effective_until:x.effective_until||undefined
    }));
  }
  async saveClinicalChangeRule(rule:ClinicalChangeRule):Promise<void>{
    await getPool().query(
      `INSERT INTO outcome_clinical_change_rules
       (id,measure_code,version,mcid,reliable_change_threshold,critical_worsening_threshold,critical_safety_threshold,
        target_min,target_max,clinical_artifact_id,clinical_artifact_version,approval_state,approved_by,approved_at,
        effective_from,effective_until)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT(measure_code,version) DO UPDATE SET
       approval_state=EXCLUDED.approval_state,approved_by=EXCLUDED.approved_by,approved_at=EXCLUDED.approved_at,
       effective_from=EXCLUDED.effective_from,effective_until=EXCLUDED.effective_until`,
      [rule.id,rule.measure_code,rule.version,rule.mcid??null,rule.reliable_change_threshold??null,
       rule.critical_worsening_threshold??null,rule.critical_safety_threshold??null,rule.target_min??null,
       rule.target_max??null,rule.clinical_artifact_id,rule.clinical_artifact_version,rule.approval_state,
       rule.approved_by,rule.approved_at,rule.effective_from,rule.effective_until||null]
    );
  }
}
