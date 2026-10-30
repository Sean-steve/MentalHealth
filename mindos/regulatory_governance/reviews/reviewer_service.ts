/**
 * MindOS Regulatory Reviewer & Counsel Authorization Service
 * Authority: Volumes III, XV & Appendix I
 * Ensures only qualified human regulatory officers can approve assessments,
 * resolve gaps, and confirm statutory interpretations.
 */

import { ValidationError, RegulatoryReviewerUnauthorizedError } from '../../platform/errors/index.js';

export class RegulatoryReviewerService {
  private static authorizedReviewers: Set<string> = new Set([
    'legal_regulatory_officer_ke',
    'lead_regulatory_counsel_ke',
    'lead_regulatory_engineer_ke',
    'data_protection_officer_ke',
    'regulatory_admin'
  ]);

  public static isAuthorized(reviewerId: string): boolean {
    if (!reviewerId) return false;
    if (reviewerId.startsWith('ai_') || reviewerId.includes('bot') || reviewerId.includes('system_auto')) {
      return false;
    }
    return RegulatoryReviewerService.authorizedReviewers.has(reviewerId);
  }

  public static assertAuthorized(reviewerId: string, actionDescription: string): void {
    if (!RegulatoryReviewerService.isAuthorized(reviewerId)) {
      throw new RegulatoryReviewerUnauthorizedError(
        `Actor ${reviewerId} is not an authorized human regulatory officer for: ${actionDescription}`
      );
    }
  }

  public static addAuthorizedReviewer(reviewerId: string): void {
    if (reviewerId.startsWith('ai_') || reviewerId.includes('bot')) {
      throw new ValidationError('Autonomous AI cannot be registered as an authorized legal reviewer.');
    }
    RegulatoryReviewerService.authorizedReviewers.add(reviewerId);
  }
}
