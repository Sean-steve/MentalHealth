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
