import React from 'react';
import { BookOpen, ShieldCheck, CheckSquare, Layers, FileText } from 'lucide-react';

export const ConstitutionTab: React.FC = () => {
  const adrs = [
    { id: 'ADR-001', title: 'Modular Monolith First', status: 'ACCEPTED', desc: 'Single deployment unit with strict internal package and domain boundaries. No premature microservices.' },
    { id: 'ADR-002', title: 'First-Class Governance Subsystems', status: 'ACCEPTED', desc: 'Clinical, DPIA, Regulatory, and AI Safety Governance are explicit platform domains with hard stop gates.' },
    { id: 'ADR-003', title: 'Non-Negotiable Safety Priority', status: 'ACCEPTED', desc: 'Human Safety > Clinical Integrity > Privacy > Autonomy > Convenience > Commercial Optimization.' },
    { id: 'ADR-004', title: 'Six-Tier Data Classification', status: 'ACCEPTED', desc: 'Public, Internal, Confidential, Restricted, Sensitive Personal, and Health-Critical boundaries strictly enforced.' },
    { id: 'ADR-005', title: 'Deny-by-Default Authorization', status: 'ACCEPTED', desc: 'Zero-trust authorization. Platform admins and moderators cannot read private clinical records.' },
    { id: 'ADR-006', title: 'Tamper-Evident SHA-256 Audit Ledger', status: 'ACCEPTED', desc: 'Cryptographically chained audit trail. Immutable, append-only with mathematical hash verification.' },
    { id: 'ADR-007', title: 'Deterministic Safety Kernel Transitions', status: 'ACCEPTED', desc: 'Risk states are deterministic. AI models emit signals only; state escalation is governed by deterministic code.' },
    { id: 'ADR-008', title: 'Separation of Duties (Four-Eye Principle)', status: 'ACCEPTED', desc: 'Authors cannot self-approve clinical artifacts, DPIAs, or release gates (R-GOV-002).' },
    { id: 'ADR-009', title: 'AI Context Firewall & Strip Invariants', status: 'ACCEPTED', desc: 'Clinical diagnoses and prescriptions are stripped prior to external LLM context ingestion.' },
    { id: 'ADR-010', title: 'Transactional Outbox Pattern', status: 'ACCEPTED', desc: 'Domain events are staged in outbox tables. Raw journals or clinical notes prohibited from event payloads.' }
  ];

  const classifications = [
    { tier: 'TIER 1: PUBLIC', color: 'bg-slate-100 text-slate-800 border-slate-200', desc: 'Articles, emergency hotline directory, public guides' },
    { tier: 'TIER 2: INTERNAL', color: 'bg-blue-50 text-blue-900 border-blue-200', desc: 'Metrics, system configuration, release metadata' },
    { tier: 'TIER 3: CONFIDENTIAL', color: 'bg-teal-50 text-teal-900 border-teal-200', desc: 'Professional rosters, institutional policies, billing logs' },
    { tier: 'TIER 4: RESTRICTED', color: 'bg-amber-50 text-amber-900 border-amber-200', desc: 'Audit ledgers, access credentials, KMS encryption keys' },
    { tier: 'TIER 5: SENSITIVE PERSONAL', color: 'bg-orange-50 text-orange-900 border-orange-200', desc: 'User emails, hashed passwords, PII, session tokens' },
    { tier: 'TIER 6: HEALTH-CRITICAL', color: 'bg-rose-100 text-rose-950 border-rose-300', desc: 'Clinical notes, PHQ/GAD screening, private journals, safety plans' }
  ];

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg bg-slate-100 border border-slate-300">
        <div className="flex items-start space-x-3">
          <BookOpen className="w-5 h-5 text-slate-800 mt-0.5 shrink-0" />
          <div className="text-sm text-slate-900">
            <h3 className="font-semibold">MindOS Engineering Constitution & Architecture Registry</h3>
            <p className="mt-1 text-slate-700 leading-relaxed">
              MindOS was constructed under an uncompromising architectural constitution. All code, database tables,
              state machines, and APIs strictly follow ADR-001 through ADR-010 and the Requirements Traceability Matrix.
            </p>
          </div>
        </div>
      </div>

      {/* ADR Grid */}
      <div>
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">
          Adopted Architecture Decision Records (ADRs)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {adrs.map((adr) => (
            <div
              key={adr.id}
              className="p-4 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors space-y-1.5 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-xs text-teal-800">{adr.id}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {adr.status}
                </span>
              </div>
              <h4 className="font-semibold text-sm text-slate-900">{adr.title}</h4>
              <p className="text-xs text-slate-600 leading-relaxed">{adr.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Six-Tier Data Classification Matrix */}
      <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-3">
        <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
          <Layers className="w-4 h-4 text-slate-700" />
          <h3 className="font-semibold text-sm text-slate-900">
            Six-Tier Data Classification & Protection Matrix (ADR-004)
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {classifications.map((c, i) => (
            <div key={i} className={`p-3 rounded-lg border ${c.color} space-y-1`}>
              <div className="font-bold text-xs tracking-wider">{c.tier}</div>
              <div className="text-xs opacity-90 leading-snug">{c.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
