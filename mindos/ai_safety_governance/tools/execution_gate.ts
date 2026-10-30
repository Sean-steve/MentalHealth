/**
 * MindOS AI Tool Execution Gate
 * Authority: ADR-016 (AI Cannot Authorize Itself) & Volumes IV, IX, XV
 * Enforces fail-closed validation on all tool invocations requested by AI models.
 */

import { AIToolRegistry } from './registry.js';
import { AIToolEntity, AIConfigurationEntity } from '../domain/types.js';
import { AIToolNotApprovedError } from '../domain/errors.js';
import { AuthorizationError, ValidationError, DomainInvariantError } from '../../platform/errors/index.js';
import { AuditService } from '../../platform/audit/index.js';

export interface ToolInvocationContext {
  ai_system_id: string;
  approved_config: AIConfigurationEntity;
  tool_code: string;
  actor_id: string; // The authenticating human user or system actor
  target_user_id: string; // The user whose data is being accessed or mutated
  declared_purpose: string;
  user_granted_consents: string[];
  parameters: Record<string, unknown>;
}

export class AIToolExecutionGate {
  /**
   * Evaluates tool invocation against approved configuration, permissions,
   * consent, cross-user boundary, and purpose.
   */
  public static authorizeInvocation(ctx: ToolInvocationContext): AIToolEntity {
    // 1. Tool must be registered
    const tool = AIToolRegistry.getTool(ctx.tool_code);

    // 2. Tool must be present in the approved configuration toolset
    const approvedTools = ctx.approved_config.toolset_codes || [];
    if (!approvedTools.includes(ctx.tool_code)) {
      AuditService.record({
        actor_type: 'SERVICE',
        actor_id: ctx.actor_id,
        action: 'AI_TOOL.UNAPPROVED_INVOCATION_ATTEMPT',
        resource_type: 'ai_tool',
        resource_id: ctx.tool_code,
        purpose: ctx.declared_purpose,
        authorization_basis: { ai_system_id: ctx.ai_system_id, approvedTools },
        result: 'DENIED'
      });

      throw new AIToolNotApprovedError(
        `AI Tool "${ctx.tool_code}" is NOT part of the approved configuration toolset for this AI system.`,
        { tool_code: ctx.tool_code, approvedTools }
      );
    }

    // 3. AI cannot self-authorize (ADR-016)
    if (ctx.parameters.__ai_self_authorize === true || ctx.parameters.claim_role) {
      throw new AuthorizationError('AI cannot self-authorize or elevate its own permissions.', {
        errorCode: 'AUTHZ_004'
      });
    }

    // 4. Cross-User Isolation: User A cannot instruct tool to access or mutate User B's resources
    // If the tool parameters specify a target patient/user ID distinct from target_user_id
    const paramUserId = (ctx.parameters.user_id || ctx.parameters.target_user_id || ctx.parameters.patient_id) as string | undefined;
    if (paramUserId && paramUserId !== ctx.target_user_id && ctx.actor_id !== 'SYSTEM_INTERNAL') {
      AuditService.record({
        actor_type: 'STAFF',
        actor_id: ctx.actor_id,
        action: 'AI_TOOL.CROSS_USER_ACCESS_VIOLATION',
        resource_type: 'user',
        resource_id: paramUserId,
        purpose: ctx.declared_purpose,
        authorization_basis: { actor: ctx.actor_id, target: ctx.target_user_id, attempted: paramUserId },
        result: 'DENIED'
      });

      throw new AuthorizationError(
        `Cross-user access denied: AI session for user "${ctx.target_user_id}" cannot operate on resource owned by user "${paramUserId}".`,
        { errorCode: 'AUTHZ_003' }
      );
    }

    // 5. Purpose verification: declared purpose must match tool's required purpose
    if (ctx.declared_purpose !== tool.required_purpose && ctx.declared_purpose !== 'SAFETY_RESPONSE') {
      throw new AuthorizationError(
        `Purpose mismatch for tool "${ctx.tool_code}". Declared: "${ctx.declared_purpose}", Required: "${tool.required_purpose}".`,
        { errorCode: 'AUTHZ_002' }
      );
    }

    // 6. Consent verification: all required consents must be granted
    const userConsents = new Set(ctx.user_granted_consents || []);
    for (const requiredConsent of tool.required_consent) {
      if (!userConsents.has(requiredConsent)) {
        throw new AuthorizationError(
          `User has not granted required consent "${requiredConsent}" for tool "${ctx.tool_code}".`,
          { errorCode: 'AUTHZ_001' }
        );
      }
    }

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: ctx.actor_id,
      action: 'AI_TOOL.INVOCATION_AUTHORIZED',
      resource_type: 'ai_tool',
      resource_id: ctx.tool_code,
      purpose: ctx.declared_purpose,
      authorization_basis: { configHash: ctx.approved_config.configuration_hash },
      result: 'ALLOWED'
    });

    return tool;
  }
}
