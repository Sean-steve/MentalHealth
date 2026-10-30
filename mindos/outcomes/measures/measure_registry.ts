/**
 * MindOS Outcome Measure Registry
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 * Sprint 23 Bounded Context
 */

import { OutcomeMeasureDefinition, MeasureComparabilityPolicy } from '../domain/entities.js';
import { OutcomeInvariants } from '../domain/invariants.js';
import { OutcomeMeasureNotFoundError } from '../../platform/errors/index.js';
import { getCanonicalSeedMeasures } from './seed_measures.js';
import { logger } from '../../platform/observability/logger.js';

export class MeasureRegistry {
  private static definitions: Map<string, OutcomeMeasureDefinition> = new Map();
  private static policies: Map<string, MeasureComparabilityPolicy> = new Map();
  private static initialized = false;

  public static initialize(force = false): void {
    if (this.initialized && !force) return;

    const { definitions, policies } = getCanonicalSeedMeasures();
    for (const p of policies) {
      this.policies.set(p.measure_code, p);
    }
    for (const d of definitions) {
      this.definitions.set(d.measure_code, d);
    }

    this.initialized = true;
    logger.info('[MeasureRegistry] Initialized canonical outcome measures (PHQ-9, GAD-7, WHO-5, C-SSRS, Sleep, Goal).');
  }

  public static registerDefinition(def: OutcomeMeasureDefinition): void {
    this.initialize();
    OutcomeInvariants.assertNotProductMetric(def.measure_code);
    this.definitions.set(def.measure_code, { ...def });
  }

  public static registerComparabilityPolicy(policy: MeasureComparabilityPolicy): void {
    this.initialize();
    this.policies.set(policy.measure_code, { ...policy });
  }

  public static getDefinition(measureCode: string): OutcomeMeasureDefinition {
    this.initialize();
    const def = this.definitions.get(measureCode);
    if (!def || def.status !== 'ACTIVE') {
      throw new OutcomeMeasureNotFoundError(`Outcome measure definition "${measureCode}" not found or not active.`);
    }
    return { ...def };
  }

  public static findDefinition(measureCode: string): OutcomeMeasureDefinition | undefined {
    this.initialize();
    const def = this.definitions.get(measureCode);
    return def ? { ...def } : undefined;
  }

  public static getComparabilityPolicy(measureCode: string): MeasureComparabilityPolicy | undefined {
    this.initialize();
    const p = this.policies.get(measureCode);
    return p ? { ...p } : undefined;
  }

  public static listActiveMeasures(): OutcomeMeasureDefinition[] {
    this.initialize();
    return Array.from(this.definitions.values()).filter((d) => d.status === 'ACTIVE').map(d=>({...d}));
  }

  public static listComparabilityPolicies(): MeasureComparabilityPolicy[] {
    this.initialize();
    return Array.from(this.policies.values()).map(p=>({...p,allowed_version_pairs:p.allowed_version_pairs.map(pair=>[...pair] as [string|number,string|number]),unit_requirements:[...p.unit_requirements],population_constraints:p.population_constraints?[...p.population_constraints]:undefined}));
  }

  public static resetForTesting(): void {
    this.definitions.clear();
    this.policies.clear();
    this.initialized = false;
    this.initialize();
  }
}
