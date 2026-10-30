/**
 * MindOS Care Relationships Invariants & Clinical Governance Guards
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Clinical Safety Policy Catalogue (R-REL-001..008, ADR-016, ADR-028)
 */

import { DomainInvariantError, AuthorizationError } from '../../platform/errors/index.js';
import {
  CareRelationship,
  CareTeamMembership,
  CareRelationshipScope
} from './entities.js';
import {
  CareRelationshipState,
  CareTeamMembershipState,
  DataDomain,
  ActionPermission
} from './types.js';

export class CareRelationshipInvariants {
  /**
   * Enforces that directory browsing, search, or booking page view never creates a relationship.
   */
  public static assertValidRelationshipCreationTrigger(originType: string): void {
    const invalidOrigins = ['DIRECTORY_VIEW', 'PROFILE_VIEW', 'SEARCH', 'BOOKING_VIEW'];
    if (invalidOrigins.includes(originType.toUpperCase())) {
      throw new DomainInvariantError(
        `R-REL-001: Cannot establish CareRelationship from passive discovery or view trigger: ${originType}`,
        { safeUserMessage: 'Care relationships cannot be established from directory browsing.' }
      );
    }
  }

  /**
   * Asserts that a professional is eligible to be a primary provider or care team member.
   */
  public static assertProfessionalEligible(professional: {
    id: string;
    isVerified: boolean;
    isActive: boolean;
    isSuspended?: boolean;
    licenseExpired?: boolean;
    jurisdictions?: string[];
  }, requiredJurisdiction?: string): void {
    if (professional.isSuspended) {
      throw new AuthorizationError(
        `R-REL-003: Professional ${professional.id} is suspended and cannot participate in care relationships.`,
        { errorCode: 'AUTHZ_003' }
      );
    }
    if (!professional.isActive) {
      throw new AuthorizationError(
        `R-REL-003: Professional ${professional.id} is not in ACTIVE state.`,
        { errorCode: 'AUTHZ_003' }
      );
    }
    if (!professional.isVerified) {
      throw new AuthorizationError(
        `R-REL-003: Professional ${professional.id} lacks verified clinical credentials.`,
        { errorCode: 'AUTHZ_003' }
      );
    }
    if (professional.licenseExpired) {
      throw new AuthorizationError(
        `R-REL-003: Professional ${professional.id} regulatory license has expired.`,
        { errorCode: 'AUTHZ_003' }
      );
    }
    if (requiredJurisdiction && professional.jurisdictions && professional.jurisdictions.length > 0) {
      if (!professional.jurisdictions.includes(requiredJurisdiction)) {
        throw new DomainInvariantError(
          `R-REL-003: Professional jurisdiction mismatch. Required: ${requiredJurisdiction}, allowed: [${professional.jurisdictions.join(', ')}]`,
          { safeUserMessage: 'Provider is not licensed to practice in this jurisdiction.' }
        );
      }
    }
  }

  /**
   * Validates relationship-scoped data domain access.
   */
  public static assertDataDomainAccessAllowed(
    relationship: CareRelationship,
    domain: DataDomain
  ): void {
    if (!relationship.scope.allowed_data_domains.includes(domain)) {
      throw new AuthorizationError(
        `R-REL-005: Requested data domain '${domain}' is outside the authorized scope for CareRelationship ${relationship.id}.`,
        { errorCode: 'AUTHZ_004' }
      );
    }
  }

  /**
   * Validates relationship-scoped action permission.
   */
  public static assertActionAllowed(
    relationship: CareRelationship,
    action: ActionPermission
  ): void {
    // If relationship is terminated, write/sign/modify actions are strictly forbidden
    if (
      (relationship.status === CareRelationshipState.TERMINATED || relationship.status === CareRelationshipState.REVOKED) &&
      action !== ActionPermission.READ
    ) {
      throw new AuthorizationError(
        `R-REL-007: Care relationship ${relationship.id} is terminated/revoked. Only read-only historical access is permitted.`,
        { errorCode: 'AUTHZ_003' }
      );
    }

    if (!relationship.scope.allowed_actions.includes(action)) {
      throw new AuthorizationError(
        `R-REL-005: Action '${action}' is not permitted by CareRelationship scope for relationship ${relationship.id}.`,
        { errorCode: 'AUTHZ_004' }
      );
    }
  }

  /**
   * Asserts relationship state allows active clinical operations.
   */
  public static assertRelationshipActive(relationship: CareRelationship, operation = 'clinical operation'): void {
    if (relationship.status !== CareRelationshipState.ACTIVE) {
      throw new DomainInvariantError(
        `R-REL-005: Care relationship ${relationship.id} is in state ${relationship.status}. Active status required for ${operation}.`,
        { safeUserMessage: `Care relationship is currently ${relationship.status.toLowerCase()}.` }
      );
    }
  }

  /**
   * Asserts care team membership is active.
   */
  public static assertCareTeamMembershipActive(membership: CareTeamMembership): void {
    if (membership.status !== CareTeamMembershipState.ACTIVE) {
      throw new AuthorizationError(
        `R-REL-008: Care team membership for professional ${membership.professional_id} is in state ${membership.status}.`,
        { errorCode: 'AUTHZ_003' }
      );
    }
  }
}
