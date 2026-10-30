/**
 * MindOS Governed AI Runtime Execution Context
 * Authority: Master Architecture Index Section 7, Volumes I, IV, XV
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';

export class AIExecutionContext {
  public readonly traceId: string;
  public readonly turnId: string;
  public readonly conversationId: string;
  public readonly userId: string;
  public readonly startTime: number;

  private stepStarts: Map<string, number> = new Map();
  private stepDurations: Map<string, number> = new Map();

  public promptTokens = 0;
  public completionTokens = 0;

  constructor(userId: string, conversationId: string) {
    this.traceId = generateUUIDv7();
    this.turnId = generateUUIDv7();
    this.conversationId = conversationId;
    this.userId = userId;
    this.startTime = Date.now();
  }

  public startStep(stepName: string): void {
    this.stepStarts.set(stepName, Date.now());
  }

  public endStep(stepName: string): number {
    const start = this.stepStarts.get(stepName);
    const duration = start ? Date.now() - start : 0;
    this.stepDurations.set(stepName, duration);
    return duration;
  }

  public getStepDuration(stepName: string): number {
    return this.stepDurations.get(stepName) || 0;
  }

  public recordTokens(prompt: number, completion: number): void {
    this.promptTokens += prompt;
    this.completionTokens += completion;
  }

  public getTotalDurationMs(): number {
    return Date.now() - this.startTime;
  }

  public toMetrics(): {
    trace_id: string;
    turn_id: string;
    duration_ms: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    steps: Record<string, number>;
  } {
    const steps: Record<string, number> = {};
    for (const [k, v] of this.stepDurations.entries()) {
      steps[k] = v;
    }
    return {
      trace_id: this.traceId,
      turn_id: this.turnId,
      duration_ms: this.getTotalDurationMs(),
      prompt_tokens: this.promptTokens,
      completion_tokens: this.completionTokens,
      total_tokens: this.promptTokens + this.completionTokens,
      steps
    };
  }
}
