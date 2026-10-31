import { DomainInvariantError, NotFoundError } from '../../platform/errors/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { ClinicalOperationsRepository } from '../repositories/in_memory.js';
import { ClinicalIncident, ClinicalIncidentState } from '../domain/types.js';

const transitions: Record<ClinicalIncidentState, ClinicalIncidentState[]> = {
  OPEN: ['CONTAINED'],
  CONTAINED: ['INVESTIGATING'],
  INVESTIGATING: ['CORRECTIVE_ACTION'],
  CORRECTIVE_ACTION: ['VALIDATING'],
  VALIDATING: ['CLOSED'],
  CLOSED: []
};

export class ClinicalIncidentService {
  static async open(input: Omit<ClinicalIncident, 'id' | 'state' | 'opened_at' | 'updated_at' | 'corrective_action_references' | 'validation_evidence_references'>): Promise<ClinicalIncident> {
    const now = new Date().toISOString();
    const incident: ClinicalIncident = {
      ...input,
      id: generateUUIDv7(),
      state: 'OPEN',
      corrective_action_references: [],
      validation_evidence_references: [],
      opened_at: now,
      updated_at: now
    };
    await ClinicalOperationsRepository.saveIncident(incident);
    return incident;
  }

  static async transition(
    id: string,
    to: ClinicalIncidentState,
    evidenceReference?: string
  ): Promise<ClinicalIncident> {
    const incident = await ClinicalOperationsRepository.getIncident(id);
    if (!incident) throw new NotFoundError('Clinical incident not found.');
    if (!transitions[incident.state].includes(to)) {
      throw new DomainInvariantError(`Invalid clinical incident transition ${incident.state} -> ${to}.`);
    }
    if (to === 'CORRECTIVE_ACTION' && !evidenceReference) {
      throw new DomainInvariantError('A corrective-action reference is required.');
    }
    if (to === 'VALIDATING' && !evidenceReference) {
      throw new DomainInvariantError('Validation requires an explicit regression/evidence reference.');
    }
    if (to === 'CLOSED' && incident.validation_evidence_references.length === 0) {
      throw new DomainInvariantError('Material incidents cannot close without corrective-action validation evidence.');
    }

    const now = new Date().toISOString();
    if (to === 'CONTAINED') incident.contained_at = now;
    if (to === 'CORRECTIVE_ACTION' && evidenceReference) incident.corrective_action_references.push(evidenceReference);
    if (to === 'VALIDATING' && evidenceReference) incident.validation_evidence_references.push(evidenceReference);
    if (to === 'CLOSED') incident.closed_at = now;
    incident.state = to;
    incident.updated_at = now;
    await ClinicalOperationsRepository.saveIncident(incident);
    return incident;
  }
}
