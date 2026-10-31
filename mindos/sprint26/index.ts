import { Router,Request } from 'express';
import { AuthorizationError } from '../platform/errors/index.js';
import {
  DataLifecycleOrchestrator,
  DisasterRecoveryService,
  HardeningObservabilityService,
  HardeningReadinessService,
  HardeningRepository,
  ReliabilityPolicyEngine
} from '../hardening/index.js';
import { getSprint26RuntimeStatus } from './runtime.js';

export const sprint26Router=Router();

const VIEW_ROLES=new Set(['SRE_VIEWER','SRE_ADMIN','SECURITY_ADMIN','PRIVACY_OFFICER']);
const SRE_ADMIN=new Set(['SRE_ADMIN','SECURITY_ADMIN']);
const PRIVACY_ADMIN=new Set(['PRIVACY_OFFICER','SECURITY_ADMIN']);

function actor(req:Request,allowed:Set<string>):{actor_id:string;actor_role:string}{
  const actor_id=String(req.headers['x-actor-id']||'');
  const actor_role=String(req.headers['x-actor-role']||'').toUpperCase();
  if(!actor_id||!allowed.has(actor_role))throw new AuthorizationError('Platform hardening access requires an authorized SRE/security/privacy role.',{errorCode:'AUTHZ_002'});
  return {actor_id,actor_role};
}

sprint26Router.get('/hardening/readiness',async(req,res,next)=>{
  try{actor(req,VIEW_ROLES);res.json(await HardeningReadinessService.snapshot(String(req.query.service_key||'PRIMARY_POSTGRES')));}catch(e){next(e);}
});

sprint26Router.get('/hardening/observability',(req,res,next)=>{
  try{actor(req,VIEW_ROLES);res.json(HardeningObservabilityService.snapshot());}catch(e){next(e);}
});

sprint26Router.get('/hardening/reliability/hierarchy',(req,res,next)=>{
  try{actor(req,VIEW_ROLES);res.json({hierarchy:ReliabilityPolicyEngine.hierarchy()});}catch(e){next(e);}
});

sprint26Router.get('/hardening/reliability/degradation/:dependency',(req,res,next)=>{
  try{
    actor(req,VIEW_ROLES);
    res.json(ReliabilityPolicyEngine.evaluate(req.params.dependency as any,String(req.query.state||'DOWN').toUpperCase() as any));
  }catch(e){next(e);}
});

sprint26Router.post('/hardening/privacy/lifecycle',async(req,res,next)=>{
  try{
    actor(req,PRIVACY_ADMIN);
    const job=await DataLifecycleOrchestrator.request({
      subject_id:req.body.subject_id,request_type:req.body.request_type,reason_code:req.body.reason_code,target_stores:req.body.target_stores
    });
    res.status(201).json({job});
  }catch(e){next(e);}
});

sprint26Router.post('/hardening/privacy/lifecycle/:id/acknowledge',async(req,res,next)=>{
  try{
    actor(req,PRIVACY_ADMIN);
    res.json(await DataLifecycleOrchestrator.acknowledge({
      job_id:req.params.id,store_key:req.body.store_key,status:req.body.status,evidence_ref:req.body.evidence_ref,detail_code:req.body.detail_code
    }));
  }catch(e){next(e);}
});

sprint26Router.get('/hardening/privacy/lifecycle/:id',async(req,res,next)=>{
  try{actor(req,PRIVACY_ADMIN);res.json(await DataLifecycleOrchestrator.status(req.params.id));}catch(e){next(e);}
});

sprint26Router.post('/hardening/recovery-targets',async(req,res,next)=>{
  try{
    const a=actor(req,SRE_ADMIN);
    const target=await DisasterRecoveryService.configureTarget({
      service_key:req.body.service_key,criticality:req.body.criticality,rpo_seconds:Number(req.body.rpo_seconds),
      rto_seconds:Number(req.body.rto_seconds),configured_by:a.actor_id
    });
    res.status(201).json({target});
  }catch(e){next(e);}
});

sprint26Router.get('/hardening/recovery-targets',async(req,res,next)=>{
  try{actor(req,VIEW_ROLES);res.json({targets:await HardeningRepository.listRecoveryTargets()});}catch(e){next(e);}
});

sprint26Router.get('/hardening/dr/:service_key',async(req,res,next)=>{
  try{actor(req,VIEW_ROLES);res.json(await DisasterRecoveryService.launchReadiness(req.params.service_key));}catch(e){next(e);}
});

sprint26Router.get('/sprint-26/status',(_req,res)=>{
  res.json({
    sprint:26,title:'Platform Hardening',status:'IMPLEMENTED',runtime:getSprint26RuntimeStatus(),
    implemented:[
      'privacy_lifecycle_dependency_graph','derived_store_completion_receipts','structured_log_message_redaction',
      'reliability_priority_hierarchy','graceful_degradation_policy','explicit_rpo_rto_registry',
      'tested_restore_evidence_gate','hardening_observability_projection','hardening_readiness_gate'
    ],
    pending:[]
  });
});

export * from './runtime.js';
