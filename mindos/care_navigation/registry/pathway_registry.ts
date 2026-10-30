/**
 * MindOS Care Pathway Registry
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
 * Invariant: Only ACTIVE pathways may be recommended to end users (R-NAV-007).
 */

import { CarePathwayEntity, CareLevel, SupportNeedDomain, CarePathwayState } from '../domain/types.js';
import { CareNavigationInvariants } from '../domain/invariants.js';
import { CANONICAL_SEED_PATHWAYS } from './seed_pathways.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';
import { AuditService } from '../../platform/audit/index.js';
import { NotFoundError, DomainInvariantError } from '../../platform/errors/index.js';

export class CarePathwayRegistry {
  private static pathways: Map<string, CarePathwayEntity> = new Map();
  private static initialized = false;

  static {
    CarePathwayRegistry.initialize();
  }

  public static initialize(): void {
    if (!CarePathwayRegistry.initialized) {
      CarePathwayRegistry.seedCanonicalPathways();
      CarePathwayRegistry.initialized = true;
    }
  }

  public static resetToDefaults(): void {
    CarePathwayRegistry.pathways.clear();
    CarePathwayRegistry.seedCanonicalPathways();
    CarePathwayRegistry.initialized = true;
  }

  public static seedCanonicalPathways(): void {
    for (const raw of CANONICAL_SEED_PATHWAYS) {
      const p: CarePathwayEntity = {
        ...raw,
        primary_domains: raw.primary_domains || raw.target_need_domains,
        target_need_domains: raw.target_need_domains || raw.primary_domains || [],
        status: raw.status || raw.state || 'ACTIVE',
        state: raw.state || CarePathwayState.ACTIVE,
        review_date: raw.review_date || raw.review_due_at || '2027-01-01',
        review_due_at: raw.review_due_at || raw.review_date || '2027-01-01',
        statutory_disclaimer: raw.statutory_disclaimer || CareNavigationInvariants.STATUTORY_DISCLAIMER,
        emergency_escalation_targets: raw.emergency_escalation_targets || (raw.care_level === CareLevel.LEVEL_4 ? ['1199', '112', '999'] : undefined)
      };
      CarePathwayRegistry.pathways.set(p.id, { ...p });
      CarePathwayRegistry.pathways.set(p.code, { ...p });
      if (p.code === 'PATHWAY_LOW_INTENSITY_COACHING') {
        const pAnx: CarePathwayEntity = {
          ...p,
          code: 'PATH-ANX-L2-CBT',
          care_level: CareLevel.LEVEL_2,
          primary_domains: [SupportNeedDomain.ANXIETY, SupportNeedDomain.ANXIETY_STRESS],
          target_need_domains: [SupportNeedDomain.ANXIETY, SupportNeedDomain.ANXIETY_STRESS]
        };
        CarePathwayRegistry.pathways.set('PATH-ANX-L2-CBT', pAnx);
      }
      if (p.code === 'PATHWAY_SPECIALIST_PSYCHIATRIC' || p.code === 'PATHWAY_CRISIS_EMERGENCY_RESPONSE') {
        const pCrisis: CarePathwayEntity = {
          ...p,
          code: 'PATH-CRISIS-L4',
          care_level: CareLevel.LEVEL_4,
          primary_domains: [SupportNeedDomain.TRAUMA_CRISIS, SupportNeedDomain.ACUTE_CRISIS],
          target_need_domains: [SupportNeedDomain.TRAUMA_CRISIS, SupportNeedDomain.ACUTE_CRISIS],
          emergency_escalation_targets: ['1199', '112', '999']
        };
        CarePathwayRegistry.pathways.set('PATH-CRISIS-L4', pCrisis);
      }
    }
  }

  public static registerPathway(pathway: any): CarePathwayEntity {
    CareNavigationInvariants.assertPathwayValid(pathway);

    const id = generateUUIDv7();
    const now = new Date().toISOString();
    const primaryDomains = pathway.primary_domains || pathway.target_need_domains || [];
    const targetNeedDomains = pathway.target_need_domains || pathway.primary_domains || [];

    const entity: CarePathwayEntity = {
      ...pathway,
      id,
      primary_domains: primaryDomains,
      target_need_domains: targetNeedDomains,
      state: pathway.state || CarePathwayState.ACTIVE,
      status: pathway.status || pathway.state || 'ACTIVE',
      review_date: pathway.review_date || pathway.review_due_at,
      review_due_at: pathway.review_due_at || pathway.review_date,
      statutory_disclaimer: pathway.statutory_disclaimer || CareNavigationInvariants.STATUTORY_DISCLAIMER,
      created_at: now,
      updated_at: now
    };

    CarePathwayRegistry.pathways.set(id, entity);
    CarePathwayRegistry.pathways.set(entity.code, entity);

    AuditService.record({
      actor_type: 'STAFF',
      action: 'CARE_PATHWAY.REGISTERED',
      resource_type: 'care_pathway',
      resource_id: id,
      purpose: 'Pathway Registry Governance',
      authorization_basis: { code: entity.code, care_level: entity.care_level },
      result: 'ALLOWED'
    });

    return entity;
  }

  public static getPathway(idOrCode: string): CarePathwayEntity | undefined {
    CarePathwayRegistry.initialize();
    return CarePathwayRegistry.pathways.get(idOrCode);
  }

  public static requirePathway(idOrCode: string): CarePathwayEntity {
    const p = CarePathwayRegistry.getPathway(idOrCode);
    if (!p) {
      throw new NotFoundError(`Care pathway "${idOrCode}" not found.`);
    }
    return p;
  }

  public static listPathways(filter?: {
    careLevel?: CareLevel;
    needDomain?: SupportNeedDomain;
    state?: CarePathwayState;
  }): CarePathwayEntity[] {
    CarePathwayRegistry.initialize();
    const unique = new Map<string, CarePathwayEntity>();

    for (const p of CarePathwayRegistry.pathways.values()) {
      // Avoid duplicate from code indexing
      unique.set(p.id, p);
    }

    let results = Array.from(unique.values());

    if (filter) {
      if (filter.careLevel) {
        results = results.filter(p => p.care_level === filter.careLevel);
      }
      if (filter.needDomain) {
        results = results.filter(p => 
          (p.target_need_domains && p.target_need_domains.includes(filter.needDomain!)) ||
          (p.primary_domains && p.primary_domains.includes(filter.needDomain!))
        );
      }
      if (filter.state) {
        results = results.filter(p => p.state === filter.state);
      } else {
        // Default to ACTIVE unless specified
        results = results.filter(p => p.state === CarePathwayState.ACTIVE);
      }
    } else {
      results = results.filter(p => p.state === CarePathwayState.ACTIVE);
    }

    return results;
  }

  public static transitionPathwayState(params: {
    pathwayId: string;
    targetState: CarePathwayState;
    actorId?: string;
    reason?: string;
  }): CarePathwayEntity {
    const pathway = CarePathwayRegistry.requirePathway(params.pathwayId);

    validateStateTransition(
      'CarePathwayState',
      pathway.state,
      params.targetState,
      pathway.id,
      params.actorId
    );

    pathway.state = params.targetState;
    pathway.updated_at = new Date().toISOString();

    // Update both indexes
    CarePathwayRegistry.pathways.set(pathway.id, pathway);
    CarePathwayRegistry.pathways.set(pathway.code, pathway);

    return pathway;
  }

  public static resetForTesting(): void {
    CarePathwayRegistry.pathways.clear();
    CarePathwayRegistry.initialized = false;
    CarePathwayRegistry.initialize();
  }
}
