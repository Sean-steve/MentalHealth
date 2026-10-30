-- Migration: 004_canonical_authorization.sql
-- Expand -> Migrate/Backfill -> Switch -> Contract
-- Authority: Master Architecture Index Section 14, Volume VIII, Appendix F & ADR-016/ADR-017/ADR-018
-- Sprint 5: Canonical Authorization, Access Control, Resource Ownership & Policy Enforcement Kernel

-- UP --
-- 1. Roles Registry Table
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(60) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_privileged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_roles_code ON roles(code);

-- 2. Permissions Registry Table (domain.resource.action)
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) UNIQUE NOT NULL,
  domain VARCHAR(60) NOT NULL,
  resource VARCHAR(60) NOT NULL,
  action VARCHAR(60) NOT NULL,
  description TEXT,
  min_classification VARCHAR(40) NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_permissions_code ON permissions(code);
CREATE INDEX IF NOT EXISTS idx_permissions_domain ON permissions(domain);

-- 3. Role Permissions Mapping Table
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code VARCHAR(60) NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
  permission_code VARCHAR(100) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role_code, permission_code)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_code);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON role_permissions(permission_code);

-- 4. Actor Role Assignments (Explicit Role Grant Model)
CREATE TABLE IF NOT EXISTS actor_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_code VARCHAR(60) NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
  scope VARCHAR(40) NOT NULL DEFAULT 'GLOBAL',
  organization_id UUID,
  community_id UUID,
  jurisdiction VARCHAR(10) DEFAULT 'KE',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  assigned_by UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revocation_reason VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_actor_role_assignments_actor ON actor_role_assignments(actor_id);
CREATE INDEX IF NOT EXISTS idx_actor_role_assignments_status ON actor_role_assignments(status);
CREATE INDEX IF NOT EXISTS idx_actor_role_assignments_role ON actor_role_assignments(role_code);

-- 5. Policy Definitions Registry Table
CREATE TABLE IF NOT EXISTS policy_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(80) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  domain VARCHAR(60) NOT NULL,
  version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  description TEXT,
  resource_type VARCHAR(60) NOT NULL,
  actions TEXT[] NOT NULL,
  classification VARCHAR(40) NOT NULL DEFAULT 'INTERNAL',
  effective_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  owner VARCHAR(80) NOT NULL DEFAULT 'PLATFORM_GOVERNANCE'
);

CREATE INDEX IF NOT EXISTS idx_policy_definitions_code ON policy_definitions(code);
CREATE INDEX IF NOT EXISTS idx_policy_definitions_resource ON policy_definitions(resource_type);
CREATE INDEX IF NOT EXISTS idx_policy_definitions_status ON policy_definitions(status);

-- DOWN --
-- DROP INDEX IF EXISTS idx_policy_definitions_status;
-- DROP INDEX IF EXISTS idx_policy_definitions_resource;
-- DROP INDEX IF EXISTS idx_policy_definitions_code;
-- DROP TABLE IF EXISTS policy_definitions;
-- DROP INDEX IF EXISTS idx_actor_role_assignments_role;
-- DROP INDEX IF EXISTS idx_actor_role_assignments_status;
-- DROP INDEX IF EXISTS idx_actor_role_assignments_actor;
-- DROP TABLE IF EXISTS actor_role_assignments;
-- DROP INDEX IF EXISTS idx_role_permissions_perm;
-- DROP INDEX IF EXISTS idx_role_permissions_role;
-- DROP TABLE IF EXISTS role_permissions;
-- DROP INDEX IF EXISTS idx_permissions_domain;
-- DROP INDEX IF EXISTS idx_permissions_code;
-- DROP TABLE IF EXISTS permissions;
-- DROP INDEX IF EXISTS idx_roles_code;
-- DROP TABLE IF EXISTS roles;
