/**
 * MindOS Cross-Border Data Transfer Safeguards Evaluator
 * Authority: Master Architecture Index Section 7, Volumes I, VIII & Appendix B / Q
 *            Kenya Data Protection Act 2019 Sections 48 & 49
 */

import {
  DataTransferAssessment,
  DataCategory,
  TransferBasis
} from '../types.js';
import { isSpecialCategory } from '../domain/taxonomy.js';

export interface CrossBorderEvaluationResult {
  permitted: boolean;
  requires_explicit_consent: boolean;
  reasons: string[];
}

export class CrossBorderTransferEngine {
  /**
   * Evaluates legality of a cross-border transfer from Kenya to destination jurisdiction.
   */
  public static evaluateTransfer(assessment: Partial<DataTransferAssessment>): CrossBorderEvaluationResult {
    const reasons: string[] = [];
    let permitted = true;
    let requiresExplicitConsent = false;

    const origin = assessment.origin_jurisdiction || 'KE';
    const destination = assessment.destination_jurisdiction || 'GLOBAL';
    const categories = assessment.data_categories || [];
    const basis = assessment.transfer_basis;
    const safeguards = assessment.safeguards || [];

    if (origin === 'KE' && destination !== 'KE') {
      // 1. Check if special/sensitive health categories are involved
      const hasSensitive = categories.some((c) => isSpecialCategory(c));
      if (hasSensitive) {
        requiresExplicitConsent = true;
        reasons.push('KDPA Section 49(1) mandates explicit consent for transborder transfer of sensitive personal or health data.');
      }

      // 2. Check for lawful transfer basis
      if (!basis) {
        permitted = false;
        reasons.push('No lawful transfer basis declared under KDPA Section 48/49.');
      } else if (
        basis === TransferBasis.STANDARD_CONTRACTUAL_CLAUSES &&
        safeguards.length === 0
      ) {
        permitted = false;
        reasons.push('Standard Contractual Clauses basis declared without supporting technical or organizational safeguards.');
      }

      // 3. Check review status
      if (assessment.review_status !== 'APPROVED') {
        permitted = false;
        reasons.push(`Transfer assessment review status is ${assessment.review_status || 'PENDING_REVIEW'}, not APPROVED.`);
      }

      // 4. Check expiry
      if (assessment.expires_at && new Date(assessment.expires_at).getTime() < Date.now()) {
        permitted = false;
        reasons.push(`Cross-border transfer authorization expired at ${assessment.expires_at}`);
      }
    }

    return {
      permitted,
      requires_explicit_consent: requiresExplicitConsent,
      reasons
    };
  }
}
