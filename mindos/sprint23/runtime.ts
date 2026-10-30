import {
  ClinicalRecordService,
  ClinicalTimelineService,
  ClinicalObservationService,
  ClinicalRecordProjectionService,
  PgClinicalRecordRepository
} from '../clinical_record/index.js';
import {
  MeasureRegistry,
  OutcomeService,
  PgOutcomeRepository,
  PgOutcomeGovernanceRepository,
  ClinicalChangeRuleRegistry,
  OutcomeAlertPolicyRegistry,
  OutcomeReconciliationService
} from '../outcomes/index.js';

export interface Sprint23RuntimeStatus {
  persistence:'POSTGRES'|'IN_MEMORY_DEFAULT';
  measure_definitions:number;
  comparability_policies:number;
  approved_clinical_change_rules:number;
  approved_alert_policies:number;
  thresholds_seeded:boolean;
}

let configured=false;
let status:Sprint23RuntimeStatus={
  persistence:'IN_MEMORY_DEFAULT',
  measure_definitions:MeasureRegistry.listActiveMeasures().length,
  comparability_policies:MeasureRegistry.listComparabilityPolicies().length,
  approved_clinical_change_rules:ClinicalChangeRuleRegistry.listApprovedRules().length,
  approved_alert_policies:OutcomeAlertPolicyRegistry.listApprovedPolicies().length,
  thresholds_seeded:false
};

export async function configureSprint23Runtime(options:{usePostgres?:boolean}={}):Promise<Sprint23RuntimeStatus>{
  const usePostgres=options.usePostgres??process.env.NODE_ENV==='production';

  if(usePostgres){
    const clinicalRepo=new PgClinicalRecordRepository();
    ClinicalRecordService.setRepository(clinicalRepo);
    ClinicalTimelineService.setRepository(clinicalRepo);
    ClinicalObservationService.setRepository(clinicalRepo);
    ClinicalRecordProjectionService.setRepository(clinicalRepo);

    const outcomeRepo=new PgOutcomeRepository();
    OutcomeService.setRepository(outcomeRepo);
    OutcomeReconciliationService.initialize(outcomeRepo,clinicalRepo);

    const governance=new PgOutcomeGovernanceRepository();
    for(const definition of MeasureRegistry.listActiveMeasures()) await governance.upsertMeasureDefinition(definition);
    for(const policy of MeasureRegistry.listComparabilityPolicies()) await governance.upsertComparabilityPolicy(policy);

    ClinicalChangeRuleRegistry.resetForTesting();
    for(const rule of await governance.listApprovedClinicalChangeRules()) ClinicalChangeRuleRegistry.registerApprovedRule(rule);

    OutcomeAlertPolicyRegistry.clear();
    for(const policy of await governance.listApprovedAlertPolicies()) OutcomeAlertPolicyRegistry.registerApprovedPolicy(policy);
  }

  configured=true;
  status={
    persistence:usePostgres?'POSTGRES':'IN_MEMORY_DEFAULT',
    measure_definitions:MeasureRegistry.listActiveMeasures().length,
    comparability_policies:MeasureRegistry.listComparabilityPolicies().length,
    approved_clinical_change_rules:ClinicalChangeRuleRegistry.listApprovedRules().length,
    approved_alert_policies:OutcomeAlertPolicyRegistry.listApprovedPolicies().length,
    thresholds_seeded:false
  };
  return {...status};
}

export function getSprint23RuntimeStatus():Sprint23RuntimeStatus&{configured:boolean}{
  return {...status,configured};
}
