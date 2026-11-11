import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(p:string)=>readFileSync(p,'utf8');

describe('MindOS Phase B29 — Full Backend Persistence & Local Certification',()=>{
  it('adds canonical migration 027 for remaining durable backend state',()=>{
    const sql=read('mindos/platform/database/migrations/027_full_backend_persistence_local_certification.sql');
    for(const table of ['professional_runtime_entities','availability_runtime_entities','appointment_runtime_entities','care_relationship_runtime_entities','clinical_workspace_runtime_entities','b29_mutable_state','local_certification_runs']){
      assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+table));
    }
  });

  it('database-enforces provider appointment overlap and idempotency',()=>{
    const sql=read('mindos/platform/database/migrations/027_full_backend_persistence_local_certification.sql');
    assert.match(sql,/appointment_runtime_provider_overlap_excl/);
    assert.match(sql,/uq_appointment_runtime_idempotency/);
  });

  it('clinical workspace and mutable user state persist ciphertext rather than plaintext payload JSON',()=>{
    const sql=read('mindos/platform/database/migrations/027_full_backend_persistence_local_certification.sql');
    assert.match(sql,/clinical_workspace_runtime_entities[\s\S]*payload_ciphertext TEXT NOT NULL/);
    assert.match(sql,/b29_mutable_state[\s\S]*payload_ciphertext TEXT NOT NULL/);
    assert.doesNotMatch(sql,/clinical_workspace_runtime_entities[\s\S]*payload JSONB NOT NULL/);
  });

  it('one B29 switch activates full local PostgreSQL persistence',()=>{
    const env=read('.env.example');
    const server=read('server.ts');
    assert.match(env,/MINDOS_DATABASE_DRIVER="postgres"/);
    assert.match(env,/MINDOS_B29_STORAGE_MODE="postgres"/);
    assert.match(server,/fullPersistence/);
    assert.match(server,/configureB29Runtime/);
  });

  it('local container migrates before serving traffic',()=>{
    const dockerfile=read('Dockerfile');
    assert.match(dockerfile,/bun run db:migrate && bun run dev/);
  });

  it('full-persistence identity registration uses the canonical durable identity service',()=>{
    const server=read('server.ts');
    assert.match(server,/canonicalIdentityService\.register/);
    assert.match(server,/canonicalIdentityService\.verifyEmail/);
    assert.match(server,/canonicalIdentityService\.authenticate/);
  });

  it('full persistence does not seed synthetic verified professionals or provider matching profiles',()=>{
    const professionals=read('mindos/professionals/service.ts');
    const matcher=read('mindos/care_navigation/matching/provider_matcher.ts');
    assert.match(professionals,/repo instanceof InMemoryProfessionalRepository/);
    assert.match(matcher,/MINDOS_B29_STORAGE_MODE==='postgres'/);
    assert.match(matcher,/if\(!fullPersistence\)ProviderMatcher\.seedCanonicalProviders\(\)/);
  });

  it('real runtime keeps expired legacy Kenya crisis resources fail-closed while tests get ephemeral fixtures only',()=>{
    const safety=read('mindos/safety/index.ts');
    assert.match(safety,/const testOnly = process\.env\.NODE_ENV === 'test'/);
    assert.match(safety,/testOnly \? testNextVerifyAt : '2026-11-01T00:00:00\.000Z'/);
  });
});
