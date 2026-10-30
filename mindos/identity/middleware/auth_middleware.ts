/**
 * MindOS Identity Express Middleware
 * Authority: Volumes III, VIII & ADR-014
 * 
 * Provides:
 * - authenticateRequest: Enforces valid, unrevoked JWT and active server session.
 * - optionalAuthenticateRequest: Attaches user context if present, passes through otherwise.
 * - requireVerifiedEmail: Rejects requests if account email is unverified.
 */

import { Request, Response, NextFunction } from 'express';
import { IdentityService } from '../services/identity_service.js';
import { AuthenticatedUserContext } from '../types.js';
import { AuthenticationError, AuthorizationError } from '../../platform/errors/index.js';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUserContext;
    }
  }
}

export function createAuthMiddleware(identityService: IdentityService) {
  return async function authenticateRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Missing or invalid Authorization header.',
          safeUserMessage: 'Please sign in to continue.'
        }
      });
      return;
    }

    const token = authHeader.substring(7).trim();

    try {
      const { account, session } = await identityService.validateTokenAndSession(token);

      req.user = {
        accountId: account.id,
        email: account.email_normalized,
        accountState: account.account_state,
        securityVersion: account.security_version,
        sessionId: session.id,
        emailVerified: account.email_verification_status === 'VERIFIED'
      };

      next();
    } catch (err: unknown) {
      if (err instanceof AuthenticationError) {
        res.status(401).json({
          error: {
            code: err.errorCode || 'UNAUTHENTICATED',
            message: err.message,
            safeUserMessage: err.safeUserMessage || 'Session invalid or expired. Please sign in again.'
          }
        });
        return;
      }

      res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication failed.',
          safeUserMessage: 'Please sign in to continue.'
        }
      });
    }
  };
}

export function requireVerifiedEmail(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required.'
      }
    });
    return;
  }

  if (!req.user.emailVerified) {
    res.status(403).json({
      error: {
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message: 'Email address must be verified before performing this action.',
        safeUserMessage: 'Please verify your email address before continuing.'
      }
    });
    return;
  }

  next();
}
