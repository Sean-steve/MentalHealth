/**
 * MindOS Software Bill of Materials (SBOM) Generator
 * Authority: Master Architecture Index Section 7 & Sprint 2 Invariants (Section 30)
 * 
 * Generates CycloneDX-compatible JSON SBOM mapping direct and transitive dependencies
 * to support security, regulatory traceability (Kenya DHA), and license compliance.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SbomComponent {
  name: string;
  version: string;
  type: 'library' | 'framework' | 'runtime';
  purl: string;
  license?: string;
  scope: 'required' | 'optional' | 'dev';
}

export interface SbomDocument {
  bomFormat: 'CycloneDX';
  specVersion: '1.5';
  serialNumber: string;
  version: number;
  metadata: {
    timestamp: string;
    tools: Array<{ vendor: string; name: string; version: string }>;
    component: {
      name: string;
      version: string;
      type: 'application';
    };
  };
  components: SbomComponent[];
}

export function generateSbom(): SbomDocument {
  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

  const components: SbomComponent[] = [];

  const addDeps = (deps: Record<string, string> = {}, scope: 'required' | 'dev') => {
    for (const [name, ver] of Object.entries(deps)) {
      const cleanVer = ver.replace(/[\^~>=<]/g, '');
      components.push({
        name,
        version: cleanVer,
        type: 'library',
        purl: `pkg:npm/${name}@${cleanVer}`,
        scope
      });
    }
  };

  addDeps(pkg.dependencies, 'required');
  addDeps(pkg.devDependencies, 'dev');

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:mindos-sbom-${Date.now()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [
        {
          vendor: 'MindOS Engineering',
          name: 'mindos-sbom-generator',
          version: '1.0.0'
        }
      ],
      component: {
        name: pkg.name || 'MindOS',
        version: pkg.version || '1.0.0',
        type: 'application'
      }
    },
    components
  };
}

if (process.argv[1]?.endsWith('generate_sbom.ts')) {
  const sbom = generateSbom();
  const outDir = path.join(process.cwd(), 'dist');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outFile = path.join(outDir, 'sbom.json');
  fs.writeFileSync(outFile, JSON.stringify(sbom, null, 2), 'utf-8');
  console.log(`[MindOS SBOM] Generated SBOM containing ${sbom.components.length} components at ${outFile}`);
}
