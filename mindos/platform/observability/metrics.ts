/**
 * MindOS Metrics & Measurement Architecture
 * Authority: Volume XII & Appendix L
 */

export interface MetricDefinitionRecord {
  code: string;
  name: string;
  definition: string;
  domain: string;
  cadence: 'Daily' | 'Weekly' | 'Monthly' | 'Per release' | 'Per evaluation';
  governance: string;
}

export const CANONICAL_METRIC_REGISTRY: Record<string, MetricDefinitionRecord> = {
  MSC: {
    code: 'MSC',
    name: 'Meaningful Support Connection',
    definition: 'Count of qualifying support actions completed under Metric Registry definition.',
    domain: 'Outcome',
    cadence: 'Weekly',
    governance: 'No raw text; user-level analysis restricted.'
  },
  MEANINGFUL_IMPROVEMENT: {
    code: 'MEANINGFUL_IMPROVEMENT',
    name: 'Meaningful Improvement',
    definition: 'Users with valid baseline/follow-up showing improvement under a versioned methodology.',
    domain: 'Outcome',
    cadence: 'Monthly',
    governance: 'Never presented as clinical cure or causal proof.'
  },
  TIME_TO_SUPPORT: {
    code: 'TIME_TO_SUPPORT',
    name: 'Time to Appropriate Support',
    definition: 'Elapsed time from need-identification event to qualifying support connection.',
    domain: 'Care',
    cadence: 'Daily',
    governance: 'Censored/abandoned journeys reported separately.'
  },
  SAFETY_WORKFLOW_COMPLETION: {
    code: 'SAFETY_WORKFLOW_COMPLETION',
    name: 'Safety Workflow Completion',
    definition: 'Safety events receiving all policy-required actions within SLO / eligible safety events.',
    domain: 'Safety',
    cadence: 'Daily',
    governance: 'Highest priority operational metric.'
  },
  API_AVAILABILITY: {
    code: 'API_AVAILABILITY',
    name: 'Core API Availability',
    definition: 'Successful eligible requests / total eligible requests at edge.',
    domain: 'Reliability',
    cadence: 'Monthly',
    governance: 'SLO definition excludes planned maintenance only if policy says so.'
  },
  SAFETY_API_AVAILABILITY: {
    code: 'SAFETY_API_AVAILABILITY',
    name: 'Safety Path Availability',
    definition: 'Successful safety resource/policy path checks / eligible checks.',
    domain: 'Reliability/Safety',
    cadence: 'Monthly',
    governance: 'Stricter SLO than general features.'
  },
  AI_CRITICAL_EVAL_PASS: {
    code: 'AI_CRITICAL_EVAL_PASS',
    name: 'Critical AI Evaluation Pass',
    definition: 'Critical test cases passed / critical test cases executed.',
    domain: 'AI Safety',
    cadence: 'Per release',
    governance: 'Required 100% for configured hard-gate suites.'
  }
};

export class MetricCollector {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();

  public increment(metricCode: string, value = 1): void {
    const current = this.counters.get(metricCode) || 0;
    this.counters.set(metricCode, current + value);
  }

  public setGauge(metricCode: string, value: number): void {
    this.gauges.set(metricCode, value);
  }

  public getSnapshot(): { counters: Record<string, number>; gauges: Record<string, number> } {
    return {
      counters: Object.fromEntries(this.counters.entries()),
      gauges: Object.fromEntries(this.gauges.entries())
    };
  }
}

export const metrics = new MetricCollector();
