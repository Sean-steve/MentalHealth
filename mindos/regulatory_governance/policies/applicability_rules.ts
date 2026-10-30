/**
 * MindOS Regulatory Applicability Rules Engine
 * Authority: Volumes III, XV & Appendix I
 * Evaluates jurisdictional statutory applicability dynamically for features and workflows.
 */

import { RegulatoryRequirementRegistry } from '../requirements/registry.js';
import { RegulatoryRequirement } from '../domain/types.js';

export interface ApplicabilityContext {
  jurisdiction_code: string;
  processes_health_data?: boolean;
  makes_clinical_claims?: boolean;
  is_cross_border?: boolean;
  data_exchange_active?: boolean;
  ai_involvement?: boolean;
  automated_decisions?: boolean;
}

export class RegulatoryApplicabilityRules {
  public static evaluateApplicableRequirements(context: ApplicabilityContext): RegulatoryRequirement[] {
    const jurCode = (context.jurisdiction_code || 'KE').toUpperCase();
    const all = RegulatoryRequirementRegistry.list(jurCode);

    return all.filter((req) => {
      // If no trigger conditions defined, requirement is universal baseline
      const triggers = req.trigger_conditions;
      if (!triggers || Object.keys(triggers).length === 0) {
        return true;
      }

      if (triggers.processes_health_data && !context.processes_health_data) {
        return false;
      }

      if (triggers.makes_clinical_claim && !context.makes_clinical_claims) {
        return false;
      }

      if (triggers.is_cross_border && !context.is_cross_border) {
        return false;
      }

      if (triggers.data_exchange_active && !context.data_exchange_active) {
        return false;
      }

      if (triggers.digital_health_service && !context.processes_health_data && !context.makes_clinical_claims) {
        return false;
      }

      return true;
    });
  }
}
