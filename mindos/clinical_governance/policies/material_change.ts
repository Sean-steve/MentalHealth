/**
 * MindOS Material Change Detection Engine
 * Authority: Master Architecture Index Section 7, Volumes I, III & Appendix B
 * Evaluates semantic differences between clinical artifact versions to determine
 * whether changes are material (mandating full clinical re-review) or non-material.
 */

import {
  ClinicalArtifactVersion,
  ClinicalClaim,
  ClinicalContraindication,
  IntendedPopulationDefinition,
  ExcludedPopulationDefinition
} from '../types.js';

export interface MaterialChangeEvaluationInput {
  previousVersion: {
    specification: Record<string, unknown>;
    intended_use: string;
    intended_population: Record<string, any> | IntendedPopulationDefinition;
    excluded_population: Record<string, any> | ExcludedPopulationDefinition;
    clinical_risk_class: string;
    claims?: ClinicalClaim[];
    contraindications?: ClinicalContraindication[];
  };
  newVersion: {
    specification: Record<string, unknown>;
    intended_use: string;
    intended_population: Record<string, any> | IntendedPopulationDefinition;
    excluded_population: Record<string, any> | ExcludedPopulationDefinition;
    clinical_risk_class: string;
    claims?: ClinicalClaim[];
    contraindications?: ClinicalContraindication[];
  };
}

export interface MaterialChangeResult {
  is_material_change: boolean;
  material_reasons: string[];
  non_material_notes: string[];
}

export class MaterialChangeDetectionEngine {
  public static evaluate(input: MaterialChangeEvaluationInput): MaterialChangeResult {
    const material_reasons: string[] = [];
    const non_material_notes: string[] = [];

    const prev = input.previousVersion;
    const next = input.newVersion;

    // 1. Clinical Risk Class Change
    if (prev.clinical_risk_class !== next.clinical_risk_class) {
      material_reasons.push(
        `Clinical Risk Class changed from ${prev.clinical_risk_class} to ${next.clinical_risk_class}.`
      );
    }

    // 2. Intended Use Semantics
    if (prev.intended_use.trim().toLowerCase() !== next.intended_use.trim().toLowerCase()) {
      const prevLower = prev.intended_use.toLowerCase();
      const nextLower = next.intended_use.toLowerCase();

      // Check if diagnostic or therapeutic claim keywords were introduced
      const escalatingKeywords = ['diagnos', 'treat', 'cure', 'prescrib', 'crisis', 'emergency'];
      const introduced = escalatingKeywords.some(k => !prevLower.includes(k) && nextLower.includes(k));

      if (introduced || Math.abs(prev.intended_use.length - next.intended_use.length) > 30) {
        material_reasons.push('Intended clinical use expanded or modified in clinical scope statement.');
      } else {
        non_material_notes.push('Minor wording adjustment in intended use without clinical scope escalation.');
      }
    }

    // 3. Intended Population Expansion or Modification
    if (JSON.stringify(prev.intended_population) !== JSON.stringify(next.intended_population)) {
      material_reasons.push('Intended population parameters modified or expanded.');
    }

    // 4. Excluded Population Narrowing (e.g., removing a safety exclusion)
    if (JSON.stringify(prev.excluded_population) !== JSON.stringify(next.excluded_population)) {
      material_reasons.push('Excluded population safety boundaries modified.');
    }

    // 5. Specification Changes (Scoring thresholds, algorithms, prompts)
    const prevSpecStr = JSON.stringify(prev.specification);
    const nextSpecStr = JSON.stringify(next.specification);

    if (prevSpecStr !== nextSpecStr) {
      // Check for scoring cutoffs or risk thresholds
      const prevCutoffs = prev.specification.scoring_thresholds || prev.specification.cutoffs;
      const nextCutoffs = next.specification.scoring_thresholds || next.specification.cutoffs;

      if (JSON.stringify(prevCutoffs) !== JSON.stringify(nextCutoffs)) {
        material_reasons.push('Assessment scoring cutoffs or risk thresholds altered.');
      }

      // Check for clinical decision or AI prompt logic
      const prevPrompt = prev.specification.system_prompt || prev.specification.clinical_prompt;
      const nextPrompt = next.specification.system_prompt || next.specification.clinical_prompt;

      if (prevPrompt !== nextPrompt) {
        material_reasons.push('Clinical AI behavioral instruction / prompt modified.');
      }

      // Check if changes are strictly non-material editorial / presentation styling
      const prevKeys = Object.keys(prev.specification || {});
      const nextKeys = Object.keys(next.specification || {});
      const nonClinicalKeys = new Set(['formatting', 'typography', 'theme', 'styling', 'layout', 'ui', 'editorial', 'display', 'accessibility']);
      const allChangedKeys = new Set([...prevKeys, ...nextKeys].filter(k => 
        JSON.stringify(prev.specification[k]) !== JSON.stringify(next.specification[k])
      ));
      const onlyNonClinical = allChangedKeys.size > 0 && Array.from(allChangedKeys).every(k => nonClinicalKeys.has(k));

      if (onlyNonClinical) {
        non_material_notes.push('Minor presentation/formatting adjustments in specification.');
      } else if (material_reasons.length === 0) {
        material_reasons.push('Clinical specification payload modified.');
      }
    }

    // 6. Clinical Claims Added or Escalated
    if (prev.claims && next.claims) {
      if (next.claims.length !== prev.claims.length) {
        material_reasons.push(`Clinical claims count changed (from ${prev.claims.length} to ${next.claims.length}).`);
      } else {
        for (const nc of next.claims) {
          const pc = prev.claims.find(c => c.claim_code === nc.claim_code);
          if (!pc) {
            material_reasons.push(`New clinical claim added: ${nc.claim_code}.`);
          } else if (pc.claim_text !== nc.claim_text || pc.strength !== nc.strength || pc.claim_type !== nc.claim_type) {
            material_reasons.push(`Clinical claim ${nc.claim_code} modified in scope or strength.`);
          }
        }
      }
    }

    // 7. Contraindications Removed or Relaxed
    if (prev.contraindications && next.contraindications) {
      if (next.contraindications.length < prev.contraindications.length) {
        material_reasons.push('One or more clinical contraindications were removed or relaxed.');
      }
    }

    const is_material_change = material_reasons.length > 0;

    return {
      is_material_change,
      material_reasons,
      non_material_notes
    };
  }
}
