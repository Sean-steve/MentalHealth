import { IValidationRepository } from './interfaces.js';
import { ReleaseReadinessCertification,ReleaseValidationCandidate,ValidationAttestation,ValidationEvidence } from '../domain/types.js';

export class InMemoryValidationRepository implements IValidationRepository{
  private candidates=new Map<string,ReleaseValidationCandidate>();
  private evidence=new Map<string,ValidationEvidence>();
  private attestations=new Map<string,ValidationAttestation>();
  private certifications=new Map<string,ReleaseReadinessCertification>();

  async saveCandidate(v:ReleaseValidationCandidate){this.candidates.set(v.release_id,structuredClone(v));}
  async getCandidate(id:string){const v=this.candidates.get(id);return v?structuredClone(v):undefined;}
  async saveEvidence(v:ValidationEvidence){this.evidence.set(v.id,structuredClone(v));}
  async listEvidence(id:string){return [...this.evidence.values()].filter(x=>x.release_id===id).map(x=>structuredClone(x));}
  async saveAttestation(v:ValidationAttestation){this.attestations.set(v.id,structuredClone(v));}
  async listAttestations(id:string){return [...this.attestations.values()].filter(x=>x.release_id===id).map(x=>structuredClone(x));}
  async saveCertification(v:ReleaseReadinessCertification){this.certifications.set(v.release_id,structuredClone(v));}
  async getCertification(id:string){const v=this.certifications.get(id);return v?structuredClone(v):undefined;}
  reset(){this.candidates.clear();this.evidence.clear();this.attestations.clear();this.certifications.clear();}
}
