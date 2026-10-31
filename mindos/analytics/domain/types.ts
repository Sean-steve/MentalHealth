import { DataClassification } from '../../platform/shared/data_classification.js';

export type AnalyticsEvidenceLevel='DESCRIPTIVE'|'CORRELATIONAL'|'COMPARATIVE'|'CAUSAL';
export type AnalyticsMetricCadence='DAILY'|'WEEKLY'|'MONTHLY'|'PER_RELEASE'|'PER_EVALUATION';
export type AnalyticsMetricDomain=
  'OUTCOME'|'CARE'|'PRODUCT'|'AI'|'AI_SAFETY'|'SAFETY'|'COMMUNITY'|'COMMUNITY_SAFETY'|
  'PROFESSIONAL_OPS'|'PROFESSIONAL_SAFETY'|'PRIVACY'|'SECURITY'|'RELIABILITY'|'BUSINESS'|'GOVERNANCE';

export interface GovernedAnalyticsEvent {
  event_id:string;
  event_type:string;
  subject_pseudonym?:string;
  session_id?:string;
  domain:string;
  object_ref_hash?:string;
  properties:Record<string,unknown>;
  consent_context:Record<string,unknown>;
  occurred_at:string;
  schema_version:number;
}

export interface AnalyticsMetricDefinitionVersion {
  id:string;
  code:string;
  version:number;
  name:string;
  definition:string;
  domain:AnalyticsMetricDomain;
  cadence:AnalyticsMetricCadence;
  governance_note:string;
  owner:string;
  source_refs:string[];
  classification:DataClassification;
  evidence_level:AnalyticsEvidenceLevel;
  min_cohort_size:number;
  effective_from:string;
  retired_at?:string;
}

export interface AnalyticsMetricAggregate {
  id:string;
  idempotency_key:string;
  metric_code:string;
  metric_version:number;
  window_start:string;
  window_end:string;
  dimensions:Record<string,string>;
  numerator?:number;
  denominator?:number;
  value?:number;
  cohort_count:number;
  suppressed:boolean;
  suppression_reason?:string;
  evidence_level:AnalyticsEvidenceLevel;
  computed_at:string;
  source_snapshot_ref?:string;
}

export interface AnalyticsDashboardMetric {
  code:string;
  name:string;
  domain:AnalyticsMetricDomain;
  cadence:AnalyticsMetricCadence;
  methodology_version:number;
  evidence_level:AnalyticsEvidenceLevel;
  value:number|null;
  numerator:number|null;
  denominator:number|null;
  cohort_count:number|null;
  suppressed:boolean;
  status:'AVAILABLE'|'SUPPRESSED'|'NO_GOVERNED_DATA';
  governance_note:string;
  window_start?:string;
  window_end?:string;
}

export type AnalyticsDashboardKind='SAFETY'|'PRODUCT'|'BUSINESS'|'OUTCOME';
