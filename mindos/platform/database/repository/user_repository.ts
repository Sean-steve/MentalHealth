/**
 * MindOS Canonical User Repository (Identity Domain)
 * Authority: Master Architecture Index Section 8, Volume I & ADR-012
 * 
 * Clean 3-tier boundary:
 * 1. Domain Entity: UserEntity
 * 2. Repository Mapper: UserMapper
 * 3. Database Model/Row: UserRow
 */

import { BaseRepository } from './base.js';
import { DatabaseClient } from '../connection.js';
import { UUID, UtcIsoTimestamp, OptimisticLockable } from '../types.js';
import { AccountState } from '../../shared/state_machines.js';
import { ConcurrencyError } from '../errors.js';
import { CursorPaginationQuery, PaginatedResult } from '../types.js';

// 1. Domain Entity
export interface UserEntity extends OptimisticLockable {
  id: UUID;
  emailNormalized: string;
  accountState: AccountState;
  emailVerifiedAt?: UtcIsoTimestamp | null;
  createdAt: UtcIsoTimestamp;
  updatedAt: UtcIsoTimestamp;
  deletionRequestedAt?: UtcIsoTimestamp | null;
  version: number;
}

// 2. Database Row Representation
export interface UserRow extends Record<string, unknown> {
  id: string;
  email_normalized: string;
  account_state: string;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
  deletion_requested_at: string | null;
  version: number;
}

// 3. Repository Mapper
export class UserMapper {
  public static toDomain(row: UserRow): UserEntity {
    return {
      id: row.id,
      emailNormalized: row.email_normalized,
      accountState: row.account_state as AccountState,
      emailVerifiedAt: row.email_verified_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletionRequestedAt: row.deletion_requested_at,
      version: Number(row.version)
    };
  }

  public static toRow(entity: UserEntity): UserRow {
    return {
      id: entity.id,
      email_normalized: entity.emailNormalized.trim().toLowerCase(),
      account_state: entity.accountState,
      email_verified_at: entity.emailVerifiedAt || null,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
      deletion_requested_at: entity.deletionRequestedAt || null,
      version: entity.version
    };
  }
}

// 4. Domain-Specific Repository
export class UserRepository extends BaseRepository<UserEntity, UserRow, UUID> {
  constructor(client: DatabaseClient) {
    super(client, 'users');
  }

  protected toDomain(row: UserRow): UserEntity {
    return UserMapper.toDomain(row);
  }

  protected toRow(entity: UserEntity): UserRow {
    return UserMapper.toRow(entity);
  }

  public async findById(id: UUID): Promise<UserEntity | null> {
    const rows = await this.client.query<UserRow>(
      `SELECT * FROM users WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) return null;
    return this.toDomain(rows[0]);
  }

  public async findByNormalizedEmail(email: string): Promise<UserEntity | null> {
    const normalized = email.trim().toLowerCase();
    const rows = await this.client.query<UserRow>(
      `SELECT * FROM users WHERE email_normalized = $1`,
      [normalized]
    );
    if (rows.length === 0) return null;
    return this.toDomain(rows[0]);
  }

  public async save(entity: UserEntity): Promise<UserEntity> {
    const row = this.toRow(entity);
    const existing = await this.findById(entity.id);

    if (!existing) {
      // Insert
      await this.client.query(
        `INSERT INTO users (
          id, email_normalized, account_state, email_verified_at,
          created_at, updated_at, deletion_requested_at, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          row.id,
          row.email_normalized,
          row.account_state,
          row.email_verified_at,
          row.created_at,
          row.updated_at,
          row.deletion_requested_at,
          row.version
        ]
      );
      return entity;
    } else {
      // Optimistic Concurrency Update
      const rows = await this.client.query<UserRow>(
        `UPDATE users SET
          email_normalized = $1, account_state = $2, email_verified_at = $3,
          deletion_requested_at = $4 WHERE id = $5 AND version = $6`,
        [
          row.email_normalized,
          row.account_state,
          row.email_verified_at,
          row.deletion_requested_at,
          row.id,
          entity.version
        ]
      );

      return {
        ...entity,
        version: entity.version + 1,
        updatedAt: new Date().toISOString()
      };
    }
  }

  public async listActive(query: CursorPaginationQuery = {}): Promise<PaginatedResult<UserEntity>> {
    const rows = await this.client.query<UserRow>(
      `SELECT * FROM users WHERE account_state = $1 LIMIT $2`,
      [AccountState.ACTIVE, (query.limit || 20) + 1]
    );
    const domainEntities = rows.map(r => this.toDomain(r));
    return this.paginateRows(domainEntities, query, u => u.id);
  }
}
