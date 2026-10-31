import { AuthorizationError,DomainInvariantError,NotFoundError } from '../../platform/errors/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { AuditService } from '../../platform/audit/index.js';
import {
  HumanDecision,ReleaseReadinessCertification,ReleaseRiskSignals,ReleaseValidationCandidate,
  ValidationAttestation,ValidationGate
} from '../domain/types.js';
import { ValidationRiskClassifier } from '../policies/risk_classifier.js';
import { ValidationAttestationPolicy } from '../policies/attestation_policy.js';
import { ValidationRepository } from '../repositories/index.js';

const allGates:ValidationGate[]=[
  'AUTOMATED_QA','SECURITY_RED_TEAM','CLINICAL','AI_SAFETY','PRIVACY_DPIA',
  'KENYA_REGULATORY','ACCESSIBILITY','PERFORMANCE','RELIABILITY_DR','INCIDENT_READINESS'
];

export class ReleaseAssuranceService{
  static async createCandidate(input:{
    release_id:string;version:string;build_sha:string;environment:'staging'|'production';
    initiator_id:string;feature_keys:string[];risk_signals:ReleaseRiskSignals;
  }):Promise<ReleaseValidationCandidate>{
    if(!input.release_id||!input.version||!input.build_sha||!input.initiator_id)throw new DomainInvariantError('Release candidate identity, version, build SHA and initiator are required.');
    const existing=await ValidationRepository.getCandidate(input.release_id);
    if(existing&&existing.status==='CERTIFIED'&&existing.build_sha!==input.build_sha){
      existing.status='SUPERSEDED';await ValidationRepository.saveCandidate(existing);
    }
    const risk_class=ValidationRiskClassifier.classify(input.risk_signals);
    const candidate:ReleaseValidationCandidate={
      id:existing?.id||generateUUIDv7(),release_id:input.release_id,version:input.version,build_sha:input.build_sha,
      environment:input.environment,risk_class,required_gates:ValidationRiskClassifier.requiredGates(risk_class,input.risk_signals),
      initiator_id:input.initiator_id,feature_keys:[...new Set(input.feature_keys)],created_at:new Date().toISOString(),status:'OPEN'
    };
    await ValidationRepository.saveCandidate(candidate);
    return candidate;
  }

  static async attest(input:{
    release_id:string;build_sha:string;gate:ValidationGate;reviewer_id:string;reviewer_role:string;
    decision:HumanDecision;conditions?:string[];evidence_refs:string[];expires_at?:string;
  }):Promise<ValidationAttestation>{
    const candidate=await ValidationRepository.getCandidate(input.release_id);
    if(!candidate)throw new NotFoundError('Release validation candidate not found.');
    if(candidate.build_sha!==input.build_sha)throw new DomainInvariantError('Attestation build SHA does not match release candidate.');
    if(!candidate.required_gates.includes(input.gate))throw new DomainInvariantError('Attestation gate is not required for this candidate.');
    if(!ValidationAttestationPolicy.requiresHuman(input.gate,candidate.risk_class))throw new DomainInvariantError('This validation gate does not require a human attestation.');
    if(!ValidationAttestationPolicy.roleAllowed(input.gate,input.reviewer_role))throw new AuthorizationError('Reviewer role is not authorized for this validation gate.',{errorCode:'AUTHZ_002'});
    if(candidate.initiator_id===input.reviewer_id)throw new AuthorizationError('Release initiator cannot self-attest a mandatory human validation gate.',{errorCode:'AUTHZ_004'});
    if(!input.evidence_refs.length)throw new DomainInvariantError('Human validation attestation requires evidence references.');
    const evidence=await ValidationRepository.listEvidence(input.release_id);
    const validRefs=new Set(evidence.filter(x=>x.build_sha===input.build_sha).map(x=>x.id));
    if(input.evidence_refs.some(x=>!validRefs.has(x)))throw new DomainInvariantError('Attestation references evidence from another build or an unknown evidence item.');
    const value:ValidationAttestation={
      id:generateUUIDv7(),release_id:input.release_id,build_sha:input.build_sha,gate:input.gate,
      reviewer_id:input.reviewer_id,reviewer_role:input.reviewer_role.toUpperCase(),decision:input.decision,
      conditions:input.conditions||[],evidence_refs:[...new Set(input.evidence_refs)],attested_at:new Date().toISOString(),expires_at:input.expires_at
    };
    await ValidationRepository.saveAttestation(value);
    AuditService.record({
      actor_type:'STAFF',actor_id:value.reviewer_id,action:'VALIDATION.HUMAN_ATTESTATION',
      resource_type:'release_validation',resource_id:value.release_id,purpose:'Release Assurance Human Review',
      authorization_basis:{gate:value.gate,role:value.reviewer_role,decision:value.decision,build_sha:value.build_sha},
      result:value.decision==='BLOCKED'?'DENIED':'ALLOWED',
      metadata:{gate:value.gate,decision:value.decision,evidence_refs:value.evidence_refs}
    });
    return value;
  }

  static async evaluate(releaseId:string):Promise<{
    candidate:ReleaseValidationCandidate;
    gate_status:Record<ValidationGate,'GREEN'|'RED'|'PENDING'|'NOT_REQUIRED'>;
    blockers:string[];
    evidence_refs:string[];
    attestation_ids:string[];
  }>{
    const candidate=await ValidationRepository.getCandidate(releaseId);
    if(!candidate)throw new NotFoundError('Release validation candidate not found.');
    const now=Date.now();
    const evidence=(await ValidationRepository.listEvidence(releaseId)).filter(x=>x.build_sha===candidate.build_sha);
    const attestations=(await ValidationRepository.listAttestations(releaseId)).filter(x=>x.build_sha===candidate.build_sha);
    const status=Object.fromEntries(allGates.map(g=>[g,candidate.required_gates.includes(g)?'PENDING':'NOT_REQUIRED'])) as Record<ValidationGate,'GREEN'|'RED'|'PENDING'|'NOT_REQUIRED'>;
    const blockers:string[]=[];

    for(const gate of candidate.required_gates){
      const gateEvidence=evidence.filter(x=>x.gate===gate).sort((a,b)=>Date.parse(b.executed_at)-Date.parse(a.executed_at))[0];
      if(!gateEvidence){blockers.push(`${gate}:EVIDENCE_MISSING`);continue;}
      if(gateEvidence.expires_at&&Date.parse(gateEvidence.expires_at)<=now){
        status[gate]='RED';blockers.push(`${gate}:EVIDENCE_EXPIRED`);continue;
      }
      if(gateEvidence.status!=='PASS'){
        status[gate]='RED';blockers.push(`${gate}:EVIDENCE_${gateEvidence.status}`);continue;
      }
      if(gateEvidence.critical_findings>0){
        status[gate]='RED';blockers.push(`${gate}:CRITICAL_FINDINGS_OPEN`);continue;
      }
      if(gate==='SECURITY_RED_TEAM'&&gateEvidence.high_findings>0){
        status[gate]='RED';blockers.push(`${gate}:HIGH_FINDINGS_OPEN`);continue;
      }

      if(ValidationAttestationPolicy.requiresHuman(gate,candidate.risk_class)){
        const att=attestations.filter(x=>x.gate===gate).sort((a,b)=>Date.parse(b.attested_at)-Date.parse(a.attested_at))[0];
        if(!att){blockers.push(`${gate}:HUMAN_ATTESTATION_MISSING`);continue;}
        if(att.expires_at&&Date.parse(att.expires_at)<=now){status[gate]='RED';blockers.push(`${gate}:HUMAN_ATTESTATION_EXPIRED`);continue;}
        if(att.decision==='BLOCKED'){status[gate]='RED';blockers.push(`${gate}:HUMAN_REVIEW_BLOCKED`);continue;}
      }
      status[gate]='GREEN';
    }

    const anyRed=Object.values(status).includes('RED');
    const anyPending=Object.values(status).includes('PENDING');
    candidate.status=anyRed?'BLOCKED':anyPending?'READY_FOR_HUMAN_REVIEW':'OPEN';
    await ValidationRepository.saveCandidate(candidate);

    return {
      candidate,gate_status:status,blockers,
      evidence_refs:evidence.map(x=>x.id),attestation_ids:attestations.map(x=>x.id)
    };
  }

  static async certify(input:{release_id:string;build_sha:string;certifier_id:string;certifier_role:string;valid_until?:string}):Promise<ReleaseReadinessCertification>{
    const evaluated=await this.evaluate(input.release_id);
    const c=evaluated.candidate;
    if(c.build_sha!==input.build_sha)throw new DomainInvariantError('Certification build SHA does not match candidate.');
    if(input.certifier_role.toUpperCase()!=='RELEASE_AUTHORITY')throw new AuthorizationError('Only RELEASE_AUTHORITY may issue final release-readiness certification.',{errorCode:'AUTHZ_002'});
    if(c.initiator_id===input.certifier_id)throw new AuthorizationError('Release initiator cannot issue final release-readiness certification.',{errorCode:'AUTHZ_004'});
    if(evaluated.blockers.length||Object.values(evaluated.gate_status).some(x=>x==='RED'||x==='PENDING')){
      throw new DomainInvariantError(`RELEASE_READINESS_BLOCKED: ${evaluated.blockers.join(',')}`);
    }
    const value:ReleaseReadinessCertification={
      id:generateUUIDv7(),release_id:c.release_id,build_sha:c.build_sha,risk_class:c.risk_class,decision:'CERTIFIED',
      blocking_reasons:[],gate_status:evaluated.gate_status,evidence_refs:evaluated.evidence_refs,
      attestation_ids:evaluated.attestation_ids,certified_by:input.certifier_id,certified_at:new Date().toISOString(),expires_at:input.valid_until
    };
    c.status='CERTIFIED';
    await ValidationRepository.saveCandidate(c);
    await ValidationRepository.saveCertification(value);
    AuditService.record({
      actor_type:'STAFF',actor_id:input.certifier_id,action:'VALIDATION.RELEASE_CERTIFIED',
      resource_type:'release_validation',resource_id:c.release_id,purpose:'Production Release Readiness Certification',
      authorization_basis:{role:'RELEASE_AUTHORITY',build_sha:c.build_sha},result:'ALLOWED',
      metadata:{risk_class:c.risk_class,evidence_count:value.evidence_refs.length,attestation_count:value.attestation_ids.length}
    });
    return value;
  }

  static async productionAuthorizationStatus(releaseId:string,buildSha?:string):Promise<{authorized:boolean;reasons:string[];certification?:ReleaseReadinessCertification}>{
    const cert=await ValidationRepository.getCertification(releaseId);
    if(!cert)return {authorized:false,reasons:['RELEASE_READINESS_CERTIFICATION_MISSING']};
    const reasons:string[]=[];
    if(cert.decision!=='CERTIFIED')reasons.push('RELEASE_READINESS_NOT_CERTIFIED');
    if(buildSha&&cert.build_sha!==buildSha)reasons.push('CERTIFICATION_BUILD_SHA_MISMATCH');
    if(cert.expires_at&&Date.parse(cert.expires_at)<=Date.now())reasons.push('RELEASE_READINESS_CERTIFICATION_EXPIRED');
    if(Object.values(cert.gate_status).some(x=>x==='RED'||x==='PENDING'))reasons.push('CERTIFICATION_CONTAINS_OPEN_GATE');
    return {authorized:reasons.length===0,reasons,certification:cert};
  }
}
