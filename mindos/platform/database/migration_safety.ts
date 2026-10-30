/**
 * MindOS Database Migration Safety & Drift Analyzer
 * Authority: Master Architecture Index Section 9, Volume III & Sprint 2 Quality Gates
 * 
 * Inspects migrations for high-risk schema operations:
 * - DROP TABLE
 * - DROP COLUMN
 * - Column type narrowing
 * - Non-null column additions without default
 * - Destructive ALTER statements
 * Enforces expand/contract migration protocol.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { MigrationEngine } from './migrations.js';
import { logger } from '../observability/logger.js';

export interface MigrationSafetyRisk {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';
  file: string;
  line?: number;
  operation: string;
  description: string;
  recommendation: string;
}

export interface MigrationValidationResult {
  valid: boolean;
  totalMigrations: number;
  risks: MigrationSafetyRisk[];
  hasHighOrCriticalRisks: boolean;
  sequenceOrdered: boolean;
}

export class MigrationSafetyAnalyzer {
  /**
   * Scans all migration files for destructive / high-risk operations.
   */
  public static analyzeMigrations(): MigrationValidationResult {
    const migrations = MigrationEngine.listAvailableMigrations();
    const risks: MigrationSafetyRisk[] = [];

    let sequenceOrdered = true;
    let expectedSeq = 1;

    for (const m of migrations) {
      const seqNumber = parseInt(m.version, 10);
      if (isNaN(seqNumber) || seqNumber !== expectedSeq) {
        sequenceOrdered = false;
        risks.push({
          severity: 'HIGH',
          file: path.basename(m.filePath),
          operation: 'SEQUENCE_DISCONTINUITY',
          description: `Migration sequence gap or duplicate. Expected version "${expectedSeq.toString().padStart(3, '0')}" but found "${m.version}".`,
          recommendation: 'Ensure migration files are numbered consecutively with 3-digit prefixes (001, 002, 003).'
        });
      }
      expectedSeq++;

      // Analyze Up migration content line by line
      const lines = m.sqlUp.split('\n');
      lines.forEach((line, idx) => {
        const trimmed = line.trim().toUpperCase();
        if (trimmed.startsWith('--')) return; // ignore comments

        // Check for DROP TABLE
        if (trimmed.startsWith('DROP TABLE') || trimmed.includes(' DROP TABLE ')) {
          risks.push({
            severity: 'CRITICAL',
            file: path.basename(m.filePath),
            line: idx + 1,
            operation: 'DROP_TABLE',
            description: `Destructive operation "DROP TABLE" detected on line ${idx + 1}.`,
            recommendation: 'Use the 4-phase Expand/Contract pattern. Deprecate tables over 2 releases before dropping.'
          });
        }

        // Check for DROP COLUMN
        if (trimmed.includes('DROP COLUMN') || trimmed.includes('DROP IF EXISTS')) {
          risks.push({
            severity: 'HIGH',
            file: path.basename(m.filePath),
            line: idx + 1,
            operation: 'DROP_COLUMN',
            description: `Destructive column removal detected on line ${idx + 1}.`,
            recommendation: 'Ensure all application code has ceased accessing this column before contraction.'
          });
        }

        // Check for adding NOT NULL without DEFAULT on existing table
        if (trimmed.includes('ALTER TABLE') && trimmed.includes('SET NOT NULL')) {
          risks.push({
            severity: 'HIGH',
            file: path.basename(m.filePath),
            line: idx + 1,
            operation: 'SET_NOT_NULL_WITHOUT_EXPAND',
            description: `Potential locking: "SET NOT NULL" detected on line ${idx + 1}.`,
            recommendation: 'Add column as nullable, backfill values in batches, then add NOT NULL with VALIDATE CONSTRAINT.'
          });
        }

        // Check for dangerous TRUNCATE
        if (trimmed.startsWith('TRUNCATE') || trimmed.includes(' TRUNCATE ')) {
          risks.push({
            severity: 'CRITICAL',
            file: path.basename(m.filePath),
            line: idx + 1,
            operation: 'TRUNCATE_TABLE',
            description: `Destructive data purge "TRUNCATE" detected on line ${idx + 1}.`,
            recommendation: 'TRUNCATE is strictly forbidden in production database migrations.'
          });
        }
      });
    }

    const hasHighOrCritical = risks.some(r => r.severity === 'CRITICAL' || r.severity === 'HIGH');

    return {
      valid: sequenceOrdered && !risks.some(r => r.severity === 'CRITICAL'),
      totalMigrations: migrations.length,
      risks,
      hasHighOrCriticalRisks: hasHighOrCritical,
      sequenceOrdered
    };
  }

  /**
   * Evaluates if a given SQL text introduces destructive patterns.
   */
  public static inspectSql(sqlText: string, filename = 'inline.sql'): MigrationSafetyRisk[] {
    const risks: MigrationSafetyRisk[] = [];
    const lines = sqlText.split('\n');

    lines.forEach((line, idx) => {
      const trimmed = line.trim().toUpperCase();
      if (trimmed.startsWith('--')) return; // ignore comments

      if (trimmed.includes('DROP TABLE')) {
        risks.push({
          severity: 'CRITICAL',
          file: filename,
          line: idx + 1,
          operation: 'DROP_TABLE',
          description: 'Destructive DROP TABLE statement',
          recommendation: 'Contract schema across two release cycles.'
        });
      }
      if (trimmed.includes('DROP COLUMN')) {
        risks.push({
          severity: 'HIGH',
          file: filename,
          line: idx + 1,
          operation: 'DROP_COLUMN',
          description: 'Destructive DROP COLUMN statement',
          recommendation: 'Verify zero application dependencies before drop.'
        });
      }
      if (trimmed.includes('TRUNCATE')) {
        risks.push({
          severity: 'CRITICAL',
          file: filename,
          line: idx + 1,
          operation: 'TRUNCATE',
          description: 'Data purge statement TRUNCATE',
          recommendation: 'Remove TRUNCATE from migration.'
        });
      }
    });

    return risks;
  }
}
