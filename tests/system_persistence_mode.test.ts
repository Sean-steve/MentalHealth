import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getMindOSDatabaseDriver,
  isSystemPostgresPersistenceEnabled
} from '../mindos/platform/database/persistence_mode.js';

describe('MindOS system-wide persistence mode', () => {
  it('uses PostgreSQL for the entire platform when MINDOS_DATABASE_DRIVER=postgres', () => {
    const env = {
      MINDOS_ENV: 'development',
      MINDOS_DATABASE_DRIVER: 'postgres'
    };
    assert.equal(getMindOSDatabaseDriver(env), 'postgres');
    assert.equal(isSystemPostgresPersistenceEnabled(env), true);
  });

  it('uses canonical in-memory persistence only when explicitly selected outside production', () => {
    const env = {
      MINDOS_ENV: 'test',
      MINDOS_DATABASE_DRIVER: 'canonical'
    };
    assert.equal(getMindOSDatabaseDriver(env), 'canonical');
    assert.equal(isSystemPostgresPersistenceEnabled(env), false);
  });

  it('ignores legacy Sprint and B29 storage switches', () => {
    const env = {
      MINDOS_ENV: 'test',
      MINDOS_DATABASE_DRIVER: 'canonical',
      MINDOS_SPRINT22_STORAGE_MODE: 'postgres',
      MINDOS_SPRINT28_STORAGE_MODE: 'postgres',
      MINDOS_B29_STORAGE_MODE: 'postgres'
    };
    assert.equal(getMindOSDatabaseDriver(env), 'canonical');
    assert.equal(isSystemPostgresPersistenceEnabled(env), false);
  });

  it('fails closed in staging/production if the system database driver is not explicit', () => {
    assert.throws(
      () => getMindOSDatabaseDriver({ MINDOS_ENV: 'production' }),
      /MINDOS_DATABASE_DRIVER must be explicitly set to "postgres"/
    );
    assert.throws(
      () => getMindOSDatabaseDriver({ MINDOS_ENV: 'staging' }),
      /MINDOS_DATABASE_DRIVER must be explicitly set to "postgres"/
    );
  });
});
