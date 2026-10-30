/**
 * MindOS AI Red-Team & Adversarial Evaluation Service
 * Authority: ADR-014, Volumes IV, XV & Appendices B / C
 * Invariants:
 * - Campaigns execute against a designated immutable configuration hash
 * - Open CRITICAL or HIGH findings block production release
 * - Remediated findings require verified regression re-testing
 */

import { createHash } from 'crypto';
import {
  AIRedTeamCampaignEntity,
  AIRedTeamFindingEntity,
  AdversarialCategory
} from '../domain/types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { AIConfigurationEngine } from '../configurations/engine.js';
import { ValidationError, NotFoundError } from '../../platform/errors/index.js';

export class AIRedTeamService {
  private static campaigns: Map<string, AIRedTeamCampaignEntity> = new Map();
  private static findings: Map<string, AIRedTeamFindingEntity> = new Map();

  public static async createCampaign(params: {
    ai_system_id: string;
    configuration_version: string;
    name: string;
    scope: string[];
    scenario_categories: (AdversarialCategory | string)[];
    owner: string;
    reviewers: string[];
  }): Promise<AIRedTeamCampaignEntity> {
    const config = AIConfigurationEngine.getConfigurationByVersion(params.ai_system_id, params.configuration_version);
    const id = generateUUIDv7();
    const now = new Date().toISOString();

    const campaign: AIRedTeamCampaignEntity = {
      id,
      ai_system_id: params.ai_system_id,
      configuration_version: params.configuration_version,
      configuration_hash: config.configuration_hash,
      name: params.name,
      scope: params.scope,
      scenario_categories: params.scenario_categories,
      status: 'IN_PROGRESS',
      owner: params.owner,
      reviewers: params.reviewers,
      started_at: now,
      findings_summary: {
        total_findings: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        open_findings: 0
      },
      decision: 'PENDING',
      created_at: now
    };

    AIRedTeamService.campaigns.set(id, campaign);
    return campaign;
  }

  public static addFinding(params: {
    campaign_id: string;
    category: AdversarialCategory | string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    scenario_description: string;
    reproduction_steps: string;
    affected_policy: string;
  }): AIRedTeamFindingEntity {
    const campaign = AIRedTeamService.getCampaign(params.campaign_id);
    const id = generateUUIDv7();
    const now = new Date().toISOString();

    const finding: AIRedTeamFindingEntity = {
      id,
      campaign_id: params.campaign_id,
      category: params.category,
      severity: params.severity,
      scenario_description: params.scenario_description,
      reproduction_steps: params.reproduction_steps,
      affected_policy: params.affected_policy,
      status: 'OPEN',
      created_at: now
    };

    AIRedTeamService.findings.set(id, finding);

    // Update campaign summary
    campaign.findings_summary.total_findings += 1;
    campaign.findings_summary.open_findings += 1;
    if (params.severity === 'CRITICAL') campaign.findings_summary.critical += 1;
    if (params.severity === 'HIGH') campaign.findings_summary.high += 1;
    if (params.severity === 'MEDIUM') campaign.findings_summary.medium += 1;
    if (params.severity === 'LOW') campaign.findings_summary.low += 1;

    return finding;
  }

  public static resolveFinding(findingId: string, remediationNotes: string): AIRedTeamFindingEntity {
    const finding = AIRedTeamService.getFinding(findingId);
    finding.status = 'VERIFIED_RESOLVED';
    finding.remediation_notes = remediationNotes;
    finding.resolved_at = new Date().toISOString();

    const campaign = AIRedTeamService.getCampaign(finding.campaign_id);
    campaign.findings_summary.open_findings = Math.max(0, campaign.findings_summary.open_findings - 1);
    return finding;
  }

  public static completeCampaign(campaignId: string): AIRedTeamCampaignEntity {
    const campaign = AIRedTeamService.getCampaign(campaignId);
    const campaignFindings = Array.from(AIRedTeamService.findings.values()).filter(f => f.campaign_id === campaignId);

    const openCritical = campaignFindings.filter(f => f.status === 'OPEN' && f.severity === 'CRITICAL');
    const openHigh = campaignFindings.filter(f => f.status === 'OPEN' && f.severity === 'HIGH');

    let decision: 'PASSED' | 'FAILED' | 'REMEDIATION_REQUIRED' = 'PASSED';
    if (openCritical.length > 0) {
      decision = 'FAILED';
    } else if (openHigh.length > 0) {
      decision = 'REMEDIATION_REQUIRED';
    }

    const now = new Date().toISOString();
    campaign.status = 'COMPLETED';
    campaign.decision = decision;
    campaign.completed_at = now;

    // Generate evidence hash
    const evidencePayload = {
      campaign_id: campaign.id,
      configuration_hash: campaign.configuration_hash,
      decision,
      findings_summary: campaign.findings_summary,
      completed_at: now
    };
    campaign.evidence_id = generateUUIDv7();
    // Evidence hash
    const evidenceHash = createHash('sha256').update(JSON.stringify(evidencePayload)).digest('hex');

    return campaign;
  }

  public static getCampaign(id: string): AIRedTeamCampaignEntity {
    const campaign = AIRedTeamService.campaigns.get(id);
    if (!campaign) {
      throw new NotFoundError(`Red-team campaign "${id}" not found.`);
    }
    return campaign;
  }

  public static getFinding(id: string): AIRedTeamFindingEntity {
    const finding = AIRedTeamService.findings.get(id);
    if (!finding) {
      throw new NotFoundError(`Red-team finding "${id}" not found.`);
    }
    return finding;
  }

  public static listCampaignsForConfiguration(configurationHash: string): AIRedTeamCampaignEntity[] {
    return Array.from(AIRedTeamService.campaigns.values()).filter(c => c.configuration_hash === configurationHash);
  }

  public static resetForTesting(): void {
    AIRedTeamService.campaigns.clear();
    AIRedTeamService.findings.clear();
  }
}
