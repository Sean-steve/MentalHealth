/**
 * MindOS Administration Bounded Context
 * Authority: Volumes I, III & Appendix B / C / Q
 * Owns: staff_members, feature_flags, break_glass_requests
 * Invariant: Platform Administrators SHALL NOT have read access to client clinical records or personal journals.
 * Invariant: Break-glass emergency overrides require recorded clinical reason, dual authorization, and tamper-evident audit.
 */

import { generateUUIDv7 } from '../platform/database/uuid.js';
import { AuditService } from '../platform/audit/index.js';
import { AuthorizationError, ValidationError } from '../platform/errors/index.js';

export interface BreakGlassRequestEntity {
  id: string; // UUIDv7
  staff_user_id: string;
  target_resource_type: string;
  target_resource_id: string;
  clinical_justification: string;
  authorized_by_supervisor_id: string;
  granted_at: string;
  expires_at: string;
}

export class AdministrationService {
  private static breakGlassLogs: Map<string, BreakGlassRequestEntity> = new Map();
  private static featureFlags: Map<string, boolean> = new Map([
    ['ai_assistant_enabled', true],
    ['kenya_crisis_directory_v2', true],
    ['telehealth_webrtc_enabled', true]
  ]);

  public static async executeBreakGlass(params: {
    staffUserId: string;
    supervisorId: string;
    targetResourceType: string;
    targetResourceId: string;
    clinicalJustification: string;
  }): Promise<BreakGlassRequestEntity> {
    if (params.staffUserId === params.supervisorId) {
      throw new AuthorizationError('Dual authorization required: Supervisor cannot be the same as the requesting staff.', {
        errorCode: 'AUTHZ_004'
      });
    }

    if (!params.clinicalJustification || params.clinicalJustification.length < 15) {
      throw new ValidationError('A detailed clinical justification is required for emergency break-glass access.');
    }

    const id = generateUUIDv7();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour max

    const request: BreakGlassRequestEntity = {
      id,
      staff_user_id: params.staffUserId,
      target_resource_type: params.targetResourceType,
      target_resource_id: params.targetResourceId,
      clinical_justification: params.clinicalJustification,
      authorized_by_supervisor_id: params.supervisorId,
      granted_at: now,
      expires_at: expiresAt
    };

    AdministrationService.breakGlassLogs.set(id, request);

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.staffUserId,
      action: 'ADMINISTRATION.BREAK_GLASS.EXECUTED',
      resource_type: params.targetResourceType,
      resource_id: params.targetResourceId,
      purpose: 'Emergency Clinical Break-Glass Access',
      authorization_basis: {
        supervisorId: params.supervisorId,
        justification: params.clinicalJustification,
        expiresAt
      },
      result: 'ALLOWED',
      is_break_glass: true
    });

    return request;
  }

  public static isFeatureEnabled(flagKey: string): boolean {
    return AdministrationService.featureFlags.get(flagKey) ?? false;
  }

  public static resetForTesting(): void {
    AdministrationService.breakGlassLogs.clear();
  }
}
