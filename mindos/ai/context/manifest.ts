/**
 * MindOS Context Manifest Generator
 * Authority: ADR-008, Volumes I, IV, XV
 */

import { createHash } from 'crypto';
import { AIContextBundle } from '../domain/types.js';

export class ContextManifestGenerator {
  public static computeBundleHash(bundle: Omit<AIContextBundle, 'manifest_hash'>): string {
    const payload = {
      t0: bundle.tier_t0,
      t1: bundle.tier_t1,
      t2: bundle.tier_t2,
      t3: bundle.tier_t3.map(m => ({ role: m.role, len: m.content.length })),
      t4: bundle.tier_t4.map(c => c.chunk_id),
      t5: bundle.tier_t5.map(m => m.id)
    };
    return createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  }
}
