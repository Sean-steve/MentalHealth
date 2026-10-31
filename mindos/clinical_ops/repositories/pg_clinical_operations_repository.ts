import { getPool } from '../../platform/database/index.js';
import {
  ClinicalIncident,
  ClinicalOperationsCapability,
  ClinicalOperationsEscalation,
  ClinicalOperationsFollowUp
} from '../domain/types.js';
import { IClinicalOperationsRepository } from './interfaces.js';

const json=<T>(value: unknown,fallback:T):T=>{
  if(value===null||value===undefined)return fallback;
  if(typeof value!=='string')return value as T;
  try{return JSON.parse(value) as T;}catch{return fallback;}
};

export class PgClinicalOperationsRepository implements IClinicalOperationsRepository {
  async saveCapability(v: ClinicalOperationsCapability): Promise<void> {
    await getPool().query(
      `INSERT INTO clinical_ops_capabilities
       (id,jurisdiction,queue_key,staffing_state,qualified_role_codes,coverage_started_at,coverage_ends_at,
        acknowledgement_sla_minutes,resolution_sla_minutes,configured_by,configured_at,policy_version)
       VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT(id) DO UPDATE SET staffing_state=EXCLUDED.staffing_state,
       qualified_role_codes=EXCLUDED.qualified_role_codes,coverage_started_at=EXCLUDED.coverage_started_at,
       coverage_ends_at=EXCLUDED.coverage_ends_at,acknowledgement_sla_minutes=EXCLUDED.acknowledgement_sla_minutes,
       resolution_sla_minutes=EXCLUDED.resolution_sla_minutes,configured_by=EXCLUDED.configured_by,
       configured_at=EXCLUDED.configured_at,policy_version=EXCLUDED.policy_version`,
      [v.id,v.jurisdiction,v.queue_key,v.staffing_state,JSON.stringify(v.qualified_role_codes),v.coverage_started_at||null,
       v.coverage_ends_at||null,v.acknowledgement_sla_minutes||null,v.resolution_sla_minutes||null,
       v.configured_by,v.configured_at,v.policy_version]
    );
  }

  async listCapabilities(jurisdiction?: string): Promise<ClinicalOperationsCapability[]> {
    const r=jurisdiction
      ? await getPool().query('SELECT * FROM clinical_ops_capabilities WHERE jurisdiction=$1 ORDER BY configured_at DESC',[jurisdiction])
      : await getPool().query('SELECT * FROM clinical_ops_capabilities ORDER BY configured_at DESC');
    return r.rows.map((x:any)=>({...x,qualified_role_codes:json(x.qualified_role_codes,[])}));
  }

  async saveEscalation(v: ClinicalOperationsEscalation): Promise<void> {
    await getPool().query(
      `INSERT INTO clinical_ops_escalations
       (id,subject_user_id,risk_event_id,risk_state,level,jurisdiction,queue_key,state,reason_codes,
        source_summary_reference,assigned_reviewer_id,assigned_reviewer_role,triaged_at,assigned_at,
        review_started_at,action_required_at,follow_up_started_at,resolved_at,cancelled_at,cancellation_reason,
        resolution_summary_reference,created_at,updated_at,policy_version)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state,reason_codes=EXCLUDED.reason_codes,
       assigned_reviewer_id=EXCLUDED.assigned_reviewer_id,assigned_reviewer_role=EXCLUDED.assigned_reviewer_role,
       triaged_at=EXCLUDED.triaged_at,assigned_at=EXCLUDED.assigned_at,review_started_at=EXCLUDED.review_started_at,
       action_required_at=EXCLUDED.action_required_at,follow_up_started_at=EXCLUDED.follow_up_started_at,
       resolved_at=EXCLUDED.resolved_at,cancelled_at=EXCLUDED.cancelled_at,cancellation_reason=EXCLUDED.cancellation_reason,
       resolution_summary_reference=EXCLUDED.resolution_summary_reference,updated_at=EXCLUDED.updated_at`,
      [v.id,v.subject_user_id,v.risk_event_id,v.risk_state,v.level,v.jurisdiction,v.queue_key,v.state,
       JSON.stringify(v.reason_codes),v.source_summary_reference||null,v.assigned_reviewer_id||null,
       v.assigned_reviewer_role||null,v.triaged_at||null,v.assigned_at||null,v.review_started_at||null,
       v.action_required_at||null,v.follow_up_started_at||null,v.resolved_at||null,v.cancelled_at||null,
       v.cancellation_reason||null,v.resolution_summary_reference||null,v.created_at,v.updated_at,v.policy_version]
    );
  }

  async getEscalation(id:string):Promise<ClinicalOperationsEscalation|undefined>{
    const r=await getPool().query('SELECT * FROM clinical_ops_escalations WHERE id=$1',[id]);
    const x:any=r.rows[0]; return x?{...x,reason_codes:json(x.reason_codes,[])}:undefined;
  }

  async listEscalations():Promise<ClinicalOperationsEscalation[]>{
    const r=await getPool().query('SELECT * FROM clinical_ops_escalations ORDER BY created_at DESC,id ASC');
    return r.rows.map((x:any)=>({...x,reason_codes:json(x.reason_codes,[])}));
  }

  async saveFollowUp(v:ClinicalOperationsFollowUp):Promise<void>{
    await getPool().query(
      `INSERT INTO clinical_ops_follow_ups
       (id,escalation_id,subject_user_id,type,responsible_actor_id,channel,scheduled_for,status,completed_at,
        outcome_reference,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,completed_at=EXCLUDED.completed_at,
       outcome_reference=EXCLUDED.outcome_reference,updated_at=EXCLUDED.updated_at`,
      [v.id,v.escalation_id,v.subject_user_id,v.type,v.responsible_actor_id||null,v.channel||null,
       v.scheduled_for,v.status,v.completed_at||null,v.outcome_reference||null,v.created_at,v.updated_at]
    );
  }

  async listFollowUps(escalationId?:string):Promise<ClinicalOperationsFollowUp[]>{
    const r=escalationId
      ? await getPool().query('SELECT * FROM clinical_ops_follow_ups WHERE escalation_id=$1 ORDER BY scheduled_for ASC',[escalationId])
      : await getPool().query('SELECT * FROM clinical_ops_follow_ups ORDER BY scheduled_for ASC');
    return r.rows as ClinicalOperationsFollowUp[];
  }

  async saveIncident(v:ClinicalIncident):Promise<void>{
    await getPool().query(
      `INSERT INTO clinical_ops_incidents
       (id,incident_type,severity,state,affected_component,linked_escalation_id,linked_risk_event_id,
        evidence_references,model_version,safety_policy_version,release_version,corrective_action_references,
        validation_evidence_references,opened_at,contained_at,closed_at,created_by,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18)
       ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state,evidence_references=EXCLUDED.evidence_references,
       corrective_action_references=EXCLUDED.corrective_action_references,
       validation_evidence_references=EXCLUDED.validation_evidence_references,
       contained_at=EXCLUDED.contained_at,closed_at=EXCLUDED.closed_at,updated_at=EXCLUDED.updated_at`,
      [v.id,v.incident_type,v.severity,v.state,v.affected_component,v.linked_escalation_id||null,
       v.linked_risk_event_id||null,JSON.stringify(v.evidence_references),v.model_version||null,
       v.safety_policy_version||null,v.release_version||null,JSON.stringify(v.corrective_action_references),
       JSON.stringify(v.validation_evidence_references),v.opened_at,v.contained_at||null,v.closed_at||null,
       v.created_by,v.updated_at]
    );
  }

  async getIncident(id:string):Promise<ClinicalIncident|undefined>{
    const r=await getPool().query('SELECT * FROM clinical_ops_incidents WHERE id=$1',[id]);
    const x:any=r.rows[0]; return x?this.mapIncident(x):undefined;
  }

  async listIncidents():Promise<ClinicalIncident[]>{
    const r=await getPool().query('SELECT * FROM clinical_ops_incidents ORDER BY opened_at DESC,id ASC');
    return r.rows.map((x:any)=>this.mapIncident(x));
  }

  private mapIncident(x:any):ClinicalIncident{
    return {...x,evidence_references:json(x.evidence_references,[]),
      corrective_action_references:json(x.corrective_action_references,[]),
      validation_evidence_references:json(x.validation_evidence_references,[])};
  }
}
