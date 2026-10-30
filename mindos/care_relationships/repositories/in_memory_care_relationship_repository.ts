/**
 * MindOS In-Memory Care Relationship Repository
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 */

import { ICareRelationshipRepository } from './interfaces.js';
import {
  CareRelationship,
  CareTeamMembership,
  CareRelationshipAuditRecord
} from '../domain/entities.js';
import { CareRelationshipState, CareTeamMembershipState } from '../domain/types.js';

export class InMemoryCareRelationshipRepository implements ICareRelationshipRepository {
  private relationships: Map<string, CareRelationship> = new Map();
  private memberships: Map<string, CareTeamMembership> = new Map();
  private auditRecords: Map<string, CareRelationshipAuditRecord[]> = new Map();

  public async saveRelationship(relationship: CareRelationship): Promise<void> {
    this.relationships.set(relationship.id, { ...relationship });
  }

  public async findRelationshipById(id: string): Promise<CareRelationship | null> {
    const rel = this.relationships.get(id);
    return rel ? { ...rel } : null;
  }

  public async findRelationshipsByUserId(
    userId: string,
    status?: CareRelationshipState
  ): Promise<CareRelationship[]> {
    const results: CareRelationship[] = [];
    for (const rel of this.relationships.values()) {
      if (rel.subject_user_id === userId) {
        if (!status || rel.status === status) {
          results.push({ ...rel });
        }
      }
    }
    return results;
  }

  public async findRelationshipsByProviderId(
    providerId: string,
    status?: CareRelationshipState
  ): Promise<CareRelationship[]> {
    const results: CareRelationship[] = [];
    for (const rel of this.relationships.values()) {
      if (rel.primary_provider_id === providerId) {
        if (!status || rel.status === status) {
          results.push({ ...rel });
        }
      }
    }
    return results;
  }

  public async listRelationships(filter?: Partial<CareRelationship>): Promise<CareRelationship[]> {
    let results = Array.from(this.relationships.values());
    if (filter) {
      results = results.filter(rel => {
        for (const [key, val] of Object.entries(filter)) {
          if ((rel as any)[key] !== val) return false;
        }
        return true;
      });
    }
    return results.map(r => ({ ...r }));
  }

  public async saveMembership(membership: CareTeamMembership): Promise<void> {
    this.memberships.set(membership.id, { ...membership });
  }

  public async findMembershipById(id: string): Promise<CareTeamMembership | null> {
    const mem = this.memberships.get(id);
    return mem ? { ...mem } : null;
  }

  public async findMembershipsByRelationshipId(
    relationshipId: string,
    status?: CareTeamMembershipState
  ): Promise<CareTeamMembership[]> {
    const results: CareTeamMembership[] = [];
    for (const mem of this.memberships.values()) {
      if (mem.relationship_id === relationshipId) {
        if (!status || mem.status === status) {
          results.push({ ...mem });
        }
      }
    }
    return results;
  }

  public async findMembershipsByProfessionalId(
    professionalId: string,
    status?: CareTeamMembershipState
  ): Promise<CareTeamMembership[]> {
    const results: CareTeamMembership[] = [];
    for (const mem of this.memberships.values()) {
      if (mem.professional_id === professionalId) {
        if (!status || mem.status === status) {
          results.push({ ...mem });
        }
      }
    }
    return results;
  }

  public async findMembership(
    relationshipId: string,
    professionalId: string
  ): Promise<CareTeamMembership | null> {
    for (const mem of this.memberships.values()) {
      if (mem.relationship_id === relationshipId && mem.professional_id === professionalId) {
        return { ...mem };
      }
    }
    return null;
  }

  public async saveAuditRecord(record: CareRelationshipAuditRecord): Promise<void> {
    const records = this.auditRecords.get(record.relationship_id) || [];
    records.push({ ...record });
    this.auditRecords.set(record.relationship_id, records);
  }

  public async listAuditRecords(relationshipId: string): Promise<CareRelationshipAuditRecord[]> {
    const records = this.auditRecords.get(relationshipId) || [];
    return records.map(r => ({ ...r }));
  }

  public async clear(): Promise<void> {
    this.relationships.clear();
    this.memberships.clear();
    this.auditRecords.clear();
  }
}
