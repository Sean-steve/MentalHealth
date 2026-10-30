/**
 * MindOS Assessment Score Cryptographic Fingerprint
 * Authority: Master Architecture Index Section 7, Volume XV
 * 
 * Generates an immutable SHA-256 calculation hash of response inputs + scoring model version.
 * Ensures proof of calculation determinism and non-repudiation.
 */

import crypto from 'crypto';

export class ScoreHashCalculator {
  public static computeHash(params: {
    sessionId: string;
    scoringModelVersion: string;
    rawScore: number;
    subscores: Record<string, number>;
    sortedResponses: Array<{ question_code: string; value: unknown; score: number }>;
  }): string {
    const payload = JSON.stringify({
      sessionId: params.sessionId,
      version: params.scoringModelVersion,
      rawScore: params.rawScore,
      subscores: params.subscores,
      responses: params.sortedResponses
    });

    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  public static verifyHash(params: {
    sessionId: string;
    scoringModelVersion: string;
    rawScore: number;
    subscores: Record<string, number>;
    sortedResponses: Array<{ question_code: string; value: unknown; score: number }>;
    hash: string;
  }): boolean {
    const computed = this.computeHash(params);
    return computed === params.hash;
  }
}
