/**
 * MindOS Private Governance Evidence Storage Engine
 * Authority: Master Architecture Index Section 14, Volumes III, XIV, XV, Appendix B & Q
 * ADR-025
 */

import { createHash, randomBytes } from 'node:crypto';
import { DataClassification } from '../../../shared/data_classification.js';
import { EvidenceIntegrityError } from '../../domain/errors.js';

export interface StorageObject {
  storage_reference: string;
  content: Buffer;
  content_hash: string;
  mime_type: string;
  size_bytes: number;
  classification: DataClassification | string;
  created_at: string;
}

export interface SignedAccessGrant {
  token: string;
  storage_reference: string;
  expires_at: string;
}

export class PrivateEvidenceStorage {
  private static storageBucket: Map<string, StorageObject> = new Map();
  private static accessGrants: Map<string, SignedAccessGrant> = new Map();

  /**
   * Stores evidence content securely and returns content_hash and storage_reference
   */
  public static async put(
    evidenceId: string,
    content: string | Buffer,
    mimeType = 'application/json',
    classification: DataClassification | string = DataClassification.SENSITIVE
  ): Promise<{ storage_reference: string; content_hash: string; size_bytes: number }> {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
    const content_hash = createHash('sha256').update(buffer).digest('hex');
    const storage_reference = `vault://evidence/${evidenceId}/${Date.now()}_${content_hash.substring(0, 12)}`;

    const obj: StorageObject = {
      storage_reference,
      content: buffer,
      content_hash,
      mime_type: mimeType,
      size_bytes: buffer.length,
      classification,
      created_at: new Date().toISOString()
    };

    PrivateEvidenceStorage.storageBucket.set(storage_reference, obj);
    return { storage_reference, content_hash, size_bytes: buffer.length };
  }

  /**
   * Generates a short-lived (e.g. 15 minutes) signed access grant for an authorized actor
   */
  public static generateSignedAccess(storageReference: string, validitySeconds = 900): SignedAccessGrant {
    const obj = PrivateEvidenceStorage.storageBucket.get(storageReference);
    if (!obj) {
      throw new Error(`Evidence storage object not found: ${storageReference}`);
    }

    const token = randomBytes(24).toString('hex');
    const expires_at = new Date(Date.now() + validitySeconds * 1000).toISOString();
    const grant: SignedAccessGrant = {
      token,
      storage_reference: storageReference,
      expires_at
    };

    PrivateEvidenceStorage.accessGrants.set(token, grant);
    return grant;
  }

  /**
   * Retrieves content using signed access token with integrity validation
   */
  public static async getByToken(token: string): Promise<{ content: Buffer; mime_type: string; content_hash: string }> {
    const grant = PrivateEvidenceStorage.accessGrants.get(token);
    if (!grant) {
      throw new Error('Invalid or expired evidence access token');
    }

    if (new Date(grant.expires_at).getTime() < Date.now()) {
      PrivateEvidenceStorage.accessGrants.delete(token);
      throw new Error('Evidence access token has expired');
    }

    const obj = PrivateEvidenceStorage.storageBucket.get(grant.storage_reference);
    if (!obj) {
      throw new Error('Evidence content object missing in storage');
    }

    // Verify content integrity on read
    const verifyHash = createHash('sha256').update(obj.content).digest('hex');
    if (verifyHash !== obj.content_hash) {
      throw new EvidenceIntegrityError('Stored content failed SHA-256 checksum verification');
    }

    return { content: obj.content, mime_type: obj.mime_type, content_hash: obj.content_hash };
  }

  /**
   * Retrieves raw content by storage reference for internal verified processes
   */
  public static getByReference(storageReference: string): StorageObject | undefined {
    return PrivateEvidenceStorage.storageBucket.get(storageReference);
  }

  public static resetForTesting(): void {
    PrivateEvidenceStorage.storageBucket.clear();
    PrivateEvidenceStorage.accessGrants.clear();
  }
}
