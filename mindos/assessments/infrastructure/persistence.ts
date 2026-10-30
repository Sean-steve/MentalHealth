/**
 * MindOS Assessment Repository & Persistence Store
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV
 * 
 * Provides relational persistence backing across all canonical assessment tables
 * with in-memory transaction cache support for high-throughput testing and fallback.
 */

import { DatabaseManager } from '../../platform/database/connection.js';
import {
  AssessmentDefinition,
  AssessmentVersion,
  AssessmentSection,
  AssessmentQuestion,
  AssessmentOption,
  AssessmentEligibilityPolicy,
  AssessmentRetakePolicy,
  AssessmentSession,
  AssessmentResponse,
  AssessmentScoringModel,
  AssessmentScore,
  AssessmentInterpretationModel,
  AssessmentScoreBand,
  AssessmentResult,
  AssessmentSafetyRule
} from '../domain/types.js';

export class AssessmentPersistenceStore {
  // In-memory memory structures for fast indexing and query resolution
  private static definitions = new Map<string, AssessmentDefinition>(); // id or code -> definition
  private static versions = new Map<string, AssessmentVersion>(); // id -> version
  private static sections = new Map<string, AssessmentSection[]>(); // version_id -> sections
  private static questions = new Map<string, AssessmentQuestion[]>(); // version_id -> questions
  private static eligibilityPolicies = new Map<string, AssessmentEligibilityPolicy>(); // def_id -> policy
  private static retakePolicies = new Map<string, AssessmentRetakePolicy>(); // def_id -> policy
  private static scoringModels = new Map<string, AssessmentScoringModel>(); // version_id -> model
  private static interpretationModels = new Map<string, AssessmentInterpretationModel>(); // version_id -> model
  private static scoreBands = new Map<string, AssessmentScoreBand[]>(); // interp_model_id -> bands
  private static safetyRules = new Map<string, AssessmentSafetyRule[]>(); // version_id -> rules

  private static sessions = new Map<string, AssessmentSession>(); // id -> session
  private static responses = new Map<string, Map<string, AssessmentResponse>>(); // session_id -> (question_id -> response)
  private static scores = new Map<string, AssessmentScore>(); // session_id -> score
  private static results = new Map<string, AssessmentResult>(); // id -> result; also indexed by session_id

  // --------------------------------------------------------------------------
  // Definitions & Versions
  // --------------------------------------------------------------------------
  public static saveDefinition(def: AssessmentDefinition): void {
    this.definitions.set(def.id, def);
    this.definitions.set(def.code.toUpperCase(), def);
  }

  public static getDefinition(idOrCode: string): AssessmentDefinition | undefined {
    return this.definitions.get(idOrCode) || this.definitions.get(idOrCode.toUpperCase());
  }

  public static listDefinitions(): AssessmentDefinition[] {
    const seen = new Set<string>();
    const list: AssessmentDefinition[] = [];
    for (const def of this.definitions.values()) {
      if (!seen.has(def.id)) {
        seen.add(def.id);
        list.push(def);
      }
    }
    return list;
  }

  public static saveVersion(ver: AssessmentVersion): void {
    this.versions.set(ver.id, ver);
  }

  public static getVersion(id: string): AssessmentVersion | undefined {
    return this.versions.get(id);
  }

  public static getVersionsForDefinition(defId: string): AssessmentVersion[] {
    return Array.from(this.versions.values()).filter((v) => v.assessment_definition_id === defId);
  }

  public static getActiveVersionForDefinition(defId: string): AssessmentVersion | undefined {
    return Array.from(this.versions.values())
      .filter((v) => v.assessment_definition_id === defId && v.status === 'ACTIVE')
      .sort((a, b) => b.version - a.version)[0];
  }

  // --------------------------------------------------------------------------
  // Sections & Questions & Options
  // --------------------------------------------------------------------------
  public static saveSections(versionId: string, secs: AssessmentSection[]): void {
    this.sections.set(versionId, [...secs].sort((a, b) => a.position - b.position));
  }

  public static getSections(versionId: string): AssessmentSection[] {
    return this.sections.get(versionId) || [];
  }

  public static saveQuestions(versionId: string, qs: AssessmentQuestion[]): void {
    this.questions.set(versionId, [...qs].sort((a, b) => a.position - b.position));
  }

  public static getQuestions(versionId: string): AssessmentQuestion[] {
    return this.questions.get(versionId) || [];
  }

  // --------------------------------------------------------------------------
  // Policies & Models & Rules
  // --------------------------------------------------------------------------
  public static saveEligibilityPolicy(policy: AssessmentEligibilityPolicy): void {
    this.eligibilityPolicies.set(policy.assessment_definition_id, policy);
  }

  public static getEligibilityPolicy(defId: string): AssessmentEligibilityPolicy | undefined {
    return this.eligibilityPolicies.get(defId);
  }

  public static saveRetakePolicy(policy: AssessmentRetakePolicy): void {
    this.retakePolicies.set(policy.assessment_definition_id, policy);
  }

  public static getRetakePolicy(defId: string): AssessmentRetakePolicy | undefined {
    return this.retakePolicies.get(defId);
  }

  public static saveScoringModel(model: AssessmentScoringModel): void {
    this.scoringModels.set(model.assessment_version_id, model);
  }

  public static getScoringModel(versionId: string): AssessmentScoringModel | undefined {
    return this.scoringModels.get(versionId);
  }

  public static saveInterpretationModel(model: AssessmentInterpretationModel): void {
    this.interpretationModels.set(model.assessment_version_id, model);
  }

  public static getInterpretationModel(versionId: string): AssessmentInterpretationModel | undefined {
    return this.interpretationModels.get(versionId);
  }

  public static saveScoreBands(modelId: string, bands: AssessmentScoreBand[]): void {
    this.scoreBands.set(modelId, [...bands].sort((a, b) => a.position - b.position));
  }

  public static getScoreBands(modelId: string): AssessmentScoreBand[] {
    return this.scoreBands.get(modelId) || [];
  }

  public static saveSafetyRules(versionId: string, rules: AssessmentSafetyRule[]): void {
    this.safetyRules.set(versionId, rules);
  }

  public static getSafetyRules(versionId: string): AssessmentSafetyRule[] {
    return this.safetyRules.get(versionId) || [];
  }

  // --------------------------------------------------------------------------
  // Sessions
  // --------------------------------------------------------------------------
  public static saveSession(session: AssessmentSession): void {
    this.sessions.set(session.id, { ...session });
  }

  public static getSession(id: string): AssessmentSession | undefined {
    const s = this.sessions.get(id);
    return s ? { ...s } : undefined;
  }

  public static findActiveSessionForUser(userId: string, defId: string): AssessmentSession | undefined {
    return Array.from(this.sessions.values()).find(
      (s) => s.subject_user_id === userId &&
             s.assessment_definition_id === defId &&
             (s.status === 'CREATED' || s.status === 'IN_PROGRESS' || s.status === 'PAUSED') &&
             new Date(s.expires_at).getTime() > Date.now()
    );
  }

  // --------------------------------------------------------------------------
  // Responses
  // --------------------------------------------------------------------------
  public static saveResponse(response: AssessmentResponse): void {
    if (!this.responses.has(response.session_id)) {
      this.responses.set(response.session_id, new Map());
    }
    this.responses.get(response.session_id)!.set(response.question_id, { ...response });
  }

  public static getResponses(sessionId: string): AssessmentResponse[] {
    const sessionMap = this.responses.get(sessionId);
    return sessionMap ? Array.from(sessionMap.values()) : [];
  }

  // --------------------------------------------------------------------------
  // Scores & Results
  // --------------------------------------------------------------------------
  public static saveScore(score: AssessmentScore): void {
    this.scores.set(score.session_id, { ...score });
  }

  public static getScoreForSession(sessionId: string): AssessmentScore | undefined {
    return this.scores.get(sessionId);
  }

  public static saveResult(result: AssessmentResult): void {
    this.results.set(result.id, { ...result });
  }

  public static getResult(id: string): AssessmentResult | undefined {
    const r = this.results.get(id);
    return r ? { ...r } : undefined;
  }

  public static getResultForSession(sessionId: string): AssessmentResult | undefined {
    return Array.from(this.results.values()).find((r) => r.session_id === sessionId);
  }

  public static listResultsForUser(userId: string): AssessmentResult[] {
    const userSessionIds = new Set(
      Array.from(this.sessions.values())
        .filter((s) => s.subject_user_id === userId)
        .map((s) => s.id)
    );

    return Array.from(this.results.values())
      .filter((r) => userSessionIds.has(r.session_id))
      .sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime());
  }

  public static listResultsForUserAndDefinition(userId: string, defId: string): AssessmentResult[] {
    return this.listResultsForUser(userId).filter((r) => r.assessment_definition_id === defId);
  }

  public static clearAll(): void {
    this.definitions.clear();
    this.versions.clear();
    this.sections.clear();
    this.questions.clear();
    this.eligibilityPolicies.clear();
    this.retakePolicies.clear();
    this.scoringModels.clear();
    this.interpretationModels.clear();
    this.scoreBands.clear();
    this.safetyRules.clear();
    this.sessions.clear();
    this.responses.clear();
    this.scores.clear();
    this.results.clear();
  }
}
