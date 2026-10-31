/**
 * MindOS Governed AI Companion Invariants & Statutory Disclaimers
 * Authority: Master Architecture Index, Volumes I, IV, XV & Appendices B / C / H / Q
 * Digital Health Act 2023 (Kenya), Kenya Data Protection Act 2019
 */

export const CANONICAL_AI_NON_DIAGNOSTIC_DISCLAIMER =
  'MindOS Companion provides automated supportive psychoeducation and wellbeing reflection. It does not provide medical diagnosis, clinical treatment, psychotherapy, or medication prescriptions. In an emergency or crisis, immediately contact emergency services or a verified crisis helpline.';

export const CANONICAL_CRISIS_RESPONSE_TEMPLATE =
  'I hear how overwhelming and difficult things are right now. Your life and safety matter deeply. Because your safety is the absolute priority, automated conversation is paused so you can connect directly with verified, confidential crisis support.';

export const AI_INVARIANTS = {
  R_AI_001: 'All model-provider calls SHALL traverse the AI Gateway and approved AI system version.',
  R_AI_002: 'AI SHALL NOT create clinical diagnosis or medication prescription records.',
  R_SAFE_001: 'Generative AI SHALL NOT be the sole authority for operational risk state/actions.',
  R_SAFE_002: 'Only verified, unexpired crisis resources SHALL be presented as authoritative urgent contacts.',
  ADR_008: 'All AI traffic must pass through AI Gateway and Context Firewall with minimum necessary disclosure.',
  ADR_009: 'Core platform logic must remain decoupled from specific AI model providers via model-agnostic ports.',
  ADR_010: 'Deterministic Safety Kernel always outranks probabilistic or generative AI behavior.',
  ADR_016: 'AI cannot authorize itself or execute unreviewed tool mutations.'
};

export const ACUTE_DISTRESS_PATTERNS = [
  /\b(suicide|kill myself|end my life|want to die|take my own life|commit suicide)\b/i,
  /\b(self[ -]?harm|cutting myself|hang myself|slit my wrists|overdose)\b/i,
  /\b(jump off|shoot myself|swallow pills|strangle myself)\b/i,
  /\b(kill someone|murder someone|hurt others|stab someone)\b/i
];

export const PROHIBITED_DIAGNOSTIC_ASSERTIONS = [
  /\bi diagnose you with\b/i,
  /\byou (have|are diagnosed with|suffer from) (major depressive disorder|bipolar disorder|schizophrenia|borderline personality|ptsd)\b/i,
  /\bmy clinical diagnosis is\b/i,
  /\bconfirm your diagnosis of\b/i
];

export const PROHIBITED_PRESCRIPTION_PATTERNS = [
  /\b(take|takes|taking|increase|decrease|prescribe|prescribed|prescribing|dose of)\s+\d+\s*(mg|milligrams|ml)\b/i,
  /\b(increase|decrease|take|start)\s+(your\s+)?(sertraline|fluoxetine|lexapro|xanax|prozac|zoloft|escitalopram|clonazepam|lithium)\s+(dose\s+)?(to\s+)?\d+\s*(mg|milligrams|ml)\b/i,
  /\b\d+\s*(mg|milligrams|ml)\s+(of\s+)?(sertraline|fluoxetine|lexapro|xanax|prozac|zoloft|escitalopram|clonazepam|lithium)\b/i,
  /\b(start taking|prescribe)\s+(sertraline|fluoxetine|lexapro|xanax|prozac|zoloft|escitalopram|clonazepam|lithium)\b/i,
  /\bstop taking your (medication|antidepressants|antipsychotics)\b/i
];
