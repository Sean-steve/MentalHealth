/**
 * MindOS Canonical Privacy Governance Bounded Context
 * Authority: Master Architecture Index Section 7, Volumes I, III, VIII, XV & Appendices B / C / Q
 *            Kenya Data Protection Act 2019 & General Regulations 2021
 * Sprint 11: Privacy Governance Engine, Data Processing Registry, DPIA Workflow,
 *            Data-Flow Governance & Privacy Release Controls
 */

export * from './types.js';
export * from './domain/errors.js';
export * from './domain/taxonomy.js';
export * from './domain/fingerprint.js';
export * from './processing/material_change.js';
export * from './dpia/trigger_engine.js';
export * from './risks/risk_model.js';
export * from './risks/control_catalogue.js';
export * from './policies/reviewer_eligibility.js';
export * from './transfers/processor_registry.js';
export * from './transfers/data_flow_registry.js';
export * from './transfers/cross_border.js';
export * from './retention/retention_bridge.js';
export * from './infrastructure/persistence.js';
export * from './infrastructure/reconciliation.js';
export * from './application/service.js';

import { DPIAState, validateStateTransition } from '../platform/shared/state_machines.js';
import { generateUUIDv7 } from '../platform/database/uuid.js';
import { AuditService } from '../platform/audit/index.js';
import { AuthorizationError, ValidationError } from '../platform/errors/index.js';
import { PrivacyGovernancePersistence } from './infrastructure/persistence.js';
import { PrivacyGovernanceEngine } from './application/service.js';
import { DataCategory, ProcessingPurpose, LawfulBasis } from './types.js';

// Backwards compatibility types for Sprint 9 integration
export interface ProcessingActivityEntity {
  id: string;
  code: string;
  name: string;
  purpose: string;
  data_categories: string[];
  data_subjects: string[];
  lawful_basis: string;
  processors: string[];
  processing_locations: string[];
  risk_flags: string[];
  owner: string;
}

export interface DPIAAssessmentEntity {
  id: string;
  processing_activity_id: string;
  version: number;
  state: DPIAState;
  necessity_proportionality: Record<string, unknown>;
  risk_register: Record<string, unknown>;
  residual_risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  required_controls: string[];
  reviewer_id?: string;
  approved_at?: string;
  review_due_at?: string;
}

/**
 * Backwards-compatibility facade for Sprint 9 code
 */
export class PrivacyGovernanceService {
  private static activities: Map<string, ProcessingActivityEntity> = new Map();
  private static dpias: Map<string, DPIAAssessmentEntity> = new Map();

  public static async registerActivity(params: {
    code: string;
    name: string;
    purpose: string;
    data_categories: string[];
    data_subjects: string[];
    lawful_basis: string;
    processors?: string[];
    processing_locations?: string[];
    risk_flags?: string[];
    owner: string;
  }): Promise<ProcessingActivityEntity> {
    const id = generateUUIDv7();
    const activity: ProcessingActivityEntity = {
      id,
      code: params.code,
      name: params.name,
      purpose: params.purpose,
      data_categories: params.data_categories,
      data_subjects: params.data_subjects,
      lawful_basis: params.lawful_basis,
      processors: params.processors || [],
      processing_locations: params.processing_locations || ['Kenya'],
      risk_flags: params.risk_flags || [],
      owner: params.owner
    };

    PrivacyGovernanceService.activities.set(id, activity);

    // Register also in canonical Sprint 11 engine
    try {
      await PrivacyGovernanceEngine.registerProcessingActivity({
        code: params.code,
        name: params.name,
        description: `Registered activity ${params.name}`,
        owner_domain: 'care',
        owner_id: params.owner,
        data_subject_categories: ['USERS'] as any,
        data_categories: params.data_categories as any,
        purposes: [ProcessingPurpose.CARE_DELIVERY],
        lawful_basis: [LawfulBasis.EXPLICIT_CONSENT],
        processors: params.processors || []
      });
    } catch {
      // Ignored if already registered
    }

    const requiresDPIA =
      params.data_categories.includes('HEALTH_SENSITIVE') ||
      params.data_categories.includes('CLINICAL_RECORD') ||
      (params.risk_flags && params.risk_flags.includes('AI_PROFILING'));

    const dpiaId = generateUUIDv7();
    const dpia: DPIAAssessmentEntity = {
      id: dpiaId,
      processing_activity_id: id,
      version: 1,
      state: requiresDPIA ? DPIAState.REQUIRED : DPIAState.APPROVED,
      necessity_proportionality: { purpose: params.purpose },
      risk_register: {},
      residual_risk: requiresDPIA ? 'HIGH' : 'LOW',
      required_controls: requiresDPIA ? ['ENCRYPTION_AT_REST', 'DENY_BY_DEFAULT_AUTHZ', 'AUDIT_LOGGING'] : []
    };

    PrivacyGovernanceService.dpias.set(dpiaId, dpia);
    return activity;
  }

  public static async decideDPIA(params: {
    dpiaId: string;
    reviewerId: string;
    approved: boolean;
    requiredControls?: string[];
    residualRisk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }): Promise<DPIAAssessmentEntity> {
    const dpia = PrivacyGovernanceService.dpias.get(params.dpiaId);
    if (!dpia) {
      throw new ValidationError('DPIA assessment not found');
    }

    const activity = PrivacyGovernanceService.activities.get(dpia.processing_activity_id);
    if (activity && activity.owner === params.reviewerId) {
      throw new AuthorizationError('Privacy author cannot self-approve DPIA (Separation of Duties).', {
        errorCode: 'AUTHZ_004'
      });
    }

    const targetState = params.approved ? DPIAState.APPROVED : DPIAState.REJECTED;
    validateStateTransition('DPIAState', dpia.state, targetState, dpia.id);

    dpia.state = targetState;
    dpia.reviewer_id = params.reviewerId;
    dpia.approved_at = new Date().toISOString();
    dpia.residual_risk = params.residualRisk || 'LOW';
    if (params.requiredControls) {
      dpia.required_controls = params.requiredControls;
    }

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.reviewerId,
      action: 'PRIVACY_GOVERNANCE.DPIA_DECISION',
      resource_type: 'dpia',
      resource_id: dpia.id,
      purpose: 'DPIA Privacy Approval',
      authorization_basis: { reviewerId: params.reviewerId, approved: params.approved },
      result: 'ALLOWED'
    });

    return dpia;
  }

  public static getDPIAByActivity(activityId: string): DPIAAssessmentEntity | undefined {
    for (const d of PrivacyGovernanceService.dpias.values()) {
      if (d.processing_activity_id === activityId) {
        return d;
      }
    }
    return undefined;
  }

  public static resetForTesting(): void {
    PrivacyGovernanceService.activities.clear();
    PrivacyGovernanceService.dpias.clear();
    PrivacyGovernancePersistence.resetMemoryState();
  }
}
