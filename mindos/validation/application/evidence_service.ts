import { createHash } from 'node:crypto';
import { DomainInvariantError,NotFoundError } from '../../platform/errors/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { AuditService } from '../../platform/audit/index.js';
import { ValidationEvidence,ValidationGate,ValidationEvidenceStatus } from '../domain/types.js';
import { ValidationRepository } from '../repositories/index.js';

const forbidden=/(journal|prompt|clinical_note|conversation_text|raw_response|assessment_answers|password|token|secret)/i;

function canonicalHash(input:unknown):string{
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function assertMinimized(value:unknown,path='summary'):void{
  if(value===null||value===undefined)return;
  if(typeof value==='string'){
    if(value.length>500)throw new DomainInvariantError(`Validation evidence field ${path} is too large; store a reference/hash instead.`);
    return;
  }
  if(Array.isArray(value)){value.forEach((v,i)=>assertMinimized(v,`${path}[${i}]`));return;}
  if(typeof value==='object'){
    for(const [k,v] of Object.entries(value as Record<string,unknown>)){
      if(forbidden.test(k))throw new DomainInvariantError(`Sensitive/raw validation evidence field is prohibited: ${path}.${k}`);
      assertMinimized(v,`${path}.${k}`);
    }
  }
}

export class ValidationEvidenceService{
  static async recordAutomated(input:{
    release_id:string;build_sha:string;gate:ValidationGate;status:ValidationEvidenceStatus;
    evidence_type:string;source:string;tool_version?:string;summary:Record<string,unknown>;
    critical_findings?:number;high_findings?:number;expires_at?:string;
  }):Promise<ValidationEvidence>{
    const candidate=await ValidationRepository.getCandidate(input.release_id);
    if(!candidate)throw new NotFoundError('Release validation candidate not found.');
    if(candidate.build_sha!==input.build_sha)throw new DomainInvariantError('Validation evidence build SHA does not match release candidate.');
    if(!candidate.required_gates.includes(input.gate))throw new DomainInvariantError('Validation evidence gate is not required for this release candidate.');
    assertMinimized(input.summary);
    const critical=input.critical_findings||0;
    const high=input.high_findings||0;
    if(critical<0||high<0)throw new DomainInvariantError('Finding counts cannot be negative.');
    if(input.status==='PASS'&&critical>0)throw new DomainInvariantError('Evidence with unresolved critical findings cannot be marked PASS.');
    const executed_at=new Date().toISOString();
    const material={
      release_id:input.release_id,build_sha:input.build_sha,gate:input.gate,status:input.status,
      evidence_type:input.evidence_type,source:input.source,tool_version:input.tool_version||null,
      summary:input.summary,critical_findings:critical,high_findings:high,executed_at
    };
    const evidence:ValidationEvidence={
      id:generateUUIDv7(),...material,evidence_hash:canonicalHash(material),expires_at:input.expires_at
    };
    await ValidationRepository.saveEvidence(evidence);
    AuditService.record({
      actor_type:'SERVICE',actor_id:'validation_evidence_service',action:'VALIDATION.EVIDENCE_RECORDED',
      resource_type:'release_validation',resource_id:input.release_id,purpose:'Release Assurance Evidence',
      authorization_basis:{gate:input.gate,build_sha:input.build_sha},result:input.status==='PASS'?'SUCCESS':'FAILED',
      metadata:{gate:input.gate,status:input.status,evidence_hash:evidence.evidence_hash,critical_findings:critical,high_findings:high}
    });
    return evidence;
  }
}
