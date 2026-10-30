/**
 * MindOS Professional Network & Provider Verification Bounded Context
 * Sprint 19 Entry Point
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 */

export * from './domain/types.js';
export * from './domain/entities.js';
export * from './domain/invariants.js';
export * from './repositories/interfaces.js';
export * from './repositories/in_memory_professional_repository.js';
export * from './specialties/specialty_registry.js';
export * from './scope/scope_service.js';
export * from './verification/verification_service.js';
export * from './registry/provider_registry_service.js';
export * from './service.js';
