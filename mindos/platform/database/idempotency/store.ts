/**
 * MindOS Canonical Idempotency Store
 * Authority: Master Architecture Index Section 8, Volume III & API Catalog
 */

import { DatabaseClient } from '../connection.js';
import { IdempotencyRecord, IdempotencyStatus } from './types.js';
import { ConflictError } from '../../errors/index.js';
import { generateUUIDv7 } from '../uuid.js';

export class IdempotencyStore {
  private client: DatabaseClient;

  constructor(client: DatabaseClient) {
    this.client = client;
  }

  public async get(key: string, scope: string): Promise<IdempotencyRecord | null> {
    const rows = await this.client.query<IdempotencyRecord>(
      `SELECT * FROM idempotency_keys WHERE idempotency_key = $1`,
      [key]
    );
    const found = rows.find(r => r.scope === scope && r.idempotency_key === key);
    return found || null;
  }

  public async acquire(
    key: string,
    scope: string,
    requestHash: string,
    ttlHours = 24
  ): Promise<{ acquired: boolean; existingRecord?: IdempotencyRecord }> {
    const existing = await this.get(key, scope);
    if (existing) {
      if (existing.status === IdempotencyStatus.COMPLETED) {
        return { acquired: false, existingRecord: existing };
      }
      if (existing.status === IdempotencyStatus.STARTED) {
        throw new ConflictError(
          `IDEMPOTENCY_CONFLICT: Operation for key "${key}" in scope "${scope}" is currently in progress.`
        );
      }
    }

    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
    const newRecord: IdempotencyRecord = {
      id: generateUUIDv7(),
      idempotency_key: key,
      scope,
      request_hash: requestHash,
      status: IdempotencyStatus.STARTED,
      expires_at: expiresAt,
      created_at: new Date().toISOString()
    };

    await this.client.query(
      `INSERT INTO idempotency_keys (
        id, idempotency_key, scope, request_hash, response_status, response_body, status, expires_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        newRecord.id,
        newRecord.idempotency_key,
        newRecord.scope,
        newRecord.request_hash,
        null,
        null,
        newRecord.status,
        newRecord.expires_at,
        newRecord.created_at
      ]
    );

    return { acquired: true };
  }

  public async complete(
    key: string,
    scope: string,
    responseStatus: number,
    responseBody: unknown
  ): Promise<void> {
    await this.client.query(
      `UPDATE idempotency_keys SET status = $1, response_status = $2, response_body = $3 WHERE idempotency_key = $4`,
      [
        IdempotencyStatus.COMPLETED,
        responseStatus,
        typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody),
        key
      ]
    );
  }
}
