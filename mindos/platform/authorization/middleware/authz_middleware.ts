/**
 * MindOS Canonical Authorization Express Middleware
 * Authority: Master Architecture Index Section 14, Volume VIII & Appendix F
 * ADR-016, ADR-017, ADR-018
 */

import { Request, Response, NextFunction } from 'express';
import { DataClassification } from '../../shared/data_classification.js';
import { PolicyEngine } from '../evaluators/policy_engine.js';
import { RoleRepository } from '../persistence/role_repository.js';
import { RoleCode, ActorContext, ResourceTarget, AuthorizationRequest } from '../domain/types.js';
import { CanonicalReasonCodes } from '../domain/reason_codes.js';

export interface PolicyMiddlewareOptions {
  action: string;
  resourceType: string;
  classification?: DataClassification;
  purpose?: string;
  getResourceOwnerId?: (req: Request) => string | undefined;
  getResourceAuthorId?: (req: Request) => string | undefined;
  getResourceId?: (req: Request) => string | undefined;
  checkExistenceLeakage?: boolean;
}

export class AuthorizationMiddleware {
  private static roleRepo = new RoleRepository();

  /**
   * Middleware enforcing a specific policy evaluation on the request.
   */
  public static requirePolicy(options: PolicyMiddlewareOptions) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const user = req.user;
      if (!user || !user.accountId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required for this operation.',
            safeUserMessage: 'Please sign in to continue.'
          }
        });
        return;
      }

      // Identity strictly separates authentication from authorization;
      // Fetch active roles for actor from authorization repository
      const userAny = user as any;
      let activeRoles: string[] = Array.isArray(userAny?.roles) ? userAny.roles : [];
      if (activeRoles.length === 0) {
        activeRoles = await AuthorizationMiddleware.roleRepo.getEffectiveRolesForActor(user.accountId);
      }

      const actorContext: ActorContext = {
        actor_id: user.accountId,
        identity_account_id: user.accountId,
        actor_type: userAny?.role || activeRoles[0] || RoleCode.USER,
        session_id: user.sessionId,
        roles: activeRoles,
        scopes: [],
        security_attributes: {
          accountState: user.accountState,
          securityVersion: user.securityVersion
        }
      };

      const resourceTarget: ResourceTarget = {
        type: options.resourceType,
        id: options.getResourceId ? options.getResourceId(req) : (req.params.id || req.params.sessionId),
        ownerId: options.getResourceOwnerId ? options.getResourceOwnerId(req) : undefined,
        authorId: options.getResourceAuthorId ? options.getResourceAuthorId(req) : undefined,
        classification: options.classification
      };

      const purpose =
        (req.headers['x-mindos-purpose'] as string) ||
        options.purpose ||
        (req.body && req.body.purpose) ||
        'SELF_SERVICE';

      const authzRequest: AuthorizationRequest = {
        actor: actorContext,
        action: options.action,
        resource: resourceTarget,
        purpose,
        context: {
          ipAddress: req.ip,
          headers: req.headers,
          ...(req.body || {})
        },
        correlation_id: req.headers['x-correlation-id'] as string
      };

      const decision = await PolicyEngine.evaluate(authzRequest);

      if (!decision.allowed) {
        // IDOR / Existence Leakage mitigation (Section 83):
        // If caller is denied access to a specific private resource they do not own,
        // return 404 to avoid leaking whether the resource exists, unless the policy demands explicit 403.
        if (options.checkExistenceLeakage && decision.reason_code === CanonicalReasonCodes.AUTHZ_NOT_OWNER) {
          res.status(404).json({
            error: {
              code: 'NOT_FOUND',
              message: 'The requested resource was not found.',
              safeUserMessage: 'Resource not found.'
            }
          });
          return;
        }

        res.status(403).json({
          error: {
            code: decision.errorCode || 'FORBIDDEN',
            reasonCode: decision.reason_code,
            message: decision.reason,
            safeUserMessage: 'You do not have authorization to perform this action.'
          }
        });
        return;
      }

      next();
    };
  }

  /**
   * Middleware requiring an explicit role assignment.
   */
  public static requireRole(requiredRole: RoleCode | string) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const user = req.user;
      if (!user || !user.accountId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required.'
          }
        });
        return;
      }

      const userAny = user as any;
      const activeRoles = await AuthorizationMiddleware.roleRepo.getEffectiveRolesForActor(user.accountId);
      const hasRole = activeRoles.includes(requiredRole) || (userAny?.role && userAny.role === requiredRole);

      if (!hasRole) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            reasonCode: CanonicalReasonCodes.AUTHZ_ROLE_REQUIRED,
            message: `Role '${requiredRole}' is required to access this resource.`,
            safeUserMessage: 'You do not have the necessary role permissions.'
          }
        });
        return;
      }

      next();
    };
  }

  /**
   * Middleware requiring a specific canonical permission code.
   */
  public static requirePermission(permissionCode: string) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const user = req.user;
      if (!user || !user.accountId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required.'
          }
        });
        return;
      }

      const activeRoles = await AuthorizationMiddleware.roleRepo.getEffectiveRolesForActor(user.accountId);
      const permissions = AuthorizationMiddleware.roleRepo.getPermissionsForRoles(activeRoles);

      if (!permissions.has(permissionCode)) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            reasonCode: CanonicalReasonCodes.AUTHZ_SCOPE_REQUIRED,
            message: `Permission '${permissionCode}' is required to perform this action.`,
            safeUserMessage: 'You do not have the required permission.'
          }
        });
        return;
      }

      next();
    };
  }
}
