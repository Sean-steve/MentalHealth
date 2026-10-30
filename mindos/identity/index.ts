/**
 * MindOS Identity Bounded Context
 * Authority: Volumes III, VIII & Appendix B / C / E / F & ADR-014/ADR-015
 * 
 * Strict Bounded Context Rules:
 * - Owns: Accounts, credentials, authentication, sessions, challenges, rate limiting.
 * - Enforces zero leakage of passwords or sensitive credentials into logs/events.
 * - Does NOT own: Consent policies, clinical records, assessments, professional licenses.
 * - Guarantees transactional consistency and transactional outbox event emission.
 */

// Export Types & Contracts
export * from './types.js';

// Export Security Subsystems
export { PasswordSecurity } from './security/password.js';
export type { PasswordHashResult } from './security/password.js';
export { TokenSecurity } from './security/tokens.js';
export { IdentityRateLimiter } from './security/rate_limiter.js';

// Export Notification Ports & Adapters
export {
  DevIdentityNotificationAdapter
} from './notifications/port.js';
export type {
  IdentityNotificationPort,
  SentNotification
} from './notifications/port.js';

// Export Persistence
export { IdentityRepository } from './persistence/identity_repository.js';
export { AccountState } from '../platform/shared/state_machines.js';

// Export Middleware
export {
  createAuthMiddleware,
  requireVerifiedEmail
} from './middleware/auth_middleware.js';

// Export Canonical Identity Service
export { IdentityService } from './services/identity_service.js';
