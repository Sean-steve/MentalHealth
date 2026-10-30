/**
 * MindOS Field-Level Encryption Engine
 * Authority: Master Architecture Index Section 8, Volume VIII & Appendix B
 * 
 * Rules (Section 31):
 * - Encrypted fields must not be logged
 * - Must not be used in ordinary analytics
 * - Must not be indexed in plaintext
 * - Must not be copied into error messages
 * - Supports key rotation
 */

import { EncryptedPayloadEnvelope, MindOsKmsProvider } from './kms.js';
import { DataClassification } from '../../shared/data_classification.js';
import { ClassificationRegistry } from '../classification_registry.js';
import { SecurityError } from '../../errors/index.js';

export class FieldEncryptor {
  private static get kms(): MindOsKmsProvider {
    return MindOsKmsProvider.getInstance();
  }

  /**
   * Encrypts a sensitive field string or object using KMS key reference
   */
  public static async encryptField(
    entityName: string,
    fieldName: string,
    value: unknown,
    overrideKeyRef?: string
  ): Promise<string> {
    if (value === null || value === undefined) {
      return '';
    }

    const fieldMeta = ClassificationRegistry.getField(entityName, fieldName);
    let keyRef = overrideKeyRef;

    if (!keyRef) {
      if (fieldMeta?.classification === DataClassification.CLINICAL_RECORD) {
        keyRef = 'clinical-records-master';
      } else if (fieldMeta?.classification === DataClassification.HEALTH_CRITICAL) {
        keyRef = 'safety-plans-master';
      } else {
        keyRef = 'health-sensitive-master';
      }
    }

    const stringified = typeof value === 'string' ? value : JSON.stringify(value);
    const envelope = await FieldEncryptor.kms.encrypt(stringified, keyRef);
    
    // Serialized storage envelope
    return JSON.stringify(envelope);
  }

  /**
   * Decrypts an encrypted field string back to its original representation
   */
  public static async decryptField<T = unknown>(serializedEnvelope: string): Promise<T> {
    if (!serializedEnvelope) {
      return null as unknown as T;
    }

    let envelope: EncryptedPayloadEnvelope;
    try {
      envelope = JSON.parse(serializedEnvelope) as EncryptedPayloadEnvelope;
      if (!envelope.ciphertext || !envelope.iv || !envelope.authTag || !envelope.keyRef) {
        throw new Error('Malformed envelope');
      }
    } catch {
      throw new SecurityError('INVALID_ENCRYPTION_ENVELOPE: Target field is not a valid encrypted envelope');
    }

    const decryptedBuffer = await FieldEncryptor.kms.decrypt(envelope);
    const text = decryptedBuffer.toString('utf-8');

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  /**
   * Re-encrypts an existing encrypted field with the latest active key version (key rotation)
   */
  public static async reencryptForRotation(serializedEnvelope: string): Promise<string> {
    const envelope = JSON.parse(serializedEnvelope) as EncryptedPayloadEnvelope;
    const activeVersion = FieldEncryptor.kms.getActiveKeyVersion(envelope.keyRef);

    if (envelope.keyVersion === activeVersion) {
      // Already on active version
      return serializedEnvelope;
    }

    const decrypted = await FieldEncryptor.kms.decrypt(envelope);
    const newEnvelope = await FieldEncryptor.kms.encrypt(decrypted, envelope.keyRef);
    return JSON.stringify(newEnvelope);
  }
}
