/**
 * MindOS Assessment Registry & Instrument Versioning Service
 * Authority: Master Architecture Index Section 7, Volumes I, XV
 * 
 * Invariants:
 * 1. Immutable Published Versions: Once a version is ACTIVE or APPROVED, its questions,
 *    options, scoring models, and bands cannot be mutated in place.
 * 2. Clinical Governance Requirement: Every clinically meaningful assessment version
 *    must reference an approved Clinical Artifact version.
 * 3. Canonical Seed Instruments: Ensures PHQ-9, GAD-7, WHO-5, and C-SSRS are loaded.
 */

import {
  AssessmentDefinition,
  AssessmentVersion,
  AssessmentSection,
  AssessmentQuestion,
  AssessmentOption,
  AssessmentScoringModel,
  AssessmentInterpretationModel,
  AssessmentScoreBand,
  AssessmentEligibilityPolicy,
  AssessmentRetakePolicy,
  AssessmentSafetyRule,
  AssessmentVersionState
} from '../domain/types.js';
import { AssessmentPersistenceStore } from '../infrastructure/persistence.js';
import { getCanonicalSeedInstruments } from './seed_instruments.js';
import {
  AssessmentNotAvailableError,
  AssessmentVersionRevokedError,
  DomainInvariantError
} from '../../platform/errors/index.js';
import { BranchingValidator } from '../branching/validator.js';
import { logger } from '../../platform/observability/logger.js';

export class AssessmentRegistry {
  private static initialized = false;

  public static reset(): void {
    this.initialized = false;
  }

  /**
   * Initializes registry and seeds canonical instruments if not yet loaded.
   */
  public static initialize(force = false): void {
    if (this.initialized && !force && AssessmentPersistenceStore.listDefinitions().length > 0) return;

    const seedBundles = getCanonicalSeedInstruments();
    for (const bundle of seedBundles) {
      this.registerBundle(bundle);
    }

    this.initialized = true;
    logger.info('[AssessmentRegistry] Initialized with canonical clinical instruments (PHQ-9, GAD-7, WHO-5, C-SSRS).');
  }

  /**
   * Registers a complete instrument bundle.
   */
  public static registerBundle(bundle: {
    definition: AssessmentDefinition;
    version: AssessmentVersion;
    sections: AssessmentSection[];
    questions: AssessmentQuestion[];
    scoringModel: AssessmentScoringModel;
    interpretationModel: AssessmentInterpretationModel;
    scoreBands: AssessmentScoreBand[];
    eligibilityPolicy: AssessmentEligibilityPolicy;
    retakePolicy: AssessmentRetakePolicy;
    safetyRules: AssessmentSafetyRule[];
  }): void {
    // Validate branching DAG
    const validation = BranchingValidator.validate(bundle.questions);
    if (!validation.valid) {
      const errMsgs = validation.issues.map((i) => `[${i.severity}] ${i.message}`).join(', ');
      throw new DomainInvariantError(`Invalid assessment branching logic in ${bundle.definition.code}: ${errMsgs}`);
    }

    const def = { ...bundle.definition, active_version_id: bundle.version.id };
    AssessmentPersistenceStore.saveDefinition(def);
    AssessmentPersistenceStore.saveVersion(bundle.version);
    AssessmentPersistenceStore.saveSections(bundle.version.id, bundle.sections);
    AssessmentPersistenceStore.saveQuestions(bundle.version.id, bundle.questions);
    AssessmentPersistenceStore.saveScoringModel(bundle.scoringModel);
    AssessmentPersistenceStore.saveInterpretationModel(bundle.interpretationModel);
    AssessmentPersistenceStore.saveScoreBands(bundle.interpretationModel.id, bundle.scoreBands);
    AssessmentPersistenceStore.saveEligibilityPolicy(bundle.eligibilityPolicy);
    AssessmentPersistenceStore.saveRetakePolicy(bundle.retakePolicy);
    AssessmentPersistenceStore.saveSafetyRules(bundle.version.id, bundle.safetyRules);
  }

  /**
   * Lists all currently active assessment definitions.
   */
  public static listAvailableAssessments(): AssessmentDefinition[] {
    this.initialize();
    return AssessmentPersistenceStore.listDefinitions().filter(
      (d) => d.status === 'ACTIVE' && d.active_version_id
    );
  }

  /**
   * Gets assessment definition by code or ID.
   */
  public static getDefinition(idOrCode: string): AssessmentDefinition {
    this.initialize();
    const def = AssessmentPersistenceStore.getDefinition(idOrCode);
    if (!def || def.status !== 'ACTIVE') {
      throw new AssessmentNotAvailableError(`Assessment instrument "${idOrCode}" is not available.`);
    }
    return def;
  }

  /**
   * Gets specific version or active version of an assessment definition.
   */
  public static getVersion(versionId: string): AssessmentVersion {
    this.initialize();
    const ver = AssessmentPersistenceStore.getVersion(versionId);
    if (!ver) {
      throw new AssessmentNotAvailableError(`Assessment version "${versionId}" not found.`);
    }
    if (ver.status === AssessmentVersionState.SUSPENDED || ver.status === AssessmentVersionState.RETIRED) {
      throw new AssessmentVersionRevokedError(`Assessment version "${ver.id}" has been ${ver.status.toLowerCase()} by clinical governance.`);
    }
    return ver;
  }

  /**
   * Gets active version for an assessment definition.
   */
  public static getActiveVersion(defId: string): AssessmentVersion {
    this.initialize();
    const ver = AssessmentPersistenceStore.getActiveVersionForDefinition(defId);
    if (!ver) {
      throw new AssessmentNotAvailableError(`No active version found for assessment definition "${defId}".`);
    }
    return ver;
  }

  /**
   * Retrieves bundle components for session execution.
   */
  public static getInstrumentForExecution(versionId: string): {
    version: AssessmentVersion;
    sections: AssessmentSection[];
    questions: AssessmentQuestion[];
    scoringModel: AssessmentScoringModel;
    interpretationModel: AssessmentInterpretationModel;
    scoreBands: AssessmentScoreBand[];
    safetyRules: AssessmentSafetyRule[];
  } {
    this.initialize();
    const version = this.getVersion(versionId);
    const sections = AssessmentPersistenceStore.getSections(versionId);
    const questions = AssessmentPersistenceStore.getQuestions(versionId);
    const scoringModel = AssessmentPersistenceStore.getScoringModel(versionId);
    const interpretationModel = AssessmentPersistenceStore.getInterpretationModel(versionId);
    const scoreBands = interpretationModel ? AssessmentPersistenceStore.getScoreBands(interpretationModel.id) : [];
    const safetyRules = AssessmentPersistenceStore.getSafetyRules(versionId);

    if (!scoringModel || !interpretationModel) {
      throw new DomainInvariantError(`Corrupt assessment version "${versionId}": missing scoring or interpretation model.`);
    }

    return {
      version,
      sections,
      questions,
      scoringModel,
      interpretationModel,
      scoreBands,
      safetyRules
    };
  }

  /**
   * Creates a new governed version (Version N+1).
   * Enforces that active published versions cannot be modified in place.
   */
  public static createNewVersion(params: {
    definitionId: string;
    supersedesVersionId: string;
    title: string;
    instructions: string;
    clinicalArtifactVersion: number;
  }): AssessmentVersion {
    this.initialize();
    const oldVer = this.getVersion(params.supersedesVersionId);
    const newVerNum = oldVer.version + 1;

    const newVersionId = `ver-${oldVer.assessment_definition_id.slice(4, 8)}-v${newVerNum}-${Date.now().toString(36)}`;
    const newVersion: AssessmentVersion = {
      id: newVersionId,
      assessment_definition_id: params.definitionId,
      version: newVerNum,
      status: AssessmentVersionState.DRAFT,
      clinical_artifact_version: params.clinicalArtifactVersion,
      title: params.title,
      instructions: params.instructions,
      population: { ...oldVer.population },
      jurisdictions: [...oldVer.jurisdictions],
      estimated_duration_minutes: oldVer.estimated_duration_minutes,
      scoring_model_version: `${newVerNum}.0.0`,
      interpretation_model_version: `${newVerNum}.0.0`,
      effective_at: new Date().toISOString(),
      supersedes_id: oldVer.id,
      created_at: new Date().toISOString()
    };

    AssessmentPersistenceStore.saveVersion(newVersion);
    logger.info(`[AssessmentRegistry] Created new assessment draft version v${newVerNum} superseding v${oldVer.version}.`);
    return newVersion;
  }
}
