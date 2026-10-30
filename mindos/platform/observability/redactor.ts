/**
 * MindOS Sensitive Data Redactor
 * Authority: Master Architecture Index Section 27, Volume VIII, Appendix M (T-028)
 */

export const SENSITIVE_FIELD_NAMES = new Set([
  'password',
  'passwd',
  'token',
  'refreshtoken',
  'refresh_token',
  'token_family_hash',
  'jwt',
  'secret',
  'session_secret',
  'jwt_secret',
  'ciphertext',
  'content_ciphertext',
  'name_ciphertext',
  'contact_ciphertext',
  'identifier_ciphertext',
  'journal_text',
  'raw_journal',
  'clinical_note',
  'clinical_text',
  'clinical_notes',
  'diagnosis',
  'assessment_answers',
  'answer_json',
  'conversation_text',
  'ai_prompt',
  'ai_response',
  'prompt_template',
  'card_number',
  'cvv',
  'authorization'
]);

export class SensitiveDataRedactor {
  private emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  private phoneRegex = /(\+?\d{1,4}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)[\d\s-]{6,10}/g;
  private bearerRegex = /Bearer\s+[A-Za-z0-9\-_.]+/gi;

  public redactText(text: string): string {
    if (!text || typeof text !== 'string') return text;
    return text
      .replace(this.emailRegex, '[REDACTED_EMAIL]')
      .replace(this.phoneRegex, '[REDACTED_PHONE]')
      .replace(this.bearerRegex, 'Bearer [REDACTED_TOKEN]');
  }

  public redactObject<T = Record<string, unknown>>(obj: T, depth = 0): T {
    if (depth > 8 || obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.redactText(obj) as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactObject(item, depth + 1)) as unknown as T;
    }

    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey === 'clinical_note' ||
          lowerKey === 'clinical_text' ||
          lowerKey === 'clinical_notes' ||
          lowerKey === 'diagnosis'
        ) {
          result[key] = '[REDACTED_CLINICAL_DATA]';
        } else if (SENSITIVE_FIELD_NAMES.has(lowerKey)) {
          result[key] = '[REDACTED_SENSITIVE_FIELD]';
        } else if (typeof value === 'string') {
          result[key] = this.redactText(value);
        } else if (typeof value === 'object' && value !== null) {
          result[key] = this.redactObject(value, depth + 1);
        } else {
          result[key] = value;
        }
      }
      return result as T;
    }

    return obj;
  }
}

export const sensitiveRedactor = new SensitiveDataRedactor();

export function redactSensitiveData(obj: unknown, depth = 0): unknown {
  return sensitiveRedactor.redactObject(obj, depth);
}
