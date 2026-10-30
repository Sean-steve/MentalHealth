/**
 * MindOS Kenya Regulatory Profile & Control Matrix
 * Authority: Volumes III, XV & Appendix I
 * Consolidates the complete Kenya regulatory governance profile.
 */

import { JurisdictionRegistry } from './registry.js';
import { RegulatoryAuthorityRegistry } from '../authorities/registry.js';
import { RegulatorySourceRegistry } from '../sources/registry.js';
import { RegulatoryRequirementRegistry } from '../requirements/registry.js';
import { RegulatoryControlRegistry } from '../controls/registry.js';

export class KenyaRegulatoryProfile {
  public static readonly JURISDICTION_CODE = 'KE';
  public static readonly PROFILE_VERSION = '1.0.0';

  public static initialize(): void {
    JurisdictionRegistry.initializeCanonicalJurisdictions();
    RegulatoryAuthorityRegistry.initializeCanonicalAuthorities();
    RegulatorySourceRegistry.initializeCanonicalSources();
    RegulatoryRequirementRegistry.initializeCanonicalRequirements();
    RegulatoryControlRegistry.initializeCanonicalControls();
  }

  public static getOverview(): {
    jurisdiction: unknown;
    authorities: unknown[];
    sources: unknown[];
    requirements: unknown[];
    controls: unknown[];
    totalRequirements: number;
    totalControls: number;
  } {
    const jur = JurisdictionRegistry.get('KE');
    const authorities = RegulatoryAuthorityRegistry.list('KE');
    const sources = RegulatorySourceRegistry.list('KE');
    const requirements = RegulatoryRequirementRegistry.list('KE');
    const controls = RegulatoryControlRegistry.list('KE');

    return {
      jurisdiction: jur,
      authorities,
      sources,
      requirements,
      controls,
      totalRequirements: requirements.length,
      totalControls: controls.length
    };
  }
}
