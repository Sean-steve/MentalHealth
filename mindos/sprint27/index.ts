import { Router,Request } from 'express';
import { AuthorizationError } from '../platform/errors/index.js';
import { ReleaseAssuranceService,ValidationEvidenceService } from '../validation/index.js';
import { getSprint27RuntimeStatus } from './runtime.js';

export const sprint27Router=Router();

const VIEW=new Set(['QA_LEAD','RELEASE_AUTHORITY','SECURITY_REVIEWER','CLINICAL_REVIEWER','CLINICAL_ADMIN','PRIVACY_OFFICER','REGULATORY_REVIEWER','AI_SAFETY_REVIEWER','SRE_ADMIN']);
const CANDIDATE=new Set(['QA_LEAD','RELEASE_AUTHORITY']);
const EVIDENCE=new Set(['QA_LEAD','SECURITY_REVIEWER','SRE_ADMIN','RELEASE_AUTOMATION']);
const ATTEST=new Set(['SECURITY_REVIEWER','SECURITY_ADMIN','CLINICAL_REVIEWER','CLINICAL_ADMIN','PRIVACY_OFFICER','REGULATORY_REVIEWER','AI_SAFETY_REVIEWER']);

function actor(req:Request,allowed:Set<string>):{actor_id:string;actor_role:string}{
  const actor_id=String(req.headers['x-actor-id']||'');
  const actor_role=String(req.headers['x-actor-role']||'').toUpperCase();
  if(!actor_id||!allowed.has(actor_role))throw new AuthorizationError('Release-assurance access requires an authorized validation/governance role.',{errorCode:'AUTHZ_002'});
  return {actor_id,actor_role};
}

sprint27Router.post('/validation/releases',async(req,res,next)=>{
  try{
    const a=actor(req,CANDIDATE);
    const candidate=await ReleaseAssuranceService.createCandidate({
      release_id:req.body.release_id,version:req.body.version,build_sha:req.body.build_sha,
      environment:req.body.environment||'production',initiator_id:a.actor_id,
      feature_keys:req.body.feature_keys||[],risk_signals:req.body.risk_signals||{}
    });
    res.status(201).json({candidate});
  }catch(e){next(e);}
});

sprint27Router.post('/validation/releases/:release_id/evidence',async(req,res,next)=>{
  try{
    actor(req,EVIDENCE);
    const evidence=await ValidationEvidenceService.recordAutomated({
      release_id:req.params.release_id,build_sha:req.body.build_sha,gate:req.body.gate,status:req.body.status,
      evidence_type:req.body.evidence_type,source:req.body.source,tool_version:req.body.tool_version,
      summary:req.body.summary||{},critical_findings:req.body.critical_findings,high_findings:req.body.high_findings,
      expires_at:req.body.expires_at
    });
    res.status(201).json({evidence});
  }catch(e){next(e);}
});

sprint27Router.post('/validation/releases/:release_id/attestations',async(req,res,next)=>{
  try{
    const a=actor(req,ATTEST);
    const attestation=await ReleaseAssuranceService.attest({
      release_id:req.params.release_id,build_sha:req.body.build_sha,gate:req.body.gate,
      reviewer_id:a.actor_id,reviewer_role:a.actor_role,decision:req.body.decision,
      conditions:req.body.conditions||[],evidence_refs:req.body.evidence_refs||[],expires_at:req.body.expires_at
    });
    res.status(201).json({attestation});
  }catch(e){next(e);}
});

sprint27Router.get('/validation/releases/:release_id',async(req,res,next)=>{
  try{actor(req,VIEW);res.json(await ReleaseAssuranceService.evaluate(req.params.release_id));}catch(e){next(e);}
});

sprint27Router.post('/validation/releases/:release_id/certify',async(req,res,next)=>{
  try{
    const a=actor(req,new Set(['RELEASE_AUTHORITY']));
    const certification=await ReleaseAssuranceService.certify({
      release_id:req.params.release_id,build_sha:req.body.build_sha,certifier_id:a.actor_id,
      certifier_role:a.actor_role,valid_until:req.body.valid_until
    });
    res.status(201).json({certification});
  }catch(e){next(e);}
});

sprint27Router.get('/validation/releases/:release_id/authorization',async(req,res,next)=>{
  try{
    actor(req,VIEW);
    res.json(await ReleaseAssuranceService.productionAuthorizationStatus(req.params.release_id,String(req.query.build_sha||'')||undefined));
  }catch(e){next(e);}
});

sprint27Router.get('/sprint-27/status',(_req,res)=>{
  res.json({
    sprint:27,title:'Validation & Release Assurance',status:'IN_PROGRESS',runtime:getSprint27RuntimeStatus(),
    implemented:[
      'risk_class_validation_depth','exact_build_validation_evidence','security_red_team_gate',
      'clinical_human_attestation','ai_safety_human_attestation','privacy_dpia_human_attestation',
      'kenya_regulatory_human_attestation','accessibility_gate','performance_gate',
      'reliability_dr_gate','incident_readiness_gate','production_release_assurance_enforcement'
    ],
    pending:['automated_validation_scripts','full_sprint27_certification']
  });
});

export * from './runtime.js';
