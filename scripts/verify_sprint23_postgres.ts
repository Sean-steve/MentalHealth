import { configureSprint23Runtime } from '../mindos/sprint23/index.js';
import { getPool, DatabaseManager } from '../mindos/platform/database/index.js';

const status = await configureSprint23Runtime({ usePostgres: true });
if (status.persistence !== 'POSTGRES') {
  throw new Error('Sprint 23 PostgreSQL runtime was not selected.');
}
if (status.thresholds_seeded !== false) {
  throw new Error('Sprint 23 must never seed clinical thresholds.');
}

const pool = getPool();
const required = [
  'longitudinal_clinical_records',
  'clinical_timeline_entries',
  'clinical_observations',
  'outcome_measure_definitions',
  'outcome_comparability_policies',
  'outcome_alert_policies',
  'outcome_clinical_change_rules',
  'outcome_measurements',
  'outcome_baselines',
  'outcome_reviews',
  'outcome_alerts',
  'outcome_snapshots'
];

for (const table of required) {
  const result = await pool.query('SELECT to_regclass($1) AS name', ['public.' + table]);
  if (!result.rows[0]?.name) {
    throw new Error('Missing Sprint 23 table: ' + table);
  }
}

const defs = await pool.query('SELECT COUNT(*)::int AS count FROM outcome_measure_definitions');
const policies = await pool.query('SELECT COUNT(*)::int AS count FROM outcome_comparability_policies');
const rules = await pool.query('SELECT COUNT(*)::int AS count FROM outcome_clinical_change_rules');
const alertPolicies = await pool.query('SELECT COUNT(*)::int AS count FROM outcome_alert_policies');

if (Number(defs.rows[0]?.count || 0) !== status.measure_definitions) {
  throw new Error('Measure registry persistence mismatch.');
}
if (Number(policies.rows[0]?.count || 0) !== status.comparability_policies) {
  throw new Error('Comparability registry persistence mismatch.');
}
if (Number(rules.rows[0]?.count || 0) !== 0) {
  throw new Error('Migration/runtime seeded clinical-change thresholds unexpectedly.');
}
if (Number(alertPolicies.rows[0]?.count || 0) !== 0) {
  throw new Error('Migration/runtime seeded alert response deadlines unexpectedly.');
}

console.log('SPRINT 23 POSTGRES SMOKE PASSED', status);
await DatabaseManager.shutdown();
