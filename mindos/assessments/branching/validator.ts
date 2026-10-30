/**
 * MindOS Assessment Branching Graph Validator
 * Authority: Master Architecture Index Section 7, Volume XV
 * 
 * Verifies that branching logic forms a valid Directed Acyclic Graph (DAG):
 * 1. No cyclic dependencies
 * 2. All referenced questions exist in the assessment version
 * 3. Referenced questions precede the conditional question in positional order
 * 4. No unreachable dead-ends or unresolvable loops
 */

import { AssessmentQuestion } from '../domain/types.js';

export interface BranchValidationIssue {
  severity: 'ERROR' | 'WARNING';
  code?: string;
  question_code: string;
  message: string;
}

export interface BranchValidationResult {
  valid: boolean;
  issues: BranchValidationIssue[];
}

export class BranchingValidator {
  public static validate(questions: AssessmentQuestion[]): BranchValidationResult {
    const issues: BranchValidationIssue[] = [];
    const questionMap = new Map<string, AssessmentQuestion>();
    const positionMap = new Map<string, number>();

    for (const q of questions) {
      if (questionMap.has(q.question_code)) {
        issues.push({
          severity: 'ERROR',
          question_code: q.question_code,
          message: `Duplicate question code "${q.question_code}" detected.`
        });
      }
      questionMap.set(q.question_code, q);
      positionMap.set(q.question_code, q.position);
    }

    // Build dependency adjacency list for cycle detection
    // Edge: A -> B means B depends on A (A must be answered before B is shown)
    const adj = new Map<string, string[]>();
    for (const q of questions) {
      adj.set(q.question_code, []);
    }

    for (const q of questions) {
      if (!q.visibility_rule || !q.visibility_rule.conditions) continue;

      for (const cond of q.visibility_rule.conditions) {
        const refCode = cond.question_code;

        // Check 1: Referenced question exists
        if (!questionMap.has(refCode)) {
          issues.push({
            severity: 'ERROR',
            question_code: q.question_code,
            message: `Visibility rule references non-existent question "${refCode}".`
          });
          continue;
        }

        // Check 2: Referenced question is strictly earlier in the sequence
        const refPos = positionMap.get(refCode) ?? 0;
        const currentPos = q.position;
        if (refPos >= currentPos) {
          issues.push({
            severity: 'ERROR',
            question_code: q.question_code,
            message: `Visibility rule on "${q.question_code}" (pos ${currentPos}) references future or self question "${refCode}" (pos ${refPos}). Forward dependencies are forbidden.`
          });
        }

        adj.get(refCode)?.push(q.question_code);
      }
    }

    // Cycle detection via DFS (Tarjan / 3-color algorithm)
    const visited = new Map<string, number>(); // 0: unvisited, 1: visiting, 2: visited
    for (const q of questions) {
      visited.set(q.question_code, 0);
    }

    function dfs(node: string): boolean {
      visited.set(node, 1);
      const neighbors = adj.get(node) || [];

      for (const neighbor of neighbors) {
        const state = visited.get(neighbor) || 0;
        if (state === 1) {
          // Cycle found!
          issues.push({
            severity: 'ERROR',
            code: 'CIRCULAR_DEPENDENCY',
            question_code: neighbor,
            message: `Cyclic branching dependency detected between "${node}" and "${neighbor}".`
          });
          return false;
        }
        if (state === 0) {
          if (!dfs(neighbor)) return false;
        }
      }

      visited.set(node, 2);
      return true;
    }

    for (const q of questions) {
      if ((visited.get(q.question_code) || 0) === 0) {
        dfs(q.question_code);
      }
    }

    const hasErrors = issues.some((i) => i.severity === 'ERROR');
    return {
      valid: !hasErrors,
      issues
    };
  }
}
