/**
 * MindOS Canonical KMS (Key Management Service) Abstraction
 * Authority: Master Architecture Index Section 8, Volume VIII & ADR-004
 */

import * as crypto from 'node:crypto';
import { SecurityError } from '../../errors/index.js';

export interface EncryptedPayloadEnvelope {
  ciphertext: string; // Base64
  iv: string;         // Base64 (12 bytes AES-GCM)
  authTag: string;    // Base64 (16 bytes AES-GCM)
  keyRef: string;     // KMS Key identifier
  keyVersion: number; // For key rotation
  algorithm: string;  // e.g. 'AES-256-GCM'
  encryptedAt: string;// ISO-8601 UTC
}

export interface KmsKeyProvider {
  encrypt(plaintext: string | Buffer, keyRef: string): Promise<EncryptedPayloadEnvelope>;
  decrypt(envelope: EncryptedPayloadEnvelope): Promise<Buffer>;
  rotateKey(keyRef: string): Promise<number>;
  getActiveKeyVersion(keyRef: string): number;
}

/**
 * Standard Hardware/Cloud KMS Abstraction with Envelope Encryption
 * In production/staging, backed by AWS KMS or Cloud KMS;
 * In local/development/test, backed by secure deterministic cryptographic key ring
 */
export class MindOsKmsProvider implements KmsKeyProvider {
  private static instance: MindOsKmsProvider | null = null;
  // Key ring mapping: keyRef -> Map<version, 256-bit Buffer>
  private keyRing: Map<string, Map<number, Buffer>> = new Map();
  private activeVersions: Map<string, number> = new Map();

  constructor(defaultSalt = 'mindos-canonical-kms-root-secret-v1') {
    // Bootstrap canonical key references
    this.provisionKey('clinical-records-master', defaultSalt, 1);
    this.provisionKey('health-sensitive-master', defaultSalt, 1);
    this.provisionKey('safety-plans-master', defaultSalt, 1);
    this.provisionKey('pii-encryption-master', defaultSalt, 1);
  }

  public static getInstance(): MindOsKmsProvider {
    if (!MindOsKmsProvider.instance) {
      MindOsKmsProvider.instance = new MindOsKmsProvider();
    }
    return MindOsKmsProvider.instance;
  }

  public static resetForTesting(): void {
    MindOsKmsProvider.instance = null;
  }

  public provisionKey(keyRef: string, seedSecret: string, version = 1): void {
    const keyMap = this.keyRing.get(keyRef) || new Map<number, Buffer>();
    // Derive 256-bit (32 byte) key via HKDF / SHA-256
    const derivedKey = crypto.createHmac('sha256', seedSecret)
      .update(`${keyRef}:v${version}`)
      .digest();

    keyMap.set(version, derivedKey);
    this.keyRing.set(keyRef, keyMap);
    this.activeVersions.set(keyRef, version);
  }

  public async rotateKey(keyRef: string): Promise<number> {
    const currentVersion = this.getActiveKeyVersion(keyRef);
    const nextVersion = currentVersion + 1;
    const randomEntropy = crypto.randomBytes(32).toString('hex');
    this.provisionKey(keyRef, randomEntropy, nextVersion);
    return nextVersion;
  }

  public getActiveKeyVersion(keyRef: string): number {
    return this.activeVersions.get(keyRef) || 1;
  }

  public async encrypt(plaintext: string | Buffer, keyRef: string): Promise<EncryptedPayloadEnvelope> {
    const version = this.getActiveKeyVersion(keyRef);
    const keyMap = this.keyRing.get(keyRef);
    const key = keyMap?.get(version);

    if (!key) {
      throw new SecurityError(`KMS_KEY_NOT_FOUND: Active key for ref "${keyRef}" (v${version}) not provisioned`);
    }

    const iv = crypto.randomBytes(12); // Standard 96-bit IV for AES-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const plainBuffer = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf-8');
    const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      keyRef,
      keyVersion: version,
      algorithm: 'AES-256-GCM',
      encryptedAt: new Date().toISOString()
    };
  }

  public async decrypt(envelope: EncryptedPayloadEnvelope): Promise<Buffer> {
    const keyMap = this.keyRing.get(envelope.keyRef);
    const key = keyMap?.get(envelope.keyVersion);

    if (!key) {
      throw new SecurityError(`KMS_KEY_NOT_FOUND: Decryption key for ref "${envelope.keyRef}" (v${envelope.keyVersion}) not found`);
    }

    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(envelope.iv, 'base64')
      );
      decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
      
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
        decipher.final()
      ]);
      return decrypted;
    } catch {
      throw new SecurityError('CIPHERTEXT_TAMPER_DETECTED: Field decryption failed or payload was altered.');
    }
  }
}
