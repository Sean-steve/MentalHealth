import React from 'react';
import { Shield, Lock, Activity, HeartHandshake, CheckCircle2, Server } from 'lucide-react';

interface HeaderProps {
  activeTab: 'safety' | 'authorization' | 'privacy' | 'audit' | 'constitution' | 'devops';
  setActiveTab: (tab: 'safety' | 'authorization' | 'privacy' | 'audit' | 'constitution' | 'devops') => void;
  systemStatus: {
    status: string;
    version: string;
    dhaRegId: string;
    odpcRegId: string;
  };
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, systemStatus }) => {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-teal-800 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              M
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">MindOS</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Kernel v{systemStatus.version} Active
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-slate-100 text-slate-700 border border-slate-200">
                  KE-DHA Certified
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Safety-Critical Mental Health & Clinical Platform Operations Console
              </p>
            </div>
          </div>

          {/* Quick Regulatory & Safety Indicators */}
          <div className="flex items-center gap-2 text-xs">
            <div className="px-2.5 py-1 rounded bg-slate-50 border border-slate-200 text-slate-700 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-teal-700" />
              <span>DHA: {systemStatus.dhaRegId}</span>
            </div>
            <div className="px-2.5 py-1 rounded bg-slate-50 border border-slate-200 text-slate-700 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-700" />
              <span>ODPC Controller</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1 sm:space-x-4 border-t border-slate-100 pt-2 pb-1 overflow-x-auto">
          <button
            id="tab-safety-kernel"
            onClick={() => setActiveTab('safety')}
            className={`px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeTab === 'safety'
                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Activity className="w-4 h-4 text-rose-600" />
            Safety Kernel & Crisis Engine
          </button>

          <button
            id="tab-authorization"
            onClick={() => setActiveTab('authorization')}
            className={`px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeTab === 'authorization'
                ? 'bg-teal-50 text-teal-900 border border-teal-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Shield className="w-4 h-4 text-teal-700" />
            Zero-Trust Authorization
          </button>

          <button
            id="tab-privacy-centre"
            onClick={() => setActiveTab('privacy')}
            className={`px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeTab === 'privacy'
                ? 'bg-cyan-50 text-cyan-900 border border-cyan-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Lock className="w-4 h-4 text-cyan-700" />
            Privacy Centre & Consent
          </button>

          <button
            id="tab-audit-ledger"
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeTab === 'audit'
                ? 'bg-amber-50 text-amber-900 border border-amber-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Lock className="w-4 h-4 text-amber-700" />
            Tamper-Evident Audit Ledger
          </button>

          <button
            id="tab-constitution"
            onClick={() => setActiveTab('constitution')}
            className={`px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeTab === 'constitution'
                ? 'bg-slate-100 text-slate-900 border border-slate-300'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <HeartHandshake className="w-4 h-4 text-slate-700" />
            Constitution & ADRs
          </button>

          <button
            id="tab-devops"
            onClick={() => setActiveTab('devops')}
            className={`px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeTab === 'devops'
                ? 'bg-teal-800 text-white border border-teal-900 font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Server className="w-4 h-4 text-teal-600 group-[.active]:text-white" />
            DevOps & Environments
          </button>
        </nav>
      </div>
    </header>
  );
};
