export interface MessagingAttachmentPolicyDecision {
  configured: boolean;
  allowed: boolean;
  reason_code: string;
}

export interface ProfessionalMessagingAttachmentPolicyPort {
  validate(params: {
    evidence_reference: string;
    mime_type: string;
    size_bytes: number;
    scan_status: 'PENDING' | 'CLEAN' | 'QUARANTINED' | 'REJECTED';
    data_classification: string;
  }): Promise<MessagingAttachmentPolicyDecision>;
}

/**
 * Attachments fail closed until a governed media/file service supplies
 * malware scan, MIME verification, size and classification policy.
 */
export class DenyByDefaultMessagingAttachmentPolicy implements ProfessionalMessagingAttachmentPolicyPort {
  async validate(): Promise<MessagingAttachmentPolicyDecision> {
    return {
      configured: false,
      allowed: false,
      reason_code: 'ATTACHMENT_POLICY_NOT_CONFIGURED'
    };
  }
}


export interface MessagingAttachmentPolicyConfig {
  max_bytes: number;
  allowed_mime_types: string[];
  allowed_data_classifications: string[];
}

/**
 * Governed attachment-link policy.
 *
 * The upstream media service remains responsible for malware scanning and
 * protected object storage. Messaging only accepts an attested CLEAN object
 * whose MIME type, size, classification and non-public evidence reference
 * satisfy an explicitly supplied policy. There are deliberately no product
 * defaults for size or MIME types.
 */
export class ConfiguredMessagingAttachmentPolicy
implements ProfessionalMessagingAttachmentPolicyPort {
  private readonly allowedMimeTypes: Set<string>;
  private readonly allowedClassifications: Set<string>;

  constructor(private readonly config: MessagingAttachmentPolicyConfig) {
    if (!Number.isFinite(config.max_bytes) || config.max_bytes <= 0) {
      throw new Error('Messaging attachment max_bytes must be explicitly configured as a positive number.');
    }
    if (!config.allowed_mime_types.length) {
      throw new Error('Messaging attachment allowed_mime_types must be explicitly configured.');
    }
    if (!config.allowed_data_classifications.length) {
      throw new Error('Messaging attachment allowed_data_classifications must be explicitly configured.');
    }
    this.allowedMimeTypes = new Set(
      config.allowed_mime_types.map(value => value.trim().toLowerCase()).filter(Boolean)
    );
    this.allowedClassifications = new Set(
      config.allowed_data_classifications.map(value => value.trim()).filter(Boolean)
    );
  }

  async validate(params: {
    evidence_reference: string;
    mime_type: string;
    size_bytes: number;
    scan_status: 'PENDING' | 'CLEAN' | 'QUARANTINED' | 'REJECTED';
    data_classification: string;
  }): Promise<MessagingAttachmentPolicyDecision> {
    const reference = params.evidence_reference.trim();
    if (!reference || /^(https?:|data:|blob:)/i.test(reference)) {
      return { configured: true, allowed: false, reason_code: 'PUBLIC_OR_INVALID_ATTACHMENT_REFERENCE' };
    }
    if (params.scan_status !== 'CLEAN') {
      return { configured: true, allowed: false, reason_code: 'ATTACHMENT_NOT_CLEAN' };
    }
    if (!Number.isSafeInteger(params.size_bytes) || params.size_bytes <= 0) {
      return { configured: true, allowed: false, reason_code: 'ATTACHMENT_SIZE_INVALID' };
    }
    if (params.size_bytes > this.config.max_bytes) {
      return { configured: true, allowed: false, reason_code: 'ATTACHMENT_TOO_LARGE' };
    }
    if (!this.allowedMimeTypes.has(params.mime_type.trim().toLowerCase())) {
      return { configured: true, allowed: false, reason_code: 'ATTACHMENT_MIME_NOT_ALLOWED' };
    }
    if (!this.allowedClassifications.has(params.data_classification)) {
      return { configured: true, allowed: false, reason_code: 'ATTACHMENT_CLASSIFICATION_NOT_ALLOWED' };
    }
    return { configured: true, allowed: true, reason_code: 'ATTACHMENT_POLICY_ALLOWED' };
  }
}

export function parseMessagingAttachmentPolicyConfig(
  raw: string | undefined
): MessagingAttachmentPolicyConfig | undefined {
  if (!raw?.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('MINDOS_MESSAGE_ATTACHMENT_POLICY_JSON must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('MINDOS_MESSAGE_ATTACHMENT_POLICY_JSON must be a JSON object.');
  }
  const candidate = parsed as Partial<MessagingAttachmentPolicyConfig>;
  if (
    !Number.isFinite(candidate.max_bytes) ||
    !Array.isArray(candidate.allowed_mime_types) ||
    !Array.isArray(candidate.allowed_data_classifications)
  ) {
    throw new Error(
      'Messaging attachment policy requires max_bytes, allowed_mime_types and allowed_data_classifications.'
    );
  }
  return {
    max_bytes: Number(candidate.max_bytes),
    allowed_mime_types: candidate.allowed_mime_types.map(String),
    allowed_data_classifications: candidate.allowed_data_classifications.map(String)
  };
}
