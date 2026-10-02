import { InMemoryProfessionalMessagingRepository } from './repositories/in_memory_professional_messaging_repository.js';
import { ProfessionalMessagingService } from './application/professional_messaging_service.js';

const defaultRepository = new InMemoryProfessionalMessagingRepository();
ProfessionalMessagingService.setRepository(defaultRepository);

export * from './domain/types.js';
export * from './domain/entities.js';
export * from './repositories/interfaces.js';
export * from './repositories/in_memory_professional_messaging_repository.js';
export * from './repositories/pg_professional_messaging_repository.js';
export * from './adapters/notification_adapter.js';
export * from './api/routes.js';
export * from './application/ports.js';
export * from './application/professional_messaging_service.js';

export function resetProfessionalMessagingForTesting(): void { defaultRepository.clear(); }