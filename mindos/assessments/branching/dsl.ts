/**
 * MindOS Assessment Branching Rule DSL Evaluator
 * Authority: Master Architecture Index Section 7, Volume XV
 * 
 * Invariant: Constrained structured rule format without arbitrary code execution (NO eval).
 */

import { BranchingVisibilityRule, BranchRuleCondition } from '../domain/types.js';

export class BranchingEvaluator {
  /**
   * Evaluates a single condition against current session responses.
   * Responses map is keyed by question_code.
   */
  public static evaluateCondition(
    condition: BranchRuleCondition,
    responses: Record<string, unknown>
  ): boolean {
    const responseValue = responses[condition.question_code];

    switch (condition.operator) {
      case 'is_answered':
        return responseValue !== undefined && responseValue !== null && responseValue !== '';

      case 'is_empty':
        return responseValue === undefined || responseValue === null || responseValue === '';

      case 'equals':
        return responseValue === condition.value;

      case 'not_equals':
        return responseValue !== condition.value;

      case 'in':
        if (!Array.isArray(condition.value)) return false;
        return (condition.value as unknown[]).includes(responseValue);

      case 'not_in':
        if (!Array.isArray(condition.value)) return true;
        return !(condition.value as unknown[]).includes(responseValue);

      case 'greater_than':
        if (typeof responseValue !== 'number' || typeof condition.value !== 'number') return false;
        return responseValue > condition.value;

      case 'greater_than_or_equal':
        if (typeof responseValue !== 'number' || typeof condition.value !== 'number') return false;
        return responseValue >= condition.value;

      case 'less_than':
        if (typeof responseValue !== 'number' || typeof condition.value !== 'number') return false;
        return responseValue < condition.value;

      case 'less_than_or_equal':
        if (typeof responseValue !== 'number' || typeof condition.value !== 'number') return false;
        return responseValue <= condition.value;

      default:
        return false;
    }
  }

  /**
   * Determines if a question is currently visible based on its visibility_rule.
   * If no rule is defined, the question is always visible.
   */
  public static isVisible(
    visibilityRule: BranchingVisibilityRule | undefined,
    responses: Record<string, unknown>
  ): boolean {
    if (!visibilityRule || !visibilityRule.conditions || visibilityRule.conditions.length === 0) {
      return true;
    }

    if (visibilityRule.operator === 'OR') {
      return visibilityRule.conditions.some((cond) =>
        BranchingEvaluator.evaluateCondition(cond, responses)
      );
    }

    // Default: 'AND'
    return visibilityRule.conditions.every((cond) =>
      BranchingEvaluator.evaluateCondition(cond, responses)
    );
  }
}
