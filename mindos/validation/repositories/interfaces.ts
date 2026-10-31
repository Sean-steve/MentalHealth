import { ReleaseReadinessCertification,ReleaseValidationCandidate,ValidationAttestation,ValidationEvidence } from '../domain/types.js';

export interface IValidationRepository{
  saveCandidate(v:ReleaseValidationCandidate):Promise<void>;
  getCandidate(releaseId:string):Promise<ReleaseValidationCandidate|undefined>;
  saveEvidence(v:ValidationEvidence):Promise<void>;
  listEvidence(releaseId:string):Promise<ValidationEvidence[]>;
  saveAttestation(v:ValidationAttestation):Promise<void>;
  listAttestations(releaseId:string):Promise<ValidationAttestation[]>;
  saveCertification(v:ReleaseReadinessCertification):Promise<void>;
  getCertification(releaseId:string):Promise<ReleaseReadinessCertification|undefined>;
  reset?():void|Promise<void>;
}
