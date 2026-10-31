import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AuthorizationError, DomainInvariantError } from '../mindos/platform/errors/index.js';
import { EscalationState, RiskState } from '../mindos/platform/shared/state_machines.js';
import { resetSafetyRepository } from '../mindos/safety/index.js';
import {
  ClinicalIncidentService,
  ClinicalOperationsEscalationService,
  ClinicalOperationsFollowUpService,
  ClinicalOperationsMetricsService,
  ClinicalOperationsReviewerProjectionService,
  ClinicalOperationsSafetyKernelBridge,
  ClinicalOperationsStaffingRegistry,
  SafetyPlanSharingService,
  resetClinicalOperationsForTesting
} from '../mindos/clinical_ops/index.js';
import {
  configureSprint24Runtime,
  resetSprint24RuntimeForTesting
} from '../mindos/sprint24/runtime.js';

describe('MindOS Sprint 24 — Clinical Operations & Human Escalation', () => {
  beforeEach(() => {
    resetSprint24RuntimeForTesting();
    resetClinicalOperationsForTesting();
    resetSafetyRepository();
  });

  it('does not create or imply human review when no staffed capability exists', async () => {
    const result = await ClinicalOperationsEscalationService.createIfStaffed({
      subject_user_id: 'user-s24',
      risk_event_id: 'risk-s24',
      risk_state: RiskState.HIGH,
      level: 'L2',
      jurisdiction: 'KE',
      reason_codes: ['SIGNIFICANT_CONCERN'],
      policy_version: 'safety-2'
    });
    assert.equal(result, null);
  });

  it('creates human review only when the required queue is genuinely staffed', async () => {
    await ClinicalOperationsStaffingRegistry.configure({
      jurisdiction: 'KE',
      queue_key: 'CLINICAL_REVIEW',
      staffing_state: 'STAFFED',
      qualified_role_codes: ['SAFETY_REVIEWER'],
      configured_by: 'clinical-admin',
      policy_version: 'ops-1'
    });

    const escalation = await ClinicalOperationsEscalationService.createIfStaffed({
      subject_user_id: 'user-s24',
      risk_event_id: 'risk-s24',
      risk_state: RiskState.HIGH,
      level: 'L2',
      jurisdiction: 'KE',
      reason_codes: ['SIGNIFICANT_CONCERN'],
      policy_version: 'safety-2'
    });

    assert.ok(escalation);
    assert.equal(escalation!.state, EscalationState.NEW);
    assert.equal(escalation!.queue_key, 'CLINICAL_REVIEW');
  });

  it('bridges authoritative Safety transitions into exactly one staffed reviewer case', async () => {
    await configureSprint24Runtime({ usePostgres: false });
    await ClinicalOperationsStaffingRegistry.configure({
      jurisdiction: 'KE',
      queue_key: 'URGENT_SAFETY',
      staffing_state: 'STAFFED',
      qualified_role_codes: ['SAFETY_REVIEWER'],
      configured_by: 'clinical-admin',
      policy_version: 'ops-1'
    });

    const input = {
      subject_user_id: 'user-bridge',
      risk_event_id: 'risk-state-bridge-1',
      risk_state: RiskState.URGENT,
      jurisdiction: 'KE',
      reason_codes: ['URGENT_TEST'],
      policy_version: 'safety-2'
    };
    await ClinicalOperationsSafetyKernelBridge.handleRiskTransition(input);
    await ClinicalOperationsSafetyKernelBridge.handleRiskTransition(input);

    const cases = await ClinicalOperationsEscalationService.list();
    assert.equal(cases.length, 1);
    assert.equal(cases[0].level, 'L3');
    assert.equal(cases[0].queue_key, 'URGENT_SAFETY');
  });

  it('enforces the canonical escalation state machine and qualified reviewer assignment', async () => {
    await ClinicalOperationsStaffingRegistry.configure({
      jurisdiction: 'KE',
      queue_key: 'URGENT_SAFETY',
      staffing_state: 'STAFFED',
      qualified_role_codes: ['SAFETY_REVIEWER'],
      configured_by: 'clinical-admin',
      policy_version: 'ops-1'
    });

    const escalation = await ClinicalOperationsEscalationService.createIfStaffed({
      subject_user_id: 'user-s24',
      risk_event_id: 'risk-urgent',
      risk_state: RiskState.URGENT,
      level: 'L3',
      jurisdiction: 'KE',
      reason_codes: ['POTENTIAL_URGENT_SAFETY_NEED'],
      policy_version: 'safety-2'
    });
    assert.ok(escalation);

    await assert.rejects(
      () => ClinicalOperationsEscalationService.transition(
        escalation!.id,
        EscalationState.ASSIGNED,
        { actor_id: 'reviewer-1', actor_role: 'SAFETY_REVIEWER' },
        { reviewer_id: 'reviewer-1', reviewer_role: 'SAFETY_REVIEWER' }
      ),
      DomainInvariantError
    );

    await ClinicalOperationsEscalationService.transition(
      escalation!.id,
      EscalationState.TRIAGED,
      { actor_id: 'reviewer-1', actor_role: 'SAFETY_REVIEWER' }
    );

    await assert.rejects(
      () => ClinicalOperationsEscalationService.transition(
        escalation!.id,
        EscalationState.ASSIGNED,
        { actor_id: 'reviewer-2', actor_role: 'PLATFORM_ADMIN' },
        { reviewer_id: 'reviewer-2', reviewer_role: 'PLATFORM_ADMIN' }
      ),
      DomainInvariantError
    );

    const assigned = await ClinicalOperationsEscalationService.transition(
      escalation!.id,
      EscalationState.ASSIGNED,
      { actor_id: 'reviewer-1', actor_role: 'SAFETY_REVIEWER' },
      { reviewer_id: 'reviewer-1', reviewer_role: 'SAFETY_REVIEWER' }
    );
    assert.equal(assigned.assigned_reviewer_id, 'reviewer-1');

    const reviewing = await ClinicalOperationsEscalationService.transition(
      escalation!.id,
      EscalationState.IN_REVIEW,
      { actor_id: 'reviewer-1', actor_role: 'SAFETY_REVIEWER' }
    );
    assert.equal(reviewing.state, EscalationState.IN_REVIEW);
  });

  it('projects minimum-necessary reviewer context and excludes full private histories', async () => {
    await ClinicalOperationsStaffingRegistry.configure({
      jurisdiction: 'KE',
      queue_key: 'CLINICAL_REVIEW',
      staffing_state: 'STAFFED',
      qualified_role_codes: ['CLINICAL_REVIEWER'],
      configured_by: 'clinical-admin',
      policy_version: 'ops-1'
    });
    const escalation = await ClinicalOperationsEscalationService.createIfStaffed({
      subject_user_id: 'user-projection',
      risk_event_id: 'risk-projection',
      risk_state: RiskState.HIGH,
      level: 'L2',
      jurisdiction: 'KE',
      reason_codes: ['SIGNIFICANT_CONCERN'],
      policy_version: 'safety-2',
      source_summary_reference: 'risk-summary:risk-projection'
    });
    assert.ok(escalation);

    const projection = await ClinicalOperationsReviewerProjectionService.getCase(escalation!.id);
    assert.equal(projection.escalation.source_summary_reference, 'risk-summary:risk-projection');
    assert.equal(projection.privacy_boundary.full_journal_included, false);
    assert.equal(projection.privacy_boundary.full_ai_history_included, false);
    assert.equal(projection.privacy_boundary.full_clinical_history_included, false);
    assert.equal(projection.privacy_boundary.raw_free_text_included, false);
    assert.equal(JSON.stringify(projection).includes('journal_entries'), false);
  });

  it('keeps missed follow-up operational and does not manufacture a higher RiskState', async () => {
    await ClinicalOperationsStaffingRegistry.configure({
      jurisdiction: 'KE',
      queue_key: 'CLINICAL_REVIEW',
      staffing_state: 'STAFFED',
      qualified_role_codes: ['SAFETY_REVIEWER'],
      configured_by: 'clinical-admin',
      policy_version: 'ops-1'
    });
    const escalation = await ClinicalOperationsEscalationService.createIfStaffed({
      subject_user_id: 'user-follow-up',
      risk_event_id: 'risk-follow-up',
      risk_state: RiskState.ELEVATED,
      level: 'L2',
      jurisdiction: 'KE',
      reason_codes: ['FOLLOW_UP_TEST'],
      policy_version: 'safety-2'
    });
    assert.ok(escalation);

    const item = await ClinicalOperationsFollowUpService.schedule({
      escalation_id: escalation!.id,
      subject_user_id: 'user-follow-up',
      type: 'HUMAN_FOLLOW_UP',
      responsible_actor_id: 'reviewer-1',
      channel: 'IN_APP',
      scheduled_for: new Date(Date.now() + 60_000).toISOString()
    });
    const missed = await ClinicalOperationsFollowUpService.markMissed(item.id);
    assert.equal(missed.status, 'MISSED');

    const unchanged = await ClinicalOperationsEscalationService.get(escalation!.id);
    assert.equal(unchanged.risk_state, RiskState.ELEVATED);

    const metrics:any = await ClinicalOperationsMetricsService.snapshot();
    assert.equal(metrics.follow_up.missed_follow_up_changes_risk_state, false);
  });

  it('does not treat trusted-contact designation as safety-plan access without an explicit grant', async () => {
    assert.equal(await SafetyPlanSharingService.canAccess({
      subject_user_id:'user-plan',
      safety_plan_reference:'safety-plan:1',
      grantee_type:'TRUSTED_CONTACT',
      grantee_id:'trusted-1',
      scope:'VIEW_WARNING_SIGNS'
    }), false);

    const grant=await SafetyPlanSharingService.grant({
      safety_plan_reference:'safety-plan:1',
      subject_user_id:'user-plan',
      actor_user_id:'user-plan',
      grantee_type:'TRUSTED_CONTACT',
      grantee_id:'trusted-1',
      scopes:['VIEW_WARNING_SIGNS','VIEW_VERIFIED_RESOURCES']
    });
    assert.equal(await SafetyPlanSharingService.canAccess({
      subject_user_id:'user-plan',
      safety_plan_reference:'safety-plan:1',
      grantee_type:'TRUSTED_CONTACT',
      grantee_id:'trusted-1',
      scope:'VIEW_WARNING_SIGNS'
    }), true);

    await SafetyPlanSharingService.revoke({
      grant_id:grant.id,
      subject_user_id:'user-plan',
      actor_user_id:'user-plan',
      reason:'User revoked access'
    });
    assert.equal(await SafetyPlanSharingService.canAccess({
      subject_user_id:'user-plan',
      safety_plan_reference:'safety-plan:1',
      grantee_type:'TRUSTED_CONTACT',
      grantee_id:'trusted-1',
      scope:'VIEW_WARNING_SIGNS'
    }), false);

    await assert.rejects(
      () => SafetyPlanSharingService.grant({
        safety_plan_reference:'safety-plan:1',
        subject_user_id:'user-plan',
        actor_user_id:'another-user',
        grantee_type:'PROFESSIONAL',
        grantee_id:'prof-1',
        scopes:['VIEW_WARNING_SIGNS']
      }),
      AuthorizationError
    );
  });

  it('requires corrective-action validation evidence before a clinical incident can close', async () => {
    const incident = await ClinicalIncidentService.open({
      incident_type: 'ESCALATION_DELIVERY_FAILURE',
      severity: 'HIGH',
      affected_component: 'clinical_ops',
      evidence_references: ['evidence:delivery-failure'],
      safety_policy_version: 'safety-2',
      release_version: 'test-release',
      created_by: 'safety-reviewer'
    });

    await ClinicalIncidentService.transition(incident.id, 'CONTAINED');
    await ClinicalIncidentService.transition(incident.id, 'INVESTIGATING');
    await ClinicalIncidentService.transition(incident.id, 'CORRECTIVE_ACTION', 'fix:queue-routing');
    await assert.rejects(
      () => ClinicalIncidentService.transition(incident.id, 'CLOSED'),
      DomainInvariantError
    );
    await ClinicalIncidentService.transition(incident.id, 'VALIDATING', 'test:regression-ops-1');
    const closed = await ClinicalIncidentService.transition(incident.id, 'CLOSED');
    assert.equal(closed.state, 'CLOSED');
  });

  it('does not fabricate false-positive/false-negative operational metrics without governed methodology', async () => {
    const metrics:any=await ClinicalOperationsMetricsService.snapshot();
    assert.equal(metrics.governed_review_metrics.false_positive_negative_methodology,'NOT_CONFIGURED');
  });
});
