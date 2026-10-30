/**
 * MindOS Care Relationships Repository Interfaces
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 */

import {
  CareRelationship,
  CareTeamMembership,
  CareRelationshipAuditRecord
} from '../domain/entities.js';
import { CareRelationshipState, CareTeamMembershipState } from '../domain/types.js';

export interface ICareRelationshipRepository {
  // Relationships
  saveRelationship(relationship: CareRelationship): Promise<void>;
  findRelationshipById(id: string): Promise<CareRelationship | null>;
  findRelationshipsByUserId(userId: string, status?: CareRelationshipState): Promise<CareRelationship[]>;
  findRelationshipsByProviderId(providerId: string, status?: CareRelationshipState): Promise<CareRelationship[]>;
  listRelationships(filter?: Partial<CareRelationship>): Promise<CareRelationship[]>;

  // Care Team Memberships
  saveMembership(membership: CareTeamMembership): Promise<void>;
  findMembershipById(id: string): Promise<CareTeamMembership | null>;
  findMembershipsByRelationshipId(relationshipId: string, status?: CareTeamMembershipState): Promise<CareTeamMembership[]>;
  findMembershipsByProfessionalId(professionalId: string, status?: CareTeamMembershipState): Promise<CareTeamMembership[]>;
  findMembership(relationshipId: string, professionalId: string): Promise<CareTeamMembership | null>;

  // Audit
  saveAuditRecord(record: CareRelationshipAuditRecord): Promise<void>;
  listAuditRecords(relationshipId: string): Promise<CareRelationshipAuditRecord[]>;

  // Testing Reset
  clear(): Promise<void>;
}
