/**
 * MindOS AI Companion Runtime Canonical Bootstrap & Seeding
 * Authority: Master Architecture Index Section 7, Volumes I, IV, XV & Appendices B / C / H / Q
 */

import {
  AISystemRegistry,
  AIConfigurationEngine,
  PromptRegistry,
  AIToolRegistry,
  AIModelRegistry,
  AIProviderGovernanceService,
  AISystemType,
  AISystemState,
  PromptType,
  AIToolCategory
} from '../../ai_safety_governance/index.js';
import { COMPANION_TOOLS } from '../tools/definitions.js';

export class AICompanionBootstrap {
  public static async bootstrapCanonicalCompanion(): Promise<{
    systemId: string;
    configurationId: string;
  }> {
    const systemCode = 'ai-companion-ke';

    // 1. Ensure AISystem registered & active
    let system = AISystemRegistry.listSystems().find(s => s.code === systemCode);
    if (!system) {
      system = await AISystemRegistry.registerSystem({
        code: systemCode,
        name: 'MindOS Governed Conversational Companion (Kenya)',
        description: 'Supportive automated psychoeducation and wellbeing reflection companion.',
        system_type: AISystemType.CONVERSATIONAL_SUPPORT,
        owner_domain: 'clinical',
        owner: 'dr_amina_clinical_lead',
        purpose: 'Non-clinical supportive reflection, guided exercises, and verified crisis resource triage',
        user_population: ['ADULTS_18_PLUS'],
        jurisdictions: ['KE'],
        data_categories: ['IDENTITY_BASIC', 'SESSION_TEXT', 'PREFERENCES'],
        clinical_relevance: false
      });
    }

    // Ensure system is in ACTIVE state
    if (system.state !== AISystemState.ACTIVE && system.state !== AISystemState.APPROVED) {
      AISystemRegistry.updateState(system.id, AISystemState.ACTIVE, 'BOOTSTRAP');
      system = AISystemRegistry.getSystem(system.id);
    }

    // 2. Ensure prompts registered & approved
    const prompts = [
      {
        code: 'companion_persona',
        name: 'MindOS Companion Persona',
        text: 'You are MindOS Companion, an automated supportive wellbeing companion in Kenya. You offer empathetic, calm, reflective psychoeducational support.'
      },
      {
        code: 'clinical_boundaries',
        name: 'MindOS Clinical Boundaries',
        text: 'You do not provide medical diagnosis, psychiatric evaluation, psychotherapy, or prescription medication advice. In any acute crisis, direct the user to verified emergency contacts.'
      }
    ];

    const promptVersions: Record<string, number> = {};

    for (const p of prompts) {
      let promptEntity = PromptRegistry.listPromptsForSystem(system.id).find(pr => pr.prompt_code === p.code);
      let vNum = 1;
      if (!promptEntity) {
        const { prompt, initial_version } = await PromptRegistry.registerPrompt({
          prompt_code: p.code,
          ai_system_id: system.id,
          name: p.name,
          prompt_type: PromptType.SYSTEM,
          owner_id: 'dr_amina_clinical_lead',
          initial_content: p.text
        });
        promptEntity = prompt;
        vNum = initial_version.version;
      }

      // Approve prompt version if not already approved
      const pVer = PromptRegistry.getVersion(p.code, vNum);
      if (pVer.status !== 'APPROVED') {
        PromptRegistry.approveVersion(p.code, vNum, 'dr_amina_clinical_lead');
      }
      promptVersions[p.code] = vNum;
    }

    // 3. Ensure companion tools registered & active in AIToolRegistry
    const toolCodes: string[] = [];
    for (const [code, toolDef] of Object.entries(COMPANION_TOOLS)) {
      try {
        AIToolRegistry.getTool(code);
      } catch {
        await AIToolRegistry.registerTool({
          code,
          name: toolDef.name,
          description: toolDef.description,
          capability: code,
          risk_class: 'LOW',
          category: toolDef.category === 'READ_ONLY' ? AIToolCategory.READ_ONLY : AIToolCategory.INTERNAL_STATE_MUTATION,
          required_authorization: toolDef.required_authorizations || [],
          required_purpose: 'SUPPORTIVE_REFLECTION',
          required_consent: toolDef.required_consents || [],
          input_schema: toolDef.input_schema
        });
      }
      toolCodes.push(code);
    }

    // 4. Ensure AIConfiguration exists & active
    const existingConfigs = AIConfigurationEngine.listConfigurationsForSystem(system.id);
    let activeConfig = existingConfigs.find(c => c.version === '1.0.0');

    if (!activeConfig) {
      activeConfig = await AIConfigurationEngine.createConfiguration({
        ai_system_id: system.id,
        version: '1.0.0',
        provider_id: '01918c00-0002-7000-8000-000000000002', // Google Vertex AI
        model_id: 'MOD-GEMINI-15-PRO-002',
        model_version: '1.5.0-pro-002',
        prompt_versions: promptVersions,
        toolset_codes: toolCodes,
        jurisdiction: 'KE',
        population: 'ADULTS_18_PLUS'
      });
    }

    if (activeConfig.status !== 'ACTIVE' && activeConfig.status !== 'APPROVED') {
      AIConfigurationEngine.updateStatus(activeConfig.id, 'ACTIVE');
      activeConfig = AIConfigurationEngine.getConfiguration(activeConfig.id);
    }

    return {
      systemId: system.id,
      configurationId: activeConfig.id
    };
  }
}
