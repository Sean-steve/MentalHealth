/**
 * MindOS Material Processing Change Detector
 * Authority: Master Architecture Index Section 7, Volumes I, VIII & Appendices B / C / Q
 *            Kenya Data Protection Act 2019 Section 31
 */

import { ProcessingActivity, DataSubjectCategory } from '../types.js';

export interface MaterialChangeEvaluation {
  is_material_change: boolean;
  triggers_new_dpia: boolean;
  change_summary: string[];
}

export class MaterialProcessingChangeDetector {
  /**
   * Compares prior approved version with proposed version to determine if changes are material.
   */
  public static evaluate(
    prior: ProcessingActivity,
    proposed: Partial<ProcessingActivity>
  ): MaterialChangeEvaluation {
    const changeSummary: string[] = [];
    let isMaterial = false;
    let triggersDPIA = false;

    // 1. Data Categories check
    if (proposed.data_categories) {
      const priorCats = new Set(prior.data_categories);
      const addedCats = proposed.data_categories.filter((c) => !priorCats.has(c));
      if (addedCats.length > 0) {
        isMaterial = true;
        triggersDPIA = true;
        changeSummary.push(`Added data categories: ${addedCats.join(', ')}`);
      }
    }

    // 2. Purposes check
    if (proposed.purposes) {
      const priorPurposes = new Set(prior.purposes);
      const addedPurposes = proposed.purposes.filter((p) => !priorPurposes.has(p));
      if (addedPurposes.length > 0) {
        isMaterial = true;
        triggersDPIA = true;
        changeSummary.push(`Added processing purposes: ${addedPurposes.join(', ')}`);
      }
    }

    // 3. Processors check
    if (proposed.processors) {
      const priorProcessors = new Set(prior.processors);
      const addedProcessors = proposed.processors.filter((p) => !priorProcessors.has(p));
      if (addedProcessors.length > 0) {
        isMaterial = true;
        changeSummary.push(`Added third-party processors: ${addedProcessors.join(', ')}`);
      }
    }

    // 4. Recipients check
    if (proposed.recipients) {
      const priorRecipients = new Set(prior.recipients);
      const addedRecipients = proposed.recipients.filter((r) => !priorRecipients.has(r));
      if (addedRecipients.length > 0) {
        isMaterial = true;
        changeSummary.push(`Added recipients: ${addedRecipients.join(', ')}`);
      }
    }

    // 5. Cross-border transfer / Jurisdictions check
    if (proposed.jurisdictions) {
      const priorJurisdictions = new Set(prior.jurisdictions);
      const addedJurisdictions = proposed.jurisdictions.filter((j) => !priorJurisdictions.has(j));
      if (addedJurisdictions.length > 0) {
        isMaterial = true;
        triggersDPIA = true;
        changeSummary.push(`Added jurisdictions: ${addedJurisdictions.join(', ')}`);
      }
    }

    // 6. AI, profiling, or automated processing introduction
    if (proposed.ai_involvement === true && prior.ai_involvement !== true) {
      isMaterial = true;
      triggersDPIA = true;
      changeSummary.push('Introduced AI model processing or inference');
    }

    if (proposed.profiling === true && prior.profiling !== true) {
      isMaterial = true;
      triggersDPIA = true;
      changeSummary.push('Introduced user profiling or behavioral scoring');
    }

    if (proposed.automated_processing === true && prior.automated_processing !== true) {
      isMaterial = true;
      triggersDPIA = true;
      changeSummary.push('Introduced automated decision making');
    }

    // 7. Data Subject Categories check (especially Minors)
    if (proposed.data_subject_categories) {
      const priorSubjects = new Set(prior.data_subject_categories);
      const addedSubjects = proposed.data_subject_categories.filter((s) => !priorSubjects.has(s));
      if (addedSubjects.length > 0) {
        isMaterial = true;
        if (addedSubjects.includes(DataSubjectCategory.MINORS)) {
          triggersDPIA = true;
        }
        changeSummary.push(`Added data subject categories: ${addedSubjects.join(', ')}`);
      }
    }

    // 8. Retention changes
    if (proposed.retention_policy_refs) {
      const priorRetention = new Set(prior.retention_policy_refs);
      const changedRetention = proposed.retention_policy_refs.filter((r) => !priorRetention.has(r));
      if (changedRetention.length > 0) {
        isMaterial = true;
        changeSummary.push(`Modified retention policy references: ${changedRetention.join(', ')}`);
      }
    }

    return {
      is_material_change: isMaterial,
      triggers_new_dpia: triggersDPIA,
      change_summary: changeSummary
    };
  }
}
