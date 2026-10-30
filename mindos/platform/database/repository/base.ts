/**
 * MindOS Canonical Repository Foundation
 * Authority: Master Architecture Index Section 8, Volume III & ADR-012
 * 
 * Rules:
 * - Domain entity <-> Repository Mapper <-> Database Row separation.
 * - Preserves enums, UTC dates, precision, versions.
 * - Participates in Unit of Work.
 * - Supports Cursor Pagination.
 */

import { DatabaseClient } from '../connection.js';
import { CursorPaginationQuery, PaginatedResult } from '../types.js';

export interface IRepository<TDomain, TId = string> {
  findById(id: TId): Promise<TDomain | null>;
  save(entity: TDomain): Promise<TDomain>;
}

export abstract class BaseRepository<TDomain, TRow extends Record<string, unknown>, TId = string>
  implements IRepository<TDomain, TId> {
  protected client: DatabaseClient;
  protected tableName: string;

  constructor(client: DatabaseClient, tableName: string) {
    this.client = client;
    this.tableName = tableName;
  }

  protected abstract toDomain(row: TRow): TDomain;
  protected abstract toRow(entity: TDomain): TRow;

  public abstract findById(id: TId): Promise<TDomain | null>;
  public abstract save(entity: TDomain): Promise<TDomain>;

  /**
   * Universal cursor pagination helper (Section 47)
   */
  protected paginateRows<T>(
    rows: T[],
    cursorQuery: CursorPaginationQuery = {},
    getCursor: (item: T) => string
  ): PaginatedResult<T> {
    const limit = cursorQuery.limit || 20;
    const items = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const nextCursor = hasMore && items.length > 0 ? getCursor(items[items.length - 1]) : undefined;

    return {
      items,
      nextCursor,
      hasMore,
      totalEstimate: rows.length
    };
  }
}
