/**
 * MindOS AI Configuration Material Change Engine
 * Authority: Volumes IV, XV & ADR-015, ADR-017
 * Purpose: Determines whether a change between two AI configurations is
 * Non-Material, Material, or Critical, and calculates the re-evaluation / review obligations.
 */

import { MaterialityLevel, AIConfigurationEntity, AIToolCategory, AIToolEntity } from './types.js';

export interface MaterialChangeAssessment {
  materiality: MaterialityLevel;
  reasons: string[];
  requires_re_evaluation: boolean;
  requires_red_teaming: boolean;
  requires_clinical_review: boolean;
  requires_privacy_review: boolean;
  requires_regulatory_review: boolean;
  requires_formal_approval: boolean;
}

export class AIMaterialChangeEngine {
  public static assessChange(params: {
    previousConfig?: AIConfigurationEntity;
    newConfig: AIConfigurationEntity;
    toolsRegistry?: Map<string, AIToolEntity>;
  }): MaterialChangeAssessment {
    const reasons: string[] = [];
    let materiality: MaterialityLevel = 'NON_MATERIAL';
    let requires_re_evaluation = false;
    let requires_red_teaming = false;
    let requires_clinical_review = false;
    let requires_privacy_review = false;
    let requires_regulatory_review = false;
    let requires_formal_approval = false;

    // Initial deployment is always critical/formal
    if (!params.previousConfig) {
      return {
        materiality: 'CRITICAL',
        reasons: ['Initial system configuration baseline requires full evaluation, red-teaming, and governance sign-off.'],
        requires_re_evaluation: true,
        requires_red_teaming: true,
        requires_clinical_review: true,
        requires_privacy_review: true,
        requires_regulatory_review: true,
        requires_formal_approval: true
      };
    }

    const prev = params.previousConfig;
    const curr = params.newConfig;

    // 1. Provider Change
    if (prev.provider_id !== curr.provider_id) {
      materiality = 'CRITICAL';
      reasons.push(`Provider changed from ${prev.provider_id} to ${curr.provider_id}. Requires fresh privacy & vendor processor validation.`);
      requires_privacy_review = true;
      requires_re_evaluation = true;
      requires_red_teaming = true;
    }

    // 2. Model / Version Change
    if (prev.model_id !== curr.model_id || prev.model_version !== curr.model_version) {
      materiality = 'MATERIAL';
      reasons.push(`Model artifact changed from ${prev.model_id}@${prev.model_version} to ${curr.model_id}@${curr.model_version}.`);
      requires_re_evaluation = true;
      requires_red_teaming = true;
    }

    // 3. Prompt Hash Differences
    const prevPrompts = prev.prompt_hashes || {};
    const currPrompts = curr.prompt_hashes || {};
    const allPromptKeys = new Set([...Object.keys(prevPrompts), ...Object.keys(currPrompts)]);
    let promptChanged = false;

    for (const key of allPromptKeys) {
      if (prevPrompts[key] !== currPrompts[key]) {
        promptChanged = true;
        reasons.push(`Prompt [${key}] hash changed (${prevPrompts[key] || 'NONE'} -> ${currPrompts[key] || 'NONE'}).`);
      }
    }

    if (promptChanged) {
      materiality = materiality === 'CRITICAL' ? 'CRITICAL' : 'MATERIAL';
      requires_re_evaluation = true;
      requires_clinical_review = true;
    }

    // 4. Toolset Modifications
    const prevTools = new Set(prev.toolset_codes || []);
    const currTools = new Set(curr.toolset_codes || []);
    const addedTools = (curr.toolset_codes || []).filter(t => !prevTools.has(t));
    const removedTools = (prev.toolset_codes || []).filter(t => !currTools.has(t));

    if (addedTools.length > 0 || removedTools.length > 0 || prev.toolset_version !== curr.toolset_version) {
      let containsHighRiskTool = false;
      if (params.toolsRegistry) {
        for (const code of addedTools) {
          const tool = params.toolsRegistry.get(code);
          if (tool && (tool.category === AIToolCategory.EXTERNAL_SIDE_EFFECT || tool.category === AIToolCategory.HIGH_RISK_ACTION)) {
            containsHighRiskTool = true;
          }
        }
      }

      if (containsHighRiskTool) {
        materiality = 'CRITICAL';
        reasons.push(`Added high-risk or external side-effect tool(s): [${addedTools.join(', ')}].`);
        requires_clinical_review = true;
        requires_privacy_review = true;
      } else {
        materiality = materiality === 'CRITICAL' ? 'CRITICAL' : 'MATERIAL';
        reasons.push(`Toolset altered: added=[${addedTools.join(', ')}], removed=[${removedTools.join(', ')}].`);
      }
      requires_re_evaluation = true;
    }

    // 5. Policy Version Changes
    if (prev.data_access_policy_version !== curr.data_access_policy_version) {
      materiality = 'MATERIAL';
      reasons.push(`Data access policy version changed from v${prev.data_access_policy_version} to v${curr.data_access_policy_version}.`);
      requires_privacy_review = true;
    }

    if (prev.memory_policy_version !== curr.memory_policy_version) {
      materiality = 'CRITICAL';
      reasons.push(`Memory policy version updated from v${prev.memory_policy_version} to v${curr.memory_policy_version}.`);
      requires_privacy_review = true;
      requires_re_evaluation = true;
    }

    if (prev.safety_policy_version !== curr.safety_policy_version) {
      materiality = 'CRITICAL';
      reasons.push(`Safety policy version updated from v${prev.safety_policy_version} to v${curr.safety_policy_version}.`);
      requires_clinical_review = true;
      requires_re_evaluation = true;
      requires_red_teaming = true;
    }

    if (prev.output_policy_version !== curr.output_policy_version) {
      materiality = 'MATERIAL';
      reasons.push(`Output policy version updated from v${prev.output_policy_version} to v${curr.output_policy_version}.`);
      requires_clinical_review = true;
      requires_re_evaluation = true;
    }

    // 6. Jurisdiction or Population expansion
    if (prev.jurisdiction !== curr.jurisdiction) {
      materiality = 'CRITICAL';
      reasons.push(`Target jurisdiction changed from ${prev.jurisdiction} to ${curr.jurisdiction}.`);
      requires_regulatory_review = true;
    }

    if (prev.population !== curr.population) {
      materiality = 'CRITICAL';
      reasons.push(`Target population changed from ${prev.population} to ${curr.population}.`);
      requires_clinical_review = true;
      requires_regulatory_review = true;
      requires_re_evaluation = true;
    }

    if (materiality !== 'NON_MATERIAL') {
      requires_formal_approval = true;
    }

    return {
      materiality,
      reasons,
      requires_re_evaluation,
      requires_red_teaming,
      requires_clinical_review,
      requires_privacy_review,
      requires_regulatory_review,
      requires_formal_approval
    };
  }
}
