/**
 * MindOS Automated Secret Scanner
 * Authority: Master Architecture Index Section 8 & Sprint 2 Quality Gates (Section 19)
 * 
 * Scans repository files for leaked secrets, API keys, private keys, and production credentials.
 * Exits with non-zero code if unredacted or active secrets are detected.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SecretViolation {
  file: string;
  line: number;
  patternName: string;
  matchedSnippet: string;
}

const SECRET_PATTERNS = [
  {
    name: 'Private Key Block',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g
  },
  {
    name: 'AWS Access Key ID',
    regex: /\b(AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g
  },
  {
    name: 'GitHub Personal Access Token',
    regex: /\bghp_[0-9a-zA-Z]{36}\b/g
  },
  {
    name: 'Generic API Key / Secret Keyword with Value',
    regex: /(?:api_key|apikey|secret_key|client_secret)\s*[:=]\s*["'](?!YOUR_|MY_|demo|test|dev-|sample)[a-zA-Z0-9_\-]{24,}["']/gi
  },
  {
    name: 'PostgreSQL Real Production Password URI',
    regex: /postgresql:\/\/[^:]+:(?!mindos_pass|mindos_test|password)[^@]+@(?!(localhost|127\.0\.0\.1))[^\/]+\//gi
  },
  {
    name: 'High Entropy Slack / Discord Webhook',
    regex: /https:\/\/hooks\.slack\.com\/services\/T[0-9A-Z]{8,12}\/B[0-9A-Z]{8,12}\/[0-9a-zA-Z]{24}/g
  }
];

const IGNORED_PATHS = [
  'node_modules',
  '.git',
  'dist',
  '.aistudio',
  'package-lock.json',
  '.env.example',
  '.env.test.example'
];

export function scanFileForSecrets(filePath: string): SecretViolation[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  // Allow files with global scan-ignore comment at top
  if (content.includes('// scan-ignore-file') || content.includes('/* scan-ignore-file */')) {
    return [];
  }

  const violations: SecretViolation[] = [];
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    // Skip comment lines explicitly referencing scanners or test markers
    if (
      line.includes('scan-ignore') ||
      line.includes('test-fixture-ignore') ||
      line.includes('mock-secret') ||
      line.includes('test-deterministic')
    ) {
      return;
    }

    for (const pattern of SECRET_PATTERNS) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(line)) {
        violations.push({
          file: path.relative(process.cwd(), filePath),
          line: idx + 1,
          patternName: pattern.name,
          matchedSnippet: line.trim().substring(0, 80) + '...'
        });
      }
    }
  });

  return violations;
}

export function scanDirectory(dir: string): SecretViolation[] {
  let violations: SecretViolation[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORED_PATHS.includes(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      violations = violations.concat(scanDirectory(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx|js|cjs|mjs|json|yml|yaml|env|sql|md|sh)$/.test(entry.name)) {
      // Don't scan the scanner definition itself
      if (entry.name === 'scan_secrets.ts') continue;
      violations = violations.concat(scanFileForSecrets(fullPath));
    }
  }

  return violations;
}

if (process.argv[1]?.endsWith('scan_secrets.ts')) {
  console.log('[MindOS Security] Running Secret Scanning across codebase...');
  const violations = scanDirectory(process.cwd());

  if (violations.length > 0) {
    console.error(`\n[CRITICAL SECURITY ALERT] Found ${violations.length} potential secret leak(s):`);
    for (const v of violations) {
      console.error(`- ${v.file}:${v.line} [${v.patternName}]`);
      console.error(`  Snippet: ${v.matchedSnippet}`);
    }
    console.error('\nMerge blocked. Never commit unredacted secrets or production credentials.');
    process.exit(1);
  } else {
    console.log('[MindOS Security] Secret scanning clean: 0 detected secrets or private keys.');
  }
}
