import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';

import { DatabaseManager } from '../mindos/platform/database/index.js';
import { configureSprint26Runtime } from '../mindos/sprint26/runtime.js';
import { DisasterRecoveryService } from '../mindos/hardening/index.js';

const sourceUrl=process.env.DATABASE_URL;
if(!sourceUrl)throw new Error('DATABASE_URL is required for Sprint 26 DR verification.');

const parsed=new URL(sourceUrl);
const restoreDb='mindos_sprint26_restore';
const adminUrl=new URL(sourceUrl);
adminUrl.pathname='/postgres';
const restoreUrl=new URL(sourceUrl);
restoreUrl.pathname='/'+restoreDb;
const dumpPath=join(tmpdir(),'mindos-sprint26-restore.dump');

const runtime=configureSprint26Runtime({usePostgres:true});
if(runtime.persistence!=='POSTGRES'||!runtime.restore_evidence_required){
  throw new Error('Sprint 26 PostgreSQL hardening runtime was not enabled.');
}

const target=await DisasterRecoveryService.configureTarget({
  service_key:'PRIMARY_POSTGRES',
  criticality:'DATA_INTEGRITY',
  rpo_seconds:60,
  rto_seconds:300,
  configured_by:'sprint26-ci-drill'
});

const backupCreatedAt=new Date().toISOString();
const rpoSeconds=Math.max(0,Math.ceil((Date.parse(backupCreatedAt)-Date.parse(target.configured_at))/1000));

const admin=new Pool({connectionString:adminUrl.toString(),ssl:false});
let restored:Pool|undefined;
try{
  await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`,[restoreDb]);
  await admin.query(`DROP DATABASE IF EXISTS ${restoreDb}`);
  await admin.query(`CREATE DATABASE ${restoreDb}`);

  const dumpBytes=execFileSync('docker',[
    'run','--rm','--network','host','postgres:16',
    'pg_dump','--format=custom','--no-owner','--no-acl',sourceUrl
  ],{maxBuffer:100*1024*1024});
  writeFileSync(dumpPath,dumpBytes);

  const restoreStartedAt=new Date().toISOString();
  execFileSync('docker',[
    'run','--rm','--network','host','-v',`${tmpdir()}:/backup:ro`,'postgres:16',
    'pg_restore','--no-owner','--no-acl','--dbname',restoreUrl.toString(),`/backup/${dumpPath.split('/').pop()}`
  ],{stdio:'inherit'});
  const restoreCompletedAt=new Date().toISOString();
  const rtoSeconds=Math.max(0,Math.ceil((Date.parse(restoreCompletedAt)-Date.parse(restoreStartedAt))/1000));

  restored=new Pool({connectionString:restoreUrl.toString(),ssl:false});
  const migrations=await restored.query(`SELECT COUNT(*)::int AS count FROM schema_migrations`);
  const latestTarget=await restored.query(
    `SELECT service_key,rpo_seconds,rto_seconds FROM reliability_recovery_targets WHERE service_key='PRIMARY_POSTGRES'`
  );
  const migrationCount=Number(migrations.rows[0]?.count||0);
  const targetRestored=latestTarget.rows[0]?.service_key==='PRIMARY_POSTGRES';
  const integrityPassed=migrationCount>=24&&targetRestored;
  const migrationCompatible=migrationCount>=24;

  const artifactHash=createHash('sha256').update(readFileSync(dumpPath)).digest('hex');
  const evidence=await DisasterRecoveryService.recordRestoreEvidence({
    service_key:'PRIMARY_POSTGRES',
    backup_created_at:backupCreatedAt,
    restore_started_at:restoreStartedAt,
    restore_completed_at:restoreCompletedAt,
    measured_rpo_seconds:rpoSeconds,
    measured_rto_seconds:rtoSeconds,
    integrity_passed:integrityPassed,
    migration_compatible:migrationCompatible,
    backup_artifact_hash:artifactHash,
    evidence:{
      restored_database:restoreDb,
      schema_migrations:migrationCount,
      recovery_target_restored:targetRestored,
      dump_format:'custom',
      encrypted_at_rest_expectation:'INFRASTRUCTURE_CONTROL_NOT_SIMULATED_IN_LOCAL_CI'
    }
  });

  if(evidence.status!=='PASS')throw new Error('Sprint 26 tested restore evidence did not satisfy configured CI recovery targets.');
  const readiness=await DisasterRecoveryService.launchReadiness('PRIMARY_POSTGRES');
  if(!readiness.ready)throw new Error('Sprint 26 DR launch readiness remained blocked after a successful restore drill.');

  console.log('SPRINT 26 DR RESTORE DRILL PASSED',{
    migration_count:migrationCount,
    measured_rpo_seconds:rpoSeconds,
    measured_rto_seconds:rtoSeconds,
    backup_artifact_hash:artifactHash.slice(0,16)+'…',
    restore_evidence_status:evidence.status
  });
}finally{
  if(restored)await restored.end();
  await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`,[restoreDb]).catch(()=>{});
  await admin.query(`DROP DATABASE IF EXISTS ${restoreDb}`).catch(()=>{});
  await admin.end();
  rmSync(dumpPath,{force:true});
  await DatabaseManager.shutdown();
}
