/**
 * MindOS Canonical Audit Redaction Engine
 * Authority: Master Architecture Index Section 27, Volume VIII, Appendix M (T-028)
 * ADR-022
 */

export const SENSITIVE_KEY_NAMES = new Set([
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
  'private_key',
  'privatekey',
  'api_key',
  'apikey',
  'authorization',
  'auth_header',
  'card_number',
  'cvv',
  'reset_token',
  'verification_token',
  'challenge_code',
  'clinical_note',
  'clinical_text',
  'clinical_notes',
  'diagnosis',
  'raw_journal',
  'journal_text',
  'assessment_answers',
  'conversation_text',
  'ai_prompt',
  'prompt_template',
  'prompt_text'
]);

export class AuditRedactor {
  private emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  private phoneRegex = /(\+?\d{1,4}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)[\d\s-]{6,10}/g;
  private bearerRegex = /Bearer\s+[A-Za-z0-9\-_.]+/gi;
  private apiKeyRegex = /(?:key|api_key|token|secret)[\s:=]+([A-Za-z0-9\-_]{16,})/gi;

  public redactText(text: string): string {
    if (!text || typeof text !== 'string') return text;
    return text
      .replace(this.emailRegex, '[REDACTED_EMAIL]')
      .replace(this.phoneRegex, '[REDACTED_PHONE]')
      .replace(this.bearerRegex, 'Bearer [REDACTED_TOKEN]')
      .replace(this.apiKeyRegex, 'key=[REDACTED_SECRET]');
  }

  public redactMetadata<T = Record<string, unknown>>(data: T, depth = 0): T {
    if (depth > 8 || data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      return this.redactText(data) as unknown as T;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.redactMetadata(item, depth + 1)) as unknown as T;
    }

    if (typeof data === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase();

        if (
          lowerKey === 'clinical_note' ||
          lowerKey === 'clinical_text' ||
          lowerKey === 'clinical_notes' ||
          lowerKey === 'diagnosis'
        ) {
          result[key] = '[REDACTED_CLINICAL_DATA]';
        } else if (
          lowerKey === 'journal_text' ||
          lowerKey === 'raw_journal'
        ) {
          result[key] = '[REDACTED_JOURNAL_CONTENT]';
        } else if (
          lowerKey === 'ai_prompt' ||
          lowerKey === 'prompt_template' ||
          lowerKey === 'conversation_text'
        ) {
          result[key] = '[REDACTED_PROMPT_BODY]';
        } else if (SENSITIVE_KEY_NAMES.has(lowerKey)) {
          result[key] = '[REDACTED_SECRET]';
        } else if (typeof value === 'string') {
          result[key] = this.redactText(value);
        } else if (typeof value === 'object' && value !== null) {
          result[key] = this.redactMetadata(value, depth + 1);
        } else {
          result[key] = value;
        }
      }
      return result as T;
    }

    return data;
  }
}

export const auditRedactor = new AuditRedactor();
