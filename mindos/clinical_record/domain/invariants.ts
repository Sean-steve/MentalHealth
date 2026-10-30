/**
 * MindOS Longitudinal Clinical Record Invariants & Clinical Governance Guards
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Clinical Safety Policy Catalogue (R-REC-001..008, ADR-016, ADR-028)
 */

import { DomainInvariantError, ClinicalTimelineAccessDeniedError } from '../../platform/errors/index.js';
import { ClinicalTimelineEntry } from './entities.js';
import { TimelineVisibilityScope, ClinicalProvenance } from './types.js';

export class ClinicalRecordInvariants {
  /**
   * R-REC-001: Timeline entry must reference a valid source record.
   */
  public static assertValidTimelineEntry(entry: Partial<ClinicalTimelineEntry>): void {
    if (!entry.subject_user_id) {
      throw new DomainInvariantError('Clinical timeline entry must have a valid subject_user_id.');
    }
    if (!entry.occurred_at || !entry.recorded_at) {
      throw new DomainInvariantError('Clinical timeline entry must declare distinct occurred_at and recorded_at timestamps.');
    }
    if (!entry.source_domain || !entry.source_type || !entry.source_id) {
      throw new DomainInvariantError('Clinical timeline entry must preserve authoritative source domain, source type, and source ID.');
    }
    if (!entry.provenance) {
      throw new DomainInvariantError('Clinical timeline entry must preserve strict clinical provenance.');
    }
    if (!entry.visibility_scope) {
      throw new DomainInvariantError('Clinical timeline entry must declare an explicit visibility_scope.');
    }
  }

  /**
   * R-REC-002: Immutability guard. Historical entries must not be silently edited.
   */
  public static assertTimelineImmutability(existing: ClinicalTimelineEntry, update: Partial<ClinicalTimelineEntry>): void {
    if (existing.source_id !== update.source_id || existing.source_domain !== update.source_domain) {
      throw new DomainInvariantError('Cannot mutate source references of an existing clinical timeline entry.');
    }
    if (existing.occurred_at !== update.occurred_at) {
      throw new DomainInvariantError('Cannot mutate historical occurred_at timestamp of a clinical timeline entry.');
    }
    if (existing.provenance !== update.provenance) {
      throw new DomainInvariantError('Cannot rewrite historical clinical provenance of a timeline entry.');
    }
  }

  /**
   * R-REC-005: AI inference restrictions on provenance.
   * AI inferences cannot masquerade as clinically assessed or professional recorded.
   */
  public static assertProvenanceIntegrity(declaredProvenance: ClinicalProvenance, actorRole: string): void {
    if (actorRole === 'AI' || actorRole === 'SYSTEM_AI') {
      if (
        declaredProvenance === ClinicalProvenance.CLINICALLY_ASSESSED ||
        declaredProvenance === ClinicalProvenance.PROFESSIONAL_RECORDED
      ) {
        throw new DomainInvariantError(
          `AI actor cannot declare provenance as ${declaredProvenance}. AI outputs must retain AI_INFERRED provenance.`
        );
      }
    }
  }

  /**
   * R-REC-006: User visibility filter guard.
   * Internal clinical governance and safety operations metadata must not be exposed to user.
   */
  public static filterEntryForViewer(entry: ClinicalTimelineEntry, viewerScope: 'USER' | 'PROFESSIONAL' | 'SAFETY'): boolean {
    if (viewerScope === 'USER') {
      // User can only see USER visibility items
      return entry.visibility_scope === TimelineVisibilityScope.USER;
    }
    if (viewerScope === 'PROFESSIONAL') {
      // Professional can see USER, PROFESSIONAL, CARE_TEAM
      return (
        entry.visibility_scope === TimelineVisibilityScope.USER ||
        entry.visibility_scope === TimelineVisibilityScope.PROFESSIONAL ||
        entry.visibility_scope === TimelineVisibilityScope.CARE_TEAM
      );
    }
    return true;
  }
}
