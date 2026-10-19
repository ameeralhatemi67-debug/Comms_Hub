// Static checks on the studio's migrations (Studio_Build_Plan.md Phase 2): row level security with read
// policies only, every function security definer with an empty search path and the studio check first,
// execute refused to public and anon, internal helpers refused to signed-in accounts too, and the
// document check equal to the client's (src/lib/studio/schema.ts). The behaviour itself is run against
// the database in supabase/tests/studio_rules.sql.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkDoc, newVideoDoc, DOC_MAX_BYTES } from '../src/lib/studio/schema.ts';

const sql = readFileSync('supabase/migrations/20261019130000_studio_projects.sql', 'utf8');
const TABLES = ['studio_projects', 'studio_revisions', 'studio_sources', 'studio_exports'];
const PUBLIC_FNS = ['studio_project_create', 'studio_project_rename', 'studio_project_archive', 'studio_lease', 'studio_release', 'studio_save', 'studio_project_doc', 'studio_list', 'studio_export_record', 'studio_project_link_work'];
const fn = (name) => sql.match(new RegExp(`create (?:or replace )?function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))?.[0] ?? '';

test('every studio table has row level security and a read policy only', () => {
  for (const t of TABLES) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`), t);
    assert.match(sql, new RegExp(`create policy ${t}_read on public\\.${t} for select to authenticated using \\(\\(select public\\.studio_can\\(\\)\\)\\);`), t);
  }
  assert.doesNotMatch(sql, /create policy [^;]* for (insert|update|delete|all)/, 'no write policy');
});

test('every function runs as definer with an empty search path, and every public one checks the studio first', () => {
  for (const n of [...PUBLIC_FNS, 'studio_sources_ok', 'studio_sources_record']) {
    const body = fn(n);
    assert.ok(body, n);
    assert.match(body, /security definer set search_path = ''/, n);
  }
  for (const n of PUBLIC_FNS) {
    const body = fn(n);
    const begin = body.indexOf('begin');
    assert.match(body.slice(begin, begin + 120), /if not public\.studio_can\(\) then raise exception 'FORBIDDEN'/, `${n} checks the studio first`);
  }
});

test('nobody outside signed-in accounts calls a function, and the internal helpers are not callable at all', () => {
  for (const n of PUBLIC_FNS) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${n}\\([^)]*\\) from public, anon;`), n);
    assert.match(sql, new RegExp(`grant execute on function public\\.${n}\\([^)]*\\) to authenticated;`), n);
  }
  for (const n of ['studio_sources_ok', 'studio_sources_record']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${n}\\([^)]*\\) from public, anon, authenticated;`), n);
    assert.doesNotMatch(sql, new RegExp(`grant execute on function public\\.${n}\\(`), n);
  }
});

test('a save needs the lease and the latest numbered revision; a numbered revision is never updated or deleted', () => {
  const save = fn('studio_save');
  assert.match(save, /p\.lease_holder is distinct from me or p\.lease_until < now\(\) then raise exception 'NO_LEASE'/);
  assert.match(save, /p\.revision <> p_base then raise exception 'STALE_REVISION'/);
  // the only deletions and the only upsert touch the autosave slot (revision 0)
  for (const m of save.matchAll(/delete from public\.studio_\w+ where [^;]+;/g)) assert.match(m[0], /revision = 0/, m[0]);
  assert.match(save, /values \(p_project, 0, p\.revision[\s\S]*?on conflict \(project_id, revision\) do update/);
  assert.doesNotMatch(sql, /update public\.studio_revisions/);
  assert.doesNotMatch(sql, /delete from public\.studio_projects/);
});

test('the sources come from the document; a new one must be visible to the caller', () => {
  assert.match(fn('studio_sources_record'), /from jsonb_array_elements\(p_doc->'sources'\) s where s->>'kind' = 'library'/);
  const ok = fn('studio_sources_ok');
  assert.match(ok, /x\.project_id = p_project and x\.asset_id = a and x\.version = v\) then\s+continue;/);
  assert.match(ok, /coalesce\(public\.media_asset_level\(a\), 0\) < 1/);
  assert.match(ok, /raise exception 'SOURCE_DENIED'/);
});

test('an export is recorded only for a version the caller uploaded, from a numbered revision', () => {
  const e = fn('studio_export_record');
  assert.match(e, /mv\.uploaded_by = me/);
  assert.match(e, /coalesce\(p_revision, 0\) < 1/);
});

test('the database and the client agree on the document limits', () => {
  assert.match(fn('studio_doc_check'), /octet_length\(p_doc::text\) > 1572864/);
  // the client's compact JSON limit stays below the database's own printing limit even with its spaces
  const doc = { ...newVideoDoc(), pad: 'x'.repeat(DOC_MAX_BYTES - 400) };
  assert.equal(checkDoc(doc), null);
  const printed = JSON.stringify(doc).replace(/":/g, '": ').replace(/,"/g, ', "');
  assert.ok(Buffer.byteLength(printed) < 1572864);
});
