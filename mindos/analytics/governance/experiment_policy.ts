import { DomainInvariantError } from '../../platform/errors/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';

export interface GovernedExperimentDefinition{
  key:string;
  feature_area:string;
  primary_metric:string;
  harm_guardrail_metrics:string[];
  sample_eligibility:string;
  duration_or_stopping_rule:string;
  privacy_classification:DataClassification;
  pricing_experiment?:boolean;
  targeting_dimensions?:string[];
}

export class AnalyticsExperimentPolicy{
  static validate(def:GovernedExperimentDefinition):void{
    if(!def.key||!def.primary_metric||!def.sample_eligibility||!def.duration_or_stopping_rule){
      throw new DomainInvariantError('Experiments require a primary metric, eligibility and duration/stopping rule.');
    }
    if(def.harm_guardrail_metrics.length===0){
      throw new DomainInvariantError('Experiments require explicit harm guardrail metrics.');
    }
    if(/safety|crisis|emergency/i.test(def.feature_area)){
      throw new DomainInvariantError('Safety resources, crisis response and required safeguards cannot be withheld by ordinary experimentation.');
    }
    if(def.pricing_experiment&&(def.targeting_dimensions||[]).some(x=>/distress|risk|symptom|diagnos|vulnerab/i.test(x))){
      throw new DomainInvariantError('Pricing experiments cannot target inferred distress or vulnerability.');
    }
  }
}
