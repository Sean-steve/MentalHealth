import { Router,Request } from 'express';
import { AuthorizationError,DomainInvariantError } from '../platform/errors/index.js';
import {
  BetaCohortService,LaunchAuthorizationService,LaunchEvidenceService,LaunchMonitoringService,
  LaunchProgramService,PostLaunchReviewService
} from '../launch/index.js';
import { getSprint28RuntimeStatus } from './runtime.js';

export const sprint28Router=Router();

const VIEW=new Set(['RELEASE_MANAGER','RELEASE_AUTHORITY','INCIDENT_COMMANDER','SAFETY_LEAD','SECURITY_LEAD','REGULATORY_REVIEWER','SRE_ADMIN','QA_LEAD']);
const PROGRAM=new Set(['RELEASE_MANAGER','RELEASE_AUTHORITY']);
const EVIDENCE=new Set(['RELEASE_MANAGER','RELEASE_AUTHORITY','QA_LEAD']);
const MONITOR=new Set(['RELEASE_MANAGER','RELEASE_AUTHORITY','INCIDENT_COMMANDER','SRE_ADMIN']);
const ENROLL=new Set(['BETA_OPERATOR','RELEASE_MANAGER','RELEASE_AUTHORITY']);
const HOLD=new Set(['RELEASE_AUTHORITY','INCIDENT_COMMANDER','SAFETY_LEAD','SECURITY_LEAD']);

function actor(req:Request,allowed:Set<string>){const id=String(req.headers['x-actor-id']||'');const role=String(req.headers['x-actor-role']||'').toUpperCase();if(!id||!allowed.has(role))throw new AuthorizationError('Launch-control access requires an authorized role.',{errorCode:'AUTHZ_002'});return {id,role};}

sprint28Router.post('/launch/programs',async(req,res,next)=>{
 try{const a=actor(req,PROGRAM);const program=await LaunchProgramService.create({...req.body,owner_id:a.id});res.status(201).json({program});}catch(e){next(e);}
});
sprint28Router.post('/launch/programs/:id/lock-release-candidate',async(req,res,next)=>{
 try{const a=actor(req,PROGRAM);res.json({program:await LaunchProgramService.lockReleaseCandidate(req.params.id,a)});}catch(e){next(e);}
});
sprint28Router.post('/launch/programs/:id/evidence-package',async(req,res,next)=>{
 try{const a=actor(req,EVIDENCE);const pkg=await LaunchEvidenceService.generate(req.params.id,req.body.items||[],a.id);res.status(201).json({evidence_package:pkg});}catch(e){next(e);}
});
sprint28Router.post('/launch/programs/:id/monitor',async(req,res,next)=>{
 try{const a=actor(req,MONITOR);const snapshot=await LaunchMonitoringService.capture(req.params.id,a.id,req.body.environment||'production');res.status(201).json({snapshot});}catch(e){next(e);}
});
sprint28Router.post('/launch/programs/:id/authorize',async(req,res,next)=>{
 try{const a=actor(req,new Set(['RELEASE_AUTHORITY']));const decision=await LaunchAuthorizationService.decide({program_id:req.params.id,decision_type:req.body.decision_type,reviewer_id:a.id,reviewer_role:a.role,decision:req.body.decision,conditions:req.body.conditions||[]});res.status(201).json({decision});}catch(e){next(e);}
});
sprint28Router.post('/launch/programs/:id/activate-beta',async(req,res,next)=>{
 try{const a=actor(req,new Set(['RELEASE_AUTHORITY']));res.json({program:await LaunchAuthorizationService.activateBeta(req.params.id,a)});}catch(e){next(e);}
});
sprint28Router.post('/launch/programs/:id/activate-limited-launch',async(req,res,next)=>{
 try{const a=actor(req,new Set(['RELEASE_AUTHORITY']));res.json({program:await LaunchAuthorizationService.activateLimitedLaunch(req.params.id,a)});}catch(e){next(e);}
});
sprint28Router.post('/launch/programs/:id/enroll',async(req,res,next)=>{
 try{const a=actor(req,ENROLL);const participant=await BetaCohortService.inviteAndEnroll({...req.body,program_id:req.params.id,actor_id:a.id});res.status(201).json({participant:{...participant,subject_ref_hash:participant.subject_ref_hash.slice(0,12)+'…'}});}catch(e){next(e);}
});
sprint28Router.post('/launch/programs/:id/withdraw',async(req,res,next)=>{
 try{
   const id=String(req.headers['x-actor-id']||'');const role=String(req.headers['x-actor-role']||'').toUpperCase();
   if(!id||!['USER','PROFESSIONAL','BETA_OPERATOR','RELEASE_MANAGER','RELEASE_AUTHORITY'].includes(role))throw new AuthorizationError('Withdrawal requires participant or launch-operations authority.',{errorCode:'AUTHZ_002'});
   if((role==='USER'||role==='PROFESSIONAL')&&req.body.subject_ref!==id)throw new AuthorizationError('Participants may withdraw only their own beta enrollment.',{errorCode:'AUTHZ_004'});
   res.json({participant:await BetaCohortService.withdraw(req.params.id,req.body.subject_ref,id)});
 }catch(e){next(e);}
});
sprint28Router.post('/launch/programs/:id/access-check',async(req,res,next)=>{
 try{actor(req,VIEW);res.json(await BetaCohortService.assertFeatureAccess(req.params.id,req.body.subject_ref,req.body.feature_key,req.body.jurisdiction||'KE'));}catch(e){next(e);}
});
sprint28Router.post('/launch/programs/:id/emergency-hold',async(req,res,next)=>{
 try{const a=actor(req,HOLD);res.json({program:await LaunchProgramService.emergencyHold(req.params.id,a,String(req.body.reason||''))});}catch(e){next(e);}
});
sprint28Router.post('/launch/programs/:id/resume',async(req,res,next)=>{
 try{const a=actor(req,new Set(['RELEASE_AUTHORITY']));res.json({program:await LaunchAuthorizationService.resume(req.params.id,a)});}catch(e){next(e);}
});
sprint28Router.post('/launch/programs/:id/post-launch-review',async(req,res,next)=>{
 try{const a=actor(req,new Set(['RELEASE_AUTHORITY']));const review=await PostLaunchReviewService.review({...req.body,program_id:req.params.id,reviewer_id:a.id,reviewer_role:a.role});res.status(201).json({review});}catch(e){next(e);}
});
sprint28Router.get('/launch/programs/:id',async(req,res,next)=>{
 try{actor(req,VIEW);const program=await LaunchProgramService.get(req.params.id);res.json({program,readiness:await LaunchAuthorizationService.evaluate(program.id)});}catch(e){next(e);}
});
sprint28Router.get('/sprint-28/status',(_req,res)=>{
 res.json({
   sprint:28,title:'Controlled Beta & Kenya Launch Readiness',status:'IMPLEMENTED',runtime:getSprint28RuntimeStatus(),
   production_launch_status:'BLOCKED_UNTIL_REAL_EXACT_BUILD_GOVERNANCE_AND_REQUIRED_EXTERNAL_EVIDENCE',
   implemented:['release_candidate_lock','hashed_beta_cohort','cohort_capacity','consent_evidence_enrollment','launch_evidence_manifest','operational_monitoring','kenya_launch_gate','emergency_hold','post_launch_review'],
   pending:[]
 });
});

export * from './runtime.js';
