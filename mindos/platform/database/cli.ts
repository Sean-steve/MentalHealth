/**
 * MindOS Database Management CLI & Lifecycle Controls
 * Authority: Master Architecture Index Section 9 & Sprint 2 Guidelines
 * 
 * Commands:
 *   status           - Displays migration status
 *   apply / migrate  - Applies pending schema migrations
 *   rollback         - Rolls back the last applied migration
 *   create <name>    - Generates a timestamped migration template
 *   validate         - Analyzes migrations for high-risk operations & sequence gaps
 *   seed             - Injects synthetic development data (FORBIDDEN IN PROD/STAGING)
 *   reset-dev        - Resets development database (REFUSES STAGING/PROD)
 *   test             - Verifies migration application on isolated test harness
 */

import { MigrationEngine } from './migrations.js';
import { MigrationSafetyAnalyzer } from './migration_safety.js';
import { SeedManager } from './seeds.js';
import { ConfigurationManager } from '../configuration/index.js';
import { DatabaseManager } from './connection.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';
  const config = ConfigurationManager.get();

  switch (command) {
    case 'status': {
      console.log(`[MindOS DB] Environment: ${config.env.toUpperCase()}`);
      const statuses = await MigrationEngine.status();
      console.log('--- Canonical Migration Status ---');
      for (const s of statuses) {
        const state = s.applied ? `[APPLIED at ${s.applied_at}]` : '[PENDING]';
        console.log(`- ${s.version}_${s.name}: ${state}`);
      }
      break;
    }

    case 'apply':
    case 'migrate': {
      console.log(`[MindOS DB] Applying migrations to ${config.env.toUpperCase()}...`);
      const result = await MigrationEngine.apply();
      console.log(`Successfully applied ${result.applied.length} migrations. Total: ${result.total}`);
      break;
    }

    case 'rollback': {
      console.log(`[MindOS DB] Rolling back migration in ${config.env.toUpperCase()}...`);
      const result = await MigrationEngine.rollback();
      console.log(result.rolledBack ? `Rolled back: ${result.rolledBack}` : 'No migrations to rollback.');
      break;
    }

    case 'validate': {
      console.log('[MindOS DB] Running Migration Safety & Drift Analysis...');
      const analysis = MigrationSafetyAnalyzer.analyzeMigrations();
      console.log(`Total migrations evaluated: ${analysis.totalMigrations}`);
      console.log(`Sequence Integrity: ${analysis.sequenceOrdered ? 'PASSED' : 'FAILED'}`);
      
      if (analysis.risks.length > 0) {
        console.log(`\nDetected ${analysis.risks.length} Migration Risks / Warnings:`);
        for (const risk of analysis.risks) {
          console.log(` [${risk.severity}] ${risk.file} - ${risk.operation}: ${risk.description}`);
          console.log(`   Recommendation: ${risk.recommendation}`);
        }
      } else {
        console.log('Zero high-risk schema operations detected. 100% Backward-Compatible Expand/Contract compliant.');
      }

      if (!analysis.valid) {
        console.error('MIGRATION_VALIDATION_FAILED: Critical schema risks or sequence discontinuity detected.');
        process.exit(1);
      }
      break;
    }

    case 'seed': {
      // Strict guard against running in staging/prod
      if (config.env === 'production' || config.env === 'staging') {
        console.error(`[SECURITY ERROR] Seeding is STRICTLY FORBIDDEN in ${config.env.toUpperCase()}!`);
        process.exit(1);
      }
      console.log(`[MindOS DB] Seeding synthetic development dataset for ${config.env}...`);
      const seedResult = await SeedManager.seed();
      console.log(`Synthetic seeds applied: ${seedResult.usersCreated} users, ${seedResult.professionalsCreated} professionals, ${seedResult.crisisFacilitiesCreated} crisis facilities.`);
      break;
    }

    case 'reset-dev': {
      // Strict guardrail: MUST REFUSE to run against STAGING or PRODUCTION
      if (config.env === 'production' || config.env === 'staging') {
        console.error(`[SECURITY INVARIANT VIOLATION] "reset-dev" REFUSES to run against "${config.env.toUpperCase()}". Aborting.`);
        process.exit(1);
      }
      console.log(`[MindOS DB] Resetting development environment: ${config.env.toUpperCase()}...`);
      MigrationEngine.resetForTesting();
      console.log('Database state cleared.');
      const applyResult = await MigrationEngine.apply();
      console.log(`Re-applied ${applyResult.applied.length} migrations.`);
      await SeedManager.seed();
      console.log('Database reset-dev sequence completed safely.');
      break;
    }

    case 'test': {
      console.log('[MindOS DB] Running test database isolation checks...');
      MigrationEngine.resetForTesting();
      const testApply = await MigrationEngine.apply();
      console.log(`Test database migration verified: ${testApply.total} migrations applied cleanly.`);
      break;
    }

    case 'create': {
      const name = args[1] || 'migration';
      const created = MigrationEngine.create(name);
      console.log(`Created migration: ${created}`);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Available commands: status, migrate (apply), rollback, validate, seed, reset-dev, test, create <name>');
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Database CLI Fatal Error:', err.message || err);
  process.exit(1);
});
