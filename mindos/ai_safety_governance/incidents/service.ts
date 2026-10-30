/**
 * MindOS AI Incident & Safety Event Service
 * Authority: ADR-011, Volumes IX, XIV, XV & KDPA 2019 Section 43
 * Automatically executes protective actions (suspend system, disable tools, revoke approval)
 * based on incident severity.
 */

import {
  AIIncidentEntity,
  AIIncidentType,
  AIIncidentState,
  AIReleaseAction
} from '../domain/types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { AISafetyReviewWorkflow } from '../reviews/workflow.js';
import { AIConfigurationEngine } from '../configurations/engine.js';
import { AISystemRegistry } from '../systems/registry.js';
import { AISystemState } from '../../platform/shared/state_machines.js';
import { AIToolRegistry } from '../tools/registry.js';
import { EventBus } from '../../platform/events/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { ValidationError, NotFoundError } from '../../platform/errors/index.js';

export class AIIncidentService {
  private static incidents: Map<string, AIIncidentEntity> = new Map();

  public static async reportIncident(params: {
    ai_system_id: string;
    configuration_version: string;
    incident_type: AIIncidentType | string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    source: string;
    description: string;
    owner: string;
    affected_tool_code?: string;
  }): Promise<AIIncidentEntity> {
    const id = generateUUIDv7();
    const now = new Date().toISOString();

    let release_action = AIReleaseAction.NONE;

    // Automatic protective actions (Section 44)
    if (params.severity === 'CRITICAL') {
      release_action = AIReleaseAction.SUSPEND_SYSTEM;
      const config = AIConfigurationEngine.getConfigurationByVersion(params.ai_system_id, params.configuration_version);
      try {
        AISafetyReviewWorkflow.revokeApproval({
          configurationHash: config.configuration_hash,
          revoked_by: params.owner,
          reason: `CRITICAL Incident reported: ${params.incident_type} - ${params.description}`
        });
      } catch {
        // Fallback state change
        AISystemRegistry.transitionState(params.ai_system_id, AISystemState.SUSPENDED, params.owner);
      }
    } else if (params.incident_type === AIIncidentType.TOOL_MISUSE && params.affected_tool_code) {
      release_action = AIReleaseAction.DISABLE_TOOLS;
      try {
        const tool = AIToolRegistry.getTool(params.affected_tool_code);
        tool.status = 'RESTRICTED';
      } catch {
        // ignore if not found
      }
    } else if (params.severity === 'HIGH') {
      release_action = AIReleaseAction.THROTTLE;
    }

    const incident: AIIncidentEntity = {
      id,
      ai_system_id: params.ai_system_id,
      configuration_version: params.configuration_version,
      incident_type: params.incident_type,
      severity: params.severity,
      source: params.source,
      description_reference: params.description,
      detected_at: now,
      status: AIIncidentState.OPEN,
      owner: params.owner,
      safety_impact: params.severity === 'CRITICAL' ? 'SEVERE_SAFETY_ALERT' : 'MODERATE',
      clinical_impact: params.incident_type === AIIncidentType.CLINICAL_BOUNDARY_VIOLATION ? 'CLINICAL_ESCALATION' : 'NONE',
      privacy_impact: params.incident_type === AIIncidentType.PRIVACY_DISCLOSURE ? 'KDPA_NOTIFICATION_TRIGGER' : 'NONE',
      security_impact: 'ANALYZING',
      regulatory_impact: 'EVALUATING',
      release_action
    };

    AIIncidentService.incidents.set(id, incident);

    // Emit event
    EventBus.enqueue(
      'ai.incident_reported',
      'ai_safety_governance',
      id,
      DataClassification.RESTRICTED,
      {
        incident_id: id,
        ai_system_id: incident.ai_system_id,
        severity: incident.severity,
        incident_type: incident.incident_type,
        action: release_action,
        occurred_at: now
      }
    );

    return incident;
  }

  public static getIncident(id: string): AIIncidentEntity {
    const incident = AIIncidentService.incidents.get(id);
    if (!incident) {
      throw new NotFoundError(`AI Incident "${id}" not found.`);
    }
    return incident;
  }

  public static listUnresolvedIncidents(ai_system_id?: string): AIIncidentEntity[] {
    const all = Array.from(AIIncidentService.incidents.values());
    return all.filter(i =>
      i.status !== AIIncidentState.RESOLVED &&
      i.status !== AIIncidentState.CLOSED &&
      (!ai_system_id || i.ai_system_id === ai_system_id)
    );
  }

  public static resolveIncident(incidentId: string, resolutionSummary: string): AIIncidentEntity {
    const incident = AIIncidentService.getIncident(incidentId);
    incident.status = AIIncidentState.RESOLVED;
    incident.resolved_at = new Date().toISOString();
    return incident;
  }

  public static resetForTesting(): void {
    AIIncidentService.incidents.clear();
  }
}
