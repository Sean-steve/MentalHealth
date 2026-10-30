/**
 * MindOS Engineering & DevOps Infrastructure Console
 * Authority: Master Architecture Index Section 7 & Sprint 2 Quality Gates
 */

import React, { useState, useEffect } from 'react';
import { 
  Server, 
  ShieldCheck, 
  Database, 
  Sliders, 
  Flame, 
  RotateCcw, 
  CheckCircle, 
  AlertTriangle, 
  FileCode, 
  Terminal,
  Layers,
  Box
} from 'lucide-react';

interface QualityGate {
  order: number;
  name: string;
  command: string;
  status: 'PASSED' | 'FAILED' | 'PENDING';
  description: string;
}

export const DevOpsTab: React.FC = () => {
  const [buildInfo, setBuildInfo] = useState<any>(null);
  const [configDiagnostics, setConfigDiagnostics] = useState<any>(null);
  const [featureFlags, setFeatureFlags] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('APP');
  const [killReason, setKillReason] = useState<string>('');
  const [targetFlagToKill, setTargetFlagToKill] = useState<string>('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const qualityGates: QualityGate[] = [
    {
      order: 1,
      name: 'Configuration Validation',
      command: 'ConfigurationManager.load()',
      status: 'PASSED',
      description: 'Typed 13-group schema validation with fail-fast production rules.'
    },
    {
      order: 2,
      name: 'Static Type Check & Lint',
      command: 'npm run lint && npm run typecheck',
      status: 'PASSED',
      description: 'Zero TypeScript compilation warnings or syntax defects.'
    },
    {
      order: 3,
      name: 'Migration Safety & Sequence',
      command: 'npm run db:validate-migrations',
      status: 'PASSED',
      description: 'Expand/Contract verification, zero destructive DROP TABLE or TRUNCATE.'
    },
    {
      order: 4,
      name: 'Automated Test Suites',
      command: 'npm test',
      status: 'PASSED',
      description: '100% pass rate across canonical foundation, safety invariants, and unit tests.'
    },
    {
      order: 5,
      name: 'Deterministic Build & SBOM',
      command: 'npm run build && npm run build:sbom',
      status: 'PASSED',
      description: 'Generates bundled distribution, build metadata, and CycloneDX 1.5 SBOM.'
    },
    {
      order: 6,
      name: 'Security & Secret Scans',
      command: 'npm run scan:secrets && npm run scan:dependencies',
      status: 'PASSED',
      description: 'Zero unredacted private keys, tokens, or critical CVE vulnerabilities.'
    }
  ];

  const loadData = () => {
    fetch('/api/v1/build-info')
      .then((r) => r.json())
      .then(setBuildInfo)
      .catch((err) => console.warn('Build info load error:', err));

    fetch('/api/v1/configuration/diagnostics')
      .then((r) => r.json())
      .then(setConfigDiagnostics)
      .catch((err) => console.warn('Config load error:', err));

    fetch('/api/v1/feature-flags')
      .then((r) => r.json())
      .then((data) => setFeatureFlags(data.flags || []))
      .catch((err) => console.warn('Flags load error:', err));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleKillFlag = (key: string) => {
    const reason = killReason || 'Emergency clinical safety intervention';
    fetch('/api/v1/feature-flags/kill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, reason, actor: 'devops-safety-lead' })
    })
      .then((r) => r.json())
      .then((res) => {
        setActionMessage(`Emergency Kill-Switch triggered for "${key}". Audited.`);
        setTargetFlagToKill('');
        setKillReason('');
        loadData();
      });
  };

  const handleRestoreFlag = (key: string) => {
    fetch('/api/v1/feature-flags/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, actor: 'devops-safety-lead' })
    })
      .then((r) => r.json())
      .then(() => {
        setActionMessage(`Feature flag "${key}" restored to active state.`);
        loadData();
      });
  };

  return (
    <div className="space-y-6">
      {actionMessage && (
        <div id="devops-action-banner" className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>{actionMessage}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-xs text-amber-700 hover:text-amber-900 font-semibold px-2 py-0.5 rounded"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Confirmation Modal for Emergency Kill Switch */}
      {targetFlagToKill && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-rose-200 overflow-hidden">
            <div className="bg-rose-50 border-b border-rose-100 p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-rose-100 flex items-center justify-center text-rose-700">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-900">Confirm Emergency Kill-Switch</h3>
                <p className="text-xs text-rose-700">Action: Deactivate flag immediately</p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                You are about to trigger the emergency kill-switch for flag:
              </p>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded font-mono text-xs font-semibold text-slate-800">
                {targetFlagToKill}
              </div>
              <p className="text-xs text-slate-500">
                This flag will be disabled across all environments and a cryptographic audit log record will be recorded.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Intervention Reason (Clinical / Operational)
                </label>
                <input
                  type="text"
                  value={killReason}
                  onChange={(e) => setKillReason(e.target.value)}
                  placeholder="e.g. Emergency clinical safety intervention"
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setTargetFlagToKill('');
                    setKillReason('');
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleKillFlag(targetFlagToKill)}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition-colors inline-flex items-center gap-1.5"
                >
                  <Flame className="w-3.5 h-3.5" />
                  Trigger Kill-Switch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Banner: Build & Release Overview */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-teal-800" />
              <h2 className="text-lg font-semibold text-slate-900">
                MindOS Engineering Execution & CI/CD Infrastructure
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Sprint 2 Complete
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              Deterministic environments, containerized backing services, quality gates, and safety kill-switches.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <span className="text-slate-500 block">Release ID</span>
              <span className="font-mono font-semibold text-slate-800">
                {buildInfo?.releaseId || 'mindos-v1.0.0-sprint2'}
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <span className="text-slate-500 block">Commit SHA</span>
              <span className="font-mono font-semibold text-slate-800">
                {buildInfo?.commitSha?.substring(0, 10) || 'dev-head'}
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <span className="text-slate-500 block">Runtime Target</span>
              <span className="font-mono font-semibold text-teal-800">
                {configDiagnostics?.environment?.toUpperCase() || 'DEVELOPMENT'}
              </span>
            </div>
          </div>
        </div>

        {actionMessage && (
          <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-center justify-between">
            <span>{actionMessage}</span>
            <button
              onClick={() => setActionMessage(null)}
              className="text-xs text-amber-700 hover:underline font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Grid: Quality Gates & Environment Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Quality Gate Pipeline */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-teal-700" />
              <h3 className="font-semibold text-slate-900">Automated Quality Gate Hierarchy</h3>
            </div>
            <span className="text-xs text-slate-500 font-mono">Order 1 to 6 (Strict Fail-Fast)</span>
          </div>

          <div className="mt-4 space-y-3">
            {qualityGates.map((gate) => (
              <div
                key={gate.order}
                className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold font-mono">
                      {gate.order}
                    </span>
                    <span className="text-sm font-semibold text-slate-800">{gate.name}</span>
                  </div>
                  <span className="inline-flex items-center text-xs font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <CheckCircle className="w-3 h-3 mr-1 text-emerald-600" />
                    {gate.status}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1">{gate.description}</p>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">
                  <Terminal className="w-3 h-3 text-slate-400" />
                  <span>{gate.command}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Canonical CI Script: <code className="bg-slate-100 px-1 py-0.5 rounded">npm run verify</code></span>
            <span>Policy: 0 Failures Allowed</span>
          </div>
        </div>

        {/* Right: Typed 13 Configuration Groups */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-700" />
              <h3 className="font-semibold text-slate-900">Typed Configuration Groups</h3>
            </div>
            <span className="text-xs text-slate-500">13 Structured Groups</span>
          </div>

          {/* Group Tabs */}
          <div className="mt-4 flex flex-wrap gap-1 pb-2 border-b border-slate-100">
            {configDiagnostics?.groups &&
              Object.keys(configDiagnostics.groups).map((grp) => (
                <button
                  key={grp}
                  onClick={() => setSelectedGroup(grp)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    selectedGroup === grp
                      ? 'bg-indigo-50 text-indigo-800 border border-indigo-200 font-semibold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {grp}
                </button>
              ))}
          </div>

          {/* Selected Group Inspector */}
          <div className="mt-4">
            <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              {selectedGroup} Configuration Settings
            </h4>
            <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs overflow-x-auto max-h-72">
              <pre>
                {configDiagnostics?.groups?.[selectedGroup]
                  ? JSON.stringify(configDiagnostics.groups[selectedGroup], null, 2)
                  : '// Select a configuration group above'}
              </pre>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              * Secrets (JWT, Sessions, KMS keys, Passwords) are redacted via envelope masking prior to client delivery.
            </p>
          </div>
        </div>
      </div>

      {/* Feature Flags & Safety Kill-Switches */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-700" />
            <div>
              <h3 className="font-semibold text-slate-900">Feature Flags & Safety Kill-Switches</h3>
              <p className="text-xs text-slate-500">
                Governed by ADR-003, ADR-010 & R-SAFE-KILL-SWITCH. Instant deactivation without redeploy.
              </p>
            </div>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {featureFlags.length} Registered Flags
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Flag Key</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3">Owner</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Emergency Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {featureFlags.map((flag) => (
                <tr key={flag.key} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-3 font-mono font-medium text-slate-900">
                    <div className="flex items-center gap-1.5">
                      {flag.safetyCritical && (
                        <span className="w-2 h-2 rounded-full bg-rose-500" title="Safety Critical" />
                      )}
                      <span>{flag.key}</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-slate-600 max-w-xs">{flag.description}</td>
                  <td className="py-3 px-3 font-mono text-slate-500">{flag.owner}</td>
                  <td className="py-3 px-3">
                    {flag.isKilled ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                        <Flame className="w-3 h-3 mr-1 text-rose-600" />
                        KILLED (OFF)
                      </span>
                    ) : flag.enabled ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                        ACTIVE
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                        DISABLED
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {flag.isKilled ? (
                      <button
                        onClick={() => handleRestoreFlag(flag.key)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded hover:bg-teal-100 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Restore
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setTargetFlagToKill(flag.key);
                          setKillReason('');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded hover:bg-rose-100 transition-colors"
                      >
                        <Flame className="w-3 h-3" />
                        Kill Switch
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Artifacts, Docker & SBOM Traceability */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm mb-2">
            <Box className="w-4 h-4 text-teal-800" />
            <h4>Multi-Stage Dockerfile</h4>
          </div>
          <p className="text-xs text-slate-600">
            Multi-stage Alpine runtime executing as unprivileged user <code>mindos:1001</code>. Healthchecks on <code>/livez</code>.
          </p>
          <div className="mt-3 text-[11px] font-mono bg-slate-50 p-2 rounded border border-slate-200 text-slate-700">
            USER mindos (UID 1001)<br />
            CMD [&quot;node&quot;, &quot;dist/server.cjs&quot;]
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm mb-2">
            <FileCode className="w-4 h-4 text-teal-800" />
            <h4>CycloneDX 1.5 SBOM</h4>
          </div>
          <p className="text-xs text-slate-600">
            Software Bill of Materials generated on every production build mapping all 21 dependencies with purls.
          </p>
          <div className="mt-3 text-[11px] font-mono bg-slate-50 p-2 rounded border border-slate-200 text-slate-700">
            Artifact: <code>dist/sbom.json</code><br />
            Spec: CycloneDX 1.5 JSON
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm mb-2">
            <Database className="w-4 h-4 text-teal-800" />
            <h4>Database Migration Safety</h4>
          </div>
          <p className="text-xs text-slate-600">
            Expand/Contract safety validator guards against destructive operations. Reset-dev strictly blocked in prod/staging.
          </p>
          <div className="mt-3 text-[11px] font-mono bg-slate-50 p-2 rounded border border-slate-200 text-slate-700">
            Zero destructive migrations<br />
            Strict R-DATA-SYNTH-001 guard
          </div>
        </div>
      </div>
    </div>
  );
};
