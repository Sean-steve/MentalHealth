/**
 * MindOS Canonical Safety Signal Taxonomy
 * Authority: Clinical Safety Policy Catalogue Section 4 & Volume V
 */

import { SignalFamily, SignalSeverity, SignalConfidence } from '../domain/types.js';

export interface SignalTaxonomyDefinition {
  code: string;
  family: SignalFamily;
  name: string;
  description: string;
  defaultSeverity: SignalSeverity;
  defaultConfidence: SignalConfidence;
  requiresImmediateTriage: boolean;
  clinicalRationale: string;
}

export const CANONICAL_SIGNAL_TAXONOMY: Record<string, SignalTaxonomyDefinition> = {
  // SUICIDAL INTENT & PLAN (Imminent danger)
  SIG_SUICIDAL_INTENT_ACTIVE: {
    code: 'SIG_SUICIDAL_INTENT_ACTIVE',
    family: SignalFamily.SUICIDAL_INTENT,
    name: 'Active Suicidal Intent',
    description: 'Explicit declaration of current intent to end one\'s life',
    defaultSeverity: SignalSeverity.CRITICAL,
    defaultConfidence: SignalConfidence.HIGH,
    requiresImmediateTriage: true,
    clinicalRationale: 'Direct acute suicidal intent represents immediate life safety hazard.'
  },
  SIG_SUICIDAL_PLAN_EXPLICIT: {
    code: 'SIG_SUICIDAL_PLAN_EXPLICIT',
    family: SignalFamily.SUICIDAL_PLAN,
    name: 'Explicit Suicidal Plan with Means/Timeline',
    description: 'Articulated method, location, preparation, or imminent timeframe',
    defaultSeverity: SignalSeverity.CRITICAL,
    defaultConfidence: SignalConfidence.HIGH,
    requiresImmediateTriage: true,
    clinicalRationale: 'Plan with means indicates progression toward imminent action.'
  },
  SIG_RECENT_ATTEMPT_ACUTE: {
    code: 'SIG_RECENT_ATTEMPT_ACUTE',
    family: SignalFamily.RECENT_ATTEMPT,
    name: 'Recent or In-Progress Self-Harm/Attempt',
    description: 'Disclosure of self-harm or attempt that occurred within last 24 hours or is in progress',
    defaultSeverity: SignalSeverity.CRITICAL,
    defaultConfidence: SignalConfidence.HIGH,
    requiresImmediateTriage: true,
    clinicalRationale: 'Acute medical or lethality risk requires immediate emergency triage.'
  },
  SIG_MEDICAL_EMERGENCY_ACUTE: {
    code: 'SIG_MEDICAL_EMERGENCY_ACUTE',
    family: SignalFamily.MEDICAL_EMERGENCY,
    name: 'Acute Medical Emergency or Overdose',
    description: 'Toxic ingestion, severe hemorrhage, overdose, or acute unresponsiveness',
    defaultSeverity: SignalSeverity.CRITICAL,
    defaultConfidence: SignalConfidence.HIGH,
    requiresImmediateTriage: true,
    clinicalRationale: 'Physical health emergency supersedes psychological intervention.'
  },

  // SUICIDAL IDEATION & SEVERE RISK (High risk)
  SIG_SUICIDAL_IDEATION_PASSIVE: {
    code: 'SIG_SUICIDAL_IDEATION_PASSIVE',
    family: SignalFamily.SUICIDAL_IDEATION,
    name: 'Passive Suicidal Ideation',
    description: 'Thoughts of wishing not to wake up, death wishes without explicit plan or intent',
    defaultSeverity: SignalSeverity.HIGH,
    defaultConfidence: SignalConfidence.MEDIUM,
    requiresImmediateTriage: false,
    clinicalRationale: 'Passive ideation requires structured safety check and supportive intervention.'
  },
  SIG_SELF_HARM_ACTIVE_URGE: {
    code: 'SIG_SELF_HARM_ACTIVE_URGE',
    family: SignalFamily.SELF_HARM_IDEATION,
    name: 'Acute Non-Suicidal Self-Injury Urge',
    description: 'Strong imminent urges to engage in non-suicidal cutting, burning, or injury',
    defaultSeverity: SignalSeverity.HIGH,
    defaultConfidence: SignalConfidence.HIGH,
    requiresImmediateTriage: false,
    clinicalRationale: 'Active self-harm impulses require de-escalation and harm reduction resources.'
  },
  SIG_VIOLENCE_THREAT_IDENTIFIED: {
    code: 'SIG_VIOLENCE_THREAT_IDENTIFIED',
    family: SignalFamily.VIOLENCE_RISK,
    name: 'Credible Threat of Interpersonal Violence',
    description: 'Threats or articulated intent to physically harm a designated third party',
    defaultSeverity: SignalSeverity.HIGH,
    defaultConfidence: SignalConfidence.HIGH,
    requiresImmediateTriage: true,
    clinicalRationale: 'Tarasoff duty-to-protect thresholds require formal safety escalation.'
  },
  SIG_ABUSE_EXPLOITATION_ACTIVE: {
    code: 'SIG_ABUSE_EXPLOITATION_ACTIVE',
    family: SignalFamily.ABUSE_OR_EXPLOITATION,
    name: 'Active Abuse, Coercion, or Domestic Violence',
    description: 'Current physical, sexual, or severe emotional abuse, trafficking, or captivity',
    defaultSeverity: SignalSeverity.HIGH,
    defaultConfidence: SignalConfidence.MEDIUM,
    requiresImmediateTriage: false,
    clinicalRationale: 'Domestic and interpersonal abuse requires specialized crisis pathways.'
  },
  SIG_PSYCHOSIS_SEVERE_DISORGANIZATION: {
    code: 'SIG_PSYCHOSIS_SEVERE_DISORGANIZATION',
    family: SignalFamily.PSYCHOSIS_OR_DISORGANIZATION,
    name: 'Acute Psychosis or Extreme Disorganization',
    description: 'Command hallucinations, intense paranoia, or total cognitive disorganization',
    defaultSeverity: SignalSeverity.HIGH,
    defaultConfidence: SignalConfidence.MEDIUM,
    requiresImmediateTriage: false,
    clinicalRationale: 'Impairs safety awareness and reality testing; professional care indicated.'
  },

  // MODERATE / ELEVATED DISTRESS
  SIG_SEVERE_DISTRESS_OVERWHELM: {
    code: 'SIG_SEVERE_DISTRESS_OVERWHELM',
    family: SignalFamily.SEVERE_DISTRESS,
    name: 'Severe Emotional Agony or Overwhelm',
    description: 'Extreme subjective despair, panic, or inability to cope without clear suicidal intent',
    defaultSeverity: SignalSeverity.MEDIUM,
    defaultConfidence: SignalConfidence.MEDIUM,
    requiresImmediateTriage: false,
    clinicalRationale: 'Elevated distress can rapidly escalate if uncontained.'
  },
  SIG_INABILITY_MAINTAIN_SAFETY: {
    code: 'SIG_INABILITY_MAINTAIN_SAFETY',
    family: SignalFamily.INABILITY_TO_MAINTAIN_IMMEDIATE_SAFETY,
    name: 'Inability to Guarantee Personal Safety',
    description: 'Subject explicitly acknowledges lack of control over self-protective actions',
    defaultSeverity: SignalSeverity.HIGH,
    defaultConfidence: SignalConfidence.HIGH,
    requiresImmediateTriage: true,
    clinicalRationale: 'Direct failure of self-preservation capability mandates human review.'
  },

  // LOW / MILD / HISTORICAL DISCLOSURES
  SIG_HISTORICAL_PAST_ATTEMPT: {
    code: 'SIG_HISTORICAL_PAST_ATTEMPT',
    family: SignalFamily.SUICIDAL_IDEATION,
    name: 'Historical Suicidal Behavior (>1 year ago)',
    description: 'Mention of past suicide attempts or self-harm without current ideation',
    defaultSeverity: SignalSeverity.LOW,
    defaultConfidence: SignalConfidence.CONFIRMED,
    requiresImmediateTriage: false,
    clinicalRationale: 'Past history is a risk factor, but without acute intent it does not warrant emergency crisis override.'
  },
  SIG_EDUCATIONAL_OR_ACADEMIC_DISCUSSION: {
    code: 'SIG_EDUCATIONAL_OR_ACADEMIC_DISCUSSION',
    family: SignalFamily.SEVERE_DISTRESS,
    name: 'Academic, Abstract, or Literary Discussion',
    description: 'Discussion of suicide in literature, news, or coursework without personal attribution',
    defaultSeverity: SignalSeverity.LOW,
    defaultConfidence: SignalConfidence.LOW,
    requiresImmediateTriage: false,
    clinicalRationale: 'Negated/educational discussion should not trigger crisis override.'
  }
};

export function lookupSignalTaxonomy(code: string): SignalTaxonomyDefinition | undefined {
  return CANONICAL_SIGNAL_TAXONOMY[code];
}

export class SignalTaxonomy {
  public static getDefinition(code: string): (SignalTaxonomyDefinition & { category?: string }) | undefined {
    const def = CANONICAL_SIGNAL_TAXONOMY[code];
    if (!def) return undefined;

    const familyToCategory: Record<string, string> = {
      [SignalFamily.SUICIDAL_INTENT]: 'SUICIDE_SELF_HARM',
      [SignalFamily.SUICIDAL_PLAN]: 'SUICIDE_SELF_HARM',
      [SignalFamily.SUICIDAL_IDEATION]: 'SUICIDE_SELF_HARM',
      [SignalFamily.SELF_HARM_ACTIVE]: 'SUICIDE_SELF_HARM',
      [SignalFamily.RECENT_ATTEMPT]: 'SUICIDE_SELF_HARM',
      [SignalFamily.INABILITY_TO_MAINTAIN_IMMEDIATE_SAFETY]: 'SUICIDE_SELF_HARM',
      [SignalFamily.MEDICAL_EMERGENCY]: 'MEDICAL_EMERGENCY',
      [SignalFamily.VIOLENCE_TO_OTHERS]: 'VIOLENCE_THREAT',
      [SignalFamily.PSYCHOSIS_SEVERE_DISORGANIZATION]: 'SEVERE_DISTRESS',
      [SignalFamily.SEVERE_DISTRESS]: 'SEVERE_DISTRESS',
      [SignalFamily.CHILD_ABUSE_EXPLOITATION]: 'ABUSE_EXPLOITATION',
      [SignalFamily.DOMESTIC_VIOLENCE]: 'ABUSE_EXPLOITATION',
    };

    return {
      ...def,
      category: familyToCategory[def.family] || 'SUICIDE_SELF_HARM'
    };
  }

  public static listAll(): SignalTaxonomyDefinition[] {
    return Object.values(CANONICAL_SIGNAL_TAXONOMY);
  }
}
