import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  CareRelationshipService,
  CareRelationshipType,
  CareRelationshipOriginType,
  resetCareRelationshipsForTesting
} from '../mindos/care_relationships/index.js';
import { ConsentService } from '../mindos/consent/index.js';
import { ProfessionalService } from '../mindos/professionals/service.js';
import {
  ProfessionalType,
  ProfessionalState,
  ProfessionalVerificationState,
  DeliveryMode,
  ProfileVisibility
} from '../mindos/professionals/domain/types.js';
import {
  CarePlanService,
  CarePlanType,
  resetCarePlansForTesting
} from '../mindos/care_plans/index.js';
import {
  OutcomeMeasurementService,
  OutcomeSeriesService,
  OutcomeTrendEngine,
  ClinicalChangeRuleRegistry,
  OutcomeAlertPolicyRegistry,
  OutcomeAlertService,
  OutcomeAlertType,
  OutcomeTrendState,
  OutcomeDirectionality,
  OutcomeValueType,
  OutcomeMeasureType,
  ClinicalProvenance,
  MeasureRegistry,
  OutcomeReviewService,
  OutcomeReviewType,
  OutcomeReviewDecision,
  ProgressViewService,
  resetOutcomesForTesting
} from '../mindos/outcomes/index.js';
import {
  ClinicalTimelineService,
  ClinicalObservationService,
  resetClinicalRecordForTesting
} from '../mindos/clinical_record/index.js';
import {
  AuthorizationError,
  DomainInvariantError
} from '../mindos/platform/errors/index.js';
import { EventBus } from '../mindos/platform/events/index.js';

const userId = 'user-s23-0001';
const professionalId = 'prof-s23-0001';
const unrelatedProfessionalId = 'prof-s23-unrelated';
let relationshipId = '';

const approvedRule = (overrides: Record<string, unknown> = {}) => ({
  id: 'rule-phq9-v1',
  measure_code: 'PHQ9_TOTAL',
  version: 1,
  mcid: 5,
  critical_worsening_threshold: 8,
  critical_safety_threshold: 15,
  clinical_artifact_id: 'clinical-artifact:phq9-change',
  clinical_artifact_version: '1.0.0',
  approval_state: 'APPROVED' as const,
  approved_by: 'clinical-governance-reviewer',
  approved_at: '2026-01-01T00:00:00.000Z',
  effective_from: '2026-01-01T00:00:00.000Z',
  ...overrides
});

async function recordPHQ(value: number, sourceReference: string, version: string | number = '1.0.0') {
  return OutcomeMeasurementService.recordMeasurement({
    subject_user_id: userId,
    measure_code: 'PHQ9_TOTAL',
    value,
    unit: 'points',
    measured_at: new Date().toISOString(),
    source_type: 'TEST',
    source_reference: sourceReference,
    instrument_version: version,
    provenance: ClinicalProvenance.USER_REPORTED,
    actor_role: 'USER'
  });
}

describe('MindOS Sprint 23 — Longitudinal Clinical Record & Measurement-Based Care', () => {
  before(async () => {
    ConsentService.resetForTesting();
    resetCareRelationshipsForTesting();
    ConsentService.recordConsent({
      userId,
      consentType: 'CLINICAL_CONSULTATION',
      status: 'GRANTED'
    });

    for (const item of [
      { id: professionalId, user: 'user-prof-s23-0001', display: 'Sprint 23 Clinician' },
      { id: unrelatedProfessionalId, user: 'user-prof-s23-unrelated', display: 'Unrelated Sprint 23 Clinician' }
    ]) {
      await ProfessionalService.getRepository().saveProfile({
        id: item.id,
        user_id: item.user,
        professional_type: ProfessionalType.CLINICAL_PSYCHOLOGIST,
        display_name: item.display,
        legal_name_reference: item.display,
        status: ProfessionalState.ACTIVE,
        verification_status: ProfessionalVerificationState.VERIFIED,
        jurisdictions: ['KE'],
        languages: ['en'],
        specialties: ['TEST'],
        delivery_modes: [DeliveryMode.TELEHEALTH],
        organization_refs: [],
        profile_visibility: ProfileVisibility.INTERNAL_ONLY,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    const relationship = await CareRelationshipService.createRelationship({
      subjectUserId: userId,
      primaryProviderId: professionalId,
      relationshipType: CareRelationshipType.PSYCHOLOGY,
      originType: CareRelationshipOriginType.CARE_NAVIGATION,
      originReference: 'sprint-23-certification',
      jurisdiction: 'KE',
      purpose: 'CARE_DELIVERY',
      activateImmediately: true,
      actorId: professionalId
    });
    relationshipId = relationship.id;
  });

  beforeEach(() => {
    resetOutcomesForTesting();
    resetClinicalRecordForTesting();
    resetCarePlansForTesting();
    EventBus.clearOutbox();
  });

  it('returns UNKNOWN when no approved clinical-change rule exists', async () => {
    await recordPHQ(16, 'no-rule-1');
    await recordPHQ(8, 'no-rule-2');
    const trend = OutcomeTrendEngine.evaluateSeries(
      await OutcomeSeriesService.getSeries(userId, 'PHQ9_TOTAL')
    );
    assert.equal(trend.trend_state, OutcomeTrendState.UNKNOWN);
    assert.equal(trend.is_clinically_significant, false);
    assert.equal(trend.requires_review, true);
    assert.deepEqual(trend.reason_codes, ['NO_APPROVED_CLINICAL_CHANGE_RULE']);
  });

  it('uses only an approved versioned clinical-change rule', async () => {
    ClinicalChangeRuleRegistry.registerApprovedRule(approvedRule());
    await recordPHQ(16, 'rule-1');
    await recordPHQ(8, 'rule-2');
    const trend = OutcomeTrendEngine.evaluateSeries(
      await OutcomeSeriesService.getSeries(userId, 'PHQ9_TOTAL')
    );
    assert.equal(trend.trend_state, OutcomeTrendState.IMPROVING);
    assert.equal(trend.change_amount, -8);
    assert.equal(trend.is_clinically_significant, true);
  });

  it('does not invent a target range when an approved rule omits it', async () => {
    ClinicalChangeRuleRegistry.registerApprovedRule(approvedRule({
      id: 'sleep-rule-v1',
      measure_code: 'SLEEP_HOURS_USER_REPORTED',
      mcid: 1
    }));
    await OutcomeMeasurementService.recordMeasurement({
      subject_user_id: userId,
      measure_code: 'SLEEP_HOURS_USER_REPORTED',
      value: 5,
      unit: 'hours',
      measured_at: '2026-01-01T00:00:00.000Z',
      source_type: 'TEST',
      source_reference: 'sleep-1',
      instrument_version: 1,
      provenance: ClinicalProvenance.USER_REPORTED,
      actor_role: 'USER'
    });
    await OutcomeMeasurementService.recordMeasurement({
      subject_user_id: userId,
      measure_code: 'SLEEP_HOURS_USER_REPORTED',
      value: 7,
      unit: 'hours',
      measured_at: '2026-01-02T00:00:00.000Z',
      source_type: 'TEST',
      source_reference: 'sleep-2',
      instrument_version: 1,
      provenance: ClinicalProvenance.USER_REPORTED,
      actor_role: 'USER'
    });
    const trend = OutcomeTrendEngine.evaluateSeries(
      await OutcomeSeriesService.getSeries(userId, 'SLEEP_HOURS_USER_REPORTED')
    );
    assert.equal(trend.trend_state, OutcomeTrendState.UNKNOWN);
    assert.ok(trend.reason_codes.includes('APPROVED_RULE_MISSING_TARGET_RANGE'));
  });

  it('does not label a categorical change clinically significant by default', () => {
    const series: any = {
      subject_user_id: userId,
      measure_code: 'TEST_CATEGORY',
      measure_definition: {
        id: 'test-category',
        measure_code: 'TEST_CATEGORY',
        name: 'Test',
        description: 'Test',
        measure_type: OutcomeMeasureType.USER_REPORTED_OUTCOME,
        unit: 'category',
        value_type: OutcomeValueType.CATEGORICAL,
        directionality: OutcomeDirectionality.NON_DIRECTIONAL,
        population: 'ALL',
        jurisdiction: 'KE',
        source_domain: 'test',
        comparability_policy_id: 'test',
        status: 'ACTIVE',
        created_at: '2026-01-01T00:00:00.000Z'
      },
      measurements: [
        { id: 'm1', value: 'A', measured_at: '2026-01-01T00:00:00.000Z' },
        { id: 'm2', value: 'B', measured_at: '2026-01-02T00:00:00.000Z' }
      ],
      comparability_status: 'COMPARABLE',
      series_version: 1
    };
    const trend = OutcomeTrendEngine.evaluateSeries(series);
    assert.equal(trend.trend_state, OutcomeTrendState.MIXED);
    assert.equal(trend.is_clinically_significant, false);
    assert.equal(trend.requires_review, true);
  });

  it('marks incompatible instrument versions INCOMPARABLE', async () => {
    ClinicalChangeRuleRegistry.registerApprovedRule(approvedRule());
    await recordPHQ(14, 'version-1', '1.0.0');
    await recordPHQ(8, 'version-2', '2.0.0');
    const series = await OutcomeSeriesService.getSeries(userId, 'PHQ9_TOTAL');
    assert.equal(series.comparability_status, 'INCOMPARABLE');
    assert.equal(
      OutcomeTrendEngine.evaluateSeries(series).trend_state,
      OutcomeTrendState.INCOMPARABLE
    );
  });

  it('is idempotent by authoritative source reference', async () => {
    const first = await recordPHQ(10, 'same-source');
    const retry = await recordPHQ(10, 'same-source');
    assert.equal(retry.id, first.id);
  });

  it('rejects AI provenance forgery', async () => {
    await assert.rejects(
      () => OutcomeMeasurementService.recordMeasurement({
        subject_user_id: userId,
        measure_code: 'PHQ9_TOTAL',
        value: 10,
        unit: 'points',
        measured_at: new Date().toISOString(),
        source_type: 'AI',
        source_reference: 'ai-forgery',
        instrument_version: '1.0.0',
        provenance: ClinicalProvenance.CLINICALLY_ASSESSED,
        actor_role: 'AI'
      }),
      DomainInvariantError
    );
  });

  it('rejects product telemetry masquerading as a clinical outcome', () => {
    assert.throws(
      () => MeasureRegistry.registerDefinition({
        id: 'product-metric',
        measure_code: 'app_click_rate',
        name: 'Clicks',
        description: 'Product telemetry',
        measure_type: OutcomeMeasureType.SYSTEM_DERIVED,
        unit: 'count',
        value_type: OutcomeValueType.INTEGER,
        directionality: OutcomeDirectionality.NON_DIRECTIONAL,
        population: 'ALL',
        jurisdiction: 'KE',
        source_domain: 'analytics',
        comparability_policy_id: 'none',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      }),
      DomainInvariantError
    );
  });

  it('does not leak raw outcome values into generic events or timeline metadata', async () => {
    const measurement = await recordPHQ(17, 'privacy-value');
    const event = EventBus.getOutbox().find(x => x.event_type === 'outcome.measurement_recorded');
    assert.ok(event);
    const envelope = JSON.parse(event!.payload);
    assert.equal(envelope.payload.value, undefined);
    assert.equal(envelope.payload.unit, undefined);

    const timeline = await ClinicalTimelineService.getTimeline(
      { subject_user_id: userId },
      'USER'
    );
    const entry = timeline.find(x => x.source_id === measurement.id);
    assert.ok(entry);
    assert.equal(entry!.summary_reference, 'outcome-measurement:' + measurement.id);
    assert.equal(JSON.stringify(entry).includes('17 points'), false);
  });

  it('re-establishes baseline from valid data after baseline invalidation', async () => {
    const first = await recordPHQ(12, 'baseline-1');
    const second = await recordPHQ(9, 'baseline-2');
    let series = await OutcomeSeriesService.getSeries(userId, 'PHQ9_TOTAL');
    assert.equal(series.baseline_measurement_id, first.id);
    await OutcomeMeasurementService.invalidateMeasurement(
      first.id,
      'SOURCE_CORRECTION',
      professionalId
    );
    series = await OutcomeSeriesService.getSeries(userId, 'PHQ9_TOTAL');
    assert.equal(series.baseline_measurement_id, second.id);
  });

  it('requires an approved alert-response policy and uses its exact window', async () => {
    await assert.rejects(
      () => OutcomeAlertService.raiseAlert({
        subject_user_id: userId,
        care_relationship_id: relationshipId,
        alert_type: OutcomeAlertType.DETERIORATION,
        severity: 'MEDIUM',
        measure_code: 'PHQ9_TOTAL'
      }),
      (err: Error) =>
        err instanceof DomainInvariantError &&
        /approved alert-response policy/i.test(err.message)
    );

    OutcomeAlertPolicyRegistry.registerApprovedPolicy({
      id: 'outcome-alert-policy',
      version: 3,
      review_due_minutes: { LOW: 240, MEDIUM: 90, HIGH: 30, CRITICAL: 10 },
      clinical_artifact_id: 'clinical-artifact:outcome-alert-response',
      clinical_artifact_version: '3.0.0',
      approval_state: 'APPROVED',
      approved_by: 'clinical-governance-reviewer',
      approved_at: '2026-01-01T00:00:00.000Z',
      effective_from: '2026-01-01T00:00:00.000Z'
    });
    const alert = await OutcomeAlertService.raiseAlert({
      subject_user_id: userId,
      care_relationship_id: relationshipId,
      alert_type: OutcomeAlertType.DETERIORATION,
      severity: 'MEDIUM',
      measure_code: 'PHQ9_TOTAL'
    });
    assert.equal(alert.policy_version, 'outcome-alert-policy:v3');
    assert.equal(
      Date.parse(alert.review_due_at) - Date.parse(alert.generated_at),
      90 * 60_000
    );
  });

  it('derives SAFETY_SIGNAL severity only from an approved threshold rule', async () => {
    ClinicalChangeRuleRegistry.registerApprovedRule(approvedRule());
    await recordPHQ(5, 'safety-rule-1');
    await recordPHQ(20, 'safety-rule-2');
    const trend = OutcomeTrendEngine.evaluateSeries(
      await OutcomeSeriesService.getSeries(userId, 'PHQ9_TOTAL')
    );
    assert.equal(trend.trend_state, OutcomeTrendState.WORSENING);
    assert.equal(trend.deterioration_severity, 'SAFETY_SIGNAL');
    assert.ok(
      trend.reason_codes.includes('APPROVED_CRITICAL_SAFETY_THRESHOLD_BREACHED')
    );
  });

  it('blocks an unrelated professional from longitudinal outcome access', async () => {
    await recordPHQ(10, 'idor-1');
    await assert.rejects(
      () => ProgressViewService.getProfessionalDashboard({
        subject_user_id: userId,
        professional_id: unrelatedProfessionalId,
        purpose: 'CARE_DELIVERY'
      }),
      AuthorizationError
    );
  });

  it('protects clinical observation values from timeline summaries', async () => {
    const observation = await ClinicalObservationService.recordObservation({
      subject_user_id: userId,
      care_relationship_id: relationshipId,
      observation_code: 'TEST_OBS',
      observation_name: 'Private observation',
      value: 'sensitive-value',
      observed_at: new Date().toISOString(),
      recorded_by: professionalId,
      provenance: ClinicalProvenance.PROFESSIONAL_RECORDED
    });
    const timeline = await ClinicalTimelineService.getTimeline(
      { subject_user_id: userId },
      'PROFESSIONAL'
    );
    const entry = timeline.find(x => x.source_id === observation.id);
    assert.ok(entry);
    assert.equal(entry!.summary_reference, 'clinical-observation:' + observation.id);
    assert.equal(JSON.stringify(entry).includes('sensitive-value'), false);
  });

  it('freezes immutable review evidence against the active Care Plan version', async () => {
    ClinicalChangeRuleRegistry.registerApprovedRule(approvedRule());
    const plan = await CarePlanService.createDraftPlan({
      relationshipId,
      authorProfessionalId: professionalId,
      planType: CarePlanType.PSYCHOLOGICAL_SUPPORT,
      summary: 'Sprint 23 snapshot plan',
      reviewFrequencyDays: 14,
      actorId: professionalId
    });
    await CarePlanService.activatePlan(plan.id, professionalId);
    const active = await CarePlanService.getActiveVersion(plan.id);
    assert.ok(active);

    await recordPHQ(11, 'snapshot-1');
    const review = await OutcomeReviewService.scheduleReview({
      subject_user_id: userId,
      care_relationship_id: relationshipId,
      care_plan_id: plan.id,
      review_type: OutcomeReviewType.SCHEDULED,
      reviewer_id: professionalId
    });
    const completed = await OutcomeReviewService.completeReview({
      review_id: review.id,
      reviewer_id: professionalId,
      decision: OutcomeReviewDecision.NO_CHANGE,
      reason_codes: ['NO_CHANGE_REQUIRED']
    });
    assert.ok(completed.snapshot_id);

    const snapshot = await OutcomeReviewService.getSnapshot(completed.snapshot_id!);
    assert.ok(snapshot);
    assert.equal(snapshot!.care_plan_version_id, active!.id);
    const originalHash = snapshot!.hash;
    const originalCount = snapshot!.measure_states[0]?.measurements.length || 0;

    if (snapshot!.measure_states[0]?.measurements[0]) {
      snapshot!.measure_states[0].measurements[0].value = 999;
    }
    await recordPHQ(6, 'snapshot-after');
    const again = await OutcomeReviewService.getSnapshot(completed.snapshot_id!);
    assert.equal(again!.hash, originalHash);
    assert.equal(
      again!.measure_states[0]?.measurements.length || 0,
      originalCount
    );
    assert.notEqual(again!.measure_states[0]?.measurements[0]?.value, 999);
  });

  it('rejects unauthorized outcome review scheduling at the service boundary', async () => {
    await assert.rejects(
      () => OutcomeReviewService.scheduleReview({
        subject_user_id: userId,
        care_relationship_id: relationshipId,
        review_type: OutcomeReviewType.PROFESSIONAL_REQUESTED,
        reviewer_id: unrelatedProfessionalId
      }),
      AuthorizationError
    );
  });

  it('rejects professional measurement writes without relationship authority', async () => {
    await assert.rejects(
      () => OutcomeMeasurementService.recordMeasurement({
        subject_user_id: userId,
        measure_code: 'PHQ9_TOTAL',
        value: 9,
        unit: 'points',
        measured_at: new Date().toISOString(),
        source_type: 'PROFESSIONAL',
        source_reference: 'unauthorized-professional-write',
        instrument_version: '1.0.0',
        provenance: ClinicalProvenance.PROFESSIONAL_RECORDED,
        actor_role: 'PROFESSIONAL',
        recorded_by: unrelatedProfessionalId,
        care_relationship_id: relationshipId
      }),
      AuthorizationError
    );
  });
});
