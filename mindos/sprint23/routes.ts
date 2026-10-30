import { Router,Request,Response,NextFunction } from 'express';
import { AuthorizationError,DomainInvariantError } from '../platform/errors/index.js';
import { RelationshipAccessEvaluator } from '../care_relationships/access/relationship_access_evaluator.js';
import {
  ClinicalRecordProjectionService,
  ClinicalObservationService,
  ClinicalProvenance
} from '../clinical_record/index.js';
import {
  ProgressViewService,
  OutcomeMeasurementService,
  OutcomeReviewService,
  OutcomeAlertService,
  OutcomeReviewType,
  OutcomeReviewDecision
} from '../outcomes/index.js';

export const sprint23Router=Router();

type ActorType='USER'|'PROFESSIONAL';
function actor(req:Request):{id:string;type:ActorType}{
  const id=String(req.headers['x-actor-id']||'');
  const type=String(req.headers['x-actor-type']||'').toUpperCase();
  if(!id) throw new AuthorizationError('x-actor-id is required.',{errorCode:'AUTHZ_001'});
  if(type!=='USER'&&type!=='PROFESSIONAL') throw new AuthorizationError('Sprint 23 HTTP access is limited to USER or PROFESSIONAL actors.',{errorCode:'AUTHZ_002'});
  return {id,type:type as ActorType};
}
async function assertProfessional(subjectUserId:string,professionalId:string,action:'READ'|'WRITE',purpose='CARE_DELIVERY'):Promise<void>{
  const decision=await RelationshipAccessEvaluator.evaluateProfessionalAccess({
    subjectUserId,professionalId,purpose,action,dataDomain:'CLINICAL_NOTES'
  });
  if(!decision.allowed) throw new AuthorizationError(decision.reason||'Relationship-scoped access denied.',{errorCode:decision.reasonCode||'AUTHZ_003'});
}

sprint23Router.get('/clinical-record/users/:userId',async(req,res,next)=>{
  try{
    const a=actor(req); const userId=req.params.userId;
    if(a.type==='USER'){
      if(a.id!==userId) throw new AuthorizationError('User may only access their own longitudinal record.',{errorCode:'AUTHZ_003'});
      return res.json(await ClinicalRecordProjectionService.projectForUser(userId));
    }
    return res.json(await ClinicalRecordProjectionService.projectForProfessional({
      subject_user_id:userId,professional_id:a.id,purpose:'CARE_DELIVERY',
      options:{timeWindowDays:req.query.days?Number(req.query.days):undefined}
    }));
  }catch(e){next(e);}
});

sprint23Router.post('/clinical-record/observations',async(req,res,next)=>{
  try{
    const a=actor(req);
    if(a.type!=='PROFESSIONAL') throw new AuthorizationError('Only an authorized professional may record a clinical observation.',{errorCode:'AUTHZ_002'});
    const {subject_user_id,care_relationship_id,clinical_encounter_id,observation_code,observation_name,value,unit,observed_at,provenance,clinical_significance}=req.body||{};
    if(!subject_user_id||!care_relationship_id||!observation_code||!observation_name||value===undefined||!observed_at||!provenance){
      return res.status(400).json({error:'subject_user_id, care_relationship_id, observation_code, observation_name, value, observed_at and provenance are required.'});
    }
    await assertProfessional(subject_user_id,a.id,'WRITE','CLINICAL_DOCUMENTATION');
    const observation=await ClinicalObservationService.recordObservation({
      subject_user_id,care_relationship_id,clinical_encounter_id,observation_code,observation_name,value,unit,
      observed_at,recorded_by:a.id,provenance:provenance as ClinicalProvenance,clinical_significance
    });
    res.status(201).json({observation});
  }catch(e){next(e);}
});

sprint23Router.get('/outcomes/users/:userId/progress',async(req,res,next)=>{
  try{
    const a=actor(req); const userId=req.params.userId;
    if(a.type!=='USER'||a.id!==userId) throw new AuthorizationError('User progress is self-only.',{errorCode:'AUTHZ_003'});
    res.json(await ProgressViewService.getUserProgress(userId));
  }catch(e){next(e);}
});

sprint23Router.get('/outcomes/users/:userId/dashboard',async(req,res,next)=>{
  try{
    const a=actor(req); if(a.type!=='PROFESSIONAL') throw new AuthorizationError('Professional role required.',{errorCode:'AUTHZ_002'});
    res.json(await ProgressViewService.getProfessionalDashboard({subject_user_id:req.params.userId,professional_id:a.id,purpose:'CARE_DELIVERY'}));
  }catch(e){next(e);}
});

sprint23Router.post('/outcomes/measurements',async(req,res,next)=>{
  try{
    const a=actor(req);
    const {subject_user_id,measure_code,value,unit,measured_at,source_type,source_reference,instrument_version,provenance,care_relationship_id,care_plan_id,care_goal_id,clinical_encounter_id}=req.body||{};
    if(!subject_user_id||!measure_code||value===undefined||!unit||!measured_at||!source_type||!source_reference||!provenance){
      return res.status(400).json({error:'subject_user_id, measure_code, value, unit, measured_at, source_type, source_reference and provenance are required.'});
    }
    if(a.type==='USER'){
      if(a.id!==subject_user_id) throw new AuthorizationError('User may record outcomes only for themselves.',{errorCode:'AUTHZ_003'});
      if(provenance!==ClinicalProvenance.USER_REPORTED) throw new AuthorizationError('User outcome provenance must be USER_REPORTED.',{errorCode:'AUTHZ_004'});
    }else{
      if(!care_relationship_id) throw new DomainInvariantError('Professional outcome recording requires care_relationship_id.');
      await assertProfessional(subject_user_id,a.id,'WRITE','CLINICAL_DOCUMENTATION');
      if(provenance!==ClinicalProvenance.PROFESSIONAL_RECORDED&&provenance!==ClinicalProvenance.CLINICALLY_ASSESSED){
        throw new AuthorizationError('Professional outcome provenance must be PROFESSIONAL_RECORDED or CLINICALLY_ASSESSED.',{errorCode:'AUTHZ_004'});
      }
    }
    const measurement=await OutcomeMeasurementService.recordMeasurement({
      subject_user_id,measure_code,value,unit,measured_at,source_type,source_reference,instrument_version,
      provenance:provenance as ClinicalProvenance,care_relationship_id,care_plan_id,care_goal_id,clinical_encounter_id,
      recorded_by:a.type==='PROFESSIONAL'?a.id:undefined,actor_role:a.type
    });
    res.status(201).json({measurement});
  }catch(e){next(e);}
});

sprint23Router.post('/outcomes/reviews',async(req,res,next)=>{
  try{
    const a=actor(req); if(a.type!=='PROFESSIONAL') throw new AuthorizationError('Professional role required.',{errorCode:'AUTHZ_002'});
    const {subject_user_id,care_relationship_id,care_plan_id,review_type,scheduled_for}=req.body||{};
    if(!subject_user_id||!care_relationship_id||!review_type) return res.status(400).json({error:'subject_user_id, care_relationship_id and review_type are required.'});
    await assertProfessional(subject_user_id,a.id,'WRITE','CARE_DELIVERY');
    const review=await OutcomeReviewService.scheduleReview({
      subject_user_id,care_relationship_id,care_plan_id,review_type:review_type as OutcomeReviewType,scheduled_for,reviewer_id:a.id
    });
    res.status(201).json({review});
  }catch(e){next(e);}
});

sprint23Router.post('/outcomes/reviews/:reviewId/complete',async(req,res,next)=>{
  try{
    const a=actor(req); if(a.type!=='PROFESSIONAL') throw new AuthorizationError('Professional role required.',{errorCode:'AUTHZ_002'});
    const {decision,reason_codes,clinical_notes,recommended_actions}=req.body||{};
    if(!decision||!Array.isArray(reason_codes)) return res.status(400).json({error:'decision and reason_codes are required.'});
    const review=await OutcomeReviewService.completeReview({
      review_id:req.params.reviewId,reviewer_id:a.id,decision:decision as OutcomeReviewDecision,
      reason_codes,clinical_notes,recommended_actions
    });
    res.json({review});
  }catch(e){next(e);}
});

sprint23Router.get('/outcomes/users/:userId/alerts',async(req,res,next)=>{
  try{
    const a=actor(req); if(a.type!=='PROFESSIONAL') throw new AuthorizationError('Professional role required.',{errorCode:'AUTHZ_002'});
    await assertProfessional(req.params.userId,a.id,'READ','CARE_DELIVERY');
    const alerts=await OutcomeAlertService.listAlertsForSubject(req.params.userId,req.query.status?String(req.query.status):undefined);
    res.json({total:alerts.length,alerts});
  }catch(e){next(e);}
});
