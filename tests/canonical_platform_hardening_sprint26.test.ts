import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DatabaseManager } from '../mindos/platform/database/index.js';
import { DomainInvariantError } from '../mindos/platform/errors/index.js';
import { Logger } from '../mindos/platform/observability/logger.js';
import {
  DataLifecycleOrchestrator,
  DisasterRecoveryService,
  HardeningObservabilityService,
  HardeningReadinessService,
  ReliabilityPolicyEngine
} from '../mindos/hardening/index.js';
import { configureSprint26Runtime, resetSprint26RuntimeForTesting } from '../mindos/sprint26/runtime.js';

const stores=['PRIMARY_DB','OBJECT_STORAGE','VECTOR_STORE','SEARCH_INDEX','ANALYTICS','CACHE'] as const;

describe('MindOS Sprint 26 — Platform Hardening',()=>{
  beforeEach(()=>{
    resetSprint26RuntimeForTesting();
    configureSprint26Runtime({usePostgres:false});
  });

  after(async()=>{
    resetSprint26RuntimeForTesting();
    await DatabaseManager.shutdown();
  });

  it('creates privacy lifecycle jobs across primary and derived stores without persisting raw subject identifiers',async()=>{
    const job=await DataLifecycleOrchestrator.request({
      subject_id:'user-sensitive-123',
      request_type:'ERASURE',
      reason_code:'USER_REQUEST'
    });
    assert.equal(job.target_stores.length,6);
    assert.deepEqual(job.target_stores,stores);
    assert.notEqual(job.subject_ref_hash,'user-sensitive-123');
    assert.equal(JSON.stringify(job).includes('user-sensitive-123'),false);
  });

  it('does not falsely complete deletion while derived stores remain pending',async()=>{
    const job=await DataLifecycleOrchestrator.request({
      subject_id:'user-a',request_type:'ERASURE',reason_code:'USER_REQUEST'
    });
    const one=await DataLifecycleOrchestrator.acknowledge({
      job_id:job.id,store_key:'PRIMARY_DB',status:'ACKNOWLEDGED',evidence_ref:'db:deleted'
    });
    assert.equal(one.job.state,'IN_PROGRESS');
    const status=await DataLifecycleOrchestrator.status(job.id);
    assert.ok(status.pending_stores.includes('ANALYTICS'));
    assert.ok(status.pending_stores.includes('VECTOR_STORE'));
    await DataLifecycleOrchestrator.assertNoFalseCompletion(job.id);
  });

  it('blocks lifecycle completion when a dependent store reports a policy block',async()=>{
    const job=await DataLifecycleOrchestrator.request({
      subject_id:'user-b',request_type:'ERASURE',reason_code:'USER_REQUEST'
    });
    const result=await DataLifecycleOrchestrator.acknowledge({
      job_id:job.id,store_key:'PRIMARY_DB',status:'BLOCKED',evidence_ref:'hold:1',detail_code:'LEGAL_HOLD'
    });
    assert.equal(result.job.state,'BLOCKED');
    assert.equal(result.job.completed_at,undefined);
  });

  it('marks privacy lifecycle complete only after every dependency acknowledges',async()=>{
    const job=await DataLifecycleOrchestrator.request({
      subject_id:'user-c',request_type:'CONSENT_WITHDRAWAL_RESTRICTION',reason_code:'CONSENT_WITHDRAWN'
    });
    for(const store of stores){
      await DataLifecycleOrchestrator.acknowledge({
        job_id:job.id,store_key:store,status:'ACKNOWLEDGED',evidence_ref:`receipt:${store}`
      });
    }
    const status=await DataLifecycleOrchestrator.status(job.id);
    assert.equal(status.job.state,'COMPLETE');
    assert.equal(status.pending_stores.length,0);
    assert.ok(status.job.completed_at);
  });

  it('enforces the canonical reliability priority hierarchy and protects safety under backpressure',()=>{
    assert.deepEqual(ReliabilityPolicyEngine.hierarchy(),[
      'SAFETY','DATA_INTEGRITY','PRIVACY_SECURITY','IDENTITY_CORE','CARE','AI_COMMUNITY','ANALYTICS_EXPERIMENTS'
    ]);
    assert.equal(ReliabilityPolicyEngine.mayAdmit('ANALYTICS_EXPERIMENTS',true),false);
    assert.equal(ReliabilityPolicyEngine.mayAdmit('SAFETY',true),true);
    assert.equal(ReliabilityPolicyEngine.protectedUnderBackpressure('SAFETY'),true);
  });

  it('keeps safety available during AI provider outage and uses a non-AI fallback',()=>{
    const decision=ReliabilityPolicyEngine.evaluate('AI_PROVIDER','DOWN');
    assert.equal(decision.safety_static_path_available,true);
    assert.match(decision.primary_behavior,/NON_AI/);
    assert.ok(decision.prohibited_claims.includes('AI_REQUIRED_FOR_SAFETY'));
  });

  it('places writes into safe mode when primary database consistency is uncertain',()=>{
    const decision=ReliabilityPolicyEngine.evaluate('PRIMARY_DB','DOWN');
    assert.equal(decision.write_mode,'SAFE_MODE');
    assert.equal(decision.safety_static_path_available,true);
    assert.ok(decision.prohibited_claims.includes('WRITE_SUCCESS_WHILE_CONSISTENCY_UNCERTAIN'));
  });

  it('does not call a backup valid when no tested restore evidence exists',async()=>{
    const before=await DisasterRecoveryService.launchReadiness('PRIMARY_POSTGRES');
    assert.equal(before.ready,false);
    assert.ok(before.blockers.includes('RECOVERY_TARGET_NOT_CONFIGURED'));

    await DisasterRecoveryService.configureTarget({
      service_key:'PRIMARY_POSTGRES',criticality:'DATA_INTEGRITY',rpo_seconds:60,rto_seconds:120,configured_by:'sre-test'
    });
    const after=await DisasterRecoveryService.launchReadiness('PRIMARY_POSTGRES');
    assert.equal(after.ready,false);
    assert.ok(after.blockers.includes('TESTED_RESTORE_EVIDENCE_MISSING'));
  });

  it('accepts restore evidence only when integrity, migration compatibility and configured targets pass',async()=>{
    await DisasterRecoveryService.configureTarget({
      service_key:'PRIMARY_POSTGRES',criticality:'DATA_INTEGRITY',rpo_seconds:60,rto_seconds:120,configured_by:'sre-test'
    });
    const evidence=await DisasterRecoveryService.recordRestoreEvidence({
      service_key:'PRIMARY_POSTGRES',
      backup_created_at:'2026-10-31T08:00:00.000Z',
      restore_started_at:'2026-10-31T08:00:05.000Z',
      restore_completed_at:'2026-10-31T08:00:25.000Z',
      measured_rpo_seconds:5,measured_rto_seconds:20,
      integrity_passed:true,migration_compatible:true,
      backup_artifact_hash:'a'.repeat(64),evidence:{migration_count:24}
    });
    assert.equal(evidence.status,'PASS');
    assert.equal((await DisasterRecoveryService.launchReadiness('PRIMARY_POSTGRES')).ready,true);
  });

  it('blocks launch after a failed restore integrity check even when timing targets pass',async()=>{
    await DisasterRecoveryService.configureTarget({
      service_key:'PRIMARY_POSTGRES',criticality:'DATA_INTEGRITY',rpo_seconds:60,rto_seconds:120,configured_by:'sre-test'
    });
    const evidence=await DisasterRecoveryService.recordRestoreEvidence({
      service_key:'PRIMARY_POSTGRES',
      backup_created_at:'2026-10-31T08:00:00.000Z',
      restore_started_at:'2026-10-31T08:00:05.000Z',
      restore_completed_at:'2026-10-31T08:00:15.000Z',
      measured_rpo_seconds:5,measured_rto_seconds:10,
      integrity_passed:false,migration_compatible:true,
      backup_artifact_hash:'b'.repeat(64),evidence:{check:'failed'}
    });
    assert.equal(evidence.status,'FAIL');
    const readiness=await DisasterRecoveryService.launchReadiness('PRIMARY_POSTGRES');
    assert.equal(readiness.ready,false);
    assert.ok(readiness.blockers.includes('RESTORE_INTEGRITY_FAILED'));
  });

  it('rejects invalid recovery targets instead of inventing operational RPO/RTO defaults',async()=>{
    await assert.rejects(()=>DisasterRecoveryService.configureTarget({
      service_key:'PRIMARY_POSTGRES',criticality:'DATA_INTEGRITY',rpo_seconds:-1,rto_seconds:0,configured_by:'sre-test'
    }),DomainInvariantError);
  });

  it('redacts sensitive values from both structured log messages and context and removes log-injection newlines',()=>{
    const logger=new Logger('test');
    const original=console.log;
    console.log=()=>{};
    try{
      const entry=logger.info('Contact person@example.com\nBearer abc.def.ghi',{
        clinical_note:'private clinical note',
        token:'very-secret',
        safe_code:'OPS_001'
      });
      assert.equal(entry.message.includes('person@example.com'),false);
      assert.equal(entry.message.includes('abc.def.ghi'),false);
      assert.equal(entry.message.includes('\n'),false);
      const context=JSON.stringify(entry.context);
      assert.equal(context.includes('private clinical note'),false);
      assert.equal(context.includes('very-secret'),false);
      assert.equal(context.includes('OPS_001'),true);
    }finally{console.log=original;}
  });

  it('publishes observability summaries without raw sensitive bodies, prompts or notes',()=>{
    const snapshot:any=HardeningObservabilityService.snapshot();
    assert.equal(snapshot.privacy_boundary.raw_request_bodies_included,false);
    assert.equal(snapshot.privacy_boundary.raw_journal_text_included,false);
    assert.equal(snapshot.privacy_boundary.raw_ai_prompts_included,false);
    assert.equal(snapshot.privacy_boundary.raw_clinical_notes_included,false);
  });

  it('hardening readiness is launch-blocking until a tested restore exists',async()=>{
    const before:any=await HardeningReadinessService.snapshot('PRIMARY_POSTGRES');
    assert.equal(before.ready,false);
    assert.ok(before.launch_blockers.includes('RECOVERY_TARGET_NOT_CONFIGURED'));

    await DisasterRecoveryService.configureTarget({
      service_key:'PRIMARY_POSTGRES',criticality:'DATA_INTEGRITY',rpo_seconds:60,rto_seconds:120,configured_by:'sre-test'
    });
    await DisasterRecoveryService.recordRestoreEvidence({
      service_key:'PRIMARY_POSTGRES',
      backup_created_at:'2026-10-31T08:00:00.000Z',
      restore_started_at:'2026-10-31T08:00:01.000Z',
      restore_completed_at:'2026-10-31T08:00:03.000Z',
      measured_rpo_seconds:1,measured_rto_seconds:2,
      integrity_passed:true,migration_compatible:true,
      backup_artifact_hash:'c'.repeat(64),evidence:{verified:true}
    });
    const after:any=await HardeningReadinessService.snapshot('PRIMARY_POSTGRES');
    assert.equal(after.ready,true);
    assert.deepEqual(after.launch_blockers,[]);
  });
});
