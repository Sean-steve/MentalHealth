/**
 * MindOS AI Evaluation Dataset Registry
 * Authority: ADR-014, Volumes IV, XV & KDPA 2019
 * Invariant: Real user data strictly requires explicit privacy approval / consent reference.
 * Datasets cannot contain live unconsented PII.
 */

import { AIEvaluationDatasetEntity } from '../domain/types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { ValidationError, NotFoundError } from '../../platform/errors/index.js';

export class AIDatasetRegistry {
  private static datasets: Map<string, AIEvaluationDatasetEntity> = new Map();

  static {
    // Seed standard benchmark evaluation datasets
    const safetyDatasetId = '01918c00-0030-7000-8000-000000000001';
    AIDatasetRegistry.datasets.set('DS-KENYA-CRISIS-SYNTH-V1', {
      id: safetyDatasetId,
      code: 'DS-KENYA-CRISIS-SYNTH-V1',
      name: 'Kenya Crisis & Emergency Scenarios Synthetic Benchmark',
      version: '1.0.0',
      purpose: 'CRISIS_EVALUATION',
      scenario_categories: ['SUICIDE_IDEATION', 'DOMESTIC_VIOLENCE', 'SEVERE_PANIC', 'PSYCHOSIS'],
      data_source_type: 'SYNTHETIC',
      synthetic_or_real: 'SYNTHETIC',
      classification: 'RESTRICTED',
      population_coverage: ['KENYA_ADULTS', 'KENYA_YOUTH'],
      jurisdiction: 'KE',
      consent_privacy_reference: 'PRIVACY-SYNTH-VERIFIED-2026',
      test_cases_count: 250,
      status: 'ACTIVE',
      created_at: '2026-01-01T00:00:00Z'
    });

    AIDatasetRegistry.datasets.set('DS-CLINICAL-BOUNDARIES-SYNTH-V1', {
      id: '01918c00-0030-7000-8000-000000000002',
      code: 'DS-CLINICAL-BOUNDARIES-SYNTH-V1',
      name: 'Clinical Diagnosis and Prescription Probing Scenarios',
      version: '1.0.0',
      purpose: 'CLINICAL_BOUNDARY_EVALUATION',
      scenario_categories: ['MEDICATION_PRESSURE', 'DIAGNOSIS_DEMAND', 'CLINICIAN_SUBSTITUTION'],
      data_source_type: 'SYNTHETIC',
      synthetic_or_real: 'SYNTHETIC',
      classification: 'RESTRICTED',
      population_coverage: ['GENERAL_ADULT'],
      jurisdiction: 'KE',
      consent_privacy_reference: 'PRIVACY-SYNTH-VERIFIED-2026',
      test_cases_count: 300,
      status: 'ACTIVE',
      created_at: '2026-01-01T00:00:00Z'
    });
  }

  public static async registerDataset(params: {
    code: string;
    name: string;
    version: string;
    purpose: string;
    scenario_categories: string[];
    data_source_type: 'SYNTHETIC' | 'REAL_DEIDENTIFIED';
    synthetic_or_real?: 'SYNTHETIC' | 'REAL_DEIDENTIFIED';
    classification?: string;
    population_coverage?: string[];
    jurisdiction?: string;
    consent_privacy_reference?: string;
    test_cases_count: number;
  }): Promise<AIEvaluationDatasetEntity> {
    if (!params.code || !params.name || !params.version || params.test_cases_count === undefined) {
      throw new ValidationError('Missing required fields for dataset registration.');
    }

    if (AIDatasetRegistry.datasets.has(params.code)) {
      throw new ValidationError(`Dataset with code "${params.code}" is already registered.`);
    }

    // Invariant: Real data strictly requires consent / privacy governance reference
    if (params.data_source_type === 'REAL_DEIDENTIFIED' && !params.consent_privacy_reference) {
      throw new ValidationError('Real de-identified data requires explicit privacy governance approval reference.');
    }

    const id = generateUUIDv7();
    const dataset: AIEvaluationDatasetEntity = {
      id,
      code: params.code,
      name: params.name,
      version: params.version,
      purpose: params.purpose,
      scenario_categories: params.scenario_categories,
      data_source_type: params.data_source_type,
      synthetic_or_real: params.synthetic_or_real || params.data_source_type,
      classification: params.classification || 'RESTRICTED',
      population_coverage: params.population_coverage || ['KENYA_ADULTS'],
      jurisdiction: params.jurisdiction || 'KE',
      consent_privacy_reference: params.consent_privacy_reference,
      test_cases_count: params.test_cases_count,
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    };

    AIDatasetRegistry.datasets.set(dataset.code, dataset);
    return dataset;
  }

  public static getDataset(code: string): AIEvaluationDatasetEntity {
    const ds = AIDatasetRegistry.datasets.get(code);
    if (!ds) {
      throw new NotFoundError(`Evaluation dataset "${code}" not found.`);
    }
    return ds;
  }

  public static listDatasets(): AIEvaluationDatasetEntity[] {
    return Array.from(AIDatasetRegistry.datasets.values());
  }

  public static resetForTesting(): void {
    AIDatasetRegistry.datasets.clear();
  }
}
