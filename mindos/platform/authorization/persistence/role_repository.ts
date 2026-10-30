/**
 * MindOS Canonical Role & Permission Repository
 * Authority: Master Architecture Index Section 14, Volume VIII & Appendix F
 * ADR-016
 */

import { v7 as uuidv7 } from 'uuid';
import { DatabaseClient, DatabaseManager } from '../../database/connection.js';
import { RoleCode, RoleScope, RoleAssignmentStatus, ActorRoleAssignment } from '../domain/types.js';
import { CANONICAL_PERMISSION_CATALOG, CanonicalPermissions } from '../domain/permissions.js';

export interface CreateRoleAssignmentParams {
  actorId: string;
  roleCode: RoleCode | string;
  scope?: RoleScope;
  organizationId?: string | null;
  communityId?: string | null;
  jurisdiction?: string | null;
  assignedBy: string;
  expiresAt?: string | null;
}

export class RoleRepository {
  private db: DatabaseClient;

  // In-memory cache & fast lookup for role-to-permission mappings
  private static rolePermissionsMap: Map<RoleCode | string, Set<string>> = new Map<RoleCode | string, Set<string>>([
    [RoleCode.USER, new Set([
      CanonicalPermissions.IDENTITY_ACCOUNT_READ_OWN,
      CanonicalPermissions.IDENTITY_ACCOUNT_MANAGE_OWN,
      CanonicalPermissions.IDENTITY_SESSION_READ_OWN,
      CanonicalPermissions.IDENTITY_SESSION_REVOKE_OWN,
      CanonicalPermissions.COMMUNITY_POST_READ,
      CanonicalPermissions.COMMUNITY_POST_CREATE,
      CanonicalPermissions.COMMUNITY_POST_DELETE_OWN
    ])],
    [RoleCode.PROFESSIONAL, new Set([
      CanonicalPermissions.IDENTITY_ACCOUNT_READ_OWN,
      CanonicalPermissions.IDENTITY_ACCOUNT_MANAGE_OWN,
      CanonicalPermissions.IDENTITY_SESSION_READ_OWN,
      CanonicalPermissions.IDENTITY_SESSION_REVOKE_OWN,
      CanonicalPermissions.COMMUNITY_POST_READ,
      CanonicalPermissions.COMMUNITY_POST_CREATE,
      CanonicalPermissions.COMMUNITY_POST_DELETE_OWN,
      CanonicalPermissions.CARE_RELATIONSHIP_VIEW,
      CanonicalPermissions.CARE_APPOINTMENT_MANAGE
    ])],
    [RoleCode.VERIFIED_PROFESSIONAL, new Set([
      CanonicalPermissions.IDENTITY_ACCOUNT_READ_OWN,
      CanonicalPermissions.IDENTITY_ACCOUNT_MANAGE_OWN,
      CanonicalPermissions.IDENTITY_SESSION_READ_OWN,
      CanonicalPermissions.IDENTITY_SESSION_REVOKE_OWN,
      CanonicalPermissions.COMMUNITY_POST_READ,
      CanonicalPermissions.COMMUNITY_POST_CREATE,
      CanonicalPermissions.COMMUNITY_POST_DELETE_OWN,
      CanonicalPermissions.CARE_RELATIONSHIP_VIEW,
      CanonicalPermissions.CARE_APPOINTMENT_MANAGE,
      CanonicalPermissions.CLINICAL_RECORD_READ,
      CanonicalPermissions.CLINICAL_RECORD_CREATE,
      CanonicalPermissions.CLINICAL_RECORD_UPDATE
    ])],
    [RoleCode.PEER_SUPPORTER, new Set([
      CanonicalPermissions.IDENTITY_ACCOUNT_READ_OWN,
      CanonicalPermissions.IDENTITY_ACCOUNT_MANAGE_OWN,
      CanonicalPermissions.IDENTITY_SESSION_READ_OWN,
      CanonicalPermissions.COMMUNITY_POST_READ,
      CanonicalPermissions.COMMUNITY_POST_CREATE,
      CanonicalPermissions.COMMUNITY_POST_DELETE_OWN
    ])],
    [RoleCode.MODERATOR, new Set([
      CanonicalPermissions.IDENTITY_ACCOUNT_READ_OWN,
      CanonicalPermissions.COMMUNITY_POST_READ,
      CanonicalPermissions.COMMUNITY_POST_MODERATE,
      CanonicalPermissions.COMMUNITY_MODERATE
      // INVARIANT R-COM-001: MODERATORS NEVER HAVE CLINICAL_RECORD_READ OR CLINICAL_RECORD_CREATE
    ])],
    [RoleCode.SAFETY_REVIEWER, new Set([
      CanonicalPermissions.IDENTITY_ACCOUNT_READ_OWN,
      CanonicalPermissions.GOVERNANCE_CLINICAL_REVIEW,
      CanonicalPermissions.GOVERNANCE_AI_SAFETY_REVIEW
    ])],
    [RoleCode.CLINICAL_REVIEWER, new Set([
      CanonicalPermissions.IDENTITY_ACCOUNT_READ_OWN,
      CanonicalPermissions.GOVERNANCE_CLINICAL_REVIEW
    ])],
    [RoleCode.CLINICAL_ADMIN, new Set([
      CanonicalPermissions.IDENTITY_ACCOUNT_READ_OWN,
      CanonicalPermissions.CARE_RELATIONSHIP_VIEW,
      CanonicalPermissions.CARE_APPOINTMENT_MANAGE,
      CanonicalPermissions.GOVERNANCE_CLINICAL_REVIEW
    ])],
    [RoleCode.PRIVACY_OFFICER, new Set([
      CanonicalPermissions.IDENTITY_ACCOUNT_READ_OWN,
      CanonicalPermissions.GOVERNANCE_PRIVACY_REVIEW,
      CanonicalPermissions.ADMINISTRATION_AUDIT_READ
    ])],
    [RoleCode.REGULATORY_REVIEWER, new Set([
      CanonicalPermissions.IDENTITY_ACCOUNT_READ_OWN,
      CanonicalPermissions.GOVERNANCE_REGULATORY_REVIEW,
      CanonicalPermissions.ADMINISTRATION_AUDIT_READ
    ])],
    [RoleCode.AI_SAFETY_REVIEWER, new Set([
      CanonicalPermissions.IDENTITY_ACCOUNT_READ_OWN,
      CanonicalPermissions.GOVERNANCE_AI_SAFETY_REVIEW
    ])],
    [RoleCode.PLATFORM_ADMIN, new Set([
      CanonicalPermissions.IDENTITY_ACCOUNT_READ_OWN,
      CanonicalPermissions.IDENTITY_SESSION_READ_ALL,
      CanonicalPermissions.IDENTITY_SESSION_REVOKE_ALL,
      CanonicalPermissions.ADMINISTRATION_USER_MANAGE,
      CanonicalPermissions.ADMINISTRATION_CONFIG_MANAGE,
      CanonicalPermissions.ADMINISTRATION_AUDIT_READ
      // INVARIANT R-SEC-001: PLATFORM_ADMIN NEVER HAS CLINICAL_RECORD_READ OR CLINICAL_RECORD_CREATE
    ])],
    [RoleCode.AUDITOR, new Set([
      CanonicalPermissions.ADMINISTRATION_AUDIT_READ
      // Read-only compliance inspection
    ])],
    [RoleCode.SYSTEM_SERVICE, new Set([
      CanonicalPermissions.ADMINISTRATION_CONFIG_MANAGE,
      CanonicalPermissions.ADMINISTRATION_AUDIT_READ
    ])]
  ]);

  constructor(db?: DatabaseClient) {
    this.db = db || DatabaseManager.getClient();
  }

  /**
   * Seeds the database with canonical roles and permissions if they don't exist.
   */
  public async seedRolesAndPermissions(): Promise<void> {
    // Seed roles
    const rolesList = [
      { code: RoleCode.USER, name: 'General User', is_privileged: false },
      { code: RoleCode.PROFESSIONAL, name: 'Professional Candidate', is_privileged: false },
      { code: RoleCode.VERIFIED_PROFESSIONAL, name: 'Verified Healthcare Professional', is_privileged: true },
      { code: RoleCode.PEER_SUPPORTER, name: 'Peer Supporter', is_privileged: false },
      { code: RoleCode.MODERATOR, name: 'Community Moderator', is_privileged: true },
      { code: RoleCode.SAFETY_REVIEWER, name: 'Safety Reviewer', is_privileged: true },
      { code: RoleCode.CLINICAL_REVIEWER, name: 'Clinical Peer Reviewer', is_privileged: true },
      { code: RoleCode.CLINICAL_ADMIN, name: 'Clinical Operations Admin', is_privileged: true },
      { code: RoleCode.PRIVACY_OFFICER, name: 'Data Protection & Privacy Officer', is_privileged: true },
      { code: RoleCode.REGULATORY_REVIEWER, name: 'Regulatory Compliance Officer', is_privileged: true },
      { code: RoleCode.AI_SAFETY_REVIEWER, name: 'AI Safety Reviewer', is_privileged: true },
      { code: RoleCode.PLATFORM_ADMIN, name: 'Platform Technical Administrator', is_privileged: true },
      { code: RoleCode.AUDITOR, name: 'Independent External Auditor', is_privileged: true },
      { code: RoleCode.SYSTEM_SERVICE, name: 'System Service Account', is_privileged: true }
    ];

    for (const r of rolesList) {
      await this.db.query(
        `INSERT INTO roles (id, code, name, is_privileged, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
        [uuidv7(), r.code, r.name, r.is_privileged, new Date().toISOString()]
      );
    }

    // Seed permissions
    for (const p of CANONICAL_PERMISSION_CATALOG) {
      await this.db.query(
        `INSERT INTO permissions (id, code, domain, resource, action, description, min_classification, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description`,
        [uuidv7(), p.code, p.domain, p.resource, p.action, p.description, p.minClassification, new Date().toISOString()]
      );
    }

    // Seed role-permission mappings
    for (const [roleCode, permSet] of RoleRepository.rolePermissionsMap.entries()) {
      for (const permCode of permSet) {
        await this.db.query(
          `INSERT INTO role_permissions (id, role_code, permission_code, created_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (role_code, permission_code) DO NOTHING`,
          [uuidv7(), roleCode, permCode, new Date().toISOString()]
        );
      }
    }
  }

  /**
   * Creates an explicit role assignment for an actor.
   */
  public async assignRole(params: CreateRoleAssignmentParams): Promise<ActorRoleAssignment> {
    const id = uuidv7();
    const assignedAt = new Date().toISOString();
    const scope: RoleScope = params.scope || RoleScope.GLOBAL;
    const status: RoleAssignmentStatus = RoleAssignmentStatus.ACTIVE;

    await this.db.query(
      `INSERT INTO actor_role_assignments
       (id, actor_id, role_code, scope, organization_id, community_id, jurisdiction, status, assigned_by, assigned_at, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        params.actorId,
        params.roleCode,
        scope,
        params.organizationId || null,
        params.communityId || null,
        params.jurisdiction || 'KE',
        status,
        params.assignedBy,
        assignedAt,
        params.expiresAt || null,
        assignedAt
      ]
    );

    return {
      id,
      actor_id: params.actorId,
      role: params.roleCode,
      scope,
      organization_id: params.organizationId || null,
      community_id: params.communityId || null,
      jurisdiction: params.jurisdiction || 'KE',
      status,
      assigned_by: params.assignedBy,
      assigned_at: assignedAt,
      expires_at: params.expiresAt || null,
      revoked_at: null,
      revocation_reason: null
    };
  }

  /**
   * Revokes an active role assignment.
   */
  public async revokeRoleAssignment(
    assignmentId: string,
    revokedBy: string,
    reason: string
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const rows = await this.db.query<{ id: string }>(
      `UPDATE actor_role_assignments
       SET status = 'REVOKED', revoked_at = $1, revocation_reason = $2
       WHERE id = $3 AND status = 'ACTIVE'
       RETURNING id`,
      [now, reason, assignmentId]
    );

    return rows.length > 0;
  }

  /**
   * Retrieves all active role assignments for an actor, filtering out expired ones.
   */
  public async getActiveRoleAssignments(actorId: string): Promise<ActorRoleAssignment[]> {
    const rows = await this.db.query<any>(
      `SELECT id, actor_id, role_code, scope, organization_id, community_id, jurisdiction, status, assigned_by, assigned_at, expires_at, revoked_at, revocation_reason
       FROM actor_role_assignments
       WHERE actor_id = $1`,
      [actorId]
    );

    const now = Date.now();
    return rows
      .filter(r => {
        if (r.status !== 'ACTIVE') return false;
        if (r.expires_at) {
          const exp = new Date(r.expires_at).getTime();
          if (exp <= now) return false;
        }
        return true;
      })
      .map(r => ({
        id: r.id,
        actor_id: r.actor_id,
        role: r.role_code,
        scope: r.scope,
        organization_id: r.organization_id,
        community_id: r.community_id,
        jurisdiction: r.jurisdiction,
        status: r.status,
        assigned_by: r.assigned_by,
        assigned_at: r.assigned_at,
        expires_at: r.expires_at,
        revoked_at: r.revoked_at,
        revocation_reason: r.revocation_reason
      }));
  }

  /**
   * Resolves the list of active effective role codes for an actor.
   * If the actor has no explicit active assignments in the database, defaults to ['USER'] for registered actors.
   */
  public async getEffectiveRolesForActor(actorId: string): Promise<string[]> {
    const assignments = await this.getActiveRoleAssignments(actorId);
    if (assignments.length === 0) {
      return [RoleCode.USER];
    }
    const rolesSet = new Set<string>(assignments.map(a => a.role));
    return Array.from(rolesSet);
  }

  /**
   * Gets the set of permission codes associated with a list of roles.
   */
  public getPermissionsForRoles(roles: string[]): Set<string> {
    const permissions = new Set<string>();
    for (const role of roles) {
      const perms = RoleRepository.rolePermissionsMap.get(role);
      if (perms) {
        for (const p of perms) {
          permissions.add(p);
        }
      }
    }
    return permissions;
  }

  /**
   * Checks whether a role has a specific permission.
   */
  public static roleHasPermission(role: string, permissionCode: string): boolean {
    const perms = RoleRepository.rolePermissionsMap.get(role);
    return perms ? perms.has(permissionCode) : false;
  }
}
