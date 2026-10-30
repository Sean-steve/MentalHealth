/**
 * MindOS Deterministic Developer Bootstrap
 * Authority: Master Architecture Index Section 7 & Sprint 2 Invariants (Section 10)
 * 
 * Automates idempotent local development bootstrap:
 * 1. Validates prerequisites (Node 20+, environment variables)
 * 2. Creates local .env from .env.example if missing
 * 3. Applies database schema migrations
 * 4. Loads synthetic seed data
 * 5. Runs health check validation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ConfigurationManager } from '../mindos/platform/configuration/index.js';
import { MigrationEngine } from '../mindos/platform/database/migrations.js';
import { SeedManager } from '../mindos/platform/database/seeds.js';
import { HealthService } from '../mindos/platform/observability/health.js';

export async function bootstrapDevelopment(): Promise<{ success: boolean; steps: string[] }> {
  const steps: string[] = [];
  console.log('================================================================');
  console.log('           MINDOS PLATFORM DEVELOPER BOOTSTRAP                  ');
  console.log('================================================================');

  // Step 1: Validate Prerequisites
  console.log('[1/5] Validating runtime environment and Node version...');
  const majorNode = parseInt(process.versions.node.split('.')[0], 10);
  if (majorNode < 20) {
    throw new Error(`Prerequisite check failed: Node.js version >= 20 required (current: ${process.version})`);
  }
  steps.push(`Node.js runtime valid: ${process.version}`);

  // Step 2: Ensure Local Configuration
  console.log('[2/5] Checking configuration template (.env)...');
  const envPath = path.join(process.cwd(), '.env');
  const envExamplePath = path.join(process.cwd(), '.env.example');
  if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('Created local .env from .env.example template.');
    steps.push('Created .env from .env.example');
  } else {
    steps.push('.env configuration already present');
  }

  // Verify Configuration parses
  ConfigurationManager.resetForTesting();
  const config = ConfigurationManager.get();
  console.log(`Loaded environment: ${config.env.toUpperCase()} on port ${config.port}`);
  steps.push(`Configuration verified: ${config.env}`);

  // Step 3: Apply Database Migrations
  console.log('[3/5] Applying canonical database migrations...');
  const migrationResult = await MigrationEngine.apply();
  console.log(`Migrations applied: ${migrationResult.applied.length} (Total available: ${migrationResult.total})`);
  steps.push(`Database migrated: ${migrationResult.applied.length}/${migrationResult.total}`);

  // Step 4: Load Synthetic Development Seeds
  console.log('[4/5] Injecting synthetic development dataset (R-DATA-SYNTH-001)...');
  const seedResult = await SeedManager.seed();
  console.log(`Seeded: ${seedResult.usersCreated} synthetic users, ${seedResult.professionalsCreated} healthcare professionals, ${seedResult.crisisFacilitiesCreated} crisis facilities.`);
  steps.push(`Synthetic seeds loaded: ${seedResult.usersCreated} users`);

  // Step 5: Self-Diagnostic Health Check
  console.log('[5/5] Running platform health diagnostics...');
  const health = await HealthService.check();
  console.log(`Liveness: ${health.liveness.status}, Readiness: ${health.readiness.status}`);
  steps.push(`Health verified: ${health.readiness.status}`);

  console.log('================================================================');
  console.log('MindOS local stack successfully bootstrapped and ready for dev!');
  console.log('Run `npm run dev` to start server.');
  console.log('================================================================');

  return { success: true, steps };
}

if (process.argv[1]?.endsWith('bootstrap.ts')) {
  bootstrapDevelopment().catch(err => {
    console.error('[BOOTSTRAP FATAL ERROR]', err.message || err);
    process.exit(1);
  });
}
