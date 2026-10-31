import { getPool } from '../../platform/database/index.js';
import { ILaunchRepository } from './interfaces.js';
import {
  LaunchAuthorizationDecision,LaunchEvidencePackage,LaunchMonitoringSnapshot,LaunchParticipant,LaunchProgram,PostLaunchReview
} from '../domain/types.js';

const parse=<T>(v:unknown,f:T):T=>{if(v===null||v===undefined)return f;if(typeof v!=='string')return v as T;try{return JSON.parse(v) as T;}catch{return f;}};
const iso=(v:unknown):string|undefined=>v===null||v===undefined?undefined:(v instanceof Date?v.toISOString():new Date(String(v)).toISOString());

export class PgLaunchRepository implements ILaunchRepository{
  async saveProgram(v:LaunchProgram){
    await getPool().query(`INSERT INTO launch_programs
      (id,code,release_id,version,build_sha,jurisdiction,state,owner_id,feature_keys,scope_json,beta_max_participants,limited_launch_max_participants,
       required_external_authorities,regulatory_scope_evidence_ref,beta_starts_at,beta_ends_at,limited_launch_starts_at,created_at,updated_at,paused_reason)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19,$20)
      ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state,feature_keys=EXCLUDED.feature_keys,scope_json=EXCLUDED.scope_json,
      beta_max_participants=EXCLUDED.beta_max_participants,limited_launch_max_participants=EXCLUDED.limited_launch_max_participants,
      required_external_authorities=EXCLUDED.required_external_authorities,regulatory_scope_evidence_ref=EXCLUDED.regulatory_scope_evidence_ref,
      beta_starts_at=EXCLUDED.beta_starts_at,beta_ends_at=EXCLUDED.beta_ends_at,limited_launch_starts_at=EXCLUDED.limited_launch_starts_at,
      updated_at=EXCLUDED.updated_at,paused_reason=EXCLUDED.paused_reason`,
      [v.id,v.code,v.release_id,v.version,v.build_sha,v.jurisdiction,v.state,v.owner_id,JSON.stringify(v.feature_keys),JSON.stringify(v.scope),
       v.beta_max_participants,v.limited_launch_max_participants,JSON.stringify(v.required_external_authorities),v.regulatory_scope_evidence_ref,
       v.beta_starts_at||null,v.beta_ends_at||null,v.limited_launch_starts_at||null,v.created_at,v.updated_at,v.paused_reason||null]);
  }
  private rowProgram(x:any):LaunchProgram{return {...x,feature_keys:parse(x.feature_keys,[]),scope:parse(x.scope_json,{}),required_external_authorities:parse(x.required_external_authorities,[]),
    beta_max_participants:Number(x.beta_max_participants),limited_launch_max_participants:Number(x.limited_launch_max_participants),
    beta_starts_at:iso(x.beta_starts_at),beta_ends_at:iso(x.beta_ends_at),limited_launch_starts_at:iso(x.limited_launch_starts_at),
    created_at:iso(x.created_at)!,updated_at:iso(x.updated_at)!,paused_reason:x.paused_reason||undefined};}
  async getProgram(idOrCode:string){const r=await getPool().query('SELECT * FROM launch_programs WHERE id::text=$1 OR code=$1 LIMIT 1',[idOrCode]);return r.rows[0]?this.rowProgram(r.rows[0]):undefined;}
  async listPrograms(){const r=await getPool().query('SELECT * FROM launch_programs ORDER BY created_at DESC');return r.rows.map((x:any)=>this.rowProgram(x));}
  async saveParticipant(v:LaunchParticipant){
    await getPool().query(`INSERT INTO launch_participants
      (id,program_id,subject_ref_hash,participant_type,jurisdiction,state,invitation_ref,consent_receipt_ref,eligibility_evidence_refs,enrolled_at,withdrawn_at,suspended_reason,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14)
      ON CONFLICT(program_id,subject_ref_hash) DO UPDATE SET state=EXCLUDED.state,consent_receipt_ref=EXCLUDED.consent_receipt_ref,
      eligibility_evidence_refs=EXCLUDED.eligibility_evidence_refs,enrolled_at=EXCLUDED.enrolled_at,withdrawn_at=EXCLUDED.withdrawn_at,
      suspended_reason=EXCLUDED.suspended_reason,updated_at=EXCLUDED.updated_at`,
      [v.id,v.program_id,v.subject_ref_hash,v.participant_type,v.jurisdiction,v.state,v.invitation_ref,v.consent_receipt_ref,
       JSON.stringify(v.eligibility_evidence_refs),v.enrolled_at||null,v.withdrawn_at||null,v.suspended_reason||null,v.created_at,v.updated_at]);
  }
  private rowParticipant(x:any):LaunchParticipant{return {...x,eligibility_evidence_refs:parse(x.eligibility_evidence_refs,[]),enrolled_at:iso(x.enrolled_at),withdrawn_at:iso(x.withdrawn_at),created_at:iso(x.created_at)!,updated_at:iso(x.updated_at)!,suspended_reason:x.suspended_reason||undefined};}
  async getParticipantByHash(programId:string,subjectHash:string){const r=await getPool().query('SELECT * FROM launch_participants WHERE program_id=$1 AND subject_ref_hash=$2',[programId,subjectHash]);return r.rows[0]?this.rowParticipant(r.rows[0]):undefined;}
  async listParticipants(programId:string){const r=await getPool().query('SELECT * FROM launch_participants WHERE program_id=$1 ORDER BY created_at',[programId]);return r.rows.map((x:any)=>this.rowParticipant(x));}
  async saveEvidencePackage(v:LaunchEvidencePackage){
    await getPool().query(`INSERT INTO launch_evidence_packages(id,program_id,release_id,build_sha,items,manifest_hash,generated_by,generated_at)
      VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
      [v.id,v.program_id,v.release_id,v.build_sha,JSON.stringify(v.items),v.manifest_hash,v.generated_by,v.generated_at]);
  }
  async getLatestEvidencePackage(programId:string){const r=await getPool().query('SELECT * FROM launch_evidence_packages WHERE program_id=$1 ORDER BY generated_at DESC LIMIT 1',[programId]);const x:any=r.rows[0];return x?{...x,items:parse(x.items,[]),generated_at:iso(x.generated_at)!}:undefined;}
  async saveMonitoringSnapshot(v:LaunchMonitoringSnapshot){
    await getPool().query(`INSERT INTO launch_monitoring_snapshots
      (id,program_id,build_sha,environment,status,critical_launch_blockers,open_critical_incidents,safety_resources_valid,incident_response_ready,rollback_ready,database_healthy,dr_ready,privacy_lifecycle_clear,notes_codes,captured_by,captured_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16)`,
      [v.id,v.program_id,v.build_sha,v.environment,v.status,v.critical_launch_blockers,v.open_critical_incidents,v.safety_resources_valid,v.incident_response_ready,v.rollback_ready,v.database_healthy,v.dr_ready,v.privacy_lifecycle_clear,JSON.stringify(v.notes_codes),v.captured_by,v.captured_at]);
  }
  async listMonitoringSnapshots(programId:string){const r=await getPool().query('SELECT * FROM launch_monitoring_snapshots WHERE program_id=$1 ORDER BY captured_at',[programId]);return r.rows.map((x:any)=>({...x,critical_launch_blockers:Number(x.critical_launch_blockers),open_critical_incidents:Number(x.open_critical_incidents),notes_codes:parse(x.notes_codes,[]),captured_at:iso(x.captured_at)!}));}
  async saveDecision(v:LaunchAuthorizationDecision){
    await getPool().query(`INSERT INTO launch_authorization_decisions(id,program_id,build_sha,decision_type,decision,reviewer_id,reviewer_role,evidence_package_id,conditions,decided_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
      [v.id,v.program_id,v.build_sha,v.decision_type,v.decision,v.reviewer_id,v.reviewer_role,v.evidence_package_id,JSON.stringify(v.conditions),v.decided_at]);
  }
  async listDecisions(programId:string){const r=await getPool().query('SELECT * FROM launch_authorization_decisions WHERE program_id=$1 ORDER BY decided_at',[programId]);return r.rows.map((x:any)=>({...x,conditions:parse(x.conditions,[]),decided_at:iso(x.decided_at)!}));}
  async savePostLaunchReview(v:PostLaunchReview){
    await getPool().query(`INSERT INTO launch_post_reviews(id,program_id,build_sha,window_started_at,window_ended_at,incident_refs,monitoring_snapshot_refs,evidence_refs,reviewer_id,reviewer_role,decision,findings,corrective_actions,reviewed_at)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,$12::jsonb,$13::jsonb,$14)`,
      [v.id,v.program_id,v.build_sha,v.window_started_at,v.window_ended_at,JSON.stringify(v.incident_refs),JSON.stringify(v.monitoring_snapshot_refs),
       JSON.stringify(v.evidence_refs),v.reviewer_id,v.reviewer_role,v.decision,JSON.stringify(v.findings),JSON.stringify(v.corrective_actions),v.reviewed_at]);
  }
  async listPostLaunchReviews(programId:string){const r=await getPool().query('SELECT * FROM launch_post_reviews WHERE program_id=$1 ORDER BY reviewed_at',[programId]);return r.rows.map((x:any)=>({...x,window_started_at:iso(x.window_started_at)!,window_ended_at:iso(x.window_ended_at)!,reviewed_at:iso(x.reviewed_at)!,incident_refs:parse(x.incident_refs,[]),monitoring_snapshot_refs:parse(x.monitoring_snapshot_refs,[]),evidence_refs:parse(x.evidence_refs,[]),findings:parse(x.findings,[]),corrective_actions:parse(x.corrective_actions,[])}));}
}
