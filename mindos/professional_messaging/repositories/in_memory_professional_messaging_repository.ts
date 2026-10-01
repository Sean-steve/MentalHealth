import { IProfessionalMessagingRepository } from './interfaces.js';
import {
  ProfessionalMessageThread,
  ProfessionalThreadParticipant,
  ProfessionalMessage,
  ProfessionalMessageAttachment
} from '../domain/entities.js';

export class InMemoryProfessionalMessagingRepository implements IProfessionalMessagingRepository {
  private threads = new Map<string, ProfessionalMessageThread>();
  private participants = new Map<string, ProfessionalThreadParticipant>();
  private messages = new Map<string, ProfessionalMessage>();
  private attachments = new Map<string, ProfessionalMessageAttachment>();

  async saveThread(thread: ProfessionalMessageThread): Promise<void> { this.threads.set(thread.id, structuredClone(thread)); }
  async findThreadById(id: string): Promise<ProfessionalMessageThread | null> { const x=this.threads.get(id); return x?structuredClone(x):null; }
  async findThreadsByRelationshipId(relationshipId: string): Promise<ProfessionalMessageThread[]> { return Array.from(this.threads.values()).filter(t=>t.care_relationship_id===relationshipId).map(x => structuredClone(x)); }
  async saveParticipant(p: ProfessionalThreadParticipant): Promise<void> { this.participants.set(p.id, structuredClone(p)); }
  async findParticipant(threadId: string, actorId: string): Promise<ProfessionalThreadParticipant | null> { const p=Array.from(this.participants.values()).find(x=>x.thread_id===threadId&&x.actor_id===actorId); return p?structuredClone(p):null; }
  async findParticipants(threadId: string): Promise<ProfessionalThreadParticipant[]> { return Array.from(this.participants.values()).filter(p=>p.thread_id===threadId).map(x => structuredClone(x)); }
  async saveMessage(message: ProfessionalMessage): Promise<void> { this.messages.set(message.id, structuredClone(message)); }
  async findMessageById(id: string): Promise<ProfessionalMessage | null> { const x=this.messages.get(id); return x?structuredClone(x):null; }
  async findMessageByIdempotencyKey(threadId: string, key: string): Promise<ProfessionalMessage | null> { const x=Array.from(this.messages.values()).find(m=>m.thread_id===threadId&&m.idempotency_key===key); return x?structuredClone(x):null; }
  async findMessages(threadId: string): Promise<ProfessionalMessage[]> { return Array.from(this.messages.values()).filter(m=>m.thread_id===threadId).sort((a,b)=>a.sent_at.localeCompare(b.sent_at)||a.id.localeCompare(b.id)).map(x => structuredClone(x)); }
  async saveAttachment(a: ProfessionalMessageAttachment): Promise<void> { this.attachments.set(a.id, structuredClone(a)); }
  async findAttachments(messageId: string): Promise<ProfessionalMessageAttachment[]> { return Array.from(this.attachments.values()).filter(a=>a.message_id===messageId).map(x => structuredClone(x)); }
  clear(): void { this.threads.clear(); this.participants.clear(); this.messages.clear(); this.attachments.clear(); }
}