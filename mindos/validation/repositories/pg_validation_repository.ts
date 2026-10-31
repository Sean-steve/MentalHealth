import { getPool } from '../../platform/database/index.js';
import { IValidationRepository } from './interfaces.js';
import { ReleaseReadinessCertification,ReleaseValidationCandidate,ValidationAttestation,ValidationEvidence } from '../domain/types.js';

const parse=<T>(v:unknown,f:T):T=>{if(v===null||v===undefined)return f;if(typeof v!=='string')return v as T;try{return JSON.parse(v) as T;}catch{return f;}};

export class PgValidationRepository implements IValidationRepository{
  async saveCandidate(v:ReleaseValidationCandidate){
    await getPool().query(`INSERT INTO validation_release_candidates
      (id,release_id,version,build_sha,environment,risk_class,required_gates,initiator_id,feature_keys,status,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10,$11)
      ON CONFLICT(release_id) DO UPDATE SET version=EXCLUDED.version,build_sha=EXCLUDED.build_sha,environment=EXCLUDED.environment,
      risk_class=EXCLUDED.risk_class,required_gates=EXCLUDED.required_gates,feature_keys=EXCLUDED.feature_keys,status=EXCLUDED.status`,
      [v.id,v.release_id,v.version,v.build_sha,v.environment,v.risk_class,JSON.stringify(v.required_gates),v.initiator_id,JSON.stringify(v.feature_keys),v.status,v.created_at]);
  }
  async getCandidate(releaseId:string){
    const r=await getPool().query('SELECT * FROM validation_release_candidates WHERE release_id=$1',[releaseId]);
    const x:any=r.rows[0];if(!x)return undefined;
    return {...x,required_gates:parse(x.required_gates,[]),feature_keys:parse(x.feature_keys,[])} as ReleaseValidationCandidate;
  }
  async saveEvidence(v:ValidationEvidence){
    await getPool().query(`INSERT INTO validation_evidence
      (id,release_id,build_sha,gate,status,evidence_type,evidence_hash,source,tool_version,summary_json,critical_findings,high_findings,executed_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14)`,
      [v.id,v.release_id,v.build_sha,v.gate,v.status,v.evidence_type,v.evidence_hash,v.source,v.tool_version||null,JSON.stringify(v.summary),v.critical_findings,v.high_findings,v.executed_at,v.expires_at||null]);
  }
  async listEvidence(releaseId:string){
    const r=await getPool().query('SELECT * FROM validation_evidence WHERE release_id=$1 ORDER BY executed_at DESC',[releaseId]);
    return r.rows.map((x:any)=>({...x,summary:parse(x.summary_json,{}),critical_findings:Number(x.critical_findings),high_findings:Number(x.high_findings),expires_at:x.expires_at||undefined}));
  }
  async saveAttestation(v:ValidationAttestation){
    await getPool().query(`INSERT INTO validation_attestations
      (id,release_id,build_sha,gate,reviewer_id,reviewer_role,decision,conditions,evidence_refs,attested_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)`,
      [v.id,v.release_id,v.build_sha,v.gate,v.reviewer_id,v.reviewer_role,v.decision,JSON.stringify(v.conditions),JSON.stringify(v.evidence_refs),v.attested_at,v.expires_at||null]);
  }
  async listAttestations(releaseId:string){
    const r=await getPool().query('SELECT * FROM validation_attestations WHERE release_id=$1 ORDER BY attested_at DESC',[releaseId]);
    return r.rows.map((x:any)=>({...x,conditions:parse(x.conditions,[]),evidence_refs:parse(x.evidence_refs,[]),expires_at:x.expires_at||undefined}));
  }
  async saveCertification(v:ReleaseReadinessCertification){
    await getPool().query(`INSERT INTO validation_release_certifications
      (id,release_id,build_sha,risk_class,decision,blocking_reasons,gate_status,evidence_refs,attestation_ids,certified_by,certified_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12)
      ON CONFLICT(release_id) DO UPDATE SET build_sha=EXCLUDED.build_sha,risk_class=EXCLUDED.risk_class,decision=EXCLUDED.decision,
      blocking_reasons=EXCLUDED.blocking_reasons,gate_status=EXCLUDED.gate_status,evidence_refs=EXCLUDED.evidence_refs,
      attestation_ids=EXCLUDED.attestation_ids,certified_by=EXCLUDED.certified_by,certified_at=EXCLUDED.certified_at,expires_at=EXCLUDED.expires_at`,
      [v.id,v.release_id,v.build_sha,v.risk_class,v.decision,JSON.stringify(v.blocking_reasons),JSON.stringify(v.gate_status),JSON.stringify(v.evidence_refs),JSON.stringify(v.attestation_ids),v.certified_by||null,v.certified_at,v.expires_at||null]);
  }
  async getCertification(releaseId:string){
    const r=await getPool().query('SELECT * FROM validation_release_certifications WHERE release_id=$1',[releaseId]);
    const x:any=r.rows[0];if(!x)return undefined;
    return {...x,blocking_reasons:parse(x.blocking_reasons,[]),gate_status:parse(x.gate_status,{}),evidence_refs:parse(x.evidence_refs,[]),attestation_ids:parse(x.attestation_ids,[]),certified_by:x.certified_by||undefined,expires_at:x.expires_at||undefined} as ReleaseReadinessCertification;
  }
}
