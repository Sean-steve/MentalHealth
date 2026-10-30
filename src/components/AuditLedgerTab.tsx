import React, { useState, useEffect } from 'react';
import { Lock, CheckCircle2, ShieldCheck, RefreshCw, Key, AlertTriangle } from 'lucide-react';

interface AuditEntry {
  id: string;
  occurred_at: string;
  actor_type: string;
  actor_id?: string;
  action: string;
  resource_type: string;
  result: 'ALLOWED' | 'DENIED' | 'ERROR';
  prev_hash: string;
  entry_hash: string;
  is_break_glass?: boolean;
}

export const AuditLedgerTab: React.FC = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [verification, setVerification] = useState<{ valid: boolean; brokenAt?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const fetchLedger = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/audit/ledger');
      const data = await res.json();
      setEntries(data.entries || []);
      setVerification(data.verification || null);
    } catch (err) {
      console.error('Failed to fetch audit ledger', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      const res = await fetch('/api/v1/audit/verify', { method: 'POST' });
      const data = await res.json();
      setVerification(data.verification);
    } catch (err) {
      console.error('Chain verification failed', err);
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, []);

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="p-4 rounded-lg bg-amber-50/70 border border-amber-200">
        <div className="flex items-start space-x-3">
          <Lock className="w-5 h-5 text-amber-800 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-950">
            <h3 className="font-semibold">Cryptographic Tamper-Evident Audit Ledger (Appendix B / Section 13)</h3>
            <p className="mt-1 text-amber-900 leading-relaxed">
              Every security-relevant action, access decision, break-glass invocation, and state transition is
              cryptographically chained via SHA-256 (h(n) = SHA256(h(n-1) + event_payload)). Any alteration or omission
              breaks mathematical chain verification immediately.
            </p>
          </div>
        </div>
      </div>

      {/* Control Strip & Integrity Card */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Key className="w-5 h-5 text-slate-600" />
          <div>
            <div className="text-sm font-semibold text-slate-900">
              SHA-256 Chained Integrity Status
            </div>
            <div className="text-xs text-slate-500">
              Total Logged Events: <span className="font-semibold text-slate-700">{entries.length}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {verification && (
            <div className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 ${
              verification.valid
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                : 'bg-rose-100 text-rose-900 border border-rose-300'
            }`}>
              {verification.valid ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>Chain Integrity Verified (100% Intact)</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-700" />
                  <span>Chain Broken at #{verification.brokenAt}</span>
                </>
              )}
            </div>
          )}

          <button
            id="btn-verify-audit-chain"
            onClick={handleVerifyChain}
            disabled={verifying}
            className="px-3.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
            <span>Verify Cryptographic Chain</span>
          </button>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Audit Trail Stream</h2>
          <span className="text-xs text-slate-500 font-mono">Genesis Root: GENESIS</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                <th className="py-2.5 px-4 font-semibold">Actor / Role</th>
                <th className="py-2.5 px-4 font-semibold">Action</th>
                <th className="py-2.5 px-4 font-semibold">Resource</th>
                <th className="py-2.5 px-4 font-semibold">Decision</th>
                <th className="py-2.5 px-4 font-semibold">Prev Hash</th>
                <th className="py-2.5 px-4 font-semibold">Entry Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400 font-sans">
                    No audit records registered yet. Perform an action or trigger evaluation to generate chained logs.
                  </td>
                </tr>
              ) : (
                entries.map((item, idx) => (
                  <tr key={item.id || idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                      {new Date(item.occurred_at).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">
                      {item.actor_type}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                      {item.action}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {item.resource_type}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.result === 'ALLOWED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {item.result}
                      </span>
                      {item.is_break_glass && (
                        <span className="ml-1 px-1.5 py-0.2 text-[9px] bg-red-600 text-white rounded font-bold">
                          BREAK-GLASS
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 truncate max-w-[120px]" title={item.prev_hash}>
                      {item.prev_hash?.slice(0, 10)}...
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 font-bold truncate max-w-[120px]" title={item.entry_hash}>
                      {item.entry_hash?.slice(0, 10)}...
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
