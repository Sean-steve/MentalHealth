import { IValidationRepository } from './interfaces.js';
import { InMemoryValidationRepository } from './in_memory.js';

let active:IValidationRepository=new InMemoryValidationRepository();
export const ValidationRepository:IValidationRepository={
  saveCandidate:v=>active.saveCandidate(v),getCandidate:id=>active.getCandidate(id),
  saveEvidence:v=>active.saveEvidence(v),listEvidence:id=>active.listEvidence(id),
  saveAttestation:v=>active.saveAttestation(v),listAttestations:id=>active.listAttestations(id),
  saveCertification:v=>active.saveCertification(v),getCertification:id=>active.getCertification(id),
  reset:()=>active.reset?.()
};
export function setValidationRepository(repo:IValidationRepository){active=repo;}
export function resetValidationRepository(){active=new InMemoryValidationRepository();}
export * from './interfaces.js';
export * from './in_memory.js';
export * from './pg_validation_repository.js';
