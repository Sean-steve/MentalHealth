import React, { useState, useEffect } from 'react';
import { AlertTriangle, PhoneCall, ShieldAlert, CheckCircle, Clock, ExternalLink, RefreshCw } from 'lucide-react';

interface CrisisResource {
  id: string;
  name: string;
  category?: string;
  resource_type?: string;
  phone_numbers?: string[];
  contact_json?: {
    phone?: string;
    sms?: string;
    whatsapp?: string;
    website?: string;
    address?: string;
  };
  availability_json?: {
    hours?: string;
    free_of_charge?: boolean;
    languages?: string[];
  };
  operating_hours?: string;
  is_toll_free?: boolean;
  is_verified?: boolean;
  verification_status?: string;
  priority_ranking?: number;
}

export const SafetyKernelTab: React.FC = () => {
  const [resources, setResources] = useState<CrisisResource[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<'suicide' | 'violence' | 'mild'>('suicide');
  const [evalResult, setEvalResult] = useState<any>(null);

  const getContactDisplay = (res: CrisisResource | any): string => {
    if (!res) return 'Direct facility contact';
    if (Array.isArray(res.phone_numbers) && res.phone_numbers.length > 0) {
      return res.phone_numbers.join(' / ');
    }
    const contacts: string[] = [];
    if (res.contact_json?.phone) contacts.push(res.contact_json.phone);
    if (res.contact_json?.sms) contacts.push(`SMS: ${res.contact_json.sms}`);
    if (res.contact_json?.whatsapp) contacts.push(`WA: ${res.contact_json.whatsapp}`);
    if (contacts.length > 0) return contacts.join(' / ');
    if (res.contact_json?.address) return res.contact_json.address;
    return 'Referral Facility Available';
  };

  const getOperatingHours = (res: CrisisResource | any): string => {
    return res?.operating_hours || res?.availability_json?.hours || '24/7 Availability';
  };

  const checkIsVerified = (res: CrisisResource | any): boolean => {
    return Boolean(res?.is_verified || res?.verification_status === 'VERIFIED');
  };

  const checkIsTollFree = (res: CrisisResource | any): boolean => {
    return Boolean(res?.is_toll_free || res?.availability_json?.free_of_charge);
  };

  const getCategoryLabel = (res: CrisisResource | any): string => {
    return res?.category || (res?.resource_type ? String(res.resource_type).replace(/_/g, ' ') : 'Crisis Resource');
  };

  const fetchResources = async () => {
    setLoadingResources(true);
    try {
      const res = await fetch('/api/v1/safety/crisis-resources?country=KE');
      const data = await res.json();
      setResources(data.resources || []);
    } catch (err) {
      console.error('Failed to load crisis resources', err);
    } finally {
      setLoadingResources(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, []);

  const handleEvaluate = async (preset: 'suicide' | 'violence' | 'mild') => {
    setSelectedPreset(preset);
    setEvaluating(true);

    let payload: any = {
      userId: 'test-user-simulation-1',
      sourceDomain: 'ASSESSMENT',
      riskCategory: 'SUICIDE_SELF_HARM',
      signals: {}
    };

    if (preset === 'suicide') {
      payload = {
        userId: 'test-user-simulation-1',
        sourceDomain: 'ASSESSMENT',
        riskCategory: 'SUICIDE_SELF_HARM',
        signals: { immediate_danger: true, ideation: 'high' }
      };
    } else if (preset === 'violence') {
      payload = {
        userId: 'test-user-simulation-2',
        sourceDomain: 'AI',
        riskCategory: 'VIOLENCE_TO_OTHERS',
        signals: { direct_threat: true }
      };
    } else {
      payload = {
        userId: 'test-user-simulation-3',
        sourceDomain: 'JOURNAL',
        riskCategory: 'GENERAL_DISTRESS',
        signals: { fatigue: true, stress_mild: true }
      };
    }

    try {
      const res = await fetch('/api/v1/safety/evaluate-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setEvalResult(data);
    } catch (err) {
      console.error('Failed to evaluate risk signal', err);
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: R-SAFE-001 & R-SAFE-002 Principles */}
      <div className="p-4 rounded-lg bg-rose-50/70 border border-rose-200">
        <div className="flex items-start space-x-3">
          <ShieldAlert className="w-5 h-5 text-rose-700 mt-0.5 shrink-0" />
          <div className="text-sm text-rose-950">
            <h3 className="font-semibold">Deterministic Safety Kernel (ADR-003 / R-SAFE-001)</h3>
            <p className="mt-1 text-rose-900 leading-relaxed">
              In MindOS, safety transitions are strictly deterministic and never delegated to probabilistic AI models.
              AI layers and screening assessments emit signals; the Safety Kernel evaluates policy and enforces state
              escalation. Verified Kenyan crisis resources (R-SAFE-002) are injected with zero marketing or third-party tracking.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Deterministic Risk Evaluator */}
        <div className="lg:col-span-7 bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Safety Policy & Signal Simulator</h2>
              <p className="text-xs text-slate-500">Test deterministic state transitions across safety boundaries</p>
            </div>
            <span className="px-2 py-0.5 text-xs font-mono bg-slate-100 text-slate-700 rounded border border-slate-200">
              Policy v2.0.0
            </span>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Select Clinical Risk Trigger
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                id="btn-preset-suicide"
                onClick={() => handleEvaluate('suicide')}
                className={`p-3 text-left rounded-lg border transition-all ${
                  selectedPreset === 'suicide'
                    ? 'border-rose-500 bg-rose-50/60 ring-1 ring-rose-500'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="text-xs font-bold text-rose-800">Critical Signal</div>
                <div className="text-xs font-medium text-slate-800 mt-0.5">Suicidal Ideation</div>
                <div className="text-[11px] text-slate-500 mt-1">Requires urgent safety override & warm lines</div>
              </button>

              <button
                id="btn-preset-violence"
                onClick={() => handleEvaluate('violence')}
                className={`p-3 text-left rounded-lg border transition-all ${
                  selectedPreset === 'violence'
                    ? 'border-amber-500 bg-amber-50/60 ring-1 ring-amber-500'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="text-xs font-bold text-amber-800">Acute Threat</div>
                <div className="text-xs font-medium text-slate-800 mt-0.5">Physical Violence</div>
                <div className="text-[11px] text-slate-500 mt-1">Triggers emergency referral protocol</div>
              </button>

              <button
                id="btn-preset-mild"
                onClick={() => handleEvaluate('mild')}
                className={`p-3 text-left rounded-lg border transition-all ${
                  selectedPreset === 'mild'
                    ? 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="text-xs font-bold text-emerald-800">Routine Signal</div>
                <div className="text-xs font-medium text-slate-800 mt-0.5">Mild Stress / Fatigue</div>
                <div className="text-[11px] text-slate-500 mt-1">No crisis escalation, baseline state</div>
              </button>
            </div>
          </div>

          {/* Result Output Card */}
          {evalResult && (
            <div className="mt-4 p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="font-bold text-slate-700">DETERMINISTIC EVALUATION RESULT</span>
                <span className={`px-2 py-0.5 rounded font-semibold ${
                  evalResult.event?.current_state === 'URGENT' || evalResult.event?.current_state === 'CRITICAL'
                    ? 'bg-rose-100 text-rose-900 border border-rose-300'
                    : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                }`}>
                  STATE: {evalResult.event?.current_state}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <div>
                  <span className="text-slate-400">Previous State:</span> {evalResult.event?.previous_state}
                </div>
                <div>
                  <span className="text-slate-400">Override Required:</span>{' '}
                  <span className={evalResult.requiresSafetyOverride ? 'text-rose-700 font-bold' : 'text-emerald-700 font-bold'}>
                    {evalResult.requiresSafetyOverride ? 'YES (TRUE)' : 'NO (FALSE)'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Risk Category:</span> {evalResult.event?.risk_category}
                </div>
                <div>
                  <span className="text-slate-400">Causation ID:</span> {evalResult.event?.causation_id}
                </div>
              </div>

              {evalResult.urgentResources && evalResult.urgentResources.length > 0 && (
                <div className="pt-2 border-t border-slate-200">
                  <div className="font-semibold text-rose-800 mb-1">
                    Emergency Interventions Injected ({evalResult.urgentResources.length} verified hotlines):
                  </div>
                  <ul className="space-y-1">
                    {evalResult.urgentResources.map((res: any) => (
                      <li key={res.id} className="flex items-center justify-between bg-white p-1.5 rounded border border-rose-200">
                        <span className="font-medium text-slate-800">{res.name}</span>
                        <span className="font-bold text-rose-700">{getContactDisplay(res)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Deterministic State Machine Ladder */}
          <div className="pt-3 border-t border-slate-100">
            <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Canonical Risk States (Section 11)
            </h4>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-xs">
              <div className="p-2 rounded bg-slate-50 border border-slate-200">
                <div className="font-semibold text-slate-800">BASELINE</div>
                <div className="text-[10px] text-slate-500">Normal</div>
              </div>
              <div className="p-2 rounded bg-slate-50 border border-slate-200">
                <div className="font-semibold text-slate-800">LOW</div>
                <div className="text-[10px] text-slate-500">Screening</div>
              </div>
              <div className="p-2 rounded bg-amber-50 border border-amber-200">
                <div className="font-semibold text-amber-800">ELEVATED</div>
                <div className="text-[10px] text-amber-700">Prompting</div>
              </div>
              <div className="p-2 rounded bg-orange-50 border border-orange-200">
                <div className="font-semibold text-orange-800">HIGH</div>
                <div className="text-[10px] text-orange-700">Safety Plan</div>
              </div>
              <div className="p-2 rounded bg-rose-50 border border-rose-200">
                <div className="font-semibold text-rose-800">URGENT</div>
                <div className="text-[10px] text-rose-700">Crisis Card</div>
              </div>
              <div className="p-2 rounded bg-red-100 border border-red-300">
                <div className="font-semibold text-red-900">CRITICAL</div>
                <div className="text-[10px] text-red-800">Immediate Esc</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Verified Kenyan Crisis Directory */}
        <div className="lg:col-span-5 bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Verified Crisis Directory (Kenya)</h2>
              <p className="text-xs text-slate-500">R-SAFE-002 Certified Hotlines & Referral Facilities</p>
            </div>
            <button
              onClick={fetchResources}
              disabled={loadingResources}
              className="p-1.5 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              title="Refresh resources"
            >
              <RefreshCw className={`w-4 h-4 ${loadingResources ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
            {resources.map((resource) => (
              <div
                key={resource.id}
                className="p-3.5 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors bg-white space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm text-slate-900">{resource.name}</span>
                      {checkIsVerified(resource) && (
                        <span className="inline-flex items-center text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                          <CheckCircle className="w-2.5 h-2.5 mr-0.5" />
                          Verified
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">{getCategoryLabel(resource)}</span>
                  </div>

                  {checkIsTollFree(resource) && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200 shrink-0">
                      TOLL-FREE
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2 text-xs font-semibold text-slate-800">
                  <PhoneCall className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>{getContactDisplay(resource)}</span>
                </div>

                <div className="flex items-center text-[11px] text-slate-500 space-x-1.5">
                  <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>Hours: {getOperatingHours(resource)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
