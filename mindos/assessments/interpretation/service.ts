/**
 * MindOS Assessment Clinical Interpretation Service
 * Authority: Master Architecture Index Section 7, Volumes I, XV
 * 
 * Invariants:
 * 1. Interpretation is NOT a clinical diagnosis.
 * 2. Pre-approved clinical governance copy ONLY (no LLM generation of clinical statements).
 * 3. Never say "You have Major Depressive Disorder" or equivalent diagnostic labels.
 */

import {
  AssessmentScore,
  AssessmentScoreBand,
  AssessmentInterpretationModel
} from '../domain/types.js';

export interface InterpretationResult {
  resultCode: string;
  resultBand: string;
  summaryText: string;
  limitations: string;
  userMessage: string;
  professionalMessage?: string;
  clinicalSignificance: string;
  safetyBehaviorReference?: string;
}

export class AssessmentInterpretationService {
  public static readonly CANONICAL_LIMITATIONS_NOTICE =
    'This screening tool is NOT a medical or psychiatric diagnosis. Scores indicate symptom levels over a specific timeframe and are meant to inform clinical discussions with a licensed healthcare professional, not replace comprehensive clinical evaluation.';

  public static interpret(params: {
    score: AssessmentScore;
    bands: AssessmentScoreBand[];
    model: AssessmentInterpretationModel;
    instrumentCode: string;
  }): InterpretationResult {
    const { score, bands, instrumentCode } = params;

    // Use normalized score if defined, otherwise raw score
    const targetScore = score.normalized_score !== undefined ? score.normalized_score : score.raw_score;

    // Find band matching targetScore
    const matchedBand = bands.find((b) => targetScore >= b.minimum && targetScore <= b.maximum) ||
      // Fallback to highest band if slightly above or lowest if below
      (targetScore > Math.max(...bands.map((b) => b.maximum))
        ? bands.sort((a, b) => b.maximum - a.maximum)[0]
        : bands.sort((a, b) => a.minimum - b.minimum)[0]);

    if (!matchedBand) {
      return {
        resultCode: `${instrumentCode}_SCORE_${Math.round(targetScore)}`,
        resultBand: 'EVALUATION_COMPLETE',
        summaryText: `Assessment score of ${targetScore} recorded. Please discuss with your care provider.`,
        limitations: AssessmentInterpretationService.CANONICAL_LIMITATIONS_NOTICE,
        userMessage: `Your responses have been recorded with a total score of ${targetScore}.`,
        clinicalSignificance: 'ROUTINE_OBSERVATION'
      };
    }

    return {
      resultCode: matchedBand.code,
      resultBand: matchedBand.code,
      summaryText: matchedBand.user_message,
      limitations: AssessmentInterpretationService.CANONICAL_LIMITATIONS_NOTICE,
      userMessage: matchedBand.user_message,
      professionalMessage: matchedBand.professional_message,
      clinicalSignificance: matchedBand.clinical_significance,
      safetyBehaviorReference: matchedBand.safety_behavior_reference
    };
  }
}
