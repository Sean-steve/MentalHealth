/**
 * MindOS Outcome Alert Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 23 Bounded Context
 * 
 * Rules:
 * - Alerts are internal clinical signals that review is required.
 * - Invariant (Section 88): Alert is NOT automatically a Safety escalation.
 * - Invariant (Section 90, 91): Internal deterioration alerts are visible only to authorized clinicians/care teams.
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { IOutcomeRepository } from '../repositories/interfaces.js';
import { OutcomeAlert } from '../domain/entities.js';
import { OutcomeAlertType, OutcomeAlertState } from '../domain/types.js';
import { DomainInvariantError, NotFoundError } from '../../platform/errors/index.js';
import { OutcomeAlertPolicyRegistry } from './outcome_alert_policy.js';

export interface RaiseAlertParams {
  subject_user_id: string;
  care_relationship_id?: string;
  alert_type: OutcomeAlertType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  measure_code?: string;
  measurement_id?: string;
  trend_id?: string;
  assigned_to?: string;
}

export class OutcomeAlertService {
  private static repository: IOutcomeRepository;

  public static setRepository(repo: IOutcomeRepository): void {
    OutcomeAlertService.repository = repo;
  }

  public static async raiseAlert(params: RaiseAlertParams): Promise<OutcomeAlert> {
    if (!OutcomeAlertService.repository) {
      throw new DomainInvariantError('OutcomeRepository not initialized.');
    }

    if (params.measurement_id) {
      const existingAlerts = await OutcomeAlertService.repository.findAlertsByUser(params.subject_user_id);
      const existing = existingAlerts.find(a =>
        a.measurement_id === params.measurement_id &&
        a.alert_type === params.alert_type &&
        (a.status === OutcomeAlertState.OPEN || a.status === OutcomeAlertState.ACKNOWLEDGED)
      );
      if (existing) return existing;
    }

    const alertId = generateUUIDv7();
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const policy = OutcomeAlertPolicyRegistry.getApprovedPolicy(nowDate);
    if (!policy) {
      throw new DomainInvariantError('Outcome alert cannot be raised without an approved alert-response policy.');
    }
    const reviewDueAt = new Date(nowDate.getTime() + policy.review_due_minutes[params.severity] * 60_000).toISOString();

    const alert: OutcomeAlert = {
      id: alertId,
      subject_user_id: params.subject_user_id,
      care_relationship_id: params.care_relationship_id,
      alert_type: params.alert_type,
      severity: params.severity,
      measure_code: params.measure_code,
      measurement_id: params.measurement_id,
      trend_id: params.trend_id,
      status: OutcomeAlertState.OPEN,
      generated_at: now,
      review_due_at: reviewDueAt,
      assigned_to: params.assigned_to,
      policy_version: `${policy.id}:v${policy.version}`
    };

    await OutcomeAlertService.repository.saveAlert(alert);

    EventBus.enqueue(
      'outcome.alert_raised',
      'outcomes',
      alertId,
      DataClassification.HEALTH_SENSITIVE,
      {
        alert_id: alertId,
        subject_user_id: params.subject_user_id,
        alert_type: params.alert_type,
        severity: params.severity,
        measure_code: params.measure_code
      }
    );

    AuditService.record({
      actor_type: 'SYSTEM',
      actor_id: 'outcome_engine',
      action: 'OUTCOME_ALERT.RAISED',
      resource_type: 'outcome_alert',
      resource_id: alertId,
      purpose: 'Clinical Deterioration Alerting',
      authorization_basis: { alertType: params.alert_type },
      result: 'ALLOWED',
      metadata: { severity: params.severity, measureCode: params.measure_code }
    });

    return alert;
  }

  public static async acknowledgeAlert(alertId: string, actorId: string): Promise<OutcomeAlert> {
    const alert = await OutcomeAlertService.repository.findAlertById(alertId);
    if (!alert) {
      throw new NotFoundError(`Outcome alert ${alertId} not found.`);
    }

    alert.status = OutcomeAlertState.ACKNOWLEDGED;
    alert.assigned_to = actorId;
    await OutcomeAlertService.repository.saveAlert(alert);

    return alert;
  }

  public static async resolveAlert(alertId: string, actorId: string, notes: string): Promise<OutcomeAlert> {
    const alert = await OutcomeAlertService.repository.findAlertById(alertId);
    if (!alert) {
      throw new NotFoundError(`Outcome alert ${alertId} not found.`);
    }

    alert.status = OutcomeAlertState.RESOLVED;
    alert.resolved_at = new Date().toISOString();
    alert.resolved_by = actorId;
    alert.resolution_notes = notes;
    await OutcomeAlertService.repository.saveAlert(alert);

    EventBus.enqueue(
      'outcome.alert_resolved',
      'outcomes',
      alertId,
      DataClassification.HEALTH_SENSITIVE,
      {
        alert_id: alertId,
        resolved_by: actorId
      }
    );

    return alert;
  }

  public static async listAlertsForSubject(userId: string, status?: string): Promise<OutcomeAlert[]> {
    if (!OutcomeAlertService.repository) {
      throw new DomainInvariantError('OutcomeRepository not initialized.');
    }
    return OutcomeAlertService.repository.findAlertsByUser(userId, status);
  }
}
