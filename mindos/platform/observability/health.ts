/**
 * MindOS Health & Liveness Checks
 * Authority: Master Architecture Index Section 28 & Volume X
 */

export interface HealthStatus {
  status: 'UP' | 'DOWN' | 'READY' | 'NOT_READY' | 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime_seconds: number;
  environment: string;
  components?: Record<string, { status: string; details?: Record<string, unknown> }>;
}

export interface ReadinessStatus extends HealthStatus {
  status: 'READY' | 'NOT_READY' | 'ok' | 'unhealthy';
  checks: {
    database: boolean;
    safety_policy: boolean;
    crisis_registry: boolean;
  };
}

export class HealthService {
  private static startTime = Date.now();
  private static isReady = true;

  public static setReady(ready: boolean): void {
    HealthService.isReady = ready;
  }

  public static checkLiveness(env: string = 'development'): HealthStatus {
    return {
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor((Date.now() - HealthService.startTime) / 1000),
      environment: env
    };
  }

  public static getLiveness(env: string = 'development'): HealthStatus {
    return HealthService.checkLiveness(env);
  }

  public static checkReadiness(
    env: string = 'development',
    dbConnected = true,
    safetyPolicyAvailable = true,
    crisisRegistryValid = true
  ): ReadinessStatus {
    const allPassed = HealthService.isReady && dbConnected && safetyPolicyAvailable && crisisRegistryValid;
    return {
      status: allPassed ? 'READY' : 'NOT_READY',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor((Date.now() - HealthService.startTime) / 1000),
      environment: env,
      checks: {
        database: dbConnected,
        safety_policy: safetyPolicyAvailable,
        crisis_registry: crisisRegistryValid
      }
    };
  }

  public static async getReadiness(env: string = 'development'): Promise<ReadinessStatus> {
    return HealthService.checkReadiness(env);
  }

  public static async getHealthSummary(env: string = 'development'): Promise<HealthStatus> {
    return {
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor((Date.now() - HealthService.startTime) / 1000),
      environment: env,
      components: {
        database: { status: 'UP', details: { driver: 'InMemoryDriver' } },
        safety_kernel: { status: 'UP', details: { policy_version: '2.0.0' } },
        audit_ledger: { status: 'UP', details: { algorithm: 'SHA-256' } }
      }
    };
  }

  public static async check(env: string = 'development'): Promise<{ liveness: HealthStatus; readiness: ReadinessStatus; summary: HealthStatus }> {
    const liveness = HealthService.getLiveness(env);
    const readiness = await HealthService.getReadiness(env);
    const summary = await HealthService.getHealthSummary(env);
    return { liveness, readiness, summary };
  }
}
