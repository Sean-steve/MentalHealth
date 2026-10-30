import React, { useState } from 'react';
import { Shield, Lock, AlertOctagon, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';

export const AuthorizationTab: React.FC = () => {
  const [role, setRole] = useState('PLATFORM_ADMIN');
  const [resourceType, setResourceType] = useState('clinical_records');
  const [action, setAction] = useState('clinical_records.read');
  const [hasCareRelationship, setHasCareRelationship] = useState(false);
  const [purpose, setPurpose] = useState('Routine System Administration');
  const [decision, setDecision] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testPredefinedScenario = (scenario: 'admin_clinical' | 'mod_journal' | 'pro_active' | 'pro_inactive') => {
    if (scenario === 'admin_clinical') {
      setRole('PLATFORM_ADMIN');
      setResourceType('clinical_records');
      setAction('clinical_records.read');
      setHasCareRelationship(false);
      setPurpose('Administrative audit attempt');
      runEvaluation('PLATFORM_ADMIN', 'clinical_records', 'clinical_records.read', false, 'Administrative audit attempt');
    } else if (scenario === 'mod_journal') {
      setRole('MODERATOR');
      setResourceType('journal');
      setAction('journal.read');
      setHasCareRelationship(false);
      setPurpose('Content moderation review');
      runEvaluation('MODERATOR', 'journal', 'journal.read', false, 'Content moderation review');
    } else if (scenario === 'pro_active') {
      setRole('VERIFIED_PROFESSIONAL');
      setResourceType('clinical_records');
      setAction('clinical_records.read');
      setHasCareRelationship(true);
      setPurpose('Direct Clinical Consultation');
      runEvaluation('VERIFIED_PROFESSIONAL', 'clinical_records', 'clinical_records.read', true, 'Direct Clinical Consultation');
    } else if (scenario === 'pro_inactive') {
      setRole('VERIFIED_PROFESSIONAL');
      setResourceType('clinical_records');
      setAction('clinical_records.read');
      setHasCareRelationship(false);
      setPurpose('Unsolicited record browsing');
      runEvaluation('VERIFIED_PROFESSIONAL', 'clinical_records', 'clinical_records.read', false, 'Unsolicited record browsing');
    }
  };

  const runEvaluation = async (
    evalRole = role,
    evalResource = resourceType,
    evalAction = action,
    evalCareRel = hasCareRelationship,
    evalPurpose = purpose
  ) => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/authorization/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId: `subj-${evalRole.toLowerCase()}-1`,
          subjectRoles: [evalRole],
          action: evalAction,
          resourceType: evalResource,
          resourceId: 'res-target-123',
          purpose: evalPurpose,
          context: {
            hasActiveCareRelationship: evalCareRel,
            careRelationshipActive: evalCareRel
          }
        })
      });
      const data = await res.json();
      setDecision(data);
    } catch (err) {
      console.error('Authorization evaluation failed', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Policy Explainer Banner */}
      <div className="p-4 rounded-lg bg-teal-50/70 border border-teal-200">
        <div className="flex items-start space-x-3">
          <Shield className="w-5 h-5 text-teal-800 mt-0.5 shrink-0" />
          <div className="text-sm text-teal-950">
            <h3 className="font-semibold">Zero-Trust & Deny-by-Default Architecture (R-SEC-001 / Appendix F)</h3>
            <p className="mt-1 text-teal-900 leading-relaxed">
              Every request across MindOS requires explicit authentication, role entitlement, clinical care relationship,
              purpose verification, and consent. Platform administrators are strictly prohibited from viewing patient clinical
              records or private journals by role alone.
            </p>
          </div>
        </div>
      </div>

      {/* Preset Scenarios */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
          Verify Canonical Invariant Scenarios
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            id="scenario-admin-clinical"
            onClick={() => testPredefinedScenario('admin_clinical')}
            className="p-3.5 text-left rounded-lg border border-slate-200 hover:border-slate-300 bg-white shadow-xs space-y-1 transition-all"
          >
            <div className="flex items-center justify-between text-xs font-bold text-rose-700">
              <span>R-SEC-001 Rule</span>
              <XCircle className="w-3.5 h-3.5" />
            </div>
            <div className="text-xs font-semibold text-slate-900">Admin reads Clinical Data</div>
            <div className="text-[11px] text-slate-500">Platform admin denied read on patient health records</div>
          </button>

          <button
            id="scenario-mod-journal"
            onClick={() => testPredefinedScenario('mod_journal')}
            className="p-3.5 text-left rounded-lg border border-slate-200 hover:border-slate-300 bg-white shadow-xs space-y-1 transition-all"
          >
            <div className="flex items-center justify-between text-xs font-bold text-rose-700">
              <span>R-COM-001 Rule</span>
              <XCircle className="w-3.5 h-3.5" />
            </div>
            <div className="text-xs font-semibold text-slate-900">Moderator reads Journal</div>
            <div className="text-[11px] text-slate-500">Community moderator denied private journal access</div>
          </button>

          <button
            id="scenario-pro-active"
            onClick={() => testPredefinedScenario('pro_active')}
            className="p-3.5 text-left rounded-lg border border-slate-200 hover:border-slate-300 bg-white shadow-xs space-y-1 transition-all"
          >
            <div className="flex items-center justify-between text-xs font-bold text-emerald-700">
              <span>Clinical Care</span>
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div className="text-xs font-semibold text-slate-900">Doctor + Active Relationship</div>
            <div className="text-[11px] text-slate-500">Verified professional granted care access</div>
          </button>

          <button
            id="scenario-pro-inactive"
            onClick={() => testPredefinedScenario('pro_inactive')}
            className="p-3.5 text-left rounded-lg border border-slate-200 hover:border-slate-300 bg-white shadow-xs space-y-1 transition-all"
          >
            <div className="flex items-center justify-between text-xs font-bold text-amber-700">
              <span>AUTHZ_002 Rule</span>
              <XCircle className="w-3.5 h-3.5" />
            </div>
            <div className="text-xs font-semibold text-slate-900">Doctor NO Relationship</div>
            <div className="text-[11px] text-slate-500">Denied without active client care relationship</div>
          </button>
        </div>
      </div>

      {/* Simulator Form & Output */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2">
            Authorization Simulator
          </h2>

          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Actor Role</label>
              <select
                id="select-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
              >
                <option value="PLATFORM_ADMIN">PLATFORM_ADMIN (System Administrator)</option>
                <option value="MODERATOR">MODERATOR (Community Moderator)</option>
                <option value="VERIFIED_PROFESSIONAL">VERIFIED_PROFESSIONAL (Licensed Clinician)</option>
                <option value="USER">USER (Consumer Patient)</option>
                <option value="PEER_SUPPORTER">PEER_SUPPORTER (Peer Companion)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Target Resource</label>
              <select
                id="select-resource"
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
              >
                <option value="clinical_records">clinical_records (Patient EHR & Notes)</option>
                <option value="journal">journal (Private Patient Journal)</option>
                <option value="assessment">assessment (PHQ/GAD Screening Data)</option>
                <option value="community_post">community_post (Public Forum Post)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Action Name</label>
              <input
                type="text"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input
                type="checkbox"
                id="checkbox-care-rel"
                checked={hasCareRelationship}
                onChange={(e) => setHasCareRelationship(e.target.checked)}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4"
              />
              <label htmlFor="checkbox-care-rel" className="text-xs font-medium text-slate-800">
                Active Clinical Care Relationship Established (R-REL-001)
              </label>
            </div>

            <button
              id="btn-run-auth-eval"
              onClick={() => runEvaluation()}
              disabled={loading}
              className="w-full mt-2 py-2 px-4 rounded-md bg-teal-800 hover:bg-teal-900 text-white font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Evaluate Authorization Engine</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Output Panel */}
        <div className="lg:col-span-6 bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2">
            Decision Audit & Enforcement
          </h2>

          {decision ? (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg border flex items-start space-x-3 ${
                decision.allowed
                  ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                  : 'bg-rose-50/80 border-rose-300 text-rose-950'
              }`}>
                {decision.allowed ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
                ) : (
                  <AlertOctagon className="w-6 h-6 text-rose-700 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <div className="font-bold text-sm">
                    {decision.allowed ? 'ACCESS GRANTED (ALLOWED)' : 'ACCESS DENIED (BLOCKED)'}
                  </div>
                  <p className="text-xs leading-relaxed">{decision.reason}</p>
                  {decision.errorCode && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-rose-200/80 text-rose-900">
                      ERROR CODE: {decision.errorCode}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-700 space-y-1">
                <div className="text-slate-500 font-bold mb-1">AUDIT ENFORCEMENT RECORD</div>
                <div>ACTOR_ROLE: {role}</div>
                <div>RESOURCE: {resourceType}</div>
                <div>ACTION: {action}</div>
                <div>ACTIVE_RELATIONSHIP: {hasCareRelationship ? 'TRUE' : 'FALSE'}</div>
                <div>ALGORITHM: Appendix F Deny-by-Default</div>
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-center p-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
              Select a scenario or click Evaluate to test the Zero-Trust policy engine.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
