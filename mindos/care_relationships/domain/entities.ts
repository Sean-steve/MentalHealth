/**
 * MindOS Care Relationships Domain Entities
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 */

import {
  CareRelationshipType,
  CareRelationshipState,
  CareRelationshipOriginType,
  CareTeamRole,
  CareTeamMembershipState,
  DataDomain,
  ActionPermission
} from './types.js';

export interface CareRelationshipScope {
  relationship_id: string;
  allowed_service_types: string[];
  allowed_data_domains: DataDomain[];
  allowed_actions: ActionPermission[];
  jurisdiction: string;
  effective_at: string;
  expires_at?: string;
  policy_version: string;
}

export interface CareRelationship {
  id: string; // UUIDv7
  subject_user_id: string;
  primary_provider_id?: string;
  organization_id?: string;
  relationship_type: CareRelationshipType;
  status: CareRelationshipState;
  state: CareRelationshipState; // canonical alias
  origin_type: CareRelationshipOriginType;
  origin_reference: string;
  jurisdiction: string;
  started_at: string;
  ended_at?: string;
  purpose: string;
  scope: CareRelationshipScope;
  consent_reference?: string;
  transfer_target_provider_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface CareTeamMembership {
  id: string; // UUIDv7
  relationship_id: string;
  professional_id: string;
  provider_id: string;
  team_role: CareTeamRole;
  status: CareTeamMembershipState;
  scope: {
    allowed_data_domains: DataDomain[];
    allowed_actions: ActionPermission[];
  };
  started_at: string;
  ended_at?: string;
  added_by: string;
  reason_code: string;
  created_at: string;
  updated_at: string;
}

export interface CareRelationshipAuditRecord {
  id: string;
  relationship_id: string;
  actor_id: string;
  action: string;
  from_state?: CareRelationshipState;
  to_state?: CareRelationshipState;
  timestamp: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}
