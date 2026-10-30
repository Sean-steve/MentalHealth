/**
 * MindOS Canonical Authorization Engine & Policy Enforcement Test Suite (Sprint 5)
 * Authority: Master Architecture Index Section 14, Volume VIII & Appendix F
 * ADR-016, ADR-017, ADR-018
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { v7 as uuidv7 } from 'uuid';
import { DataClassification } from '../mindos/platform/shared/data_classification.js';
import {
  AuthorizationEngine,
  PolicyEngine,
  PolicyRegistry,
  RoleRepository,
  AuthorizationMiddleware,
  RoleCode,
  RoleScope,
  CanonicalReasonCodes,
  CanonicalPermissions,
  CanonicalPurposes,
  CANONICAL_POLICIES
} from '../mindos/platform/authorization/index.js';
import { AuditService } from '../mindos/platform/audit/index.js';
import { DatabaseManager } from '../mindos/platform/database/connection.js';

describe('MindOS Sprint 5: Canonical Authorization & Policy Enforcement Architecture', () => {
  beforeEach(() => {
    PolicyEngine.resetMetrics();
  });

  describe('1. Deny-by-Default Invariants & Authentication Enforcement', () => {
    test('Denies access when actor is unauthenticated or missing actor_id', async () => {
      const decision = await PolicyEngine.evaluate({
        actor: {
          actor_id: '',
          identity_account_id: '',
          actor_type: 'ANONYMOUS',
          roles: [],
          scopes: []
        },
        action: 'resource.read',
        resource: { type: 'document', id: 'doc-1' }
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.effect, 'DENY');
      assert.equal(decision.reason_code, CanonicalReasonCodes.AUTHZ_UNAUTHENTICATED);
    });

    test('Denies access when actor account is in locked or suspended state', async () => {
      const decision = await PolicyEngine.evaluate({
        actor: {
          actor_id: 'user-suspended-1',
          identity_account_id: 'user-suspended-1',
          actor_type: RoleCode.USER,
          roles: [RoleCode.USER],
          scopes: [],
          security_attributes: {
            accountState: 'SUSPENDED'
          }
        },
        action: 'user_profile.read_own',
        resource: { type: 'user_profile', id: 'user-suspended-1', ownerId: 'user-suspended-1' }
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reason_code, CanonicalReasonCodes.AUTHZ_ACCOUNT_STATE_DENIED);
    });

    test('Denies access by default for unmapped actions or resources', async () => {
      const decision = await PolicyEngine.evaluate({
        actor: {
          actor_id: 'user-active-1',
          identity_account_id: 'user-active-1',
          actor_type: RoleCode.USER,
          roles: [RoleCode.USER],
          scopes: []
        },
        action: 'unknown_action',
        resource: { type: 'unregistered_resource', id: 'res-99' }
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reason_code, CanonicalReasonCodes.AUTHZ_DENY_BY_DEFAULT);
    });
  });

  describe('2. R-SEC-001: Platform Administrator Health Boundary Restriction', () => {
    test('Strictly BLOCKS PLATFORM_ADMIN from accessing clinical notes of other patients', async () => {
      const decision = await PolicyEngine.evaluate({
        actor: {
          actor_id: 'admin-root',
          identity_account_id: 'admin-root',
          actor_type: RoleCode.PLATFORM_ADMIN,
          roles: [RoleCode.PLATFORM_ADMIN],
          scopes: []
        },
        action: 'read',
        resource: {
          type: 'clinical_notes',
          id: 'note-pat-1',
          ownerId: 'patient-42',
          classification: DataClassification.CLINICAL_RECORD
        },
        purpose: 'SYSTEM_OPERATION'
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reason_code, CanonicalReasonCodes.AUTHZ_ADMIN_HEALTH_PROHIBITED);
      assert.match(decision.reason, /Platform administrators are prohibited/i);
    });

    test('Strictly BLOCKS PLATFORM_ADMIN from reading private psychological journals', async () => {
      const decision = await PolicyEngine.evaluate({
        actor: {
          actor_id: 'admin-sec',
          identity_account_id: 'admin-sec',
          actor_type: RoleCode.PLATFORM_ADMIN,
          roles: [RoleCode.PLATFORM_ADMIN],
          scopes: []
        },
        action: 'read',
        resource: {
          type: 'journal',
          id: 'journal-entry-1',
          ownerId: 'patient-123',
          classification: DataClassification.HEALTH_SENSITIVE
        }
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reason_code, CanonicalReasonCodes.AUTHZ_ADMIN_HEALTH_PROHIBITED);
    });

    test('PERMITS PLATFORM_ADMIN to manage technical system settings', async () => {
      const decision = await PolicyEngine.evaluate({
        actor: {
          actor_id: 'admin-ops',
          identity_account_id: 'admin-ops',
          actor_type: RoleCode.PLATFORM_ADMIN,
          roles: [RoleCode.PLATFORM_ADMIN],
          scopes: []
        },
        action: 'update',
        resource: { type: 'platform_config', id: 'global-security' },
        purpose: 'SYSTEM_OPERATION'
      });

      assert.equal(decision.allowed, true);
      assert.equal(decision.reason_code, CanonicalReasonCodes.AUTHZ_ALLOWED);
    });
  });

  describe('3. R-COM-001: Community Moderator Health Boundary Restriction', () => {
    test('Strictly BLOCKS MODERATOR from accessing clinical records or assessments', async () => {
      const decision = await PolicyEngine.evaluate({
        actor: {
          actor_id: 'mod-1',
          identity_account_id: 'mod-1',
          actor_type: RoleCode.MODERATOR,
          roles: [RoleCode.MODERATOR],
          scopes: []
        },
        action: 'read',
        resource: {
          type: 'assessment',
          id: 'assessment-99',
          ownerId: 'patient-88',
          classification: DataClassification.CLINICAL_RECORD
        }
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reason_code, CanonicalReasonCodes.AUTHZ_MODERATOR_HEALTH_PROHIBITED);
    });

    test('PERMITS MODERATOR to moderate and flag community posts', async () => {
      const decision = await PolicyEngine.evaluate({
        actor: {
          actor_id: 'mod-1',
          identity_account_id: 'mod-1',
          actor_type: RoleCode.MODERATOR,
          roles: [RoleCode.MODERATOR],
          scopes: []
        },
        action: 'moderate',
        resource: {
          type: 'community_post',
          id: 'post-101',
          authorId: 'user-author-9'
        },
        purpose: CanonicalPurposes.MODERATION
      });

      assert.equal(decision.allowed, true);
      assert.equal(decision.reason_code, CanonicalReasonCodes.AUTHZ_ALLOWED);
    });
  });

  describe('4. Healthcare Professional Clinical Access & Purpose/Consent Verification', () => {
    test('Blocks unverified professional candidate from accessing clinical records', async () => {
      const decision = await PolicyEngine.evaluate({
        actor: {
          actor_id: 'doc-unverified',
          identity_account_id: 'doc-unverified',
          actor_type: RoleCode.PROFESSIONAL,
          roles: [RoleCode.PROFESSIONAL],
          scopes: [],
          professional_context: { isVerified: false }
        },
        action: 'read',
        resource: {
          type: 'clinical_notes',
          id: 'note-1',
          ownerId: 'patient-10'
        },
        purpose: CanonicalPurposes.CARE_DELIVERY,
        relationship_context: { careRelationshipActive: true },
        consent_context: { consentGrantActive: true }
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reason_code, CanonicalReasonCodes.AUTHZ_ROLE_REQUIRED);
      assert.match(decision.reason, /verified healthcare professional/i);
    });

    test('Blocks verified professional when active care relationship is missing', async () => {
      const decision = await PolicyEngine.evaluate({
        actor: {
          actor_id: 'doc-verified',
          identity_account_id: 'doc-verified',
          actor_type: RoleCode.VERIFIED_PROFESSIONAL,
          roles: [RoleCode.VERIFIED_PROFESSIONAL],
          scopes: [],
          professional_context: { isVerified: true }
        },
        action: 'read',
        resource: {
          type: 'clinical_notes',
          id: 'note-1',
          ownerId: 'patient-10'
        },
        purpose: CanonicalPurposes.CARE_DELIVERY,
        relationship_context: { careRelationshipActive: false }
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reason_code, CanonicalReasonCodes.AUTHZ_RELATIONSHIP_REQUIRED);
    });

    test('Blocks verified professional when purpose is missing or non-canonical', async () => {
      const decision = await PolicyEngine.evaluate({
        actor: {
          actor_id: 'doc-verified',
          identity_account_id: 'doc-verified',
          actor_type: RoleCode.VERIFIED_PROFESSIONAL,
          roles: [RoleCode.VERIFIED_PROFESSIONAL],
          scopes: []
        },
        action: 'read',
        resource: {
          type: 'clinical_notes',
          id: 'note-1',
          ownerId: 'patient-10'
        },
        purpose: 'Curiosity browsing',
        relationship_context: { careRelationshipActive: true }
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reason_code, CanonicalReasonCodes.AUTHZ_PURPOSE_REQUIRED);
    });

    test('Blocks verified professional when patient consent grant is absent or revoked', async () => {
      const decision = await PolicyEngine.evaluate({
        actor: {
          actor_id: 'doc-verified',
          identity_account_id: 'doc-verified',
          actor_type: RoleCode.VERIFIED_PROFESSIONAL,
          roles: [RoleCode.VERIFIED_PROFESSIONAL],
          scopes: []
        },
        action: 'read',
        resource: {
          type: 'clinical_notes',
          id: 'note-1',
          ownerId: 'patient-10'
        },
        purpose: CanonicalPurposes.CARE_DELIVERY,
        relationship_context: { careRelationshipActive: true },
        consent_context: { consentGrantActive: false }
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reason_code, CanonicalReasonCodes.AUTHZ_CONSENT_REQUIRED);
    });

    test('GRANTS access to verified professional with care relationship, canonical purpose and active consent', async () => {
      const decision = await PolicyEngine.evaluate({
        actor: {
          actor_id: 'doc-verified',
          identity_account_id: 'doc-verified',
          actor_type: RoleCode.VERIFIED_PROFESSIONAL,
          roles: [RoleCode.VERIFIED_PROFESSIONAL],
          scopes: []
        },
        action: 'read',
        resource: {
          type: 'clinical_notes',
          id: 'note-1',
          ownerId: 'patient-10'
        },
        purpose: CanonicalPurposes.CARE_DELIVERY,
        relationship_context: { careRelationshipActive: true },
        consent_context: { consentGrantActive: true }
      });

      assert.equal(decision.allowed, true);
      assert.equal(decision.reason_code, CanonicalReasonCodes.AUTHZ_ALLOWED);
    });
  });

  describe('5. IDOR & Ownership Isolation', () => {
    test('Prevents user from accessing another user identity session (IDOR mitigation)', async () => {
      const decision = await PolicyEngine.evaluate({
        actor: {
          actor_id: 'attacker-user',
          identity_account_id: 'attacker-user',
          actor_type: RoleCode.USER,
          roles: [RoleCode.USER],
          scopes: []
        },
        action: 'read_own',
        resource: {
          type: 'identity_session',
          id: 'session-victim',
          ownerId: 'victim-user'
        }
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reason_code, CanonicalReasonCodes.AUTHZ_NOT_OWNER);
      assert.match(decision.reason, /Actor is not the owner/i);
    });

    test('Allows user to revoke their own active session', async () => {
      const decision = await PolicyEngine.evaluate({
        actor: {
          actor_id: 'user-legit',
          identity_account_id: 'user-legit',
          actor_type: RoleCode.USER,
          roles: [RoleCode.USER],
          scopes: []
        },
        action: 'revoke_own',
        resource: {
          type: 'identity_session',
          id: 'session-123',
          ownerId: 'user-legit'
        }
      });

      assert.equal(decision.allowed, true);
      assert.equal(decision.reason_code, CanonicalReasonCodes.AUTHZ_ALLOWED);
    });

    test('Prevents non-author user from deleting community post', async () => {
      const decision = await PolicyEngine.evaluate({
        actor: {
          actor_id: 'user-bystander',
          identity_account_id: 'user-bystander',
          actor_type: RoleCode.USER,
          roles: [RoleCode.USER],
          scopes: []
        },
        action: 'delete_own',
        resource: {
          type: 'community_post',
          id: 'post-original',
          authorId: 'user-author'
        }
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reason_code, CanonicalReasonCodes.AUTHZ_NOT_OWNER);
    });
  });

  describe('6. Role Repository & Scoped Permission Management', () => {
    const roleRepo = new RoleRepository();

    test('Seeds canonical roles and permissions idempotently', async () => {
      await roleRepo.seedRolesAndPermissions();
      const client = DatabaseManager.getClient();
      const rolesRes = await client.query('SELECT * FROM roles');
      const permRes = await client.query('SELECT * FROM permissions');

      assert.ok(rolesRes.length >= 12);
      assert.ok(permRes.length >= 20);
    });

    test('Assigns scoped role and resolves effective roles ignoring expired assignments', async () => {
      const actorId = 'actor-assignment-test-' + uuidv7().substring(0, 8);

      // Active assignment
      await roleRepo.assignRole({
        actorId,
        roleCode: RoleCode.PEER_SUPPORTER,
        scope: RoleScope.COMMUNITY,
        communityId: 'anxiety-support-group',
        assignedBy: 'system'
      });

      // Expired assignment
      await roleRepo.assignRole({
        actorId,
        roleCode: RoleCode.MODERATOR,
        scope: RoleScope.GLOBAL,
        assignedBy: 'system',
        expiresAt: new Date(Date.now() - 3600000).toISOString()
      });

      const effectiveRoles = await roleRepo.getEffectiveRolesForActor(actorId);
      assert.ok(effectiveRoles.includes(RoleCode.PEER_SUPPORTER));
      assert.ok(!effectiveRoles.includes(RoleCode.MODERATOR), 'Expired role must not be effective');
    });

    test('Resolves permissions for roles correctly from canonical matrix', () => {
      const perms = roleRepo.getPermissionsForRoles([RoleCode.USER]);
      assert.ok(perms.has(CanonicalPermissions.IDENTITY_ACCOUNT_READ_OWN));
      assert.ok(perms.has(CanonicalPermissions.COMMUNITY_POST_CREATE));
      assert.ok(!perms.has(CanonicalPermissions.COMMUNITY_POST_MODERATE));

      const modPerms = roleRepo.getPermissionsForRoles([RoleCode.MODERATOR]);
      assert.ok(modPerms.has(CanonicalPermissions.COMMUNITY_POST_MODERATE));
      assert.ok(!modPerms.has(CanonicalPermissions.CLINICAL_RECORD_READ));
    });
  });

  describe('7. Policy Registry Verification', () => {
    test('Contains all canonical policies with valid schemas', () => {
      const allPolicies = PolicyRegistry.getAllPolicies();
      assert.ok(allPolicies.length >= 7);

      const clinicalPolicy = PolicyRegistry.getPolicy('policy.clinical.record.access');
      assert.ok(clinicalPolicy);
      assert.equal(clinicalPolicy.resource_type, 'clinical_record');
      assert.ok(clinicalPolicy.actions.length >= 2);
    });
  });

  describe('8. Fail-Closed Resilience & Audit Security Integration', () => {
    test('Fail-closed safeguard denies access if evaluation throws an unexpected error', async () => {
      // Mock an unexpected failure by passing an object with throwing getter
      const maliciousRequest: any = {
        get actor() {
          throw new Error('Explosion in context resolver');
        }
      };

      const decision = await PolicyEngine.evaluate(maliciousRequest);
      assert.equal(decision.allowed, false);
      assert.equal(decision.effect, 'DENY');
      assert.equal(decision.reason_code, CanonicalReasonCodes.AUTHZ_HARD_DENY);
      assert.match(decision.reason, /fail-closed safeguard/i);
    });

    test('Evaluations update observability metrics', async () => {
      await PolicyEngine.evaluate({
        actor: {
          actor_id: 'metric-actor',
          identity_account_id: 'metric-actor',
          actor_type: RoleCode.USER,
          roles: [RoleCode.USER],
          scopes: []
        },
        action: 'user_profile.read_own',
        resource: { type: 'user_profile', id: 'metric-actor', ownerId: 'metric-actor' }
      });

      const metrics = PolicyEngine.getMetrics();
      assert.ok(metrics.evaluationsTotal >= 1);
      assert.ok(metrics.allowedTotal >= 1);
    });
  });

  describe('9. Express Authorization Middleware Integration', () => {
    test('requireRole rejects request when user lacks designated role', async () => {
      const middleware = AuthorizationMiddleware.requireRole(RoleCode.PLATFORM_ADMIN);

      let statusCode = 200;
      let responseBody: any = null;
      let nextCalled = false;

      const mockReq: any = {
        user: {
          accountId: 'regular-user-99',
          role: RoleCode.USER,
          roles: [RoleCode.USER]
        }
      };

      const mockRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(body: any) {
          responseBody = body;
          return this;
        }
      };

      await middleware(mockReq, mockRes, () => {
        nextCalled = true;
      });

      assert.equal(statusCode, 403);
      assert.equal(nextCalled, false);
      assert.equal(responseBody.error.code, 'FORBIDDEN');
    });

    test('requirePolicy permits authorized owner to access own resource', async () => {
      const middleware = AuthorizationMiddleware.requirePolicy({
        action: 'revoke_own',
        resourceType: 'identity_session',
        getResourceOwnerId: (req: any) => req.user.accountId
      });

      let nextCalled = false;
      const mockReq: any = {
        user: {
          accountId: 'legit-owner',
          roles: [RoleCode.USER]
        },
        params: { id: 'sess-1' },
        headers: {}
      };
      const mockRes: any = {
        status: () => mockRes,
        json: () => mockRes
      };

      await middleware(mockReq, mockRes, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });
  });
});
