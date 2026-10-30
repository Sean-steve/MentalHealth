/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { SystemHealthBanner } from './components/SystemHealthBanner';
import { SafetyKernelTab } from './components/SafetyKernelTab';
import { AuthorizationTab } from './components/AuthorizationTab';
import { PrivacyCentreTab } from './components/PrivacyCentreTab';
import { AuditLedgerTab } from './components/AuditLedgerTab';
import { ConstitutionTab } from './components/ConstitutionTab';
import { DevOpsTab } from './components/DevOpsTab';

export default function App() {
  const [activeTab, setActiveTab] = useState<'safety' | 'authorization' | 'privacy' | 'audit' | 'constitution' | 'devops'>('devops');
  const [systemData, setSystemData] = useState({
    status: 'UP',
    version: '1.0.0',
    dhaRegId: 'DHA-REG-KE-2026-DEV',
    odpcRegId: 'ODPC-DC-2026-DEV',
    database: 'In-Memory Driver (Operational)',
    migrations: '3 applied',
    correlationId: 'req-root-001'
  });

  useEffect(() => {
    // Fetch live system health from server
    fetch('/api/v1/health')
      .then((res) => res.json())
      .then((data) => {
        if (data.health) {
          setSystemData((prev) => ({
            ...prev,
            status: data.health.status || 'UP',
            version: data.version || '1.0.0',
            database: data.health.components?.database?.status || 'In-Memory (Ready)'
          }));
        }
      })
      .catch((err) => {
        console.warn('Could not fetch server health, using kernel defaults', err);
      });
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased selection:bg-teal-100 selection:text-teal-900">
      <SystemHealthBanner
        healthData={{
          status: systemData.status,
          database: systemData.database,
          migrations: systemData.migrations,
          correlationId: systemData.correlationId
        }}
      />

      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        systemStatus={{
          status: systemData.status,
          version: systemData.version,
          dhaRegId: systemData.dhaRegId,
          odpcRegId: systemData.odpcRegId
        }}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'safety' && <SafetyKernelTab />}
        {activeTab === 'authorization' && <AuthorizationTab />}
        {activeTab === 'privacy' && <PrivacyCentreTab />}
        {activeTab === 'audit' && <AuditLedgerTab />}
        {activeTab === 'constitution' && <ConstitutionTab />}
        {activeTab === 'devops' && <DevOpsTab />}
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            MindOS Platform Kernel &bull; Safety-Critical Mental Health Architecture &bull; Kenya Digital Health Act Compliant
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            SHA-256 Audit Chaining &bull; R-SEC-001 &bull; R-SAFE-001/002
          </span>
        </div>
      </footer>
    </div>
  );
}
