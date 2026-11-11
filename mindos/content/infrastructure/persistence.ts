/**
 * MindOS Content & Psychoeducation Persistence Store
 * Authority: Master Architecture Index Section 8, Volumes I, III, XVI
 * 
 * Provides relational persistence backing across all canonical content tables
 * with in-memory transaction cache support for high-throughput testing and deterministic execution.
 */

import {
  ContentDefinition,
  ContentVersion,
  ContentBlock,
  ContentTaxonomy,
  ContentTaxonomyTerm,
  ContentTermAssignment,
  ContentLocalization,
  GuidedExercise,
  ExerciseSession,
  ContentCollection,
  ContentCollectionItem,
  ContentProgress,
  ContentBookmark,
  ContentIssue,
  ContentClaim
} from '../domain/types.js';
import { B29MutableStateStore } from '../../b29/mutable_state_store.js';

export class ContentPersistenceStore {
  private static durablePersistenceEnabled = false;

  public static async enableDurablePersistence(): Promise<void> {
    this.durablePersistenceEnabled = true;
    await this.hydrateMutableState();
  }

  public static disableDurablePersistenceForTesting(): void {
    this.durablePersistenceEnabled = false;
  }

  public static async hydrateMutableState(): Promise<void> {
    if (!this.durablePersistenceEnabled) return;
    this.exerciseSessions.clear();
    this.progress.clear();
    this.bookmarks.clear();
    this.issues.clear();
    const records = await B29MutableStateStore.list<any>('CONTENT');
    for (const record of records) {
      if (record.entity_type === 'EXERCISE_SESSION') {
        const v = record.payload as ExerciseSession;
        this.exerciseSessions.set(v.id, v);
      } else if (record.entity_type === 'PROGRESS') {
        const v = record.payload as ContentProgress;
        let userMap = this.progress.get(v.subject_user_id);
        if (!userMap) {
          userMap = new Map<string, ContentProgress>();
          this.progress.set(v.subject_user_id, userMap);
        }
        userMap.set(v.content_definition_id, v);
      } else if (record.entity_type === 'BOOKMARK') {
        const v = record.payload as { subject_user_id:string; content_definition_id:string };
        let set = this.bookmarks.get(v.subject_user_id);
        if (!set) {
          set = new Set<string>();
          this.bookmarks.set(v.subject_user_id, set);
        }
        set.add(v.content_definition_id);
      } else if (record.entity_type === 'ISSUE') {
        const v = record.payload as ContentIssue;
        this.issues.set(v.id, v);
      }
    }
  }

  private static definitions = new Map<string, ContentDefinition>(); // id or code -> definition
  private static versions = new Map<string, ContentVersion>(); // id -> version
  private static blocks = new Map<string, ContentBlock[]>(); // version_id -> blocks
  private static taxonomies = new Map<string, ContentTaxonomy>(); // id or code -> taxonomy
  private static terms = new Map<string, ContentTaxonomyTerm>(); // id -> term
  private static termAssignments = new Map<string, ContentTermAssignment[]>(); // def_id -> assignments
  private static localizations = new Map<string, Map<string, ContentLocalization>>(); // def_id -> (locale -> loc)
  private static exercises = new Map<string, GuidedExercise>(); // id -> exercise; also def_id or version_id -> exercise
  private static exerciseSessions = new Map<string, ExerciseSession>(); // id -> session
  private static collections = new Map<string, ContentCollection>(); // id or code -> collection
  private static collectionItems = new Map<string, ContentCollectionItem[]>(); // coll_id -> items
  private static progress = new Map<string, Map<string, ContentProgress>>(); // userId -> (defId -> progress)
  private static bookmarks = new Map<string, Set<string>>(); // userId -> Set of defIds
  private static issues = new Map<string, ContentIssue>(); // id -> issue
  private static claims = new Map<string, ContentClaim[]>(); // version_id -> claims

  // --------------------------------------------------------------------------
  // Definitions & Versions
  // --------------------------------------------------------------------------
  public static saveDefinition(def: ContentDefinition): void {
    this.definitions.set(def.id, def);
    this.definitions.set(def.code.toUpperCase(), def);
  }

  public static getDefinition(idOrCode: string): ContentDefinition | undefined {
    return this.definitions.get(idOrCode) || this.definitions.get(idOrCode.toUpperCase());
  }

  public static listDefinitions(): ContentDefinition[] {
    const seen = new Set<string>();
    const list: ContentDefinition[] = [];
    for (const def of this.definitions.values()) {
      if (!seen.has(def.id)) {
        seen.add(def.id);
        list.push(def);
      }
    }
    return list;
  }

  public static saveVersion(ver: ContentVersion): void {
    this.versions.set(ver.id, ver);
  }

  public static getVersion(id: string): ContentVersion | undefined {
    return this.versions.get(id);
  }

  public static getVersionByDefAndNum(defId: string, versionNum: number): ContentVersion | undefined {
    for (const ver of this.versions.values()) {
      if (ver.content_definition_id === defId && ver.version === versionNum) {
        return ver;
      }
    }
    return undefined;
  }

  public static listVersions(defId: string): ContentVersion[] {
    return Array.from(this.versions.values()).filter(v => v.content_definition_id === defId);
  }

  public static getActiveVersion(defId: string): ContentVersion | undefined {
    const def = this.getDefinition(defId);
    if (def && def.active_version_id) {
      return this.versions.get(def.active_version_id);
    }
    // Fallback to highest approved/published version
    const defVersions = this.listVersions(defId)
      .filter(v => v.status === 'PUBLISHED')
      .sort((a, b) => b.version - a.version);
    return defVersions[0];
  }

  // --------------------------------------------------------------------------
  // Content Blocks
  // --------------------------------------------------------------------------
  public static saveBlocks(versionId: string, blocks: ContentBlock[]): void {
    this.blocks.set(versionId, [...blocks].sort((a, b) => a.position - b.position));
  }

  public static getBlocks(versionId: string): ContentBlock[] {
    return this.blocks.get(versionId) || [];
  }

  // --------------------------------------------------------------------------
  // Taxonomy & Terms
  // --------------------------------------------------------------------------
  public static saveTaxonomy(tax: ContentTaxonomy): void {
    this.taxonomies.set(tax.id, tax);
    this.taxonomies.set(tax.code.toUpperCase(), tax);
  }

  public static getTaxonomy(idOrCode: string): ContentTaxonomy | undefined {
    return this.taxonomies.get(idOrCode) || this.taxonomies.get(idOrCode.toUpperCase());
  }

  public static listTaxonomies(): ContentTaxonomy[] {
    const seen = new Set<string>();
    const list: ContentTaxonomy[] = [];
    for (const tax of this.taxonomies.values()) {
      if (!seen.has(tax.id)) {
        seen.add(tax.id);
        list.push(tax);
      }
    }
    return list;
  }

  public static saveTerm(term: ContentTaxonomyTerm): void {
    this.terms.set(term.id, term);
  }

  public static getTerm(id: string): ContentTaxonomyTerm | undefined {
    return this.terms.get(id);
  }

  public static listTerms(taxonomyId?: string): ContentTaxonomyTerm[] {
    const list = Array.from(this.terms.values());
    if (taxonomyId) {
      return list.filter(t => t.taxonomy_id === taxonomyId);
    }
    return list;
  }

  public static saveTermAssignment(assignment: ContentTermAssignment): void {
    const current = this.termAssignments.get(assignment.content_definition_id) || [];
    const filtered = current.filter(a => a.term_id !== assignment.term_id);
    filtered.push(assignment);
    this.termAssignments.set(assignment.content_definition_id, filtered);
  }

  public static getTermAssignments(defId: string): ContentTermAssignment[] {
    return this.termAssignments.get(defId) || [];
  }

  public static listDefinitionsByTerm(termId: string): string[] {
    const defIds: string[] = [];
    for (const [defId, assignments] of this.termAssignments.entries()) {
      if (assignments.some(a => a.term_id === termId)) {
        defIds.push(defId);
      }
    }
    return defIds;
  }

  // --------------------------------------------------------------------------
  // Localizations
  // --------------------------------------------------------------------------
  public static saveLocalization(loc: ContentLocalization): void {
    let defLocs = this.localizations.get(loc.content_definition_id);
    if (!defLocs) {
      defLocs = new Map<string, ContentLocalization>();
      this.localizations.set(loc.content_definition_id, defLocs);
    }
    defLocs.set(loc.locale, loc);
  }

  public static getLocalization(defId: string, locale: string): ContentLocalization | undefined {
    return this.localizations.get(defId)?.get(locale);
  }

  public static listLocalizations(defId: string): ContentLocalization[] {
    const defLocs = this.localizations.get(defId);
    return defLocs ? Array.from(defLocs.values()) : [];
  }

  // --------------------------------------------------------------------------
  // Guided Exercises
  // --------------------------------------------------------------------------
  public static saveExercise(exercise: GuidedExercise): void {
    this.exercises.set(exercise.id, exercise);
    this.exercises.set(`def:${exercise.content_definition_id}`, exercise);
    this.exercises.set(`ver:${exercise.content_version_id}`, exercise);
  }

  public static getExercise(id: string): GuidedExercise | undefined {
    return this.exercises.get(id);
  }

  public static getExerciseByDef(defId: string): GuidedExercise | undefined {
    return this.exercises.get(`def:${defId}`);
  }

  public static getExerciseByVersion(versionId: string): GuidedExercise | undefined {
    return this.exercises.get(`ver:${versionId}`);
  }

  public static listExercises(): GuidedExercise[] {
    const seen = new Set<string>();
    const list: GuidedExercise[] = [];
    for (const ex of this.exercises.values()) {
      if (!seen.has(ex.id)) {
        seen.add(ex.id);
        list.push(ex);
      }
    }
    return list;
  }

  // --------------------------------------------------------------------------
  // Exercise Sessions
  // --------------------------------------------------------------------------
  public static saveSession(session: ExerciseSession): void {
    this.exerciseSessions.set(session.id, session);
  }

  public static async saveSessionDurable(session: ExerciseSession): Promise<void> {
    this.saveSession(session);
    if (this.durablePersistenceEnabled) {
      await B29MutableStateStore.put({
        domain:'CONTENT',entity_type:'EXERCISE_SESSION',entity_id:session.id,
        owner_id:session.subject_user_id,parent_id:session.exercise_id,status:String(session.status),payload:session
      });
    }
  }

  public static getSession(id: string): ExerciseSession | undefined {
    return this.exerciseSessions.get(id);
  }

  public static listSessionsByUser(userId: string): ExerciseSession[] {
    return Array.from(this.exerciseSessions.values()).filter(s => s.subject_user_id === userId);
  }

  // --------------------------------------------------------------------------
  // Collections & Items
  // --------------------------------------------------------------------------
  public static saveCollection(collection: ContentCollection): void {
    this.collections.set(collection.id, collection);
    this.collections.set(collection.code.toUpperCase(), collection);
  }

  public static getCollection(idOrCode: string): ContentCollection | undefined {
    return this.collections.get(idOrCode) || this.collections.get(idOrCode.toUpperCase());
  }

  public static listCollections(): ContentCollection[] {
    const seen = new Set<string>();
    const list: ContentCollection[] = [];
    for (const c of this.collections.values()) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        list.push(c);
      }
    }
    return list;
  }

  public static saveCollectionItem(item: ContentCollectionItem): void {
    const current = this.collectionItems.get(item.collection_id) || [];
    const filtered = current.filter(i => i.content_definition_id !== item.content_definition_id);
    filtered.push(item);
    filtered.sort((a, b) => a.position - b.position);
    this.collectionItems.set(item.collection_id, filtered);
  }

  public static getCollectionItems(collectionId: string): ContentCollectionItem[] {
    return this.collectionItems.get(collectionId) || [];
  }

  // --------------------------------------------------------------------------
  // User Content Progress
  // --------------------------------------------------------------------------
  public static saveProgress(prog: ContentProgress): void {
    let userMap = this.progress.get(prog.subject_user_id);
    if (!userMap) {
      userMap = new Map<string, ContentProgress>();
      this.progress.set(prog.subject_user_id, userMap);
    }
    userMap.set(prog.content_definition_id, prog);
  }

  public static async saveProgressDurable(prog: ContentProgress): Promise<void> {
    this.saveProgress(prog);
    if (this.durablePersistenceEnabled) {
      await B29MutableStateStore.put({
        domain:'CONTENT',entity_type:'PROGRESS',entity_id:prog.id,
        owner_id:prog.subject_user_id,parent_id:prog.content_definition_id,status:String(prog.status),payload:prog
      });
    }
  }

  public static getProgress(userId: string, defId: string): ContentProgress | undefined {
    return this.progress.get(userId)?.get(defId);
  }

  public static listUserProgress(userId: string): ContentProgress[] {
    const userMap = this.progress.get(userId);
    return userMap ? Array.from(userMap.values()) : [];
  }

  // --------------------------------------------------------------------------
  // User Bookmarks
  // --------------------------------------------------------------------------
  public static saveBookmark(userId: string, defId: string): void {
    let bms = this.bookmarks.get(userId);
    if (!bms) {
      bms = new Set<string>();
      this.bookmarks.set(userId, bms);
    }
    bms.add(defId);
  }

  public static async saveBookmarkDurable(userId: string, defId: string): Promise<void> {
    this.saveBookmark(userId,defId);
    if (this.durablePersistenceEnabled) {
      await B29MutableStateStore.put({
        domain:'CONTENT',entity_type:'BOOKMARK',entity_id:`${userId}:${defId}`,
        owner_id:userId,parent_id:defId,status:'ACTIVE',
        payload:{subject_user_id:userId,content_definition_id:defId}
      });
    }
  }

  public static deleteBookmark(userId: string, defId: string): void {
    this.bookmarks.get(userId)?.delete(defId);
  }

  public static async deleteBookmarkDurable(userId: string, defId: string): Promise<void> {
    this.deleteBookmark(userId,defId);
    if (this.durablePersistenceEnabled) {
      await B29MutableStateStore.delete('CONTENT','BOOKMARK',`${userId}:${defId}`);
    }
  }

  public static listBookmarks(userId: string): string[] {
    return Array.from(this.bookmarks.get(userId) || []);
  }

  public static isBookmarked(userId: string, defId: string): boolean {
    return (this.bookmarks.get(userId) || new Set()).has(defId);
  }

  // --------------------------------------------------------------------------
  // Content Issues
  // --------------------------------------------------------------------------
  public static saveIssue(issue: ContentIssue): void {
    this.issues.set(issue.id, issue);
  }

  public static async saveIssueDurable(issue: ContentIssue): Promise<void> {
    this.saveIssue(issue);
    if (this.durablePersistenceEnabled) {
      await B29MutableStateStore.put({
        domain:'CONTENT',entity_type:'ISSUE',entity_id:issue.id,
        parent_id:issue.content_version_id,status:String(issue.status),payload:issue
      });
    }
  }

  public static getIssue(id: string): ContentIssue | undefined {
    return this.issues.get(id);
  }

  public static listIssues(versionId?: string): ContentIssue[] {
    const all = Array.from(this.issues.values());
    if (versionId) {
      return all.filter(i => i.content_version_id === versionId);
    }
    return all;
  }

  // --------------------------------------------------------------------------
  // Content Claims
  // --------------------------------------------------------------------------
  public static saveClaim(claim: ContentClaim): void {
    const current = this.claims.get(claim.content_version_id) || [];
    current.push(claim);
    this.claims.set(claim.content_version_id, current);
  }

  public static getClaims(versionId: string): ContentClaim[] {
    return this.claims.get(versionId) || [];
  }

  // --------------------------------------------------------------------------
  // Test Harness / Reset
  // --------------------------------------------------------------------------
  public static clearAllForTesting(): void {
    this.definitions.clear();
    this.versions.clear();
    this.blocks.clear();
    this.taxonomies.clear();
    this.terms.clear();
    this.termAssignments.clear();
    this.localizations.clear();
    this.exercises.clear();
    this.exerciseSessions.clear();
    this.collections.clear();
    this.collectionItems.clear();
    this.progress.clear();
    this.bookmarks.clear();
    this.issues.clear();
    this.claims.clear();
  }
}
