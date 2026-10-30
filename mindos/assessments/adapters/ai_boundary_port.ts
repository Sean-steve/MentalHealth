/**
 * MindOS Assessment AI Boundary & Safety Enclosure Port
 * Authority: Master Architecture Index Section 7, Volumes I, XV
 * 
 * Strict Boundaries:
 * 1. AI cannot re-score assessments or invent new score bands.
 * 2. AI receives ONLY clinically approved summaries and score bands.
 * 3. AI is strictly forbidden from diagnosing users based on assessment results.
 */

import { AssessmentResult } from '../domain/types.js';
import { AssessmentPersistenceStore } from '../infrastructure/persistence.js';

export interface AIAssessmentContext {
  hasCompletedAssessments: boolean;
  latestScreeningSummary?: string;
  latestScreeningBand?: string;
  latestScreeningDate?: string;
  nonDiagnosticConstraint: string;
}

export class AssessmentAIBoundaryPort {
  public static readonly AI_NON_DIAGNOSTIC_DIRECTIVE =
    'MANDATORY CLINICAL DIRECTIVE: Assessment screening scores indicate symptom levels over a specific timeframe only. You must NEVER offer a clinical diagnosis (such as "You have depression"). Always refer the user to their human healthcare provider.';

  public static getContextForAI(userId: string): AIAssessmentContext {
    const results = AssessmentPersistenceStore.listResultsForUser(userId);
    const validResults = results.filter((r) => r.status === 'VALID');

    if (validResults.length === 0) {
      return {
        hasCompletedAssessments: false,
        nonDiagnosticConstraint: this.AI_NON_DIAGNOSTIC_DIRECTIVE
      };
    }

    const latest = validResults[0];
    const definition = AssessmentPersistenceStore.getDefinition(latest.assessment_definition_id);

    return {
      hasCompletedAssessments: true,
      latestScreeningSummary: `${definition?.name || 'Screening'}: ${latest.result_band}. ${latest.summary_text}`,
      latestScreeningBand: latest.result_band,
      latestScreeningDate: latest.generated_at,
      nonDiagnosticConstraint: this.AI_NON_DIAGNOSTIC_DIRECTIVE
    };
  }
}
