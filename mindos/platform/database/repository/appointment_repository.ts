/**
 * MindOS Canonical Appointment Repository (Appointments Domain)
 * Authority: Master Architecture Index Section 8, Volume V & ADR-012
 * 
 * Enforces:
 * - Domain Entity <-> Mapper <-> Database Row separation
 * - Optimistic concurrency locking (versioning)
 * - Exact minor units for currency
 * - Strict timezone awareness
 */

import { BaseRepository } from './base.js';
import { DatabaseClient } from '../connection.js';
import { UUID, UtcIsoTimestamp, Money, MoneyUtils, OptimisticLockable } from '../types.js';
import { CursorPaginationQuery, PaginatedResult } from '../types.js';

export enum AppointmentState {
  REQUESTED = 'REQUESTED',
  HELD = 'HELD',
  CONFIRMED = 'CONFIRMED',
  CANCELLED_BY_USER = 'CANCELLED_BY_USER',
  CANCELLED_BY_PROFESSIONAL = 'CANCELLED_BY_PROFESSIONAL',
  NO_SHOW = 'NO_SHOW',
  COMPLETED = 'COMPLETED'
}

// 1. Domain Entity
export interface AppointmentEntity extends OptimisticLockable {
  id: UUID;
  userId: UUID;
  professionalId: UUID;
  serviceId: UUID;
  state: AppointmentState;
  startsAt: UtcIsoTimestamp;
  endsAt: UtcIsoTimestamp;
  timezoneSnapshot: string;
  price: Money;
  idempotencyKey: string;
  createdAt: UtcIsoTimestamp;
  updatedAt: UtcIsoTimestamp;
  version: number;
}

// 2. Database Row Representation
export interface AppointmentRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  professional_id: string;
  service_id: string;
  state: string;
  starts_at: string;
  ends_at: string;
  timezone_snapshot: string;
  price_snapshot: string | Record<string, unknown>;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
  version: number;
}

// 3. Repository Mapper
export class AppointmentMapper {
  public static toDomain(row: AppointmentRow): AppointmentEntity {
    const rawPrice = typeof row.price_snapshot === 'string'
      ? JSON.parse(row.price_snapshot)
      : (row.price_snapshot || { amount_minor: 0, currency: 'KES' });

    return {
      id: row.id,
      userId: row.user_id,
      professionalId: row.professional_id,
      serviceId: row.service_id,
      state: row.state as AppointmentState,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      timezoneSnapshot: row.timezone_snapshot,
      price: MoneyUtils.fromMinor(rawPrice.amount_minor, rawPrice.currency),
      idempotencyKey: row.idempotency_key,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: Number(row.version)
    };
  }

  public static toRow(entity: AppointmentEntity): AppointmentRow {
    return {
      id: entity.id,
      user_id: entity.userId,
      professional_id: entity.professionalId,
      service_id: entity.serviceId,
      state: entity.state,
      starts_at: entity.startsAt,
      ends_at: entity.endsAt,
      timezone_snapshot: entity.timezoneSnapshot,
      price_snapshot: JSON.stringify({
        amount_minor: entity.price.amountMinor.toString(),
        currency: entity.price.currency
      }),
      idempotency_key: entity.idempotencyKey,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
      version: entity.version
    };
  }
}

// 4. Domain-Specific Repository
export class AppointmentRepository extends BaseRepository<AppointmentEntity, AppointmentRow, UUID> {
  constructor(client: DatabaseClient) {
    super(client, 'appointments');
  }

  protected toDomain(row: AppointmentRow): AppointmentEntity {
    return AppointmentMapper.toDomain(row);
  }

  protected toRow(entity: AppointmentEntity): AppointmentRow {
    return AppointmentMapper.toRow(entity);
  }

  public async findById(id: UUID): Promise<AppointmentEntity | null> {
    const rows = await this.client.query<AppointmentRow>(
      `SELECT * FROM appointments WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) return null;
    return this.toDomain(rows[0]);
  }

  public async findByIdempotencyKey(key: string): Promise<AppointmentEntity | null> {
    const rows = await this.client.query<AppointmentRow>(
      `SELECT * FROM appointments WHERE idempotency_key = $1`,
      [key]
    );
    if (rows.length === 0) return null;
    return this.toDomain(rows[0]);
  }

  public async save(entity: AppointmentEntity): Promise<AppointmentEntity> {
    const row = this.toRow(entity);
    const existing = await this.findById(entity.id);

    if (!existing) {
      // Insert
      await this.client.query(
        `INSERT INTO appointments (
          id, user_id, professional_id, service_id, state,
          starts_at, ends_at, timezone_snapshot, price_snapshot,
          idempotency_key, created_at, updated_at, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          row.id,
          row.user_id,
          row.professional_id,
          row.service_id,
          row.state,
          row.starts_at,
          row.ends_at,
          row.timezone_snapshot,
          row.price_snapshot,
          row.idempotency_key,
          row.created_at,
          row.updated_at,
          row.version
        ]
      );
      return entity;
    } else {
      // Optimistic Concurrency Update
      await this.client.query(
        `UPDATE appointments SET
          state = $1, starts_at = $2, ends_at = $3,
          price_snapshot = $4 WHERE id = $5 AND version = $6`,
        [
          row.state,
          row.starts_at,
          row.ends_at,
          row.price_snapshot,
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

  public async listForUser(userId: UUID, query: CursorPaginationQuery = {}): Promise<PaginatedResult<AppointmentEntity>> {
    const rows = await this.client.query<AppointmentRow>(
      `SELECT * FROM appointments WHERE user_id = $1 LIMIT $2`,
      [userId, (query.limit || 20) + 1]
    );
    const domainEntities = rows.map(r => this.toDomain(r));
    return this.paginateRows(domainEntities, query, a => a.id);
  }
}
