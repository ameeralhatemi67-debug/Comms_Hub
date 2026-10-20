// Settings Step S4 (Settings_Integrations_Plan.md 7): the site's half of backups. The database half,
// with the access rules, is supabase/tests/backup_rules.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildExport, exportFileName, ExportTooLarge, MAX_ROWS, PAGE } from '../src/lib/backups/export.ts';
import { BACKUP_EXCLUDED, BACKUP_KIND_AR, BACKUP_STATE_AR, EVENT_AR, ageAr, backupError, eventLine } from '../src/lib/integrations/rules.ts';

const sql = readFileSync(new URL('../supabase/migrations/20261015150000_backups.sql', import.meta.url), 'utf8');
// The studio (Studio_Build_Plan.md Phase 2) redefines the list and the plan: the latest definition is in force.
const later = [readFileSync(new URL('../supabase/migrations/20261020140000_studio_kit.sql', import.meta.url), 'utf8'), readFileSync(new URL('../supabase/migrations/20261019130000_studio_projects.sql', import.meta.url), 'utf8')];
const find = (text, name) => text.match(new RegExp(`create (?:or replace )?function public\\.${name}\\([^)]*\\)[\\s\\S]*?\\n\\$\\$;`))?.[0];
const body = (name) => later.map((t) => find(t, name)).find(Boolean) ?? find(sql, name) ?? '';

test('an export is one gzipped JSON file with a header, the tables, their counts, and what is not in it', async () => {
  const rows = { works: Array.from({ length: PAGE + 20 }, (_, i) => ({ id: i, title: `عمل ${i}` })), projects: [{ id: 'p1', name: 'مشروع' }] };
  const calls = [];
  const built = await buildExport(
    { kind: 'database', takenAt: '2026-10-15T10:00:00Z', takenBy: 'adm@x.sa', run: 'r1' },
    {
      plan: [{ table: 'works', rows: rows.works.length }, { table: 'projects', rows: 1 }],
      page: async (t, off, lim) => (calls.push([t, off, lim]), rows[t].slice(off, off + lim)),
    },
  );
  const doc = JSON.parse(gunzipSync(built.bytes).toString('utf8'));
  assert.equal(doc.format, 'comms-hub-backup');
  assert.equal(doc.kind, 'database');
  assert.equal(doc.taken_by, 'adm@x.sa');
  assert.equal(doc.tables.works.length, PAGE + 20, 'every page was read');
  assert.deepEqual(doc.counts, { works: PAGE + 20, projects: 1 });
  assert.equal(built.items, PAGE + 21);
  assert.equal(built.sha256, createHash('sha256').update(built.bytes).digest('hex'));
  assert.deepEqual(calls.map((c) => c.slice(0, 2)), [['works', 0], ['works', PAGE], ['projects', 0]]);
  assert.deepEqual(doc.excluded, BACKUP_EXCLUDED);
  assert.equal(doc.tables.works[0].title, 'عمل 0', 'Arabic survives');
});

test('an export that is too large for the server\'s memory is refused before any page is read', async () => {
  let read = 0;
  await assert.rejects(
    buildExport({ kind: 'config', takenAt: 'x', takenBy: 'y', run: 'z' }, { plan: [{ table: 't', rows: MAX_ROWS + 1 }], page: async () => (read++, []) }),
    (e) => e instanceof ExportTooLarge,
  );
  assert.equal(read, 0);
  assert.match(exportFileName('database', '2026-10-15T10:00:00Z'), /^comms-hub-records-2026-10-15\.json\.gz$/);
  assert.match(exportFileName('config', '2026-10-15T10:00:00Z'), /^comms-hub-settings-2026-10-15\.json\.gz$/);
});

test('what an export may hold: no mail, messaging, private notes, numbers, upload sessions or secrets', () => {
  const list = body('backup_table_list');
  const tables = [...list.matchAll(/'table','([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(tables.length > 30);
  for (const t of tables) assert.doesNotMatch(t, /^(mail_(threads|messages|members|files|date_tokens)|chat_|reminders|notifications|profiles|whatsapp_|guide_progress|undo_steps|storage_move_items|mail_server_key|vault)/, t);
  for (const t of ['works', 'media_files', 'file_locations', 'role_capabilities', 'platforms', 'site_settings', 'integrations']) assert.ok(tables.includes(t), t);
  assert.match(list, /'table','integrations', 'drop', jsonb_build_array\('secret_id','pending_secret_id'\)/);
});

test('every backup function checks the right, record functions also the server key, the tables have no policy', () => {
  for (const t of ['backup_jobs', 'backup_runs']) assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`));
  assert.doesNotMatch(sql, /create policy[^;]+backup_/);
  for (const n of ['backup_policy_set', 'backup_run_begin', 'backup_export_plan', 'backup_export_page', 'backup_run_close', 'backup_run_finish', 'backup_sample_claim', 'backup_sample_mark', 'backup_run_verify', 'backup_prune_claim', 'backup_prune_mark'])
    assert.match(body(n), /has_capability\('backups\.run', null\)/, n);
  for (const n of ['backup_run_finish', 'backup_sample_claim', 'backup_sample_mark', 'backup_run_verify', 'backup_prune_claim', 'backup_prune_mark']) assert.match(body(n), /mail_key_ok\(p_key\)/, n);
  assert.match(body('backup_restore_file'), /has_capability\('backups\.restore', null\)/);
  assert.match(body('backup_target_set'), /has_capability\('storage\.manage', null\)/);
});

test('a backup is never in the provider the library lives in, is incremental, and never changes a primary', () => {
  assert.match(body('backup_target_set'), /BACKUP_SAME_PROVIDER/);
  assert.match(body('storage_move_plan'), /p_mode <> 'backup' or not exists/);
  assert.match(body('storage_move_copied'), /when m\.mode = 'backup' then 'backup' else 'replica'/);
  // Restore needs a primary that is gone and a backup copy that was verified.
  const r = body('backup_restore_file');
  assert.match(r, /prim\.state not in \('missing','failed'\)/);
  assert.match(r, /role = 'backup' and state = 'ok' and verified_at is not null/);
  assert.doesNotMatch(sql, /delete from public\.file_locations/);
});

test('there is no scheduler: only a manual frequency is accepted, and the site says how old the last copy is', () => {
  assert.match(body('backup_policy_set'), /BACKUP_NO_SCHEDULER/);
  assert.match(body('backup_overview'), /'stale', not exists/);
  assert.match(body('settings_overview'), /'backup_stale'/);
});

test('the routes need the right, build nothing private, and verify by reading back', () => {
  const exp = readFileSync('src/app/api/backups/export/route.ts', 'utf8');
  assert.match(exp, /capGuard\(request, 'backups\.run', true\)/);
  assert.match(exp, /backup_export_page/);
  assert.match(exp, /sha256/);
  assert.match(exp, /backup_prune_claim/);
  const ver = readFileSync('src/app/api/backups/verify/route.ts', 'utf8');
  assert.match(ver, /backup_sample_claim/);
  assert.match(ver, /new Md5\(\)/);
  assert.match(ver, /e\.status === 503/, 'an unreachable provider marks nothing');
  const run = readFileSync('src/app/api/backups/run/route.ts', 'utf8');
  assert.match(run, /capGuard\(request, 'backups\.run', true\)/);
  for (const f of ['src/app/api/backups/export/route.ts', 'src/app/api/backups/verify/route.ts', 'src/app/api/backups/run/route.ts', 'src/components/settings/backups.tsx'])
    assert.doesNotMatch(readFileSync(f, 'utf8'), /secret_id|decrypted|int_secret_use|vaultSecret\(/, f);
});

test('the words: kinds, states, age, events and every refusal the migration raises', () => {
  for (const k of ['files', 'database', 'config']) assert.ok(BACKUP_KIND_AR[k], k);
  assert.deepEqual(Object.keys(BACKUP_STATE_AR).sort(), ['completed', 'failed', 'partial', 'running']);
  const now = Date.parse('2026-10-15T12:00:00Z');
  assert.equal(ageAr(null, now), 'لا توجد نسخة بعد');
  assert.equal(ageAr('2026-10-15T01:00:00Z', now), 'اليوم');
  assert.equal(ageAr('2026-10-14T01:00:00Z', now), 'منذ يوم');
  assert.equal(ageAr('2026-10-13T01:00:00Z', now), 'منذ يومين');
  assert.equal(ageAr('2026-10-10T01:00:00Z', now), 'منذ 5 أيام');
  assert.equal(ageAr('2026-09-10T01:00:00Z', now), 'منذ 35 يوماً');
  for (const k of ['backup_run', 'backup_verified', 'backup_restored', 'backup_policy', 'backup_target']) {
    assert.ok(EVENT_AR[k], k);
    assert.match(sql, new RegExp(`'${k}'`));
  }
  for (const code of new Set([...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]))) {
    if (['FORBIDDEN', 'INT_NOT_FOUND', 'BACKUP_BAD_KIND', 'BACKUP_BAD_STATE', 'BACKUP_BAD_RECORD', 'BACKUP_BAD_TABLE', 'BACKUP_NOT_NEEDED', 'CHECKSUM_CONFLICT', 'MOVE_BAD_STATE'].includes(code) || code.startsWith('MOVE_')) continue;
    assert.notEqual(backupError(code), backupError('unknown'), code);
  }
  assert.equal(eventLine({ kind: 'backup_verified', integration: 'S3', data: { kind: 'files', checked: 3, ok: 3, failed: 0 } }), 'فُحصت نسخة احتياطية · S3: قُرئت 3، سليمة 3، تعذّرت 0');
  assert.doesNotMatch(JSON.stringify([BACKUP_KIND_AR, BACKUP_STATE_AR, BACKUP_EXCLUDED]), /\p{Extended_Pictographic}/u);
});

test('the studio\'s records are in the database export, without the editing lease, and revisions are read 25 at a time', async () => {
  const list = body('backup_table_list');
  for (const t of ['studio_projects', 'studio_revisions', 'studio_sources', 'studio_exports']) assert.match(list, new RegExp(`'table','${t}'`), t);
  assert.match(list, /'table','studio_projects', 'drop', jsonb_build_array\('lease_holder','lease_until'\)/);
  assert.match(list, /'table','studio_revisions', 'page', 25/);
  assert.match(list, /'table','studio_brand'\)\)\s*else/, '«هوية الاستوديو» is configuration');
  assert.match(body('backup_export_plan'), /jsonb_strip_nulls\(jsonb_build_object\('table', e->>'table', 'rows', n, 'page', e->'page'\)\)/);
  const calls = [];
  const rows = Array.from({ length: 60 }, (_, i) => ({ project_id: 'p', revision: i }));
  const built = await buildExport(
    { kind: 'database', takenAt: 't', takenBy: 'a', run: 'r' },
    { plan: [{ table: 'studio_revisions', rows: 60, page: 25 }], page: async (t, off, lim) => (calls.push([off, lim]), rows.slice(off, off + lim)) },
  );
  assert.deepEqual(calls, [[0, 25], [25, 25], [50, 25]]);
  assert.equal(built.tables.studio_revisions, 60);
});
