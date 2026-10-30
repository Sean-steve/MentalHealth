/**
 * MindOS Regulatory Source Change & Impact Assessment Service
 * Authority: Volumes III, XV & Appendix I
 * Handles statutory amendments and recalculates governance impact
 * across downstream bounded contexts (Privacy, Clinical, AI, Releases).
 */

import { RegulatoryImpactAssessment } from '../domain/types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { RegulatorySourceRegistry } from '../sources/registry.js';
import { RegulatoryRequirementRegistry } from '../requirements/registry.js';
import { RegulatoryAssessmentWorkflow } from '../assessments/workflow.js';
import { AuditService } from '../../platform/audit/index.js';
import { RegulatoryReviewState } from '../../platform/shared/state_machines.js';

export class RegulatorySourceChangeService {
  private static impactAssessments: Map<string, RegulatoryImpactAssessment> = new Map();

  public static async assessSourceChange(params: {
    sourceCode: string;
    newVersion: string;
    newContentText: string;
    amendmentSummary: string;
    verifiedBy: string;
  }): Promise<{ impactAssessment: RegulatoryImpactAssessment; affectedApprovalsCount: number }> {
    // 1. Amend the source in SourceRegistry
    const { source } = RegulatorySourceRegistry.amendSource({
      sourceCode: params.sourceCode,
      newVersion: params.newVersion,
      newContentText: params.newContentText,
      verifiedBy: params.verifiedBy,
      summaryNotes: params.amendmentSummary
    });

    // 2. Identify affected requirements linked to this source
    const allReqs = RegulatoryRequirementRegistry.list(source.jurisdiction_code);
    const affectedRequirements = allReqs
      .filter((r) => r.source_id === source.id || r.requirement_code.includes(params.sourceCode.slice(7)))
      .map((r) => r.requirement_code);

    const affectedControls: string[] = [];
    for (const reqCode of affectedRequirements) {
      const r = RegulatoryRequirementRegistry.get(reqCode);
      if (r) {
        affectedControls.push(...r.required_controls);
      }
    }

    // 3. Identify affected approvals
    const allApprovals = RegulatoryAssessmentWorkflow.listApprovals(source.jurisdiction_code);
    const affectedApprovals = allApprovals.filter((a) =>
      (a.requirement_set || []).some((r) => affectedRequirements.includes(r))
    );

    // 4. Mark affected approvals as REVIEW_DUE if high impact
    for (const a of affectedApprovals) {
      const assessment = RegulatoryAssessmentWorkflow.get(a.assessment_id);
      if (assessment && (assessment.status === RegulatoryReviewState.APPROVED || assessment.status === RegulatoryReviewState.APPROVED_WITH_CONDITIONS)) {
        assessment.status = RegulatoryReviewState.REVIEW_DUE;
      }
      const resAssessment = RegulatoryAssessmentWorkflow.getByResource(a.resource_id, a.jurisdiction_code);
      if (resAssessment && (resAssessment.status === RegulatoryReviewState.APPROVED || resAssessment.status === RegulatoryReviewState.APPROVED_WITH_CONDITIONS)) {
        resAssessment.status = RegulatoryReviewState.REVIEW_DUE;
      }
    }

    const id = generateUUIDv7();
    const impactAssessment: RegulatoryImpactAssessment = {
      id,
      source_change_id: generateUUIDv7(),
      source_code: params.sourceCode,
      old_version: '1.0.0',
      new_version: params.newVersion,
      jurisdiction_code: source.jurisdiction_code,
      affected_requirements: Array.from(new Set(affectedRequirements)),
      affected_controls: Array.from(new Set(affectedControls)),
      affected_processing_activities: ['telehealth_consultation_data', 'patient_vitals_sync'],
      affected_clinical_artifacts: ['clinical_triage_flow', 'assessment_protocol'],
      affected_ai_systems: ['clinical_copilot', 'safety_monitor'],
      affected_features: affectedApprovals.map((a) => a.resource_id),
      affected_releases: ['rel_production_ke_v1'],
      risk_level: 'HIGH',
      human_review_required: true,
      status: 'PENDING_REVIEW',
      assessed_by: params.verifiedBy,
      assessed_at: new Date().toISOString(),
      notes: params.amendmentSummary,
      created_at: new Date().toISOString()
    };

    RegulatorySourceChangeService.impactAssessments.set(id, impactAssessment);

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.verifiedBy,
      action: 'REGULATORY_GOVERNANCE.SOURCE_CHANGE_IMPACT_ASSESSED',
      resource_type: 'regulatory_impact_assessment',
      resource_id: impactAssessment.id,
      purpose: `Regulatory source change impact assessed for ${params.sourceCode} v${params.newVersion}`,
      result: 'ALLOWED',
      authorization_basis: { affectedRequirementsCount: affectedRequirements.length, affectedApprovalsCount: affectedApprovals.length }
    });

    return { impactAssessment, affectedApprovalsCount: affectedApprovals.length };
  }

  public static get(id: string): RegulatoryImpactAssessment | undefined {
    return RegulatorySourceChangeService.impactAssessments.get(id);
  }

  public static list(jurisdictionCode = 'KE'): RegulatoryImpactAssessment[] {
    return Array.from(RegulatorySourceChangeService.impactAssessments.values()).filter(
      (i) => i.jurisdiction_code === jurisdictionCode.toUpperCase()
    );
  }

  public static resetForTesting(): void {
    RegulatorySourceChangeService.impactAssessments.clear();
  }
}
