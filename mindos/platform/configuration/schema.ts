/**
 * MindOS Canonical Typed Configuration Metadata & Groups
 * Authority: Master Architecture Index Section 6 & Appendix M, Sprint 2 Specifications
 * 
 * Defines the 13 concern groups:
 * APP, DATABASE, CACHE, QUEUE, STORAGE, AUTH, SECURITY, AI,
 * PAYMENTS, NOTIFICATIONS, ANALYTICS, OBSERVABILITY, GOVERNANCE
 */

import { z } from 'zod';

export type Environment = 'local' | 'development' | 'test' | 'staging' | 'production';

export interface SettingMetadata<T> {
  name: string;
  group: ConcernGroup;
  type: string;
  requiredEnvironments: Environment[];
  defaultPolicy: 'REQUIRED' | 'SAFE_DEFAULT' | 'ENVIRONMENT_SPECIFIC' | 'FORBIDDEN_IN_PROD';
  isSecret: boolean;
  description: string;
  validate?: (val: T, env: Environment) => { valid: boolean; error?: string };
}

export type ConcernGroup =
  | 'APP'
  | 'DATABASE'
  | 'CACHE'
  | 'QUEUE'
  | 'STORAGE'
  | 'AUTH'
  | 'SECURITY'
  | 'AI'
  | 'PAYMENTS'
  | 'NOTIFICATIONS'
  | 'ANALYTICS'
  | 'OBSERVABILITY'
  | 'GOVERNANCE';

// --- ZOD SCHEMAS PER GROUP ---

export const AppGroupSchema = z.object({
  environment: z.enum(['local', 'development', 'test', 'staging', 'production']),
  port: z.coerce.number().int().min(1024).max(65535).default(3000),
  appUrl: z.string().url().default('http://localhost:3000'),
  corsAllowedOrigins: z.array(z.string()).default(['http://localhost:3000']),
  debugMode: z.boolean().default(false),
  defaultCountryCode: z.string().length(2).default('KE')
});

export const DatabaseGroupSchema = z.object({
  url: z.string().default(''),
  poolMin: z.coerce.number().int().min(1).default(2),
  poolMax: z.coerce.number().int().min(2).default(20),
  ssl: z.boolean().default(false),
  connectionTimeoutMs: z.coerce.number().int().default(5000)
});

export const CacheGroupSchema = z.object({
  url: z.string().default('redis://localhost:6379/0'),
  ttlSeconds: z.coerce.number().int().default(300),
  keyPrefix: z.string().default('mindos:cache:'),
  enabled: z.boolean().default(true)
});

export const QueueGroupSchema = z.object({
  url: z.string().default('redis://localhost:6379/1'),
  retryLimit: z.coerce.number().int().default(3),
  dlqName: z.string().default('mindos:dlq:dead-letters'),
  concurrency: z.coerce.number().int().default(5)
});

export const StorageGroupSchema = z.object({
  provider: z.enum(['local_disk', 's3_compatible', 'gcs']).default('local_disk'),
  bucket: z.string().default('mindos-clinical-artifacts-dev'),
  endpoint: z.string().optional(),
  region: z.string().default('af-south-1'),
  encryptedAtRest: z.boolean().default(true)
});

export const AuthGroupSchema = z.object({
  jwtSecret: z.string().default(''),
  jwtExpiryMinutes: z.coerce.number().int().default(60),
  sessionSecret: z.string().default(''),
  sessionTtlHours: z.coerce.number().int().default(24),
  mfaRequiredForProfessionals: z.boolean().default(true)
});

export const SecurityGroupSchema = z.object({
  encryptionKmsKeyRef: z.string().default(''),
  auditIntegritySalt: z.string().default(''),
  allowInsecureCookies: z.boolean().default(false),
  csrfEnabled: z.boolean().default(true),
  rateLimitRpm: z.coerce.number().int().default(120)
});

export const AiGroupSchema = z.object({
  provider: z.enum(['gemini', 'mock_sandbox']).default('gemini'),
  geminiApiKey: z.string().optional(),
  maxTokens: z.coerce.number().int().default(2048),
  temperature: z.coerce.number().min(0).max(1).default(0.2),
  safetyFilterThreshold: z.enum(['BLOCK_NONE', 'BLOCK_LOW', 'BLOCK_MEDIUM', 'BLOCK_HIGH']).default('BLOCK_MEDIUM')
});

export const PaymentsGroupSchema = z.object({
  provider: z.enum(['mpesa_daraja', 'stripe_sandbox', 'mock']).default('mock'),
  sandboxMode: z.boolean().default(true),
  webhookSecret: z.string().optional(),
  merchantId: z.string().default('MINDOS_KE_MERCHANT_DEV')
});

export const NotificationsGroupSchema = z.object({
  provider: z.enum(['sms_africastalking', 'mock_console']).default('mock_console'),
  defaultSender: z.string().default('MindOS-KE'),
  smsTtlMinutes: z.coerce.number().int().default(10),
  enableRealDispatch: z.boolean().default(false)
});

export const AnalyticsGroupSchema = z.object({
  enabled: z.boolean().default(false),
  anonymizeIp: z.boolean().default(true),
  retentionDays: z.coerce.number().int().default(90)
});

export const ObservabilityGroupSchema = z.object({
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  structuredJson: z.boolean().default(true),
  otelEndpoint: z.string().optional(),
  sampleRate: z.coerce.number().min(0).max(1).default(1.0)
});

export const GovernanceGroupSchema = z.object({
  kenyaDhaCertId: z.string().default('DHA-REG-KE-2026-DEV'),
  kenyaOdpcRegId: z.string().default('ODPC-DC-2026-DEV'),
  safetyPolicyVersion: z.string().default('2.0.0'),
  safetyOverrideEnabled: z.boolean().default(true),
  strictReleaseGates: z.boolean().default(true)
});

export interface GroupedMindOSConfig {
  APP: z.infer<typeof AppGroupSchema>;
  DATABASE: z.infer<typeof DatabaseGroupSchema>;
  CACHE: z.infer<typeof CacheGroupSchema>;
  QUEUE: z.infer<typeof QueueGroupSchema>;
  STORAGE: z.infer<typeof StorageGroupSchema>;
  AUTH: z.infer<typeof AuthGroupSchema>;
  SECURITY: z.infer<typeof SecurityGroupSchema>;
  AI: z.infer<typeof AiGroupSchema>;
  PAYMENTS: z.infer<typeof PaymentsGroupSchema>;
  NOTIFICATIONS: z.infer<typeof NotificationsGroupSchema>;
  ANALYTICS: z.infer<typeof AnalyticsGroupSchema>;
  OBSERVABILITY: z.infer<typeof ObservabilityGroupSchema>;
  GOVERNANCE: z.infer<typeof GovernanceGroupSchema>;
}

// Registry of setting declarations for audit and validation
export const SETTINGS_METADATA_CATALOG: SettingMetadata<any>[] = [
  {
    name: 'APP.environment',
    group: 'APP',
    type: 'enum(local,development,test,staging,production)',
    requiredEnvironments: ['local', 'development', 'test', 'staging', 'production'],
    defaultPolicy: 'REQUIRED',
    isSecret: false,
    description: 'Explicit runtime environment of MindOS'
  },
  {
    name: 'APP.debugMode',
    group: 'APP',
    type: 'boolean',
    requiredEnvironments: ['staging', 'production'],
    defaultPolicy: 'FORBIDDEN_IN_PROD',
    isSecret: false,
    description: 'Enables debug profiling and verbose stacktraces. FORBIDDEN in prod.',
    validate: (val, env) => {
      if ((env === 'production' || env === 'staging') && val === true) {
        return { valid: false, error: 'Debug mode MUST NOT be enabled in staging or production (R-SEC-DEBUG).' };
      }
      return { valid: true };
    }
  },
  {
    name: 'APP.corsAllowedOrigins',
    group: 'APP',
    type: 'string[]',
    requiredEnvironments: ['staging', 'production'],
    defaultPolicy: 'ENVIRONMENT_SPECIFIC',
    isSecret: false,
    description: 'Allowed HTTP origins for CORS.',
    validate: (val: string[], env) => {
      if (env === 'production') {
        if (val.includes('*') || val.some(o => o.includes('localhost') || o.includes('127.0.0.1'))) {
          return { valid: false, error: 'Production CORS origin cannot contain wildcard "*" or localhost.' };
        }
      }
      return { valid: true };
    }
  },
  {
    name: 'DATABASE.url',
    group: 'DATABASE',
    type: 'string (URL)',
    requiredEnvironments: ['local', 'development', 'test', 'staging', 'production'],
    defaultPolicy: 'REQUIRED',
    isSecret: true,
    description: 'Primary PostgreSQL cluster connection string.',
    validate: (val: string, env) => {
      if (env === 'production' || env === 'staging') {
        if (val.includes('localhost') || val.includes('127.0.0.1') || val.includes('mindos_user:mindos_pass')) {
          return { valid: false, error: 'Production/Staging requires a managed, non-localhost PostgreSQL connection string.' };
        }
      }
      return { valid: true };
    }
  },
  {
    name: 'AUTH.jwtSecret',
    group: 'AUTH',
    type: 'string (min 32 chars in prod)',
    requiredEnvironments: ['local', 'development', 'test', 'staging', 'production'],
    defaultPolicy: 'REQUIRED',
    isSecret: true,
    description: 'Secret key used for signing session and identity JWTs.',
    validate: (val: string, env) => {
      if (env === 'production' || env === 'staging') {
        if (val.includes('dev-insecure') || val.length < 32) {
          return { valid: false, error: 'JWT secret must be at least 32 high-entropy characters in production/staging.' };
        }
      }
      return { valid: true };
    }
  },
  {
    name: 'SECURITY.encryptionKmsKeyRef',
    group: 'SECURITY',
    type: 'string (KMS URI)',
    requiredEnvironments: ['staging', 'production'],
    defaultPolicy: 'REQUIRED',
    isSecret: true,
    description: 'KMS Key Reference for AES-256-GCM envelope encryption.',
    validate: (val: string, env) => {
      if (env === 'production' || env === 'staging') {
        if (!val || val.includes('local-key')) {
          return { valid: false, error: 'Production requires a valid external KMS Key Reference.' };
        }
      }
      return { valid: true };
    }
  },
  {
    name: 'SECURITY.allowInsecureCookies',
    group: 'SECURITY',
    type: 'boolean',
    requiredEnvironments: ['staging', 'production'],
    defaultPolicy: 'FORBIDDEN_IN_PROD',
    isSecret: false,
    description: 'Allows non-HTTPS cookies. Strictly forbidden in staging and production.',
    validate: (val: boolean, env) => {
      if ((env === 'production' || env === 'staging') && val === true) {
        return { valid: false, error: 'Insecure cookies are strictly prohibited in production/staging.' };
      }
      return { valid: true };
    }
  },
  {
    name: 'PAYMENTS.sandboxMode',
    group: 'PAYMENTS',
    type: 'boolean',
    requiredEnvironments: ['production'],
    defaultPolicy: 'ENVIRONMENT_SPECIFIC',
    isSecret: false,
    description: 'Payment sandbox mode. Must be false in live production.',
    validate: (val: boolean, env) => {
      if (env === 'production' && val === true) {
        return { valid: false, error: 'Payment sandbox mode cannot be active in live production environment.' };
      }
      return { valid: true };
    }
  }
];
