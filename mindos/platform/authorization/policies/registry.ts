/**
 * MindOS Versioned Policy Registry
 * Authority: Master Architecture Index Section 14, Volume VIII, Sections 21-23
 * ADR-016
 */

import { PolicyDefinition, PolicyStatus } from '../domain/types.js';
import { CANONICAL_POLICIES } from './definitions.js';

export class PolicyRegistry {
  private static policies: Map<string, PolicyDefinition> = new Map();

  static {
    // Bootstrap canonical policies into memory
    for (const policy of CANONICAL_POLICIES) {
      PolicyRegistry.registerPolicy(policy);
    }
  }

  /**
   * Registers or updates a policy definition in the registry.
   */
  public static registerPolicy(policy: PolicyDefinition): void {
    const key = `${policy.policy_id}:${policy.version}`;
    PolicyRegistry.policies.set(key, policy);
    // Also store by policy_id as the latest version
    PolicyRegistry.policies.set(policy.policy_id, policy);
  }

  /**
   * Retrieves a policy definition by ID and optional version.
   * If version is omitted, returns the latest registered version.
   */
  public static getPolicy(policyId: string, version?: string): PolicyDefinition | undefined {
    if (version) {
      return PolicyRegistry.policies.get(`${policyId}:${version}`);
    }
    return PolicyRegistry.policies.get(policyId);
  }

  /**
   * Retrieves all registered policies.
   */
  public static getAllPolicies(): PolicyDefinition[] {
    const unique = new Map<string, PolicyDefinition>();
    for (const policy of PolicyRegistry.policies.values()) {
      unique.set(policy.policy_id, policy);
    }
    return Array.from(unique.values());
  }

  /**
   * Finds an ACTIVE policy matching a given resource type and action.
   */
  public static findPolicyForResourceAction(
    resourceType: string,
    action: string
  ): PolicyDefinition | undefined {
    const normalizedRes = resourceType.toLowerCase();
    const normalizedAct = action.toLowerCase();

    for (const policy of PolicyRegistry.policies.values()) {
      if (policy.status !== 'ACTIVE') continue;
      if (policy.resource_type.toLowerCase() === normalizedRes) {
        if (policy.actions.some(a => a.toLowerCase() === normalizedAct || a === '*')) {
          return policy;
        }
      }
    }
    return undefined;
  }

  /**
   * Lists all active policies.
   */
  public static listActivePolicies(): PolicyDefinition[] {
    const unique = new Map<string, PolicyDefinition>();
    for (const p of PolicyRegistry.policies.values()) {
      if (p.status === 'ACTIVE') {
        unique.set(p.policy_id, p);
      }
    }
    return Array.from(unique.values());
  }

  /**
   * Resets registry to default canonical policies (useful for test isolation).
   */
  public static resetForTesting(): void {
    PolicyRegistry.policies.clear();
    for (const policy of CANONICAL_POLICIES) {
      PolicyRegistry.registerPolicy(policy);
    }
  }
}
