/**
 * MindOS Migration Architecture
 * Authority: Master Architecture Index Section 9, Volume III
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseManager } from './connection.js';
import { logger } from '../observability/logger.js';

export interface MigrationFile {
  version: string;
  name: string;
  filePath: string;
  sqlUp: string;
  sqlDown?: string;
}

export interface MigrationStatus {
  version: string;
  name: string;
  applied: boolean;
  applied_at?: string;
}

export class MigrationEngine {
  private static appliedMigrations: Map<string, string> = new Map();

  private static usesPersistentRegistry(): boolean {
    return String(process.env.MINDOS_DATABASE_DRIVER || '').toLowerCase() === 'postgres';
  }

  private static async hydratePersistentRegistry(): Promise<void> {
    if (!MigrationEngine.usesPersistentRegistry()) return;
    try {
      const client = DatabaseManager.getClient();
      const rows = await client.query<{ version: string; applied_at: string | Date }>(
        'SELECT version, applied_at FROM schema_migrations ORDER BY version'
      );
      MigrationEngine.appliedMigrations.clear();
      for (const row of rows) {
        const appliedAt = row.applied_at instanceof Date
          ? row.applied_at.toISOString()
          : String(row.applied_at);
        MigrationEngine.appliedMigrations.set(String(row.version), appliedAt);
      }
    } catch {
      // Migration 001 creates schema_migrations. Before that table exists, an empty registry is expected.
      MigrationEngine.appliedMigrations.clear();
    }
  }

  public static getMigrationsDirectory(): string {
    return path.join(process.cwd(), 'mindos', 'platform', 'database', 'migrations');
  }

  public static listAvailableMigrations(): MigrationFile[] {
    const dir = MigrationEngine.getMigrationsDirectory();
    if (!fs.existsSync(dir)) {
      return [];
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    return files.map(file => {
      const parts = file.replace('.sql', '').split('_');
      const version = parts[0];
      const name = parts.slice(1).join('_');
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      // Split UP and DOWN if indicated
      const downMarker = '-- DOWN --';
      let sqlUp = content;
      let sqlDown: string | undefined;

      if (content.includes(downMarker)) {
        const split = content.split(downMarker);
        sqlUp = split[0];
        sqlDown = split[1];
      }

      return {
        version,
        name,
        filePath,
        sqlUp,
        sqlDown
      };
    });
  }

  public static async status(): Promise<MigrationStatus[]> {
    await MigrationEngine.hydratePersistentRegistry();
    const available = MigrationEngine.listAvailableMigrations();
    return available.map(m => {
      const appliedAt = MigrationEngine.appliedMigrations.get(m.version);
      return {
        version: m.version,
        name: m.name,
        applied: !!appliedAt,
        applied_at: appliedAt
      };
    });
  }

  public static async apply(): Promise<{ applied: string[]; total: number }> {
    const available = MigrationEngine.listAvailableMigrations();
    const applied: string[] = [];
    const client = DatabaseManager.getClient();

    await MigrationEngine.hydratePersistentRegistry();

    for (const migration of available) {
      if (!MigrationEngine.appliedMigrations.has(migration.version)) {
        logger.info(`Applying migration: ${migration.version}_${migration.name}`);
        
        const appliedAt = new Date().toISOString();
        await client.transaction(async (tx) => {
          // Execute SQL UP
          await tx.query(migration.sqlUp);
          if (MigrationEngine.usesPersistentRegistry()) {
            await tx.query(
              `INSERT INTO schema_migrations (version, name, applied_at)
               VALUES ($1, $2, $3)
               ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name`,
              [migration.version, migration.name, appliedAt]
            );
          }
          MigrationEngine.appliedMigrations.set(migration.version, appliedAt);
        });

        applied.push(`${migration.version}_${migration.name}`);
      }
    }

    logger.info(`Migrations applied successfully: ${applied.length} of ${available.length}`);
    return { applied, total: available.length };
  }

  public static async rollback(): Promise<{ rolledBack: string | null }> {
    await MigrationEngine.hydratePersistentRegistry();
    const available = MigrationEngine.listAvailableMigrations();
    const appliedList = Array.from(MigrationEngine.appliedMigrations.keys()).sort();
    if (appliedList.length === 0) {
      logger.info('No migrations to rollback.');
      return { rolledBack: null };
    }

    const lastVersion = appliedList[appliedList.length - 1];
    const migration = available.find(m => m.version === lastVersion);

    if (migration && migration.sqlDown) {
      logger.info(`Rolling back migration: ${migration.version}_${migration.name}`);
      const client = DatabaseManager.getClient();
      await client.transaction(async (tx) => {
        await tx.query(migration.sqlDown!);
        if (MigrationEngine.usesPersistentRegistry()) {
          await tx.query('DELETE FROM schema_migrations WHERE version = $1', [migration.version]);
        }
        MigrationEngine.appliedMigrations.delete(migration.version);
      });
      return { rolledBack: `${migration.version}_${migration.name}` };
    } else {
      MigrationEngine.appliedMigrations.delete(lastVersion);
      logger.warn(`Rolled back version ${lastVersion} (no DOWN script declared)`);
      return { rolledBack: lastVersion };
    }
  }

  public static create(name: string): string {
    const dir = MigrationEngine.getMigrationsDirectory();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const existing = fs.readdirSync(dir).filter(f => f.endsWith('.sql'));
    const nextSeq = (existing.length + 1).toString().padStart(3, '0');
    const sanitizedName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const fileName = `${nextSeq}_${sanitizedName}.sql`;
    const fullPath = path.join(dir, fileName);

    const template = `-- Migration: ${nextSeq}_${sanitizedName}.sql
-- Expand -> Migrate/Backfill -> Switch -> Contract
-- Authority: Volume III, Section 9

-- UP --
-- Enter forward schema changes here

-- DOWN --
-- Enter rollback schema changes here
`;

    fs.writeFileSync(fullPath, template, 'utf-8');
    logger.info(`Created new migration file: ${fullPath}`);
    return fullPath;
  }

  public static resetForTesting(): void {
    MigrationEngine.appliedMigrations.clear();
  }
}
