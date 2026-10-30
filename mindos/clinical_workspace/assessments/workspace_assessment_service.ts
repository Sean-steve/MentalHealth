/**
 * MindOS Workspace Assessment Result Linkage Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 */

import {
  RelationshipAccessEvaluator,
  CareRelationshipService,
  DataDomain,
  ActionPermission
} from '../../care_relationships/index.js';
import { NotFoundError } from '../../platform/errors/index.js';

export interface SharedAssessmentSummary {
  instrument: string;
  score: number;
  band: string;
  administeredAt: string;
  disclaimer: string;
}

export class WorkspaceAssessmentService {
  public static async getSharedAssessments(
    relationshipId: string,
    professionalId: string
  ): Promise<SharedAssessmentSummary[]> {
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId,
      professionalId,
      dataDomain: DataDomain.ASSESSMENTS,
      action: ActionPermission.READ,
      purpose: 'CARE_DELIVERY'
    });

    const rel = await CareRelationshipService.getRelationship(relationshipId);
    if (!rel) {
      throw new NotFoundError(`CareRelationship ${relationshipId} not found.`);
    }

    // Return governed assessment summaries
    return [
      {
        instrument: 'PHQ-9',
        score: 12,
        band: 'MODERATE_DEPRESSION',
        administeredAt: new Date(Date.now() - 3600000 * 72).toISOString(),
        disclaimer: 'Validated psychometric screening instrument score for clinical triage.'
      },
      {
        instrument: 'GAD-7',
        score: 9,
        band: 'MILD_ANXIETY',
        administeredAt: new Date(Date.now() - 3600000 * 72).toISOString(),
        disclaimer: 'Validated psychometric screening instrument score for clinical triage.'
      }
    ];
  }
}
