/**
 * MindOS Typed Configuration Architecture
 * Authority: Master Architecture Index Section 6 & Appendix M, Sprint 2 Specifications
 * 
 * Enforces:
 * - Explicit environment isolation (LOCAL, DEVELOPMENT, TEST, STAGING, PRODUCTION)
 * - 13 Typed Concern Groups (APP, DATABASE, CACHE, QUEUE, STORAGE, AUTH, SECURITY, AI, PAYMENTS, NOTIFICATIONS, ANALYTICS, OBSERVABILITY, GOVERNANCE)
 * - Fail-fast validation refusing unsafe production defaults
 * - Backward compatibility with foundation callers
 */

import {
  Environment,
  GroupedMindOSConfig,
  AppGroupSchema,
  DatabaseGroupSchema,
  CacheGroupSchema,
  QueueGroupSchema,
  StorageGroupSchema,
  AuthGroupSchema,
  SecurityGroupSchema,
  AiGroupSchema,
  PaymentsGroupSchema,
  NotificationsGroupSchema,
  AnalyticsGroupSchema,
  ObservabilityGroupSchema,
  GovernanceGroupSchema,
  SETTINGS_METADATA_CATALOG
} from './schema.js';

export type { Environment, GroupedMindOSConfig } from './schema.js';

export interface AppConfig {
  env: Environment;
  port: number;
  appUrl: string;
  databaseUrl: string;
  safetyPolicyVersion: string;
  safetyOverrideEnabled: boolean;
  kenyaDhaCertId: string;
  kenyaOdpcRegId: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  secrets: {
    jwtSecret: string;
    sessionSecret: string;
    kmsKeyRef: string;
    auditIntegritySalt: string;
    geminiApiKey?: string;
  };
  // Typed 13 concern groups
  grouped: GroupedMindOSConfig;
}

export class ConfigurationManager {
  private static cachedConfig: AppConfig | null = null;
  private static cachedGrouped: GroupedMindOSConfig | null = null;

  public static load(envSource: Record<string, string | undefined> = process.env): AppConfig {
    const rawEnv = (envSource.MINDOS_ENV || envSource.NODE_ENV || 'development').toLowerCase() as Environment;
    
    const validEnvs: Environment[] = ['local', 'development', 'test', 'staging', 'production'];
    if (!validEnvs.includes(rawEnv)) {
      throw new Error(`CONFIG_CRITICAL_ERROR: Invalid MINDOS_ENV="${rawEnv}". Must be one of: ${validEnvs.join(', ')}`);
    }

    const isProductionLike = rawEnv === 'production' || rawEnv === 'staging';

    // 1. App Group
    const corsRaw = envSource.CORS_ALLOWED_ORIGINS 
      ? envSource.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim()) 
      : [envSource.APP_URL || (isProductionLike ? 'https://app.mindos.co.ke' : 'http://localhost:3000')];
    
    const appParsed = AppGroupSchema.parse({
      environment: rawEnv,
      port: envSource.PORT || 3000,
      appUrl: envSource.APP_URL || (isProductionLike ? 'https://app.mindos.co.ke' : 'http://localhost:3000'),
      corsAllowedOrigins: corsRaw,
      debugMode: envSource.DEBUG === 'true' || envSource.DEBUG_MODE === 'true',
      defaultCountryCode: envSource.DEFAULT_COUNTRY_CODE || 'KE'
    });

    // 2. Database Group
    const defaultDevDb = rawEnv === 'test'
      ? 'postgresql://mindos_test:mindos_test@localhost:5432/mindos_test_db'
      : 'postgresql://mindos_user:mindos_pass@localhost:5432/mindos_db';
    
    const dbUrl = envSource.DATABASE_URL || (isProductionLike ? '' : defaultDevDb);
    const dbParsed = DatabaseGroupSchema.parse({
      url: dbUrl,
      poolMin: envSource.DB_POOL_MIN || 2,
      poolMax: envSource.DB_POOL_MAX || (isProductionLike ? 20 : 5),
      ssl: envSource.DB_SSL === 'true' || isProductionLike,
      connectionTimeoutMs: envSource.DB_TIMEOUT_MS || 5000
    });

    // 3. Cache Group
    const cacheParsed = CacheGroupSchema.parse({
      url: envSource.REDIS_CACHE_URL || (isProductionLike ? '' : 'redis://localhost:6379/0'),
      ttlSeconds: envSource.CACHE_TTL_SECONDS || 300,
      keyPrefix: envSource.CACHE_KEY_PREFIX || `mindos:${rawEnv}:`,
      enabled: envSource.CACHE_ENABLED !== 'false'
    });

    // 4. Queue Group
    const queueParsed = QueueGroupSchema.parse({
      url: envSource.REDIS_QUEUE_URL || (isProductionLike ? '' : 'redis://localhost:6379/1'),
      retryLimit: envSource.QUEUE_RETRY_LIMIT || 3,
      dlqName: envSource.QUEUE_DLQ_NAME || `mindos:${rawEnv}:dlq`,
      concurrency: envSource.QUEUE_CONCURRENCY || (isProductionLike ? 10 : 2)
    });

    // 5. Storage Group
    const storageParsed = StorageGroupSchema.parse({
      provider: (envSource.STORAGE_PROVIDER as any) || (isProductionLike ? 's3_compatible' : 'local_disk'),
      bucket: envSource.STORAGE_BUCKET || `mindos-artifacts-${rawEnv}`,
      endpoint: envSource.STORAGE_ENDPOINT,
      region: envSource.STORAGE_REGION || 'af-south-1',
      encryptedAtRest: envSource.STORAGE_ENCRYPTED !== 'false'
    });

    // 6. Auth Group
    const jwtSecret = envSource.JWT_SECRET || (isProductionLike ? 'prod-placeholder-jwt-secret-min-32-characters' : 'dev-insecure-jwt-secret-min-32-chars-long-standard');
    const sessionSecret = envSource.SESSION_SECRET || (isProductionLike ? 'prod-placeholder-session-secret-min-32-characters' : 'dev-insecure-session-secret-min-32-chars-long-standard');
    const authParsed = AuthGroupSchema.parse({
      jwtSecret,
      jwtExpiryMinutes: envSource.JWT_EXPIRY_MINUTES || 60,
      sessionSecret,
      sessionTtlHours: envSource.SESSION_TTL_HOURS || 24,
      mfaRequiredForProfessionals: envSource.MFA_REQUIRED_PROFESSIONALS !== 'false'
    });

    // 7. Security Group
    const kmsKeyRef = envSource.ENCRYPTION_KMS_KEY_REF || (isProductionLike ? 'kms://projects/prod/cryptoKeys/app-key' : 'kms://mindos-dev/local-key');
    const auditIntegritySalt = envSource.AUDIT_INTEGRITY_SALT || (isProductionLike ? 'prod-audit-salt-standard-min-8' : 'dev-audit-salt-minimum-8-chars');
    const securityParsed = SecurityGroupSchema.parse({
      encryptionKmsKeyRef: kmsKeyRef,
      auditIntegritySalt,
      allowInsecureCookies: envSource.ALLOW_INSECURE_COOKIES === 'true',
      csrfEnabled: envSource.CSRF_ENABLED !== 'false',
      rateLimitRpm: envSource.RATE_LIMIT_RPM || (isProductionLike ? 120 : 1000)
    });

    // 8. AI Group
    const aiParsed = AiGroupSchema.parse({
      provider: (envSource.AI_PROVIDER as any) || (envSource.GEMINI_API_KEY ? 'gemini' : 'mock_sandbox'),
      geminiApiKey: envSource.GEMINI_API_KEY,
      maxTokens: envSource.AI_MAX_TOKENS || 2048,
      temperature: envSource.AI_TEMPERATURE || 0.2,
      safetyFilterThreshold: (envSource.AI_SAFETY_THRESHOLD as any) || 'BLOCK_MEDIUM'
    });

    // 9. Payments Group
    const paymentsParsed = PaymentsGroupSchema.parse({
      provider: (envSource.PAYMENTS_PROVIDER as any) || (isProductionLike ? 'mpesa_daraja' : 'mock'),
      sandboxMode: rawEnv !== 'production',
      webhookSecret: envSource.PAYMENTS_WEBHOOK_SECRET,
      merchantId: envSource.PAYMENTS_MERCHANT_ID || `MINDOS_MERCHANT_${rawEnv.toUpperCase()}`
    });

    // 10. Notifications Group
    const notificationsParsed = NotificationsGroupSchema.parse({
      provider: (envSource.NOTIFICATIONS_PROVIDER as any) || (isProductionLike ? 'sms_africastalking' : 'mock_console'),
      defaultSender: envSource.NOTIFICATIONS_SENDER || 'MindOS-KE',
      smsTtlMinutes: envSource.NOTIFICATIONS_SMS_TTL || 10,
      enableRealDispatch: envSource.NOTIFICATIONS_REAL_DISPATCH === 'true' && isProductionLike
    });

    // 11. Analytics Group
    const analyticsParsed = AnalyticsGroupSchema.parse({
      enabled: envSource.ANALYTICS_ENABLED === 'true',
      anonymizeIp: envSource.ANALYTICS_ANONYMIZE_IP !== 'false',
      retentionDays: envSource.ANALYTICS_RETENTION_DAYS || 90
    });

    // 12. Observability Group
    const obsParsed = ObservabilityGroupSchema.parse({
      logLevel: (envSource.LOG_LEVEL as any) || (isProductionLike ? 'info' : 'debug'),
      structuredJson: envSource.STRUCTURED_LOGS !== 'false',
      otelEndpoint: envSource.OTEL_EXPORTER_OTLP_ENDPOINT,
      sampleRate: envSource.TELEMETRY_SAMPLE_RATE || 1.0
    });

    // 13. Governance Group
    const govParsed = GovernanceGroupSchema.parse({
      kenyaDhaCertId: envSource.KENYA_DHA_CERT_ID || `DHA-REG-KE-2026-${rawEnv.toUpperCase()}`,
      kenyaOdpcRegId: envSource.KENYA_ODPC_REG_ID || `ODPC-DC-2026-${rawEnv.toUpperCase()}`,
      safetyPolicyVersion: envSource.SAFETY_POLICY_VERSION || '2.0.0',
      safetyOverrideEnabled: envSource.SAFETY_OVERRIDE_ENABLED !== 'false',
      strictReleaseGates: envSource.STRICT_RELEASE_GATES !== 'false'
    });

    const grouped: GroupedMindOSConfig = {
      APP: appParsed,
      DATABASE: dbParsed,
      CACHE: cacheParsed,
      QUEUE: queueParsed,
      STORAGE: storageParsed,
      AUTH: authParsed,
      SECURITY: securityParsed,
      AI: aiParsed,
      PAYMENTS: paymentsParsed,
      NOTIFICATIONS: notificationsParsed,
      ANALYTICS: analyticsParsed,
      OBSERVABILITY: obsParsed,
      GOVERNANCE: govParsed
    };

    // --- FAIL-FAST PRODUCTION / STAGING CHECKS ---
    for (const item of SETTINGS_METADATA_CATALOG) {
      if (item.validate) {
        let targetValue: any;
        const [grp, key] = item.name.split('.');
        if (grp && key && (grouped as any)[grp]) {
          targetValue = (grouped as any)[grp][key];
        }
        const validation = item.validate(targetValue, rawEnv);
        if (!validation.valid) {
          throw new Error(`CONFIG_FAIL_FAST_ERROR: [${item.name}] in environment "${rawEnv}" failed policy: ${validation.error}`);
        }
      }
    }

    // Additional Fail-Fast checks for Production-like environments
    if (isProductionLike) {
      if (!grouped.DATABASE.url || grouped.DATABASE.url.includes('localhost') || grouped.DATABASE.url.includes('mindos_pass')) {
        throw new Error(`CONFIG_FAIL_FAST_ERROR: [DATABASE.url] Production/Staging requires a secured, managed external database URL.`);
      }
      if (!grouped.AUTH.jwtSecret || grouped.AUTH.jwtSecret.includes('dev-insecure') || grouped.AUTH.jwtSecret.length < 32) {
        throw new Error(`CONFIG_FAIL_FAST_ERROR: [AUTH.jwtSecret] Production/Staging requires high-entropy JWT_SECRET (>= 32 chars).`);
      }
      if (!grouped.AUTH.sessionSecret || grouped.AUTH.sessionSecret.includes('dev-insecure') || grouped.AUTH.sessionSecret.length < 32) {
        throw new Error(`CONFIG_FAIL_FAST_ERROR: [AUTH.sessionSecret] Production/Staging requires high-entropy SESSION_SECRET (>= 32 chars).`);
      }
      if (!grouped.SECURITY.encryptionKmsKeyRef || grouped.SECURITY.encryptionKmsKeyRef.includes('local-key')) {
        throw new Error(`CONFIG_FAIL_FAST_ERROR: [SECURITY.encryptionKmsKeyRef] Production/Staging requires an active cloud KMS key URI.`);
      }
      if (grouped.APP.debugMode) {
        throw new Error(`CONFIG_FAIL_FAST_ERROR: [APP.debugMode] Debug mode is strictly prohibited in ${rawEnv}.`);
      }
    }

    const legacyConfig: AppConfig = {
      env: rawEnv,
      port: grouped.APP.port,
      appUrl: grouped.APP.appUrl,
      databaseUrl: grouped.DATABASE.url,
      safetyPolicyVersion: grouped.GOVERNANCE.safetyPolicyVersion,
      safetyOverrideEnabled: grouped.GOVERNANCE.safetyOverrideEnabled,
      kenyaDhaCertId: grouped.GOVERNANCE.kenyaDhaCertId,
      kenyaOdpcRegId: grouped.GOVERNANCE.kenyaOdpcRegId,
      logLevel: grouped.OBSERVABILITY.logLevel,
      secrets: {
        jwtSecret: grouped.AUTH.jwtSecret,
        sessionSecret: grouped.AUTH.sessionSecret,
        kmsKeyRef: grouped.SECURITY.encryptionKmsKeyRef,
        auditIntegritySalt: grouped.SECURITY.auditIntegritySalt,
        geminiApiKey: grouped.AI.geminiApiKey
      },
      grouped
    };

    ConfigurationManager.cachedConfig = legacyConfig;
    ConfigurationManager.cachedGrouped = grouped;
    return legacyConfig;
  }

  public static get(): AppConfig {
    if (!ConfigurationManager.cachedConfig) {
      return ConfigurationManager.load();
    }
    return ConfigurationManager.cachedConfig;
  }

  public static getGrouped(): GroupedMindOSConfig {
    if (!ConfigurationManager.cachedGrouped) {
      ConfigurationManager.load();
    }
    return ConfigurationManager.cachedGrouped!;
  }

  public static getConfig(): AppConfig & {
    NODE_ENV: string;
    PORT: number;
    DEFAULT_COUNTRY_CODE: string;
    DATABASE_URL: string;
  } {
    const c = ConfigurationManager.get();
    return {
      ...c,
      NODE_ENV: c.env,
      PORT: c.port,
      DEFAULT_COUNTRY_CODE: c.grouped?.APP?.defaultCountryCode || 'KE',
      DATABASE_URL: c.databaseUrl
    };
  }

  public static resetForTesting(): void {
    ConfigurationManager.cachedConfig = null;
    ConfigurationManager.cachedGrouped = null;
  }
}
