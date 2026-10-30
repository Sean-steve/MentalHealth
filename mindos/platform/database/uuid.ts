/**
 * MindOS Canonical UUIDv7 Utility
 * Authority: Master Architecture Index Section 8, Volume III & Appendix B
 */

import { v4 as uuidv4, validate as uuidValidate } from 'uuid';

/**
 * Generates a standard UUID compatible with UUIDv7 time-ordered sorting
 */
export function generateUUIDv7(): string {
  // Use timestamp-prefixed UUID representation or standard RFC 4122 v4/v7
  const now = Date.now();
  const timeHex = now.toString(16).padStart(12, '0');
  const random = uuidv4().replace(/-/g, '').substring(12);
  const raw = `${timeHex}${random}`;
  
  // Format as standard 8-4-4-4-12 UUID
  return `${raw.substring(0, 8)}-${raw.substring(8, 12)}-7${raw.substring(13, 16)}-a${raw.substring(17, 20)}-${raw.substring(20, 32)}`;
}

export function isValidUUID(id: string): boolean {
  return typeof id === 'string' && (uuidValidate(id) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
}

export function extractTimestampFromUUIDv7(id: string): number {
  if (!isValidUUID(id)) {
    throw new Error(`Invalid UUID: ${id}`);
  }
  const clean = id.replace(/-/g, '');
  const timeHex = clean.substring(0, 12);
  return parseInt(timeHex, 16);
}

export const UUIDv7 = {
  generate: generateUUIDv7
};

