// The studio, third round, Phase 7 (MVP_draft.md 62.12 to 62.14): the database for the connections and
// the helpers that use it. The behaviour is run against the database in
// supabase/tests/studio_connections_rules.sql; here, the migration's shape and the pure helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { msOfTimecode, noteTime, areaOf, noteErrorText, noteMs, NOTE_COLUMNS } from '../src/lib/media/notes.ts';
import { noticeHref } from '../src/lib/work/rules.ts';

const sql = readFileSync('supabase/migrations/20261020150000_studio_connections.sql', 'utf8');
const fn = (name) => sql.match(new RegExp(`create (?:or replace )?function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))?.[0] ?? '';

test('notes gain a version, an exact time, an area, answers and «تم»; the older insert stays', () => {
  assert.match(sql, /add column version int check \(version is null or version >= 1\)/);
  assert.match(sql, /add column at_ms int check \(at_ms is null or at_ms >= 0\)/);
  assert.match(sql, /add column area jsonb check \(public\.media_note_area_ok\(area\)\)/);
  assert.match(sql, /add column parent_id uuid references public\.media_notes\(id\) on delete cascade/);
  assert.doesNotMatch(sql, /drop policy notes_insert/);
  for (const c of ['version', 'at_ms', 'area', 'parent_id', 'done_at', 'done_by']) assert.ok(NOTE_COLUMNS.split(',').includes(c), c);
});

test('every new function runs as definer with an empty search path; the internal ones are callable by nobody', () => {
  for (const n of ['media_note_add', 'media_note_done', 'studio_can_for', 'studio_note_notify', 'studio_project_for_work', 'studio_request_source_access', 'studio_lease']) {
    assert.match(fn(n), /security definer set search_path = ''/, n);
  }
  for (const n of ['studio_project_for_work', 'studio_request_source_access', 'studio_lease']) {
    const b = fn(n);
    const begin = b.indexOf('begin');
    assert.match(b.slice(begin, begin + 120), /if not public\.studio_can\(\) then raise exception 'FORBIDDEN'/, n);
  }
  assert.match(sql, /revoke all on function public\.studio_can_for\(text\) from public, anon, authenticated;/);
  assert.match(sql, /revoke all on function public\.studio_note_notify\(\) from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /grant execute on function public\.studio_can_for/);
  assert.match(fn('media_note_add'), /coalesce\(public\.media_asset_level\(p_asset\), 0\) < 1 then raise exception 'FORBIDDEN'/, 'only on a file the caller sees');
  assert.match(fn('media_note_done'), /n\.author is distinct from me and not public\.work_lead\(\) and not public\.media_can_edit\(fld\)/);
  assert.match(fn('studio_note_notify'), /if public\.studio_can_for\(r\.email\) then/, 'only people who still hold the studio');
  assert.match(fn('studio_lease'), /perform public\.work_notify\(p\.lease_holder, 'info'/);
  assert.match(fn('studio_request_source_access'), /return public\.request_folder_access\(fld, p_reason\);/);
});

test('times and areas of notes', () => {
  assert.equal(msOfTimecode('01:05'), 65000);
  assert.equal(msOfTimecode('1:5'), null);
  assert.equal(msOfTimecode(''), null);
  assert.equal(noteTime(65250), '01:05.3');
  assert.equal(noteMs({ at_ms: 3250, timecode: '00:03' }), 3250);
  assert.equal(noteMs({ at_ms: null, timecode: '00:07' }), 7000);
  assert.deepEqual(areaOf({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.1 }), { x: 0.2, y: 0.1, w: 0.4, h: 0.4 });
  assert.deepEqual(areaOf({ x: -0.2, y: 0.5 }, { x: 0.3, y: 1.4 }), { x: 0, y: 0.5, w: 0.3, h: 0.5 });
  assert.equal(areaOf({ x: 0.5, y: 0.5 }, { x: 0.501, y: 0.6 }), null, 'a click is not an area');
  assert.match(noteErrorText('ERROR: VERSION_INVALID'), /الإصدار/);
});

test('a notice from the studio opens the project', () => {
  assert.equal(noticeHref({ page: 'studio', id: 'abc' }), '/motion/studio/abc');
  assert.equal(noticeHref({ page: 'studio' }), '/motion/studio');
});
