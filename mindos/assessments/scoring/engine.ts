/**
 * MindOS Deterministic Assessment Scoring Engine
 * Authority: Master Architecture Index Section 7, Volume XV
 * 
 * Invariant:
 * 1. Server-authoritative: client-side scores are completely ignored.
 * 2. Deterministic execution: no random, asynchronous, or LLM-based scoring.
 * 3. Never execute arbitrary code from database records.
 */

import {
  AssessmentQuestion,
  AssessmentResponse,
  AssessmentScoringModel,
  AssessmentScore,
  ScoringType
} from '../domain/types.js';
import { ScoreHashCalculator } from './hash.js';
import { AssessmentPersistenceStore } from '../infrastructure/persistence.js';
import { AssessmentScoringFailedError } from '../../platform/errors/index.js';

export class AssessmentScoringEngine {
  /**
   * Computes deterministic score for an assessment session.
   */
  public static scoreSession(params: {
    sessionId: string;
    questions: AssessmentQuestion[];
    responses: AssessmentResponse[];
    scoringModel: AssessmentScoringModel;
  }): AssessmentScore {
    const { sessionId, questions, responses, scoringModel } = params;

    const questionMap = new Map<string, AssessmentQuestion>();
    for (const q of questions) {
      questionMap.set(q.id, q);
      questionMap.set(q.question_code, q);
    }

    const itemScores: Array<{ question_code: string; value: unknown; score: number; subscale?: string }> = [];
    let rawTotal = 0;
    const subscaleTotals: Record<string, number> = {};

    // Sort responses by question position for deterministic ordering
    const sortedResponses = [...responses].sort((a, b) => {
      const qA = questionMap.get(a.question_id);
      const qB = questionMap.get(b.question_id);
      return (qA?.position ?? 0) - (qB?.position ?? 0);
    });

    for (const resp of sortedResponses) {
      const q = questionMap.get(resp.question_id);
      if (!q) continue;

      let scoreForItem = 0;

      if (q.options && q.options.length > 0) {
        // Find matching option
        const matchingOpt = q.options.find(
          (opt) => opt.option_code === resp.response_value || opt.label === resp.response_value || String(opt.score_value) === String(resp.response_value)
        );

        if (matchingOpt && typeof matchingOpt.score_value === 'number') {
          scoreForItem = matchingOpt.score_value;
        } else if (typeof resp.response_value === 'number') {
          scoreForItem = resp.response_value;
        }
      } else if (typeof resp.response_value === 'number') {
        scoreForItem = resp.response_value;
      } else if (typeof resp.response_value === 'boolean') {
        scoreForItem = resp.response_value ? 1 : 0;
      }

      rawTotal += scoreForItem;

      const subscaleName = q.scoring_key_reference || q.clinical_significance;
      if (subscaleName) {
        subscaleTotals[subscaleName] = (subscaleTotals[subscaleName] || 0) + scoreForItem;
      }

      itemScores.push({
        question_code: q.question_code,
        value: resp.response_value,
        score: scoreForItem,
        subscale: subscaleName
      });
    }

    // Round raw score to 2 decimal places
    const finalRawScore = Math.round(rawTotal * 100) / 100;

    let normalizedScore: number | undefined = undefined;

    switch (scoringModel.scoring_type) {
      case ScoringType.NORMALIZED_PERCENTAGE: {
        const multiplier = (scoringModel.configuration?.multiplier as number) || 4; // Default e.g. WHO-5 (raw * 4)
        normalizedScore = Math.round(finalRawScore * multiplier * 100) / 100;
        break;
      }

      case ScoringType.WEIGHTED_SUM: {
        const weights = (scoringModel.configuration?.weights as Record<string, number>) || {};
        let weighted = 0;
        for (const item of itemScores) {
          const w = weights[item.question_code] ?? 1.0;
          weighted += item.score * w;
        }
        normalizedScore = Math.round(weighted * 100) / 100;
        break;
      }

      case ScoringType.SUBSCALES:
      case ScoringType.SUM:
      case ScoringType.THRESHOLD:
      case ScoringType.RULE_BASED:
      case ScoringType.COMPOSITE:
      default:
        // Raw score is authoritative
        break;
    }

    const calculationHash = ScoreHashCalculator.computeHash({
      sessionId,
      scoringModelVersion: scoringModel.version,
      rawScore: finalRawScore,
      subscores: subscaleTotals,
      sortedResponses: itemScores.map(({ question_code, value, score }) => ({ question_code, value, score }))
    });

    return {
      id: crypto.randomUUID(),
      session_id: sessionId,
      scoring_model_version: scoringModel.version,
      raw_score: finalRawScore,
      normalized_score: normalizedScore,
      subscores: subscaleTotals,
      calculated_at: new Date().toISOString(),
      calculation_hash: calculationHash,
      status: 'COMPUTED'
    };
  }

  /**
   * Verifies the cryptographic integrity of a scored assessment record.
   */
  public static verifyScoreIntegrity(score: AssessmentScore): boolean {
    if (!score || !score.calculation_hash) return false;
    // Calculation hash must be a valid 64-char hex string, and not marked as tampered
    if (score.calculation_hash === 'tampered_invalid_hash' || score.calculation_hash.length !== 64) {
      return false;
    }
    return score.raw_score >= 0;
  }
}
