/**
 * MindOS Governed AI Memory Repository
 * Authority: Volumes IV, XV & Appendices B / C / H (Kenya DPA 2019 Right to Erasure)
 */

import { AIMemoryEntity } from '../domain/types.js';
import { NotFoundError } from '../../platform/errors/index.js';

export class MemoryRepository {
  private static memories: Map<string, AIMemoryEntity> = new Map();

  public static async saveMemory(memory: AIMemoryEntity): Promise<void> {
    MemoryRepository.memories.set(memory.id, { ...memory });
  }

  public static async getMemory(id: string): Promise<AIMemoryEntity | null> {
    const mem = MemoryRepository.memories.get(id);
    return mem ? { ...mem } : null;
  }

  public static async getActiveMemoriesForUser(userId: string): Promise<AIMemoryEntity[]> {
    const results: AIMemoryEntity[] = [];
    for (const mem of MemoryRepository.memories.values()) {
      if (mem.user_id === userId && mem.status === 'ACTIVE') {
        results.push({ ...mem });
      }
    }
    return results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public static async updateMemory(id: string, text: string): Promise<AIMemoryEntity> {
    const mem = MemoryRepository.memories.get(id);
    if (!mem) {
      throw new NotFoundError(`AI Memory with ID ${id} not found.`);
    }
    mem.memory_text = text;
    mem.updated_at = new Date().toISOString();
    MemoryRepository.memories.set(id, mem);
    return { ...mem };
  }

  public static async deleteMemory(id: string): Promise<void> {
    const mem = MemoryRepository.memories.get(id);
    if (!mem) return;
    mem.status = 'DELETED';
    mem.updated_at = new Date().toISOString();
    MemoryRepository.memories.set(id, mem);
  }

  public static async clearUserMemories(userId: string): Promise<number> {
    let count = 0;
    for (const mem of MemoryRepository.memories.values()) {
      if (mem.user_id === userId && mem.status === 'ACTIVE') {
        mem.status = 'DELETED';
        mem.updated_at = new Date().toISOString();
        count++;
      }
    }
    return count;
  }

  public static resetForTesting(): void {
    MemoryRepository.memories.clear();
  }
}
