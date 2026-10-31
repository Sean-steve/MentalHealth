import { Router, Request, Response } from 'express';
import { AuthorizationError } from '../platform/errors/index.js';
import { EscalationState, RiskState } from '../platform/shared/state_machines.js';
import {
  ClinicalIncidentService,
  ClinicalOperationsEscalationService,
  ClinicalOperationsFollowUpService,
  ClinicalOperationsMetricsService,
  ClinicalOperationsRepository,
  ClinicalOperationsReviewerProjectionService,
  ClinicalOperationsStaffingRegistry,
  SafetyPlanSharingService
} from '../clinical_ops/index.js';
import { getSprint24RuntimeStatus } from './runtime.js';

export const sprint24Router = Router();

const ALLOWED_INTERNAL_ROLES = new Set(['SAFETY_REVIEWER','CLINICAL_REVIEWER','CLINICAL_ADMIN']);

function internalActor(req: Request): { actor_id: string; actor_role: string } {
  const actor_id = String(req.headers['x-actor-id'] || '');
  const actor_role = String(req.headers['x-actor-role'] || '').toUpperCase();
  if (!actor_id || !ALLOWED_INTERNAL_ROLES.has(actor_role)) {
    throw new AuthorizationError('Clinical Operations access requires an authorized internal clinical/safety role.', { errorCode: 'AUTHZ_002' });
  }
  return { actor_id, actor_role };
}

function userActor(req:Request):string{
  const actorId=String(req.headers['x-actor-id']||'');
  const actorType=String(req.headers['x-actor-type']||'').toUpperCase();
  if(!actorId||actorType!=='USER'){
    throw new AuthorizationError('Safety-plan sharing is a user-controlled operation.',{errorCode:'AUTHZ_002'});
  }
  return actorId;
}

sprint24Router.get('/clinical-ops/capabilities', async (req,res,next) => {
  try {
    internalActor(req);
    const jurisdiction = req.query.jurisdiction ? String(req.query.jurisdiction) : undefined;
    res.json({ capabilities: await ClinicalOperationsRepository.listCapabilities(jurisdiction) });
  } catch (e) { next(e); }
});

sprint24Router.post('/clinical-ops/capabilities', async (req,res,next) => {
  try {
    const actor = internalActor(req);
    if (actor.actor_role !== 'CLINICAL_ADMIN') {
      throw new AuthorizationError('Only CLINICAL_ADMIN may configure clinical-operations staffing truth.', { errorCode: 'AUTHZ_002' });
    }
    const capability = await ClinicalOperationsStaffingRegistry.configure({
      jurisdiction: req.body.jurisdiction,
      queue_key: req.body.queue_key,
      staffing_state: req.body.staffing_state,
      qualified_role_codes: req.body.qualified_role_codes || [],
      coverage_started_at: req.body.coverage_started_at,
      coverage_ends_at: req.body.coverage_ends_at,
      acknowledgement_sla_minutes: req.body.acknowledgement_sla_minutes,
      resolution_sla_minutes: req.body.resolution_sla_minutes,
      configured_by: actor.actor_id,
      policy_version: req.body.policy_version
    });
    res.status(201).json({ capability });
  } catch (e) { next(e); }
});

sprint24Router.get('/clinical-ops/escalations', async (req,res,next) => {
  try {
    internalActor(req);
    const escalations = await ClinicalOperationsEscalationService.list();
    res.json({ total: escalations.length, escalations });
  } catch (e) { next(e); }
});

sprint24Router.get('/clinical-ops/escalations/:id/case', async (req,res,next) => {
  try {
    internalActor(req);
    res.json(await ClinicalOperationsReviewerProjectionService.getCase(req.params.id));
  } catch (e) { next(e); }
});

sprint24Router.post('/clinical-ops/escalations', async (req,res,next) => {
  try {
    internalActor(req);
    const escalation = await ClinicalOperationsEscalationService.createIfStaffed({
      subject_user_id: req.body.subject_user_id,
      risk_event_id: req.body.risk_event_id,
      risk_state: req.body.risk_state as RiskState,
      level: req.body.level,
      jurisdiction: req.body.jurisdiction || 'KE',
      reason_codes: req.body.reason_codes || [],
      policy_version: req.body.policy_version,
      source_summary_reference: req.body.source_summary_reference
    });
    if (!escalation) {
      return res.status(202).json({
        human_review_created: false,
        reason: 'NO_ACTIVE_STAFFED_CAPABILITY',
        instruction: 'Continue authoritative Safety Kernel actions and verified real-world support. Do not imply human monitoring.'
      });
    }
    res.status(201).json({ human_review_created: true, escalation });
  } catch (e) { next(e); }
});

sprint24Router.post('/clinical-ops/escalations/:id/transition', async (req,res,next) => {
  try {
    const actor = internalActor(req);
    const escalation = await ClinicalOperationsEscalationService.transition(
      req.params.id,
      req.body.to_state as EscalationState,
      actor,
      {
        reviewer_id: req.body.reviewer_id,
        reviewer_role: req.body.reviewer_role,
        resolution_summary_reference: req.body.resolution_summary_reference,
        cancellation_reason: req.body.cancellation_reason
      }
    );
    res.json({ escalation });
  } catch (e) { next(e); }
});

sprint24Router.post('/clinical-ops/follow-ups', async (req,res,next) => {
  try {
    internalActor(req);
    const follow_up = await ClinicalOperationsFollowUpService.schedule(req.body);
    res.status(201).json({ follow_up });
  } catch (e) { next(e); }
});

sprint24Router.post('/clinical-ops/follow-ups/:id/missed', async (req,res,next) => {
  try {
    internalActor(req);
    const follow_up = await ClinicalOperationsFollowUpService.markMissed(req.params.id);
    res.json({ follow_up, risk_state_changed: false });
  } catch (e) { next(e); }
});

sprint24Router.post('/clinical-ops/incidents', async (req,res,next) => {
  try {
    const actor = internalActor(req);
    const incident = await ClinicalIncidentService.open({
      incident_type: req.body.incident_type,
      severity: req.body.severity,
      affected_component: req.body.affected_component,
      linked_escalation_id: req.body.linked_escalation_id,
      linked_risk_event_id: req.body.linked_risk_event_id,
      evidence_references: req.body.evidence_references || [],
      model_version: req.body.model_version,
      safety_policy_version: req.body.safety_policy_version,
      release_version: req.body.release_version,
      created_by: actor.actor_id
    });
    res.status(201).json({ incident });
  } catch (e) { next(e); }
});

sprint24Router.post('/clinical-ops/incidents/:id/transition', async (req,res,next) => {
  try {
    internalActor(req);
    const incident = await ClinicalIncidentService.transition(
      req.params.id,
      req.body.to_state,
      req.body.evidence_reference
    );
    res.json({ incident });
  } catch (e) { next(e); }
});

sprint24Router.get('/clinical-ops/metrics', async (req,res,next) => {
  try {
    internalActor(req);
    res.json(await ClinicalOperationsMetricsService.snapshot());
  } catch (e) { next(e); }
});

sprint24Router.post('/clinical-ops/safety-plan-shares', async (req,res,next) => {
  try {
    const actorId=userActor(req);
    const grant=await SafetyPlanSharingService.grant({
      safety_plan_reference:req.body.safety_plan_reference,
      subject_user_id:req.body.subject_user_id,
      actor_user_id:actorId,
      grantee_type:req.body.grantee_type,
      grantee_id:req.body.grantee_id,
      scopes:req.body.scopes
    });
    res.status(201).json({grant});
  } catch (e) { next(e); }
});

sprint24Router.post('/clinical-ops/safety-plan-shares/:id/revoke', async (req,res,next) => {
  try {
    const actorId=userActor(req);
    const grant=await SafetyPlanSharingService.revoke({
      grant_id:req.params.id,
      subject_user_id:req.body.subject_user_id,
      actor_user_id:actorId,
      reason:req.body.reason
    });
    res.json({grant});
  } catch (e) { next(e); }
});

sprint24Router.get('/sprint-24/status', (_req: Request, res: Response) => {
  res.json({
    sprint: 24,
    title: 'Clinical Operations & Human Escalation',
    status: 'IMPLEMENTED',
    runtime:getSprint24RuntimeStatus(),
    implemented: [
      'postgres_adapters',
      'staffing_truth_registry',
      'safety_kernel_event_bridge',
      'governed_escalation_state_machine',
      'minimum_human_assignment_guard',
      'minimum_necessary_reviewer_projection',
      'follow_up_workflow_separation',
      'no_response_does_not_increase_risk',
      'safety_plan_sharing',
      'clinical_incident_lifecycle',
      'operations_metrics'
    ],
    pending: []
  });
});

export * from './runtime.js';
