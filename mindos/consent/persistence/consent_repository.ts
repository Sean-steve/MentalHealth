/**
 * MindOS Canonical Consent Persistence Repository
 * Authority: Master Architecture Index Section 14, Volume III, IV, VIII
 * ADR-006, ADR-011, ADR-019
 */

import { DatabaseManager, DatabaseClient } from '../../platform/database/connection.js';
import { v7 as uuidv7 } from 'uuid';
import {
  ConsentDefinition,
  ConsentPolicyVersion,
  ConsentGrant,
  ConsentEvidence,
  ConsentScopeEntry,
  ConsentRecipient,
  ConsentState,
  ConsentCategory,
  ConsentScopeType
} from '../domain/types.js';
import { CANONICAL_CONSENT_SEEDS } from '../domain/definitions_seed.js';
import { ConflictError, NotFoundError } from '../../platform/errors/index.js';

export class ConsentRepository {
  private db?: DatabaseClient;

  // In-memory canonical tables for zero-latency, fail-closed evaluation
  private definitionsTable: Map<string, ConsentDefinition> = new Map();
  private policyVersionsTable: Map<string, ConsentPolicyVersion[]> = new Map(); // by consent_code
  private grantsTable: Map<string, ConsentGrant> = new Map(); // by grant id
  private evidencesTable: Map<string, ConsentEvidence> = new Map(); // by evidence id
  private scopesTable: Map<string, ConsentScopeEntry[]> = new Map(); // by grant id
  private recipientsTable: Map<string, ConsentRecipient[]> = new Map(); // by grant id

  constructor(client?: DatabaseClient) {
    this.db = client;
    this.ensureBaselineSeed();
  }

  /**
   * Automatically initializes canonical definitions and policies into the repository
   */
  public ensureBaselineSeed(): void {
    if (this.definitionsTable.size === 0) {
      for (const seed of CANONICAL_CONSENT_SEEDS) {
        this.definitionsTable.set(seed.definition.code, { ...seed.definition });
        
        const existingVersions = this.policyVersionsTable.get(seed.definition.code) || [];
        existingVersions.push({ ...seed.initialPolicyVersion });
        this.policyVersionsTable.set(seed.definition.code, existingVersions);
      }
    }
  }

  public reset(): void {
    this.definitionsTable.clear();
    this.policyVersionsTable.clear();
    this.grantsTable.clear();
    this.evidencesTable.clear();
    this.scopesTable.clear();
    this.recipientsTable.clear();
    this.ensureBaselineSeed();
  }

  // --- Consent Definitions ---

  public listDefinitions(): ConsentDefinition[] {
    return Array.from(this.definitionsTable.values());
  }

  public getDefinitionByCode(code: string): ConsentDefinition | null {
    return this.definitionsTable.get(code) || null;
  }

  public getDefinitionById(id: string): ConsentDefinition | null {
    for (const def of this.definitionsTable.values()) {
      if (def.id === id) return def;
    }
    return null;
  }

  // --- Policy Versions ---

  public listPolicyVersions(consentCode?: string): ConsentPolicyVersion[] {
    if (consentCode) {
      return [...(this.policyVersionsTable.get(consentCode) || [])];
    }
    const all: ConsentPolicyVersion[] = [];
    for (const list of this.policyVersionsTable.values()) {
      all.push(...list);
    }
    return all;
  }

  public getActivePolicyVersion(consentCode: string): ConsentPolicyVersion | null {
    const list = this.policyVersionsTable.get(consentCode) || [];
    const active = list.filter(v => v.status === 'ACTIVE');
    if (active.length === 0) return null;
    return active[active.length - 1];
  }

  public getPolicyVersion(consentDefinitionId: string, version: string): ConsentPolicyVersion | null {
    for (const list of this.policyVersionsTable.values()) {
      for (const v of list) {
        if (v.consent_definition_id === consentDefinitionId && v.version === version) {
          return v;
        }
      }
    }
    return null;
  }

  public createPolicyVersion(params: {
    consentDefinitionId: string;
    consentCode: string;
    version: string;
    title: string;
    summary: string;
    fullTextReference: string;
    jurisdiction?: string;
    language?: string;
    isMaterialChange?: boolean;
    approvedBy: string;
  }): ConsentPolicyVersion {
    const id = uuidv7();
    const now = new Date().toISOString();

    const existing = this.getPolicyVersion(params.consentDefinitionId, params.version);
    if (existing) {
      throw new ConflictError(`Policy version ${params.version} already exists for consent ${params.consentCode}`);
    }

    const list = this.policyVersionsTable.get(params.consentCode) || [];

    // Supersede previous active versions
    for (const v of list) {
      if (v.status === 'ACTIVE') {
        v.status = 'SUPERSEDED';
        v.retired_at = now;
      }
    }

    const newVersion: ConsentPolicyVersion = {
      id,
      consent_definition_id: params.consentDefinitionId,
      consent_code: params.consentCode,
      version: params.version,
      title: params.title,
      summary: params.summary,
      full_text_reference: params.fullTextReference,
      effective_at: now,
      jurisdiction: params.jurisdiction || 'KE',
      language: params.language || 'en',
      status: 'ACTIVE',
      is_material_change: params.isMaterialChange ?? false,
      approved_by: params.approvedBy,
      created_at: now
    };

    list.push(newVersion);
    this.policyVersionsTable.set(params.consentCode, list);
    return newVersion;
  }

  // --- Consent Grants ---

  public getActiveGrant(subjectUserId: string, consentCode: string): ConsentGrant | null {
    const matching: ConsentGrant[] = [];
    for (const g of this.grantsTable.values()) {
      if (g.subject_user_id === subjectUserId && g.consent_code === consentCode && g.status === ConsentState.GRANTED) {
        matching.push(g);
      }
    }

    if (matching.length === 0) return null;

    const grant = matching[matching.length - 1];

    // Check expiry
    if (grant.expires_at) {
      const now = new Date();
      if (now >= new Date(grant.expires_at)) {
        grant.status = ConsentState.EXPIRED;
        grant.updated_at = now.toISOString();
        return null;
      }
    }

    // Attach scopes and recipients
    grant.scopes = this.scopesTable.get(grant.id) || [];
    grant.recipients = this.recipientsTable.get(grant.id) || [];

    return grant;
  }

  public getLatestGrant(subjectUserId: string, consentCode: string): ConsentGrant | null {
    const matching: ConsentGrant[] = [];
    for (const g of this.grantsTable.values()) {
      if (g.subject_user_id === subjectUserId && g.consent_code === consentCode) {
        matching.push(g);
      }
    }

    if (matching.length === 0) return null;

    const grant = matching[matching.length - 1];
    grant.scopes = this.scopesTable.get(grant.id) || [];
    grant.recipients = this.recipientsTable.get(grant.id) || [];
    return grant;
  }

  public listGrantsForSubject(subjectUserId: string): ConsentGrant[] {
    const matching: ConsentGrant[] = [];
    for (const g of this.grantsTable.values()) {
      if (g.subject_user_id === subjectUserId) {
        g.scopes = this.scopesTable.get(g.id) || [];
        g.recipients = this.recipientsTable.get(g.id) || [];
        matching.push(g);
      }
    }
    return matching;
  }

  public saveGrant(grant: ConsentGrant): void {
    this.grantsTable.set(grant.id, { ...grant });
  }

  // --- Evidence ---

  public saveEvidence(evidence: ConsentEvidence): void {
    this.evidencesTable.set(evidence.id, { ...evidence });
  }

  public getEvidence(evidenceId: string): ConsentEvidence | null {
    return this.evidencesTable.get(evidenceId) || null;
  }

  // --- Scopes ---

  public saveScopes(scopes: ConsentScopeEntry[]): void {
    if (scopes.length === 0) return;
    const grantId = scopes[0].consent_grant_id;
    const existing = this.scopesTable.get(grantId) || [];
    existing.push(...scopes.map(s => ({ ...s })));
    this.scopesTable.set(grantId, existing);
  }

  public getScopesForGrant(grantId: string): ConsentScopeEntry[] {
    return this.scopesTable.get(grantId) || [];
  }

  public getScopeEntriesForGrant(grantId: string): ConsentScopeEntry[] {
    return this.getScopesForGrant(grantId);
  }

  // --- Recipients ---

  public saveRecipients(recipients: ConsentRecipient[]): void {
    if (recipients.length === 0) return;
    const grantId = recipients[0].consent_grant_id;
    const existing = this.recipientsTable.get(grantId) || [];
    existing.push(...recipients.map(r => ({ ...r })));
    this.recipientsTable.set(grantId, existing);
  }

  public getRecipientsForGrant(grantId: string): ConsentRecipient[] {
    return this.recipientsTable.get(grantId) || [];
  }
}
