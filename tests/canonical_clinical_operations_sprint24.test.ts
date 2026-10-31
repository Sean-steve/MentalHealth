import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DomainInvariantError } from '../mindos/platform/errors/index.js';
import { EscalationState, RiskState } from '../mindos/platform/shared/state_machines.js';
import {
  ClinicalIncidentService,
  ClinicalOperationsEscalationService,
  ClinicalOperationsFollowUpService,
  ClinicalOperationsStaffingRegistry,
  resetClinicalOperationsForTesting
} from '../mindos/clinical_ops/index.js';

describe('MindOS Sprint 24 — Clinical Operations & Human Escalation foundation', () => {
  beforeEach(() => resetClinicalOperationsForTesting());

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
});
