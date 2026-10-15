// Action_Plan.md C4: the database enforces a platform's limits at the send step. The rule is in two
// places (src/lib/platforms/limits.ts and the SQL function work_copy_issues); the same cases run
// through both. The SQL half runs in supabase/tests/limits_rules.sql against the database; here
// the TypeScript half is held to the expected column that file carries, so neither can change alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CASES } from './limits-battery.mjs';
import { valuesSql, expected } from './limits-sql-values.mjs';
import { workErrorText } from '../src/lib/work/rules.ts';
import { ENFORCED_AR, checkCopy } from '../src/lib/platforms/limits.ts';

const sql = readFileSync(new URL('../supabase/tests/limits_rules.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261015220000_limits_enforced.sql', import.meta.url), 'utf8');

test('the SQL rule run carries exactly the cases and expected codes the TypeScript rule gives', () => {
  assert.ok(CASES.length >= 50);
  assert.ok(sql.includes(valuesSql()), 'regenerate with: node --experimental-strip-types tests/limits-sql-values.mjs and rebuild limits_rules.sql');
});

test('anchors of the rule', () => {
  const [parts, im, vi, tv, p] = CASES[5];
  assert.equal(expected(parts, im, vi, tv, p), 'TOO_LONG');
  assert.equal(expected(CASES[4][0], 0, 0, false, 'instagram'), '');
  assert.equal(expected(CASES[29][0], 0, 0, false, 'youtube'), 'VIDEO_REQUIRED');
});

test('every error code the interface can raise is either enforced in SQL or deliberately not', () => {
  // The error-level codes of checkCopy, from its source, against the codes the migration writes.
  const src = readFileSync(new URL('../src/lib/platforms/limits.ts', import.meta.url), 'utf8');
  const ts = new Set([...src.matchAll(/code: '([A-Z_]+)', level: 'error'/g)].map((m) => m[1]));
  const db = new Set([...migration.matchAll(/array_append\(out, '([A-Z_]+)'\)/g)].map((m) => m[1]));
  // VIDEO_REQUIRED is the same rule the old work_youtube_ok enforced; both list it.
  assert.deepEqual([...ts].sort(), [...db].sort());
  assert.deepEqual(Object.keys(ENFORCED_AR).sort(), [...db].sort());
});

test('a refusal from the database is worded with the platform and the limit', () => {
  const t = workErrorText('COPY_OVER_LIMIT: instagram TOO_LONG');
  assert.match(t, /إنستغرام/);
  assert.match(t, /النص أطول من الحد/);
  assert.match(workErrorText('COPY_OVER_LIMIT'), /تتجاوز حد/);
});

test('the send-step functions are patched and the helpers are not reachable through the API', () => {
  assert.match(migration, /work_assert_copies\(p_work, w\.channels\)/);
  for (const f of ['work_schedule(text,timestamptz,text)', 'work_publish(text,text)', 'work_run_publish(text,uuid[],timestamptz,text)']) {
    assert.ok(migration.includes(f), f);
  }
  for (const f of ['platform_limit', 'work_copy_issues', 'work_copy_errors', 'work_assert_copies']) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon, authenticated`), f);
  }
  // Submitting for review is not blocked: a copy can still be fixed during review.
  assert.ok(!migration.includes("pg_get_functiondef('public.work_submit"));
  void checkCopy;
});
