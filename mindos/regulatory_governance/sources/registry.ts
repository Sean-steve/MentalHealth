/**
 * MindOS Regulatory Source Registry
 * Authority: Volumes III, XV & Appendix I
 * Tracks statutory acts, regulations, legal notices, standards, and official guidance.
 * Invariant: Differentiates authoritative official sources from commentary/secondary analysis.
 * Implements content hashing (SHA-256) and source version tracking.
 */

import { createHash } from 'node:crypto';
import { RegulatorySource, RegulatorySourceVersion } from '../domain/types.js';
import {
  RegulatorySourceType,
  RegulatorySourceStatus,
  RegulatorySourceClassification
} from '../domain/taxonomy.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { RegulatoryAuthorityRegistry } from '../authorities/registry.js';
import { ValidationError } from '../../platform/errors/index.js';

export class RegulatorySourceRegistry {
  private static sources: Map<string, RegulatorySource> = new Map();
  private static versions: Map<string, RegulatorySourceVersion[]> = new Map(); // source_id -> versions

  static {
    RegulatorySourceRegistry.initializeCanonicalSources();
  }

  public static computeHash(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  public static initializeCanonicalSources(): void {
    RegulatorySourceRegistry.sources.clear();
    RegulatorySourceRegistry.versions.clear();

    const canonical: Array<{
      code: string;
      authorityCode: string;
      type: RegulatorySourceType;
      title: string;
      ref: string;
      version: string;
      publicationDate: string;
      effectiveDate: string;
      classification: RegulatorySourceClassification;
      canonicalSummary: string;
    }> = [
      {
        code: 'KE-SRC-DPA-2019',
        authorityCode: 'ODPC',
        type: RegulatorySourceType.ACT,
        title: 'Data Protection Act, 2019',
        ref: 'Kenya Gazette Supplement No. 181 (Act No. 24 of 2019)',
        version: '1.0.0',
        publicationDate: '2019-11-08',
        effectiveDate: '2019-11-25',
        classification: RegulatorySourceClassification.AUTHORITATIVE_OFFICIAL_SOURCE,
        canonicalSummary: 'Establishes the ODPC, regulates processing of personal and sensitive health data, provides data subject rights, mandates DPIA, and sets cross-border transfer requirements.'
      },
      {
        code: 'KE-SRC-DPR-2021',
        authorityCode: 'ODPC',
        type: RegulatorySourceType.REGULATION,
        title: 'Data Protection (General) Regulations, 2021',
        ref: 'Legal Notice No. 263 of 2021',
        version: '1.0.0',
        publicationDate: '2021-12-14',
        effectiveDate: '2022-02-11',
        classification: RegulatorySourceClassification.AUTHORITATIVE_OFFICIAL_SOURCE,
        canonicalSummary: 'Operationalizes the Data Protection Act 2019: detailed obligations for health data processing, data protection by design, retention limits, and security safeguards.'
      },
      {
        code: 'KE-SRC-DHA-2023',
        authorityCode: 'DHA',
        type: RegulatorySourceType.ACT,
        title: 'Digital Health Act, 2023 (Act No. 15 of 2023)',
        ref: 'Kenya Gazette Supplement No. 195 (Acts No. 15)',
        version: '1.0.0',
        publicationDate: '2023-10-19',
        effectiveDate: '2023-11-02',
        classification: RegulatorySourceClassification.AUTHORITATIVE_OFFICIAL_SOURCE,
        canonicalSummary: 'Establishes Digital Health Agency; governs digital health systems, health information exchanges, health data localization/sovereignty, patient consent for data exchange, and digital health software certification.'
      },
      {
        code: 'KE-SRC-HA-2017',
        authorityCode: 'MOH',
        type: RegulatorySourceType.ACT,
        title: 'Health Act, 2017 (Act No. 21 of 2017)',
        ref: 'Kenya Gazette Supplement No. 97 (Acts No. 21)',
        version: '1.0.0',
        publicationDate: '2017-06-13',
        effectiveDate: '2017-06-21',
        classification: RegulatorySourceClassification.AUTHORITATIVE_OFFICIAL_SOURCE,
        canonicalSummary: 'Fundamental framework for the Kenyan health system; mandates strict confidentiality of health records, duties of healthcare workers, and patient rights.'
      },
      {
        code: 'KE-SRC-CMCA-2018',
        authorityCode: 'CAK',
        type: RegulatorySourceType.ACT,
        title: 'Computer Misuse and Cybercrimes Act, 2018 (Act No. 5 of 2018)',
        ref: 'Kenya Gazette Supplement No. 61 (Acts No. 5)',
        version: '1.0.0',
        publicationDate: '2018-05-16',
        effectiveDate: '2018-05-30',
        classification: RegulatorySourceClassification.AUTHORITATIVE_OFFICIAL_SOURCE,
        canonicalSummary: 'Criminalizes unauthorized access to critical information infrastructure; mandates cryptographic security safeguards and cybersecurity incident reporting.'
      },
      {
        code: 'KE-SRC-MHA-2022',
        authorityCode: 'MOH',
        type: RegulatorySourceType.ACT,
        title: 'Mental Health (Amendment) Act, 2022',
        ref: 'Kenya Gazette Supplement No. 115 (Act No. 14 of 2022)',
        version: '1.0.0',
        publicationDate: '2022-06-21',
        effectiveDate: '2022-07-05',
        classification: RegulatorySourceClassification.AUTHORITATIVE_OFFICIAL_SOURCE,
        canonicalSummary: 'Establishes mental health rights, patient protections, voluntary and involuntary treatment criteria, and mandates high-level confidentiality for mental health clinical interactions.'
      }
    ];

    for (const c of canonical) {
      const auth = RegulatoryAuthorityRegistry.get(c.authorityCode, 'KE');
      const authorityId = auth ? auth.id : generateUUIDv7();
      const sourceId = generateUUIDv7();
      const contentHash = RegulatorySourceRegistry.computeHash(c.canonicalSummary);

      const source: RegulatorySource = {
        id: sourceId,
        source_code: c.code,
        jurisdiction_code: 'KE',
        authority_id: authorityId,
        source_type: c.type,
        title: c.title,
        official_reference: c.ref,
        version: c.version,
        publication_date: c.publicationDate,
        effective_date: c.effectiveDate,
        status: RegulatorySourceStatus.EFFECTIVE,
        retrieved_at: '2026-01-01T00:00:00.000Z',
        verified_at: '2026-01-01T00:00:00.000Z',
        source_hash: contentHash,
        classification: c.classification
      };

      RegulatorySourceRegistry.sources.set(c.code, source);

      const versionRecord: RegulatorySourceVersion = {
        id: generateUUIDv7(),
        source_id: sourceId,
        version: c.version,
        publication_date: c.publicationDate,
        effective_date: c.effectiveDate,
        content_text: c.canonicalSummary,
        content_hash: contentHash,
        verified_by: 'legal_regulatory_officer_ke',
        verified_at: '2026-01-01T00:00:00.000Z',
        summary_notes: 'Initial canonical baseline'
      };

      RegulatorySourceRegistry.versions.set(sourceId, [versionRecord]);
    }
  }

  public static get(code: string): RegulatorySource | undefined {
    return RegulatorySourceRegistry.sources.get(code);
  }

  public static getById(id: string): RegulatorySource | undefined {
    for (const s of RegulatorySourceRegistry.sources.values()) {
      if (s.id === id) return s;
    }
    return undefined;
  }

  public static list(jurisdictionCode = 'KE'): RegulatorySource[] {
    return Array.from(RegulatorySourceRegistry.sources.values()).filter(
      (s) => s.jurisdiction_code === jurisdictionCode.toUpperCase()
    );
  }

  public static getVersions(sourceId: string): RegulatorySourceVersion[] {
    return RegulatorySourceRegistry.versions.get(sourceId) || [];
  }

  public static getLatestVersion(sourceId: string): RegulatorySourceVersion | undefined {
    const list = RegulatorySourceRegistry.versions.get(sourceId) || [];
    return list[list.length - 1];
  }

  public static registerSource(source: RegulatorySource, initialContent: string, verifiedBy: string): void {
    if (RegulatorySourceRegistry.sources.has(source.source_code)) {
      throw new ValidationError(`Regulatory source ${source.source_code} already registered`);
    }

    const hash = RegulatorySourceRegistry.computeHash(initialContent);
    source.source_hash = hash;
    RegulatorySourceRegistry.sources.set(source.source_code, source);

    const versionRecord: RegulatorySourceVersion = {
      id: generateUUIDv7(),
      source_id: source.id,
      version: source.version,
      publication_date: source.publication_date,
      effective_date: source.effective_date,
      content_text: initialContent,
      content_hash: hash,
      verified_by: verifiedBy,
      verified_at: new Date().toISOString(),
      summary_notes: 'Source registered'
    };

    RegulatorySourceRegistry.versions.set(source.id, [versionRecord]);
  }

  public static amendSource(params: {
    sourceCode: string;
    newVersion: string;
    newContentText: string;
    publicationDate?: string;
    effectiveDate?: string;
    verifiedBy: string;
    summaryNotes: string;
  }): { source: RegulatorySource; version: RegulatorySourceVersion } {
    const source = RegulatorySourceRegistry.get(params.sourceCode);
    if (!source) {
      throw new ValidationError(`Source not found: ${params.sourceCode}`);
    }

    const hash = RegulatorySourceRegistry.computeHash(params.newContentText);
    source.version = params.newVersion;
    source.source_hash = hash;
    source.status = RegulatorySourceStatus.AMENDED;
    source.verified_at = new Date().toISOString();

    const versionRecord: RegulatorySourceVersion = {
      id: generateUUIDv7(),
      source_id: source.id,
      version: params.newVersion,
      publication_date: params.publicationDate || source.publication_date,
      effective_date: params.effectiveDate || source.effective_date,
      content_text: params.newContentText,
      content_hash: hash,
      verified_by: params.verifiedBy,
      verified_at: new Date().toISOString(),
      summary_notes: params.summaryNotes
    };

    const history = RegulatorySourceRegistry.versions.get(source.id) || [];
    history.push(versionRecord);
    RegulatorySourceRegistry.versions.set(source.id, history);

    return { source, version: versionRecord };
  }

  public static resetForTesting(): void {
    RegulatorySourceRegistry.initializeCanonicalSources();
  }
}
