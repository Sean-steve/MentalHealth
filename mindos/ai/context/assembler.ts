/**
 * MindOS Governed AI Context Assembler
 * Authority: Master Architecture Index Section 7, Volumes I, IV, XV & Appendices B / C / H / Q
 * 
 * Assembles context across T0..T5 adhering strictly to minimum necessary disclosure:
 * - T0: Persona, statutory non-diagnostic disclaimers, clinical boundaries
 * - T1: Demographics (locale, jurisdiction, age bracket)
 * - T2: Current non-clinical wellbeing state
 * - T3: Bounded sliding turn history
 * - T4: Governed psychoeducational content chunks
 * - T5: Governed user memories (requires active AI_MEMORY consent)
 */

import { AIContextBundle, ConversationRole, AIMemoryEntity } from '../domain/types.js';
import { CANONICAL_AI_NON_DIAGNOSTIC_DISCLAIMER } from '../domain/invariants.js';
import { ConversationMessage } from '../domain/message.js';
import { ContentRetrievalChunk } from '../../content/domain/types.js';
import { ConsentService } from '../../consent/index.js';
import { MemoryRepository } from '../repositories/memory_repository.js';
import { AIContextFirewall } from './firewall.js';
import { ContextManifestGenerator } from './manifest.js';

export interface ContextAssemblyParams {
  userId: string;
  personaText: string;
  boundariesText: string;
  locale?: string;
  jurisdiction?: string;
  recentMessages?: ConversationMessage[];
  retrievedChunks?: ContentRetrievalChunk[];
  moodScore?: number;
  wellbeingSummary?: string;
}

export class ContextAssembler {
  public static async assemble(params: ContextAssemblyParams): Promise<AIContextBundle> {
    // T0: System Persona & Disclaimers
    const tier_t0 = {
      system_persona: params.personaText,
      statutory_disclaimers: [CANONICAL_AI_NON_DIAGNOSTIC_DISCLAIMER],
      clinical_boundaries: [params.boundariesText]
    };

    // T1: Demographics
    const tier_t1 = {
      locale: params.locale || 'en-KE',
      jurisdiction: params.jurisdiction || 'KE',
      age_bracket: 'ADULT_18_PLUS'
    };

    // T2: Wellbeing state
    const tier_t2 = {
      current_mood_score: params.moodScore,
      non_clinical_checkin_summary: params.wellbeingSummary
    };

    // T3: Sliding turn history (last 8 messages max)
    const rawMessages = params.recentMessages || [];
    const tier_t3 = rawMessages.slice(-8).map(m => ({
      role: m.role,
      content: m.content
    }));

    // T4: Retrieved psychoeducation chunks (already verified published and stamped)
    const tier_t4 = params.retrievedChunks || [];

    // T5: User memories (Consent gated: 'AI_MEMORY')
    let tier_t5: AIMemoryEntity[] = [];
    const hasMemoryConsent = ConsentService.hasActiveConsent(params.userId, 'AI_MEMORY');
    if (hasMemoryConsent) {
      tier_t5 = await MemoryRepository.getActiveMemoriesForUser(params.userId);
    }

    // Context firewall checks on combined string representations
    for (const chunk of tier_t4) {
      AIContextFirewall.validateContentText(chunk.content_text);
    }
    for (const mem of tier_t5) {
      AIContextFirewall.validateContentText(mem.memory_text);
    }

    const bundleWithoutHash = {
      tier_t0,
      tier_t1,
      tier_t2,
      tier_t3,
      tier_t4,
      tier_t5
    };

    const manifest_hash = ContextManifestGenerator.computeBundleHash(bundleWithoutHash);

    return {
      ...bundleWithoutHash,
      manifest_hash
    };
  }
}
