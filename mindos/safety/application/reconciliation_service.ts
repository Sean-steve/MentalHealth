/**
 * MindOS Safety Reconciliation & Integrity Auditor
 * Authority: Volumes I, V & Clinical Safety Policy Catalogue Section 9
 * 
 * Rules:
 * - Reconciles active risk states with escalations, actions, and resources.
 * - Discrepancies generate formal SafetyIncidentEntity records and alerts.
 */

import { ISafetyRepository } from '../repositories/safety_repository.js';
import {
  SafetyIncidentEntity,
  SafetyIncidentSeverity,
  SafetyIncidentType,
  ResourceVerificationStatus,
  RiskState
} from '../domain/types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { SafetyAlertManager } from '../infrastructure/alerts.js';

export interface ReconciliationReport {
  timestamp: string;
  evaluatedUsers: number;
  missingEscalationsCount: number;
  expiredResourcesCount: number;
  breachedSlaCount: number;
  incidentsCreated: string[];
  status: 'CLEAN' | 'DISCREPANCIES_DETECTED';
}

export class SafetyReconciliationService {
  constructor(private repo: ISafetyRepository) {}

  public async reconcile(sampleUserIds: string[] = []): Promise<ReconciliationReport> {
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    const incidentsCreated: string[] = [];
    let missingEscalations = 0;
    let expiredResources = 0;
    let breachedSla = 0;

    // 1. Check user risk states vs active escalations
    for (const userId of sampleUserIds) {
      const risk = await this.repo.getCurrentRiskState(userId);
      if (risk && (risk.level === RiskState.URGENT || risk.level === RiskState.HIGH)) {
        const escalations = await this.repo.getActiveEscalations();
        const hasActiveEscalation = escalations.some(e => e.subject_user_id === userId);

        if (!hasActiveEscalation) {
          missingEscalations++;
          const incident: SafetyIncidentEntity = {
            id: generateUUIDv7(),
            incident_type: SafetyIncidentType.MISSED_SIGNAL,
            severity: risk.level === RiskState.URGENT ? SafetyIncidentSeverity.CRITICAL : SafetyIncidentSeverity.HIGH,
            affected_component: 'SAFETY_ESCALATION_ENGINE',
            detected_at: nowIso,
            status: 'OPEN',
            description_reference: `User ${userId} in ${risk.level} risk state without active escalation record.`,
            created_at: nowIso
          };
          await this.repo.saveIncident(incident);
          incidentsCreated.push(incident.id);

          SafetyAlertManager.raiseAlert({
            alertType: 'MISSING_MANDATORY_SAFETY_ESCALATION',
            severity: incident.severity as any,
            message: incident.description_reference,
            context: { userId, riskLevel: risk.level }
          });
        }
      }
    }

    // 2. Check safety resources for expiration
    const resources = await this.repo.getResources();
    for (const res of resources) {
      if (res.verification_status === ResourceVerificationStatus.VERIFIED && new Date(res.expires_at).getTime() <= nowMs) {
        expiredResources++;
        const incident: SafetyIncidentEntity = {
          id: generateUUIDv7(),
          incident_type: SafetyIncidentType.RESOURCE_EXPIRED_PRESENTED,
          severity: SafetyIncidentSeverity.HIGH,
          affected_component: 'SAFETY_RESOURCE_REGISTRY',
          detected_at: nowIso,
          status: 'OPEN',
          description_reference: `Resource ${res.resource_code} has expired verification (${res.expires_at}).`,
          created_at: nowIso
        };
        await this.repo.saveIncident(incident);
        incidentsCreated.push(incident.id);
      }
    }

    // 3. Check active escalations SLA status
    const escalations = await this.repo.getActiveEscalations();
    for (const esc of escalations) {
      if (!esc.acknowledged_at && new Date(esc.sla_acknowledgement_due_at).getTime() < nowMs) {
        breachedSla++;
      }
    }

    const hasDiscrepancies = missingEscalations > 0 || expiredResources > 0 || breachedSla > 0;

    return {
      timestamp: nowIso,
      evaluatedUsers: sampleUserIds.length,
      missingEscalationsCount: missingEscalations,
      expiredResourcesCount: expiredResources,
      breachedSlaCount: breachedSla,
      incidentsCreated,
      status: hasDiscrepancies ? 'DISCREPANCIES_DETECTED' : 'CLEAN'
    };
  }
}
