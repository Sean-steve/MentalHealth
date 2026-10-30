/**
 * MindOS Canonical Privacy Governance Application Service & Orchestrator
 * Authority: Master Architecture Index Section 7, Volumes I, III, VIII, XV & Appendices B / C / Q
 *            Kenya Data Protection Act 2019 & General Regulations 2021
 * Sprint 11: Privacy Governance Engine, Data Processing Registry, DPIA Workflow,
 *            Data-Flow Governance & Privacy Release Controls
 */

import { v7 as uuidv7 } from 'uuid';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { AuditAction, AuditActorType, AuditResult, GovernanceDomain } from '../../platform/audit/domain/taxonomy.js';
import { GovernanceEvidenceService } from '../../platform/audit/application/governance_evidence_service.js';
import { ValidationError } from '../../platform/errors/index.js';
import {
  ProcessingActivity,
  ProcessingActivityVersion,
  ProcessingActivityState,
  DPIAAssessment,
  DPIAState,
  PrivacyRisk,
  PrivacyRiskControl,
  PrivacyRemediation,
  PrivacyApproval,
  PrivacyDecision,
  DPIATriggerResult,
  RiskLevel,
  DataCategory,
  RegisterProcessingActivityInput,
  SubmitDPIAInput,
  EvaluateReleaseGateInput,
  PrivacyAuditReport
} from '../types.js';
import { PrivacyGovernancePersistence } from '../infrastructure/persistence.js';
import { PrivacyFingerprintEngine } from '../domain/fingerprint.js';
import { MaterialProcessingChangeDetector } from '../processing/material_change.js';
import { DPIATriggerEngine } from '../dpia/trigger_engine.js';
import { PrivacyRiskModel } from '../risks/risk_model.js';
import { PrivacyReviewerEligibilityEngine } from '../policies/reviewer_eligibility.js';
import { PrivacyProcessorRegistry } from '../transfers/processor_registry.js';
import {
  PrivacyDPIARequiredError,
  PrivacyDPIANotApprovedError,
  PrivacyHighResidualRiskError,
  PrivacyProcessingNotRegisteredError,
  PrivacyProcessingVersionNotApprovedError,
  PrivacyProcessorNotApprovedError,
  PrivacyApprovalExpiredError,
  PrivacyApprovalRevokedError
} from '../domain/errors.js';

export class PrivacyGovernanceEngine {
  /**
   * 1. Register a new Processing Activity
   */
  public static async registerProcessingActivity(
    input: RegisterProcessingActivityInput
  ): Promise<ProcessingActivity> {
    if (!input.code || !input.name || !input.owner_id || !input.owner_domain) {
      throw new ValidationError('Processing activity registration requires code, name, owner_id, and owner_domain');
    }

    if (!input.data_categories || input.data_categories.length === 0) {
      throw new ValidationError('Processing activity must declare at least one data category');
    }

    if (!input.purposes || input.purposes.length === 0) {
      throw new ValidationError('Processing activity must declare at least one processing purpose');
    }

    if (!input.lawful_basis || input.lawful_basis.length === 0) {
      throw new ValidationError('Processing activity must declare at least one lawful basis under KDPA Section 30/44');
    }

    const existing = await PrivacyGovernancePersistence.getActivityByCode(input.code);
    if (existing) {
      throw new ValidationError(`Processing activity with code "${input.code}" already exists`);
    }

    const now = new Date().toISOString();
    const id = uuidv7();

    const activity: ProcessingActivity = {
      id,
      code: input.code,
      name: input.name,
      description: input.description,
      owner_domain: input.owner_domain,
      owner_id: input.owner_id,
      version: 1,
      status: ProcessingActivityState.DRAFT,
      data_subject_categories: input.data_subject_categories || [],
      data_categories: input.data_categories,
      special_categories: input.special_categories || [],
      purposes: input.purposes,
      lawful_basis: input.lawful_basis,
      consent_dependencies: input.consent_dependencies || {},
      sources: input.sources || ['DIRECT_USER_INPUT'],
      recipients: input.recipients || [],
      processors: input.processors || [],
      storage_locations: input.storage_locations || ['KE-REGION'],
      processing_locations: input.processing_locations || ['KE-REGION'],
      transfer_locations: input.transfer_locations || ['KE'],
      retention_policy_refs: input.retention_policy_refs || [],
      automated_processing: Boolean(input.automated_processing),
      profiling: Boolean(input.profiling),
      ai_involvement: Boolean(input.ai_involvement),
      clinical_relevance: Boolean(input.clinical_relevance),
      security_classification: input.security_classification || 'CONFIDENTIAL',
      jurisdictions: input.jurisdictions || ['KE'],
      fingerprint: '',
      governed_resource_id: input.governed_resource_id,
      created_at: now,
      updated_at: now
    };

    activity.fingerprint = PrivacyFingerprintEngine.computeFingerprint(activity);

    // Save master record
    await PrivacyGovernancePersistence.saveActivity(activity);

    // Save initial version
    const versionRecord: ProcessingActivityVersion = {
      id: uuidv7(),
      processing_activity_id: id,
      version: 1,
      status: ProcessingActivityState.DRAFT,
      fingerprint: activity.fingerprint,
      specification: { ...activity },
      is_material_change: false,
      created_by: input.owner_id,
      created_at: now
    };
    await PrivacyGovernancePersistence.saveVersion(versionRecord);

    // Evaluate DPIA requirement
    const triggerEval = DPIATriggerEngine.evaluate(activity);
    if (triggerEval.result === DPIATriggerResult.DPIA_REQUIRED) {
      activity.status = ProcessingActivityState.DPIA_REQUIRED;
      await PrivacyGovernancePersistence.saveActivity(activity);

      await EventBus.publish({
        type: 'privacy.dpia_required',
        payload: {
          processing_activity_id: activity.id,
          activity_code: activity.code,
          reasons: triggerEval.factors.reasons
        }
      });
    } else {
      activity.status = ProcessingActivityState.ASSESSMENT_REQUIRED;
      await PrivacyGovernancePersistence.saveActivity(activity);
    }

    // Publish event & Audit
    await EventBus.publish({
      type: 'privacy.processing_activity_created',
      payload: {
        activity_id: activity.id,
        code: activity.code,
        status: activity.status,
        version: activity.version
      }
    });

    await AuditService.record({
      action: AuditAction.CREATE,
      actor_id: input.owner_id,
      actor_type: AuditActorType.USER,
      resource_type: 'processing_activity',
      resource_id: activity.id,
      result: AuditResult.SUCCESS,
      authorization_basis: { code: activity.code, version: activity.version, status: activity.status }
    });

    return activity;
  }

  /**
   * 2. Submit updates to an existing Processing Activity (Material change detection)
   */
  public static async updateProcessingActivity(
    activityId: string,
    updates: Partial<ProcessingActivity>,
    actorId: string
  ): Promise<ProcessingActivity> {
    const activity = await PrivacyGovernancePersistence.getActivityById(activityId);
    if (!activity) {
      throw new PrivacyProcessingNotRegisteredError(`Processing activity ${activityId} not found`);
    }

    const materialEval = MaterialProcessingChangeDetector.evaluate(activity, updates);
    const now = new Date().toISOString();

    if (materialEval.is_material_change) {
      // Increment version and revoke existing approval
      activity.version += 1;
      activity.status = materialEval.triggers_new_dpia
        ? ProcessingActivityState.DPIA_REQUIRED
        : ProcessingActivityState.IN_REVIEW;

      Object.assign(activity, updates, { updated_at: now });
      activity.fingerprint = PrivacyFingerprintEngine.computeFingerprint(activity);

      await PrivacyGovernancePersistence.saveActivity(activity);

      // Save new version
      await PrivacyGovernancePersistence.saveVersion({
        id: uuidv7(),
        processing_activity_id: activity.id,
        version: activity.version,
        status: activity.status,
        fingerprint: activity.fingerprint,
        specification: { ...activity },
        is_material_change: true,
        material_change_summary: materialEval.change_summary.join('; '),
        supersedes_version: activity.version - 1,
        created_by: actorId,
        created_at: now
      });

      await EventBus.publish({
        type: 'privacy.processing_activity_changed',
        payload: {
          activity_id: activity.id,
          code: activity.code,
          version: activity.version,
          is_material_change: true,
          reasons: materialEval.change_summary
        }
      });
    } else {
      // Non-material update (e.g. description edit)
      Object.assign(activity, updates, { updated_at: now });
      await PrivacyGovernancePersistence.saveActivity(activity);
    }

    return activity;
  }

  /**
   * 3. Submit a Data Protection Impact Assessment (DPIA)
   */
  public static async submitDPIA(
    activityId: string,
    input: SubmitDPIAInput
  ): Promise<DPIAAssessment> {
    const activity = await PrivacyGovernancePersistence.getActivityById(activityId);
    if (!activity) {
      throw new PrivacyProcessingNotRegisteredError(`Activity ${activityId} not found`);
    }

    const now = new Date().toISOString();
    const dpiaId = uuidv7();
    const triggerEval = DPIATriggerEngine.evaluate(activity);

    // Score all inherent and residual risks
    let residualCritical = 0;
    let residualHigh = 0;
    let residualModerate = 0;
    let residualLow = 0;
    let inherentCritical = 0;
    let inherentHigh = 0;

    const createdRisks: PrivacyRisk[] = [];

    for (const r of input.risks) {
      const inherentLevel = PrivacyRiskModel.calculateRiskLevel(r.likelihood, r.impact);
      if (inherentLevel === RiskLevel.CRITICAL) inherentCritical++;
      if (inherentLevel === RiskLevel.HIGH) inherentHigh++;

      const residualCalc = PrivacyRiskModel.calculateResidualRisk(
        r.likelihood,
        r.impact,
        r.controls
      );

      if (residualCalc.residual_risk === RiskLevel.CRITICAL) residualCritical++;
      else if (residualCalc.residual_risk === RiskLevel.HIGH) residualHigh++;
      else if (residualCalc.residual_risk === RiskLevel.MODERATE) residualModerate++;
      else residualLow++;

      const riskRecord: PrivacyRisk = {
        id: uuidv7(),
        dpia_id: dpiaId,
        risk_code: r.risk_code,
        threat_event: r.threat_event,
        risk_dimension: r.risk_dimension,
        affected_data: r.affected_data,
        affected_subjects: r.affected_subjects,
        likelihood: r.likelihood,
        impact: r.impact,
        inherent_risk: inherentLevel,
        residual_likelihood: residualCalc.residual_likelihood,
        residual_impact: residualCalc.residual_impact,
        residual_risk: residualCalc.residual_risk,
        status: 'TREATED',
        owner: r.owner,
        created_at: now
      };

      await PrivacyGovernancePersistence.saveRisk(riskRecord);
      createdRisks.push(riskRecord);
    }

    // Overall residual risk is maximum of any individual residual risk
    let overallResidualRisk: RiskLevel = RiskLevel.LOW;
    if (residualCritical > 0) overallResidualRisk = RiskLevel.CRITICAL;
    else if (residualHigh > 0) overallResidualRisk = RiskLevel.HIGH;
    else if (residualModerate > 0) overallResidualRisk = RiskLevel.MODERATE;

    const dpia: DPIAAssessment = {
      id: dpiaId,
      dpia_code: `DPIA-${activity.code}-V${activity.version}`,
      processing_activity_id: activity.id,
      processing_activity_version: activity.version,
      status: DPIAState.IN_REVIEW,
      trigger_factors: triggerEval.factors,
      scope: input.scope,
      purpose: input.purpose,
      necessity_assessment: input.necessity_assessment,
      proportionality_assessment: input.proportionality_assessment,
      risk_summary: {
        total_risks: input.risks.length,
        inherent_critical: inherentCritical,
        inherent_high: inherentHigh,
        residual_critical: residualCritical,
        residual_high: residualHigh,
        residual_moderate: residualModerate,
        residual_low: residualLow
      },
      residual_risk: overallResidualRisk,
      requested_by: input.requested_by,
      conditions: [],
      submitted_at: now,
      created_at: now,
      updated_at: now
    };

    await PrivacyGovernancePersistence.saveDPIA(dpia);

    // Save remediations if present
    if (input.remediations) {
      for (const rem of input.remediations) {
        await PrivacyGovernancePersistence.saveRemediation({
          id: uuidv7(),
          dpia_id: dpiaId,
          action: rem.action,
          owner: rem.owner,
          status: 'OPEN' as any,
          due_at: rem.due_at,
          evidence_required: rem.evidence_required !== false,
          created_at: now
        });
      }
    }

    // Transition activity state
    activity.status = ProcessingActivityState.IN_REVIEW;
    await PrivacyGovernancePersistence.saveActivity(activity);

    return dpia;
  }

  /**
   * 4. Reviewer Decision on a DPIA (Approve, Conditional Approve, Reject)
   */
  public static async decideDPIA(
    dpiaId: string,
    decision: PrivacyDecision,
    reviewer: { id: string; roles: string[] },
    options: {
      conditions?: string[];
      reason?: string;
      validity_days?: number;
    } = {}
  ): Promise<{ dpia: DPIAAssessment; approval?: PrivacyApproval }> {
    const dpia = await PrivacyGovernancePersistence.getDPIAById(dpiaId);
    if (!dpia) {
      throw new ValidationError(`DPIA ${dpiaId} not found`);
    }

    const activity = await PrivacyGovernancePersistence.getActivityById(dpia.processing_activity_id);
    if (!activity) {
      throw new PrivacyProcessingNotRegisteredError('Associated processing activity not found');
    }

    // 1. Separation of duties & role eligibility check
    const eligibility = PrivacyReviewerEligibilityEngine.evaluateEligibility(reviewer, activity.owner_id);
    if (!eligibility.eligible) {
      throw new ValidationError(eligibility.reason || 'Reviewer not authorized');
    }

    // 2. High residual risk check: If residual risk is HIGH or CRITICAL, approval is strictly blocked
    if (
      (decision === PrivacyDecision.APPROVE || decision === PrivacyDecision.CONDITIONAL_APPROVE) &&
      (dpia.residual_risk === RiskLevel.HIGH || dpia.residual_risk === RiskLevel.CRITICAL)
    ) {
      throw new PrivacyHighResidualRiskError(
        `DPIA approval blocked: overall residual privacy risk is ${dpia.residual_risk}. Requires complete risk treatment before sign-off.`
      );
    }

    const now = new Date().toISOString();
    dpia.decision = decision;
    dpia.decision_reason = options.reason || `Decided as ${decision} by Data Protection Officer`;
    dpia.reviewer_id = reviewer.id;
    dpia.completed_at = now;
    dpia.updated_at = now;

    let approval: PrivacyApproval | undefined;

    if (decision === PrivacyDecision.APPROVE || decision === PrivacyDecision.CONDITIONAL_APPROVE) {
      dpia.status = decision === PrivacyDecision.APPROVE ? DPIAState.APPROVED : DPIAState.CONDITIONALLY_APPROVED;
      dpia.conditions = options.conditions || [];

      const validityDays = options.validity_days || 365; // Default 1 year review cycle
      const expiryDate = new Date(Date.now() + validityDays * 86400 * 1000).toISOString();
      dpia.expires_at = expiryDate;
      dpia.next_review_at = expiryDate;

      // Update Activity State
      activity.status = decision === PrivacyDecision.APPROVE
        ? ProcessingActivityState.APPROVED
        : ProcessingActivityState.CONDITIONALLY_APPROVED;
      await PrivacyGovernancePersistence.saveActivity(activity);

      // Create Evidence Vault record for immutable proof
      let evidenceId = '';
      try {
        const ev = await GovernanceEvidenceService.createEvidence(
          {
            title: `Privacy Approval Certificate: ${activity.code} v${activity.version}`,
            description: `Statutory privacy signoff for ${activity.name}. DPIA: ${dpia.dpia_code}. Residual Risk: ${dpia.residual_risk}.`,
            evidence_type: 'SECURITY_AUDIT',
            domain: GovernanceDomain.PRIVACY,
            related_resource_type: 'processing_activity',
            related_resource_id: activity.id,
            created_by: reviewer.id,
            source: 'PrivacyGovernanceEngine'
          },
          JSON.stringify({
            activity_id: activity.id,
            activity_code: activity.code,
            version: activity.version,
            dpia_id: dpia.id,
            reviewer: reviewer.id,
            residual_risk: dpia.residual_risk,
            conditions: dpia.conditions,
            decision
          })
        );
        evidenceId = ev.id;
      } catch (err) {
        // Log evidence creation issue if storage unavailable
      }

      // Create Immutable PrivacyApproval
      approval = {
        id: uuidv7(),
        processing_activity_id: activity.id,
        processing_activity_version: activity.version,
        dpia_id: dpia.id,
        dpia_version: 1,
        fingerprint: activity.fingerprint,
        reviewer_id: reviewer.id,
        reviewer_role: reviewer.roles[0] || 'ROLE_DATA_PROTECTION_OFFICER',
        decision,
        conditions: dpia.conditions,
        policy_version: '1.0.0',
        status: 'ACTIVE',
        approved_at: now,
        expires_at: expiryDate,
        evidence_vault_id: evidenceId,
        created_at: now
      };

      await PrivacyGovernancePersistence.saveApproval(approval);
    } else if (decision === PrivacyDecision.REJECT) {
      dpia.status = DPIAState.REJECTED;
      activity.status = ProcessingActivityState.REJECTED;
      await PrivacyGovernancePersistence.saveActivity(activity);
    } else {
      dpia.status = DPIAState.ACTION_REQUIRED;
      activity.status = ProcessingActivityState.ACTION_REQUIRED;
      await PrivacyGovernancePersistence.saveActivity(activity);
    }

    await PrivacyGovernancePersistence.saveDPIA(dpia);

    await EventBus.publish({
      type: 'privacy.dpia_decided',
      payload: {
        dpia_id: dpia.id,
        dpia_code: dpia.dpia_code,
        activity_code: activity.code,
        decision,
        status: dpia.status,
        reviewer_id: reviewer.id
      }
    });

    await AuditService.record({
      action: AuditAction.APPROVE,
      actor_id: reviewer.id,
      actor_type: AuditActorType.USER,
      resource_type: 'dpia_assessment',
      resource_id: dpia.id,
      result: AuditResult.SUCCESS,
      authorization_basis: { decision, conditions: options.conditions, residual_risk: dpia.residual_risk }
    });

    return { dpia, approval };
  }

  /**
   * 5. Urgent Suspension & Revocation
   */
  public static async revokeApproval(
    activityId: string,
    version: number,
    actorId: string,
    reason: string
  ): Promise<void> {
    const activity = await PrivacyGovernancePersistence.getActivityById(activityId);
    if (!activity) {
      throw new PrivacyProcessingNotRegisteredError(`Activity ${activityId} not found`);
    }

    const approval = await PrivacyGovernancePersistence.getApprovalForActivityVersion(activityId, version);
    const now = new Date().toISOString();

    if (approval) {
      approval.status = 'REVOKED';
      approval.revoked_at = now;
      approval.revoked_by = actorId;
      approval.revocation_reason = reason;
      await PrivacyGovernancePersistence.saveApproval(approval);
    }

    activity.status = ProcessingActivityState.REVOKED;
    activity.updated_at = now;
    await PrivacyGovernancePersistence.saveActivity(activity);

    await EventBus.publish({
      type: 'privacy.approval_revoked',
      payload: { activity_id: activity.id, code: activity.code, version, reason, revoked_by: actorId }
    });

    await EventBus.publish({
      type: 'privacy.processing_suspended',
      payload: { activity_id: activity.id, code: activity.code, reason }
    });

    await AuditService.record({
      action: AuditAction.REVOKE,
      actor_id: actorId,
      actor_type: AuditActorType.USER,
      resource_type: 'privacy_approval',
      resource_id: approval?.id || activity.id,
      result: AuditResult.SUCCESS,
      authorization_basis: { reason }
    });
  }

  /**
   * 6. Release Gate Evaluation: Fail-Closed Enforcement
   * Used by Governance Kernel Release Gates to determine if processing is allowed to run.
   */
  public static async evaluateReleaseGate(
    input: EvaluateReleaseGateInput
  ): Promise<{ permitted: boolean; reason?: string; approval?: PrivacyApproval }> {
    const activity = await PrivacyGovernancePersistence.getActivityByCode(input.processing_activity_code);
    if (!activity) {
      return {
        permitted: false,
        reason: `PRIVACY_PROCESSING_NOT_REGISTERED: Processing activity "${input.processing_activity_code}" is not registered in the Processing Activity Registry.`
      };
    }

    const versionToCheck = input.version || activity.version;
    const approval = await PrivacyGovernancePersistence.getApprovalForActivityVersion(activity.id, versionToCheck);

    if (!approval) {
      return {
        permitted: false,
        reason: `PRIVACY_PROCESSING_VERSION_NOT_APPROVED: Processing activity "${activity.code}" version ${versionToCheck} has no record of Privacy Approval.`
      };
    }

    if (approval.status === 'REVOKED') {
      return {
        permitted: false,
        reason: `PRIVACY_APPROVAL_REVOKED: Privacy approval for "${activity.code}" v${versionToCheck} has been revoked: ${approval.revocation_reason || 'Administrative revocation'}.`
      };
    }

    if (new Date(approval.expires_at).getTime() < Date.now()) {
      return {
        permitted: false,
        reason: `PRIVACY_APPROVAL_EXPIRED: Privacy approval for "${activity.code}" v${versionToCheck} expired at ${approval.expires_at}. Mandatory periodic reassessment required.`
      };
    }

    // Check processor approvals if specified
    if (input.processor_codes) {
      for (const pCode of input.processor_codes) {
        const procEval = PrivacyProcessorRegistry.validateProcessorUsage(
          pCode,
          input.data_categories[0] || DataCategory.IDENTITY,
          input.purpose
        );
        if (!procEval.authorized) {
          return {
            permitted: false,
            reason: `PRIVACY_PROCESSOR_NOT_APPROVED: ${procEval.reason}`
          };
        }
      }
    }

    return {
      permitted: true,
      approval
    };
  }

  /**
   * 7. Generate Canonical Privacy Audit Report ("Why was Processing Activity X permitted on Date Y?")
   */
  public static async generateAuditReport(
    activityCode: string,
    queryDate: string = new Date().toISOString()
  ): Promise<PrivacyAuditReport> {
    const activity = await PrivacyGovernancePersistence.getActivityByCode(activityCode);
    if (!activity) {
      return {
        activity_code: activityCode,
        activity_name: 'UNKNOWN',
        query_date: queryDate,
        is_permitted: false,
        status: ProcessingActivityState.REJECTED,
        version: 0,
        lawful_basis: [],
        purposes: [],
        data_categories: [],
        reasons: ['Processing activity was not registered in the canonical registry.']
      };
    }

    const approval = await PrivacyGovernancePersistence.getApprovalForActivityVersion(activity.id, activity.version);
    const dpia = await PrivacyGovernancePersistence.getDPIAForActivity(activity.id, activity.version);

    const queryTime = new Date(queryDate).getTime();
    let permitted = false;
    const reasons: string[] = [];

    if (!approval) {
      reasons.push('No privacy approval record exists for this activity version.');
    } else if (approval.status === 'REVOKED' && approval.revoked_at && new Date(approval.revoked_at).getTime() <= queryTime) {
      reasons.push(`Approval was revoked on ${approval.revoked_at}: ${approval.revocation_reason}`);
    } else if (new Date(approval.expires_at).getTime() < queryTime) {
      reasons.push(`Approval expired on ${approval.expires_at}.`);
    } else if (new Date(approval.approved_at).getTime() > queryTime) {
      reasons.push(`Processing was not yet approved on ${queryDate} (approved at ${approval.approved_at}).`);
    } else {
      permitted = true;
      reasons.push(`Permitted under valid Privacy Approval issued by ${approval.reviewer_id} (${approval.reviewer_role}).`);
      if (approval.conditions.length > 0) {
        reasons.push(`Subject to operational conditions: ${approval.conditions.join(', ')}.`);
      }
    }

    return {
      activity_code: activity.code,
      activity_name: activity.name,
      query_date: queryDate,
      is_permitted: permitted,
      status: activity.status,
      version: activity.version,
      approval_details: approval
        ? {
            approved_at: approval.approved_at,
            expires_at: approval.expires_at,
            reviewer_id: approval.reviewer_id,
            reviewer_role: approval.reviewer_role,
            decision: approval.decision,
            conditions: approval.conditions,
            evidence_vault_id: approval.evidence_vault_id
          }
        : undefined,
      dpia_details: dpia
        ? {
            dpia_code: dpia.dpia_code,
            status: dpia.status,
            residual_risk: dpia.residual_risk,
            trigger_factors: dpia.trigger_factors
          }
        : undefined,
      lawful_basis: activity.lawful_basis,
      purposes: activity.purposes,
      data_categories: activity.data_categories,
      reasons
    };
  }

  /**
   * 8. Data Subject Rights (DSAR) Inventory Query:
   * Maps what processing activities, processors, and flows handle a data category.
   */
  public static async queryDSARInventory(category: DataCategory): Promise<{
    activities: string[];
    processors: string[];
    flows: string[];
  }> {
    const allActivities = await PrivacyGovernancePersistence.listActivities();
    const matchingActivities = allActivities
      .filter((a) => a.data_categories.includes(category))
      .map((a) => `${a.code} (${a.name})`);

    const allProcessors = PrivacyProcessorRegistry.listAll();
    const matchingProcessors = allProcessors
      .filter((p) => p.data_categories.includes(category))
      .map((p) => `${p.processor_code} - ${p.name}`);

    return {
      activities: matchingActivities,
      processors: matchingProcessors,
      flows: []
    };
  }
}
