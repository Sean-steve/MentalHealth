/**
 * MindOS system-wide persistence mode.
 *
 * MINDOS_DATABASE_DRIVER is the single authoritative persistence switch for
 * the whole platform. Sprint/phase-specific storage flags are intentionally
 * not consulted.
 */
export type MindOSDatabaseDriver = 'postgres' | 'canonical';

export function getMindOSDatabaseDriver(
  env: Record<string, string | undefined> = process.env
): MindOSDatabaseDriver {
  const raw = String(env.MINDOS_DATABASE_DRIVER || '').trim().toLowerCase();
  if (raw === 'postgres') return 'postgres';
  if (raw === 'canonical' || raw === 'memory' || raw === 'in_memory') return 'canonical';

  const runtimeEnv = String(env.MINDOS_ENV || env.NODE_ENV || 'development').trim().toLowerCase();

  if (runtimeEnv === 'production' || runtimeEnv === 'staging') {
    throw new Error(
      'MINDOS_DATABASE_DRIVER must be explicitly set to "postgres" in staging/production.'
    );
  }

  return 'canonical';
}

export function isSystemPostgresPersistenceEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return getMindOSDatabaseDriver(env) === 'postgres';
}
