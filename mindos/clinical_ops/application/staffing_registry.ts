import { DomainInvariantError } from '../../platform/errors/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { ClinicalOperationsRepository } from '../repositories/index.js';
import { ClinicalOperationsCapability } from '../domain/types.js';

export class ClinicalOperationsStaffingRegistry {
  private static enforcementEnabled = false;

  static setEnforcementEnabled(enabled:boolean):void{this.enforcementEnabled=enabled;}
  static isEnforcementEnabled():boolean{return this.enforcementEnabled;}
  static async configure(input: Omit<ClinicalOperationsCapability, 'id' | 'configured_at'>): Promise<ClinicalOperationsCapability> {
    if (!input.jurisdiction || !input.queue_key || !input.configured_by || !input.policy_version) {
      throw new DomainInvariantError('jurisdiction, queue_key, configured_by and policy_version are required.');
    }
    if (input.staffing_state === 'STAFFED' && input.qualified_role_codes.length === 0) {
      throw new DomainInvariantError('A staffed clinical-operations capability requires at least one qualified reviewer role.');
    }
    if (input.coverage_started_at && input.coverage_ends_at &&
        Date.parse(input.coverage_ends_at) <= Date.parse(input.coverage_started_at)) {
      throw new DomainInvariantError('coverage_ends_at must be after coverage_started_at.');
    }
    const value: ClinicalOperationsCapability = {
      ...input,
      id: generateUUIDv7(),
      configured_at: new Date().toISOString()
    };
    await ClinicalOperationsRepository.saveCapability(value);
    return value;
  }

  static async findActiveCapability(jurisdiction: string, queueKey: string, at = new Date()): Promise<ClinicalOperationsCapability | undefined> {
    const values = (await ClinicalOperationsRepository.listCapabilities(jurisdiction))
      .filter(x => x.queue_key === queueKey)
      .sort((a,b) => Date.parse(b.configured_at) - Date.parse(a.configured_at));
    const latest = values[0];
    if (!latest || latest.staffing_state !== 'STAFFED') return undefined;
    if (latest.coverage_started_at && Date.parse(latest.coverage_started_at) > at.getTime()) return undefined;
    if (latest.coverage_ends_at && Date.parse(latest.coverage_ends_at) <= at.getTime()) return undefined;
    return latest;
  }

  static async isHumanReviewActuallyAvailable(jurisdiction: string, queueKey: string, at = new Date()): Promise<boolean> {
    return Boolean(await this.findActiveCapability(jurisdiction, queueKey, at));
  }
}
