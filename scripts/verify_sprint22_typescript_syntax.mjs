import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const roots = [
  'mindos/care_plans',
  'mindos/clinical_tasks',
  'mindos/professional_messaging',
  'mindos/sprint22'
];
const explicitFiles = [
  'server.ts',
  'tests/canonical_care_plans_tasks_messaging_sprint22.test.ts'
];

function collectTypeScriptFiles(entry) {
  const absolute = path.join(root, entry);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return entry.endsWith('.ts') ? [entry] : [];

  const files = [];
  for (const child of fs.readdirSync(absolute)) {
    const relative = path.join(entry, child);
    const childAbsolute = path.join(root, relative);
    const childStat = fs.statSync(childAbsolute);
    if (childStat.isDirectory()) {
      files.push(...collectTypeScriptFiles(relative));
    } else if (relative.endsWith('.ts')) {
      files.push(relative);
    }
  }
  return files;
}

const files = [
  ...roots.flatMap(collectTypeScriptFiles),
  ...explicitFiles.filter(file => fs.existsSync(path.join(root, file)))
].sort();

if (files.length === 0) {
  console.error('SPRINT 22 TYPESCRIPT SYNTAX VERIFICATION FAILED');
  console.error('- no TypeScript files were discovered');
  process.exit(1);
}

const errors = [];
for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      isolatedModules: true,
      verbatimModuleSyntax: false
    }
  });

  for (const diagnostic of result.diagnostics || []) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    let location = '';
    if (diagnostic.file && diagnostic.start !== undefined) {
      const pos = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      location = `:${pos.line + 1}:${pos.character + 1}`;
    }
    errors.push(`${file}${location} TS${diagnostic.code}: ${message}`);
  }
}

if (errors.length > 0) {
  console.error('SPRINT 22 TYPESCRIPT SYNTAX VERIFICATION FAILED');
  for (const error of errors) console.error('- ' + error);
  process.exit(1);
}

console.log('SPRINT 22 TYPESCRIPT SYNTAX VERIFICATION PASSED');
console.log(`TypeScript files parsed/transpiled: ${files.length}`);
console.log('Note: this gate validates TypeScript syntax/transpilation only; full type resolution waits for the complete Sprint 1-21 foundation import.');
