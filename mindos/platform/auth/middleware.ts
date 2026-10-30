/**
 * MindOS Platform Authentication Middleware
 * Authority: Master Architecture Index Section 7 & 14, Volumes III, VIII & ADR-014
 * 
 * Provides unified authentication middleware across platform HTTP endpoints.
 * Validates cryptographic JWT and active server session when provided,
 * while supporting actor resolution headers for dev/interactive environments.
 */

import { Request, Response, NextFunction } from 'express';
import { IdentityService } from '../../identity/services/identity_service.js';
import { AuthenticatedUserContext, AccountState } from '../../identity/types.js';
import { AuthenticationError } from '../errors/index.js';

export type PlatformUserContext = AuthenticatedUserContext;

export class AuthenticationMiddleware {
  private static identityService = new IdentityService();

  /**
   * Express middleware to authenticate inbound requests.
   */
  public static async authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      try {
        const { account, session } = await AuthenticationMiddleware.identityService.validateTokenAndSession(token);
        req.user = {
          id: account.id,
          accountId: account.id,
          email: account.email_normalized,
          accountState: account.account_state,
          securityVersion: account.security_version,
          sessionId: session.id,
          emailVerified: account.email_verification_status === 'VERIFIED'
        };
        return next();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Invalid session token';
        res.status(401).json({
          error: {
            code: 'UNAUTHENTICATED',
            message,
            safeUserMessage: 'Session expired or invalid. Please sign in again.'
          }
        });
        return;
      }
    }

    // Interactive / Demo / Developer context fallback
    const headerActor = (req.headers['x-actor-id'] as string) || (req.headers['x-user-id'] as string);
    const queryUser = req.query.user_id as string;
    const existingUser = (req as any).user;
    const resolvedId = existingUser?.id || existingUser?.accountId || headerActor || queryUser || '01918c00-0001-7000-8000-000000000001';

    req.user = {
      id: resolvedId,
      accountId: resolvedId,
      email: existingUser?.email || 'user@mindos.internal',
      accountState: existingUser?.accountState || 'ACTIVE',
      securityVersion: 1,
      sessionId: existingUser?.sessionId || 'sess-dev-001',
      emailVerified: true
    };

    next();
  }
}
