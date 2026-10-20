// The studio's project document and its saving (Studio_Build_Plan.md Phase 2): the shape the database
// accepts, unknown fields kept, sources read from the document, and the autosaver's behaviour with a
// fake database and a fake clock (autosave after 15 seconds, numbered saves, a lost lease turns the
// editor to reading and keeps the draft, a network failure retries).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  checkDoc, openDoc, newVideoDoc, newPhotoDoc, librarySources, localSources, canvasOf, durationOf, danglingSources, unusedSources,
  DOC_MAX_BYTES, RATIOS, US,
} from '../src/lib/studio/schema.ts';
import { Saver, memoryDrafts, studioApi, studioErrorCode, studioErrorText, draftIsNewer, saveStateText, STUDIO_ERRORS, AUTOSAVE_MS, RETRY_MS } from '../src/lib/studio/persist.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const lib = (id, asset, version = 1) => ({ id, kind: 'library', asset, version, name: 'ملف', media: 'video' });

test('a new video project is valid, 9:16 at 30 frames, with one track of each kind', () => {
  const d = newVideoDoc();
  assert.equal(checkDoc(d), null);
  assert.equal(d.video.ratio, '9:16');
  assert.equal(d.video.fps, 30);
  assert.deepEqual(d.video.tracks.map((t) => t.kind), ['video', 'graphics', 'text', 'audio']);
  assert.deepEqual(canvasOf(d), { w: 1080, h: 1920, label: RATIOS['9:16'].label });
  assert.equal(durationOf(d), 0);
});

test('a new photo project keeps its size within 16 and 8000 pixels a side', () => {
  assert.equal(checkDoc(newPhotoDoc(1080, 1350)), null);
  assert.deepEqual(canvasOf(newPhotoDoc(20000, 3)), { w: 8000, h: 16 });
});

test('the checks the database makes, as the client makes them', () => {
  assert.equal(checkDoc(null), 'DOC_INVALID');
  assert.equal(checkDoc({ ...newVideoDoc(), schema: 2 }), 'DOC_INVALID', 'a newer schema than this client knows');
  assert.equal(checkDoc(newVideoDoc(), 'photo'), 'DOC_INVALID', 'the other kind');
  assert.equal(checkDoc({ ...newVideoDoc(), sources: [lib('a', A), lib('a', B)] }), 'DOC_INVALID', 'two sources, one id');
  assert.equal(checkDoc({ ...newVideoDoc(), sources: [lib('a', 'not-a-uuid')] }), 'DOC_INVALID', 'a library source needs a file id');
  assert.equal(checkDoc({ ...newVideoDoc(), sources: [lib('a', A, 0)] }), 'DOC_INVALID', 'and a version from 1');
  assert.equal(checkDoc({ ...newVideoDoc(), sources: [{ id: 'x', kind: 'url', url: 'https://x' }] }), 'DOC_INVALID', 'never a download address');
  assert.equal(checkDoc({ ...newVideoDoc(), pad: 'x'.repeat(DOC_MAX_BYTES) }), 'DOC_TOO_LARGE');
  assert.equal(checkDoc({ ...newPhotoDoc(), photo: { w: 10, h: 10 } }), 'DOC_INVALID', 'a photo has layers');
});

test('the library sources are read from the document, once each, at their exact version', () => {
  const d = { ...newVideoDoc(), sources: [lib('s1', A, 1), lib('s2', A, 2), lib('s3', A, 1), { id: 'l1', kind: 'local', key: 'k', name: 'جهاز.mp4', media: 'video', size: 9 }] };
  assert.deepEqual(librarySources(d), [{ asset: A, version: 1 }, { asset: A, version: 2 }]);
  assert.deepEqual(localSources(d).map((s) => s.id), ['l1']);
});

test('opening keeps every field this client does not know, and fills missing defaults', () => {
  const raw = newVideoDoc('16:9', 25);
  raw.future = { from: 'desktop' };
  raw.video.tracks[0].clips.push({ id: 'c1', start: 0, length: 2 * US, source: 's1', keyframes: [{ t: 0, x: 1 }] });
  raw.sources.push(lib('s1', A));
  raw.video.fps = 29;
  const d = openDoc(raw);
  assert.deepEqual(d.future, { from: 'desktop' });
  assert.deepEqual(d.video.tracks[0].clips[0].keyframes, [{ t: 0, x: 1 }]);
  assert.equal(d.video.fps, 30, 'an unknown frame rate falls back');
  assert.equal(raw.video.fps, 29, 'the input is not changed');
  assert.equal(durationOf(d), 2 * US);
  assert.throws(() => openDoc({ kind: 'video' }), /DOC_INVALID/);
});

test('broken and unused source references are found', () => {
  const d = newVideoDoc();
  d.sources.push(lib('s1', A), lib('s2', B));
  d.video.tracks[0].clips.push({ id: 'c1', start: 0, length: US, source: 's1' }, { id: 'c2', start: US, length: US, source: 'gone' });
  assert.deepEqual(danglingSources(d), ['gone']);
  assert.deepEqual(unusedSources(d), ['s2']);
});

test('database refusals become Arabic sentences', () => {
  assert.equal(studioErrorCode('STALE_REVISION'), 'STALE_REVISION');
  assert.equal(studioErrorCode('ERROR: P0001: NO_LEASE'), 'NO_LEASE');
  assert.equal(studioErrorCode('fetch failed'), 'NETWORK');
  assert.match(studioErrorText('SOURCE_DENIED'), /[؀-ۿ]/);
  for (const [k, v] of Object.entries(STUDIO_ERRORS)) assert.ok(/[؀-ۿ]/.test(v) && !v.includes(k), k);
});

/** A fake clock: timers run when the test advances time. */
function clock() {
  let now = 1_000_000;
  let timers = [];
  return {
    now: () => now,
    timer: (fn, ms) => {
      const t = { at: now + ms, fn };
      timers.push(t);
      return () => (timers = timers.filter((x) => x !== t));
    },
    async advance(ms) {
      now += ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((t) => t !== due);
        await due.fn();
        await new Promise((r) => setImmediate(r));
      }
    },
  };
}

/** A fake database that keeps the same rules as studio_save for one project. */
function fakeDb({ lease = true } = {}) {
  const db = { revision: 1, autosave: null, revisions: { 1: newVideoDoc() }, lease, calls: [], down: false };
  const call = async (fn, a) => {
    db.calls.push(fn);
    if (db.down) throw new Error('fetch failed');
    if (fn === 'studio_save') {
      if (!db.lease) return { data: null, error: { message: 'NO_LEASE' } };
      if (a.p_base !== db.revision) return { data: null, error: { message: 'STALE_REVISION' } };
      if (a.p_explicit) {
        db.revision += 1;
        db.revisions[db.revision] = a.p_doc;
        db.autosave = null;
        return { data: { revision: db.revision, explicit: true, saved_at: new Date().toISOString() }, error: null };
      }
      db.autosave = a.p_doc;
      return { data: { revision: db.revision, explicit: false, saved_at: new Date().toISOString() }, error: null };
    }
    return { data: null, error: null };
  };
  return { db, api: studioApi(call) };
}

const edit = (doc, note) => ({ ...doc, note });

test('a change is autosaved 15 seconds later, not before, and the draft is written within a second', async () => {
  const c = clock();
  const { db, api } = fakeDb();
  const drafts = memoryDrafts();
  const states = [];
  const s = new Saver({ api, project: 'p', doc: newVideoDoc(), base: 1, leased: true, drafts, timer: c.timer, now: c.now, onState: (x) => states.push(x.kind) });
  s.change(edit(s.current, 'أ'));
  assert.equal(s.state.kind, 'dirty');
  await c.advance(1000);
  assert.equal((await drafts.get('p')).doc.note, 'أ', 'the draft is on the device');
  await c.advance(AUTOSAVE_MS - 2000);
  assert.equal(db.autosave, null, 'not yet');
  await c.advance(1000);
  assert.equal(db.autosave.note, 'أ');
  assert.equal(s.state.kind, 'saved');
  assert.equal(await drafts.get('p'), null, 'a saved draft is cleared');
  assert.deepEqual(states, ['dirty', 'saving', 'saved']);
});

test('leaving the editor inside the site saves what was changed at once; dispose alone keeps only the draft', async () => {
  const c = clock();
  const { db, api } = fakeDb();
  const drafts = memoryDrafts();
  const s = new Saver({ api, project: 'p', doc: newVideoDoc(), base: 1, leased: true, drafts, timer: c.timer, now: c.now });
  s.change(edit(s.current, 'قبل المغادرة'));
  await c.advance(100);
  await s.flush();
  assert.equal(db.autosave.note, 'قبل المغادرة', 'saved without waiting for the timer');
  assert.equal(s.state.kind, 'saved');
  s.dispose();
  await c.advance(AUTOSAVE_MS * 2);
  assert.equal(db.calls.filter((x) => x === 'studio_save').length, 1, 'once');
  // nothing changed: nothing is sent
  const quiet = new Saver({ api, project: 'q', doc: newVideoDoc(), base: 1, leased: true, drafts, timer: c.timer, now: c.now });
  await quiet.flush();
  assert.equal(db.calls.filter((x) => x === 'studio_save').length, 1);
  // without the lease the draft is kept on the device and nothing is sent
  const ro = new Saver({ api, project: 'r', doc: newVideoDoc(), base: 1, leased: false, drafts, timer: c.timer, now: c.now });
  ro.change(edit(ro.current, 'للقراءة'));
  await ro.flush();
  assert.equal((await drafts.get('r')).doc.note, 'للقراءة');
  assert.equal(db.calls.filter((x) => x === 'studio_save').length, 1);
  const src = readFileSync('src/components/studio/use-project.ts', 'utf8');
  assert.match(src, /await s\?\.flush\(\)\.catch\(\(\) => undefined\);\s*s\?\.dispose\(\);\s*if \(held\) await api\.release\(id\);/);
});

test('changes keep postponing the autosave, and «حفظ نسخة» makes a numbered revision at once', async () => {
  const c = clock();
  const { db, api } = fakeDb();
  const s = new Saver({ api, project: 'p', doc: newVideoDoc(), base: 1, leased: true, drafts: memoryDrafts(), timer: c.timer, now: c.now });
  s.change(edit(s.current, '1'));
  await c.advance(10_000);
  s.change(edit(s.current, '2'));
  await c.advance(10_000);
  assert.equal(db.calls.filter((x) => x === 'studio_save').length, 0, 'still typing');
  const r = await s.save(true, 'للمراجعة');
  assert.equal(r.ok, true);
  assert.equal(db.revision, 2);
  assert.equal(db.revisions[2].note, '2');
  assert.equal(s.revision, 2, 'the next save builds on revision 2');
  s.change(edit(s.current, '3'));
  await c.advance(AUTOSAVE_MS);
  assert.equal(db.autosave.note, '3');
  assert.equal(db.revision, 2, 'an autosave never makes a numbered revision');
});

test('losing the lease turns the editor to reading and keeps the work on the device', async () => {
  const c = clock();
  const { db, api } = fakeDb();
  const drafts = memoryDrafts();
  const s = new Saver({ api, project: 'p', doc: newVideoDoc(), base: 1, leased: true, drafts, timer: c.timer, now: c.now });
  db.lease = false; // someone took over
  s.change(edit(s.current, 'عملي'));
  await c.advance(AUTOSAVE_MS);
  assert.equal(s.state.kind, 'readonly');
  assert.equal(s.state.code, 'NO_LEASE');
  assert.equal((await drafts.get('p')).doc.note, 'عملي');
  const again = await s.save(true);
  assert.equal(again.ok, false, 'no more saves until the lease is back');
  assert.equal(db.calls.filter((x) => x === 'studio_save').length, 1);
});

test('a newer revision saved elsewhere refuses the save: reading, draft kept', async () => {
  const c = clock();
  const { db, api } = fakeDb();
  const drafts = memoryDrafts();
  const s = new Saver({ api, project: 'p', doc: newVideoDoc(), base: 1, leased: true, drafts, timer: c.timer, now: c.now });
  db.revision = 5;
  s.change(edit(s.current, 'قديم'));
  const r = await s.save(false);
  assert.equal(r.ok, false);
  assert.equal(s.state.code, 'STALE_REVISION');
  assert.equal((await drafts.get('p')).doc.note, 'قديم');
});

test('a lost connection is retried, and the change made meanwhile is saved too', async () => {
  const c = clock();
  const { db, api } = fakeDb();
  const s = new Saver({ api, project: 'p', doc: newVideoDoc(), base: 1, leased: true, drafts: memoryDrafts(), timer: c.timer, now: c.now });
  db.down = true;
  s.change(edit(s.current, 'أ'));
  await c.advance(AUTOSAVE_MS);
  assert.equal(s.state.kind, 'error');
  assert.equal(s.state.code, 'NETWORK');
  db.down = false;
  await c.advance(RETRY_MS);
  assert.equal(db.autosave.note, 'أ');
  assert.equal(s.state.kind, 'saved');
});

test('a document the database would refuse is not sent at all', async () => {
  const { db, api } = fakeDb();
  const s = new Saver({ api, project: 'p', doc: newVideoDoc(), base: 1, leased: true, drafts: memoryDrafts(), timer: () => () => {}, now: () => 0 });
  s.change({ ...s.current, pad: 'x'.repeat(DOC_MAX_BYTES) });
  const r = await s.save(true);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'DOC_TOO_LARGE');
  assert.equal(db.calls.length, 0);
  assert.equal(s.state.kind, 'error');
});

test('a device draft is offered back only when it is newer and on the same revision', () => {
  const opened = { revision: 3, saved_at: '2026-10-19T10:00:00Z' };
  assert.equal(draftIsNewer({ base: 3, at: Date.parse('2026-10-19T10:05:00Z'), doc: newVideoDoc() }, opened), true);
  assert.equal(draftIsNewer({ base: 3, at: Date.parse('2026-10-19T09:00:00Z'), doc: newVideoDoc() }, opened), false);
  assert.equal(draftIsNewer({ base: 2, at: Date.parse('2026-10-19T10:05:00Z'), doc: newVideoDoc() }, opened), false, 'a draft on an older revision is not mixed in');
  assert.equal(draftIsNewer(null, opened), false);
});

test('the save state is said in Arabic', () => {
  assert.equal(saveStateText({ kind: 'saved', at: 0, revision: 1 }, 3000), 'محفوظ');
  assert.equal(saveStateText({ kind: 'saved', at: 0, revision: 1 }, 30_000), 'محفوظ قبل 30 ثانية');
  assert.equal(saveStateText({ kind: 'dirty' }), 'تغييرات لم تُحفظ بعد');
  assert.equal(saveStateText({ kind: 'readonly', code: 'NO_LEASE', error: '' }), 'للقراءة فقط');
});
