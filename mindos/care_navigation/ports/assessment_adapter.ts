/**
 * MindOS Care Navigation Assessment Sharing Adapter
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV
 * Bridges canonical AssessmentResultSharingPort into Care Navigation baselines.
 */

import { AssessmentBaseline } from '../domain/types.js';
import { AssessmentResultSharingPort } from '../../assessments/adapters/sharing_port.js';
import { AssessmentPersistenceStore } from '../../assessments/infrastructure/persistence.js';
import { AssessmentResultState } from '../../assessments/domain/types.js';
import { ConsentService } from '../../consent/index.js';

export class CareAssessmentAdapter {
  public static async getBaselinesForUser(
    userId: string,
    resultIds?: string[]
  ): Promise<AssessmentBaseline[]> {
    const baselines: AssessmentBaseline[] = [];
    const hasConsent = ConsentService.hasActiveConsent(userId, 'ASSESSMENT_SHARING') ||
                       ConsentService.hasActiveConsent(userId, 'TERMS_OF_SERVICE');

    // If specific result IDs provided
    if (resultIds && resultIds.length > 0) {
      for (const rid of resultIds) {
        try {
          const shared = await AssessmentResultSharingPort.prepareResultForSharing({
            resultId: rid,
            requestingActorId: userId,
            purpose: 'CARE_COORDINATION',
            hasPatientConsent: hasConsent
          });

          if (shared.shareable) {
            baselines.push({
              instrument_code: shared.result.result_code || shared.result.assessment_definition_id,
              score: shared.result.raw_score,
              band: shared.result.result_band,
              result_id: shared.result.id,
              taken_at: shared.result.generated_at
            });
          }
        } catch {
          // Skip unshareable or missing results gracefully
        }
      }
    } else {
      // Find latest valid results in store
      const allResults = AssessmentPersistenceStore.listResultsForUser(userId);
      const validResults = allResults.filter(r => r.status === AssessmentResultState.VALID);

      // Group by assessment code and pick latest
      const latestMap = new Map<string, typeof validResults[0]>();
      for (const r of validResults) {
        const code = r.result_code || r.assessment_definition_id;
        const existing = latestMap.get(code);
        if (!existing || new Date(r.generated_at).getTime() > new Date(existing.generated_at).getTime()) {
          latestMap.set(code, r);
        }
      }

      for (const r of latestMap.values()) {
        baselines.push({
          instrument_code: r.result_code || r.assessment_definition_id,
          score: r.raw_score,
          band: r.result_band,
          result_id: r.id,
          taken_at: r.generated_at
        });
      }
    }

    return baselines;
  }
}
