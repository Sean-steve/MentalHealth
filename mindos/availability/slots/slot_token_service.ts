/**
 * MindOS Slot Token Service - Cryptographic Tamper-Resistant Slot Tokens
 * Authority: ADR-034 Concurrency & Tamper Protection
 */

import crypto from 'crypto';
import { SlotTokenPayload } from '../domain/types.js';

const SLOT_SECRET = process.env.SLOT_SIGNING_SECRET || 'mindos-canonical-slot-signing-secret-kenya-2026';
const TOKEN_TTL_MS = 60 * 60 * 1000; // 60 minutes validity

export class SlotTokenService {
  public static generateToken(payload: Omit<SlotTokenPayload, 'generated_at'>): string {
    const fullPayload: SlotTokenPayload = {
      ...payload,
      generated_at: Date.now()
    };

    const data = JSON.stringify(fullPayload);
    const encodedData = Buffer.from(data).toString('base64url');
    const signature = crypto
      .createHmac('sha256', SLOT_SECRET)
      .update(encodedData)
      .digest('base64url');

    return `${encodedData}.${signature}`;
  }

  public static verifyToken(token: string): { valid: boolean; payload?: SlotTokenPayload; error?: string } {
    if (!token || !token.includes('.')) {
      return { valid: false, error: 'Malformed slot token format' };
    }

    const [encodedData, signature] = token.split('.');
    if (!encodedData || !signature) {
      return { valid: false, error: 'Malformed slot token components' };
    }

    const expectedSignature = crypto
      .createHmac('sha256', SLOT_SECRET)
      .update(encodedData)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return { valid: false, error: 'Invalid slot token signature (tamper detected)' };
    }

    try {
      const decodedJson = Buffer.from(encodedData, 'base64url').toString('utf8');
      const payload: SlotTokenPayload = JSON.parse(decodedJson);

      const age = Date.now() - payload.generated_at;
      if (age > TOKEN_TTL_MS) {
        return { valid: false, error: 'Slot token has expired' };
      }

      return { valid: true, payload };
    } catch {
      return { valid: false, error: 'Failed to decode slot token payload' };
    }
  }
}
