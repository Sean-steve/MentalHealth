/**
 * MindOS Build Metadata Generator
 * Authority: Master Architecture Index Section 7 & Sprint 2 Build Foundations
 * 
 * Generates immutable build manifest recorded at build time.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface BuildMetadata {
  name: string;
  version: string;
  releaseId: string;
  commitSha: string;
  buildTimestamp: string;
  nodeVersion: string;
  targetEnvironment: string;
  deterministic: boolean;
  complianceBaseline: {
    kenyaDha: string;
    kenyaOdpc: string;
    engineeringConstitution: string;
  };
}

export function generateBuildMetadata(): BuildMetadata {
  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

  const commitSha = process.env.COMMIT_SHA || process.env.GIT_COMMIT || 'sha-20260904-dev-head-sprint2';
  const targetEnv = process.env.MINDOS_ENV || 'production';
  const version = pkg.version || '1.0.0';
  const releaseId = `mindos-v${version}-${commitSha.substring(0, 7)}`;

  return {
    name: 'MindOS',
    version,
    releaseId,
    commitSha,
    buildTimestamp: new Date().toISOString(),
    nodeVersion: process.version,
    targetEnvironment: targetEnv,
    deterministic: true,
    complianceBaseline: {
      kenyaDha: 'DHA-REG-KE-2026',
      kenyaOdpc: 'ODPC-DATA-PROTECTION-ACT-2019',
      engineeringConstitution: 'ADR-001_THROUGH_ADR-010'
    }
  };
}

// When executed directly via CLI
if (process.argv[1]?.endsWith('build_metadata.ts')) {
  const meta = generateBuildMetadata();
  const outDir = path.join(process.cwd(), 'dist');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outFile = path.join(outDir, 'build-metadata.json');
  fs.writeFileSync(outFile, JSON.stringify(meta, null, 2), 'utf-8');
  console.log(`[MindOS Build] Generated build metadata at ${outFile}`);
}
