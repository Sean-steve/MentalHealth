/**
 * MindOS AI Safety Evaluation Harness & Engine
 * Authority: ADR-014, Volumes IV, XV & Appendices B / C
 * Invariants:
 * - Evaluations execute strictly against a designated immutable configuration hash
 * - Zero tolerance: any critical failure triggers automatic FAIL
 * - Generates immutable SHA-256 evidence hash for release gate integration
 */

import { createHash } from 'crypto';
import {
  AIEvaluationRunEntity,
  EvaluationType,
  EvaluationDecision,
  CriticalFailureItem
} from '../domain/types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { CANONICAL_THRESHOLD_POLICY, ThresholdPolicyConfig } from './thresholds.js';
import { AIConfigurationEngine } from '../configurations/engine.js';
import { AIDatasetRegistry } from '../datasets/registry.js';
import { ValidationError, NotFoundError } from '../../platform/errors/index.js';

export class AIEvaluationEngine {
  private static runs: Map<string, AIEvaluationRunEntity> = new Map();

  public static async executeEvaluation(params: {
    ai_system_id: string;
    configuration_version: string;
    evaluation_type: EvaluationType;
    evaluation_suite_version?: string;
    dataset_code: string;
    dataset_version?: string;
    metrics: Record<string, number>;
    critical_failures?: CriticalFailureItem[];
    threshold_policy?: ThresholdPolicyConfig;
  }): Promise<AIEvaluationRunEntity> {
    // 1. Verify Configuration exists and get hash
    const config = AIConfigurationEngine.getConfigurationByVersion(params.ai_system_id, params.configuration_version);
    const dataset = AIDatasetRegistry.getDataset(params.dataset_code);

    const thresholdPolicy = params.threshold_policy || CANONICAL_THRESHOLD_POLICY;
    const critical_failures = params.critical_failures || [];
    const metrics = params.metrics || {};

    // 2. Evaluate Decision based on Threshold Policy & Critical Failures
    let decision: EvaluationDecision = EvaluationDecision.PASS;

    // Hard-Gate 1: Critical Failures
    if (critical_failures.length > thresholdPolicy.critical_failure_tolerance) {
      decision = EvaluationDecision.FAIL;
    }

    // Hard-Gate 2: Safety Score Thresholds
    if (params.evaluation_type === EvaluationType.SAFETY || params.evaluation_type === EvaluationType.REGRESSION) {
      if ((metrics.safety_score !== undefined && metrics.safety_score < thresholdPolicy.min_overall_safety_score) ||
          (metrics.hallucination_rate !== undefined && metrics.hallucination_rate > thresholdPolicy.max_hallucination_rate) ||
          (metrics.privacy_leakage !== undefined && metrics.privacy_leakage > thresholdPolicy.max_privacy_leakage)) {
        decision = EvaluationDecision.FAIL;
      }
    }

    // Hard-Gate 3: Clinical Boundary zero tolerance
    if (params.evaluation_type === EvaluationType.CLINICAL_BOUNDARY) {
      if (metrics.clinical_boundary_score !== undefined && metrics.clinical_boundary_score < thresholdPolicy.min_clinical_boundary_score) {
        decision = EvaluationDecision.FAIL;
      }
    }

    // Hard-Gate 4: Crisis zero tolerance
    if (params.evaluation_type === EvaluationType.CRISIS) {
      if (metrics.crisis_routing_accuracy !== undefined && metrics.crisis_routing_accuracy < thresholdPolicy.min_crisis_routing_accuracy) {
        decision = EvaluationDecision.FAIL;
      }
    }

    // Hard-Gate 5: Tool precision
    if (params.evaluation_type === EvaluationType.TOOL_USE) {
      if (metrics.tool_precision !== undefined && metrics.tool_precision < thresholdPolicy.min_tool_precision) {
        decision = EvaluationDecision.FAIL;
      }
    }

    const id = generateUUIDv7();
    const evidenceId = generateUUIDv7();
    const now = new Date().toISOString();

    // Compute deterministic evidence hash
    const evidencePayload = {
      evaluation_id: id,
      ai_system_id: params.ai_system_id,
      configuration_hash: config.configuration_hash,
      evaluation_type: params.evaluation_type,
      dataset_code: dataset.code,
      metrics,
      critical_failures_count: critical_failures.length,
      decision,
      completed_at: now
    };
    const evidence_hash = createHash('sha256').update(JSON.stringify(evidencePayload)).digest('hex');

    const run: AIEvaluationRunEntity = {
      id,
      ai_system_id: params.ai_system_id,
      configuration_version: params.configuration_version,
      configuration_hash: config.configuration_hash,
      evaluation_type: params.evaluation_type,
      evaluation_suite_version: params.evaluation_suite_version || '1.0.0',
      dataset_version: params.dataset_version || dataset.version,
      status: 'COMPLETED',
      started_at: now,
      completed_at: now,
      metrics,
      critical_failures,
      threshold_policy_version: thresholdPolicy.version,
      decision,
      evidence_id: evidenceId,
      evidence_hash
    };

    AIEvaluationEngine.runs.set(id, run);
    return run;
  }

  public static getRun(id: string): AIEvaluationRunEntity {
    const run = AIEvaluationEngine.runs.get(id);
    if (!run) {
      throw new NotFoundError(`Evaluation run "${id}" not found.`);
    }
    return run;
  }

  public static listRunsForConfiguration(configurationHash: string): AIEvaluationRunEntity[] {
    return Array.from(AIEvaluationEngine.runs.values()).filter(r => r.configuration_hash === configurationHash);
  }

  public static resetForTesting(): void {
    AIEvaluationEngine.runs.clear();
  }
}
