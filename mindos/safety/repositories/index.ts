/**
 * MindOS Safety Repository Exports & Factory
 * Authority: Volumes I, V & Clinical Safety Policy Catalogue
 */

import { ISafetyRepository } from './safety_repository.js';
import { InMemorySafetyRepository } from './in_memory_safety_repository.js';
import { PgSafetyRepository } from './pg_safety_repository.js';

export * from './safety_repository.js';
export * from './in_memory_safety_repository.js';
export * from './pg_safety_repository.js';

let activeRepository: ISafetyRepository = new InMemorySafetyRepository();

export function getSafetyRepository(): ISafetyRepository {
  return activeRepository;
}

export function setSafetyRepository(repo: ISafetyRepository): void {
  activeRepository = repo;
}

export function resetSafetyRepository(): void {
  activeRepository = new InMemorySafetyRepository();
}
