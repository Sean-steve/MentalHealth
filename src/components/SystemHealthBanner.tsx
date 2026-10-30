import React from 'react';
import { Activity, Database, GitCommit, CheckCircle2 } from 'lucide-react';

interface SystemHealthBannerProps {
  healthData: {
    status: string;
    database: string;
    migrations: string;
    correlationId: string;
  };
}

export const SystemHealthBanner: React.FC<SystemHealthBannerProps> = ({ healthData }) => {
  return (
    <div className="bg-slate-900 text-slate-100 px-4 py-2.5 text-xs font-mono border-b border-slate-800">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-semibold tracking-wide">SYSTEM: {healthData.status.toUpperCase()}</span>
          </div>

          <div className="flex items-center space-x-1 text-slate-300">
            <Database className="w-3.5 h-3.5 text-slate-400" />
            <span>DB: {healthData.database}</span>
          </div>

          <div className="flex items-center space-x-1 text-slate-300">
            <GitCommit className="w-3.5 h-3.5 text-slate-400" />
            <span>MIGRATIONS: {healthData.migrations}</span>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-slate-400">
          <span>CORRELATION: <span className="text-slate-200">{healthData.correlationId || 'root-kernel'}</span></span>
          <span className="text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            R-SEC-001 ENFORCED
          </span>
        </div>
      </div>
    </div>
  );
};
