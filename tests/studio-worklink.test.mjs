// The studio, third round, Phase 8 (MVP_draft.md 62.12): the studio and the work. What a project made for a
// work starts as, where the work stands in plain words, when it may be sent to review from the studio, who
// decides next, the chapters written into the YouTube copy, and that the wiring keeps the work cycle's rules
// (the studio sends through work_submit and approves nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { suggestFor, currentStage, daysUntil, dayWords, sendBlock, sendNeeds, decidesNext, suggestOf, suggestedFirst, withChapters, SENDABLE } from '../src/lib/studio/worklink.ts';
import { SHORTCUTS, matchShortcut } from '../src/lib/studio/shortcuts.ts';

const read = (f) => readFileSync(f, 'utf8');

test('a project for a work: video for video works and YouTube posts, photo otherwise; the shape follows the platforms', () => {
  assert.deepEqual(suggestFor('video', ['instagram']).kind, 'video');
  assert.equal(suggestFor('video', ['instagram']).ratio, '9:16');
  assert.equal(suggestFor('video', ['youtube']).ratio, '16:9');
  assert.equal(suggestFor('video', ['youtube', 'instagram']).ratio, '9:16');
  assert.equal(suggestFor('post', ['youtube']).kind, 'video');
  const ig = suggestFor('post', ['instagram', 'x']);
  assert.equal(ig.kind, 'photo');
  assert.equal(ig.ratio, '4:5');
  assert.deepEqual(ig.photo, { w: 1080, h: 1350 });
  assert.deepEqual(suggestFor('post', ['x', 'linkedin']).photo, { w: 1920, h: 1080 });
  assert.deepEqual(suggestFor('post', []).photo, { w: 1080, h: 1080 });
  assert.deepEqual(suggestFor('announce', []).categories, ['numbers', 'repine']);
  assert.deepEqual(suggestFor('video', []).categories, ['frames', 'repine']);
});

test('the suggested groups come first in their order, the others keep theirs; a document keeps at most three', () => {
  const g = [{ id: 'numbers' }, { id: 'repine' }, { id: 'frames' }];
  assert.deepEqual(suggestedFirst(g, ['frames', 'repine']).map((x) => x.id), ['frames', 'repine', 'numbers']);
  assert.deepEqual(suggestedFirst(g, ['nothing', 'frames', 'frames']).map((x) => x.id), ['frames', 'numbers', 'repine']);
  assert.deepEqual(suggestedFirst(g, []).map((x) => x.id), ['numbers', 'repine', 'frames']);
  assert.deepEqual(suggestOf({ suggest: { categories: ['frames', 7, 'repine'] } }), ['frames', 'repine']);
  assert.deepEqual(suggestOf({}), []);
  assert.deepEqual(suggestOf({ suggest: 'x' }), []);
});

test('the current stage is the first not finished nor passed at its approval point', () => {
  const st = (pos, extra = {}) => ({ id: `s${pos}`, pos, name: `م${pos}`, who: null, due_on: null, started_at: null, done_at: null, gate: false, gate_at: null, ...extra });
  assert.equal(currentStage([st(2), st(1, { done_at: 'x' }), st(3)])?.id, 's2');
  assert.equal(currentStage([st(1, { gate: true, gate_at: 'x' }), st(2)])?.id, 's2');
  assert.equal(currentStage([st(1, { done_at: 'x' })]), null);
});

test('dates in plain words from today', () => {
  assert.equal(daysUntil('2026-10-22', '2026-10-20'), 2);
  assert.equal(daysUntil('2026-10-20T23:00:00Z', '2026-10-20'), 0);
  assert.equal(dayWords('2026-10-20', '2026-10-20'), 'اليوم');
  assert.equal(dayWords('2026-10-21', '2026-10-20'), 'غداً');
  assert.equal(dayWords('2026-10-22', '2026-10-20'), 'بعد يومين');
  assert.equal(dayWords('2026-10-25', '2026-10-20'), 'بعد 5 أيام');
  assert.equal(dayWords('2026-11-20', '2026-10-20'), 'بعد 31 يوماً');
  assert.equal(dayWords('2026-10-19', '2026-10-20'), 'متأخر يوماً');
  assert.equal(dayWords('2026-10-18', '2026-10-20'), 'متأخر يومين');
  assert.equal(dayWords('2026-10-15', '2026-10-20'), 'متأخر 5 أيام');
});

test('sending from the studio: only in production or changes requested, each refusal said; who decides next', () => {
  assert.deepEqual(SENDABLE, ['IN_PRODUCTION', 'CHANGES_REQUESTED']);
  for (const s of SENDABLE) assert.equal(sendBlock(s), null);
  for (const s of ['DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'REJECTED']) assert.ok(sendBlock(s), s);
  assert.match(sendBlock('APPROVED'), /يعيده إلى المراجعة/);
  assert.equal(decidesNext('director'), 'مساعد مدير الاتصال المؤسسي');
  assert.equal(decidesNext('assistant'), 'مدير الاتصال المؤسسي');
  assert.equal(decidesNext('admin'), 'مدير الاتصال المؤسسي أو مساعده');
  // the database's own rule allows these statuses (work_submit), so the interface never offers more
  const wc = read('supabase/migrations/20261012120000_work_cycle.sql');
  const submit = wc.match(/create function public\.work_submit\([\s\S]*?\n\$\$;/)?.[0] ?? '';
  assert.match(submit, /'IN_PRODUCTION'/);
  assert.match(submit, /'CHANGES_REQUESTED'/);
});

test('what the work page must settle first is said before the export: accounts for a publishable work, a proposed time still ahead', () => {
  const now = Date.parse('2026-10-20T09:00:00Z');
  assert.equal(sendNeeds({ channels: [], proposed_at: null }, false, now), null);
  assert.match(sendNeeds({ channels: [], proposed_at: null }, true, now), /حسابات النشر/);
  assert.match(sendNeeds({ channels: ['a'], proposed_at: '2026-10-19T09:00:00Z' }, true, now), /مضى/);
  assert.equal(sendNeeds({ channels: ['a'], proposed_at: '2026-10-21T09:00:00Z' }, true, now), null);
  assert.equal(sendNeeds({ channels: ['a'], proposed_at: null }, true, now), null);
  // the database refuses the same (work_submit), so the interface only says it sooner
  const submit = read('supabase/migrations/20261012120000_work_cycle.sql').match(/create function public\.work_submit\([\s\S]*?\n\$\$;/)?.[0] ?? '';
  assert.match(submit, /CHANNEL_REQUIRED/);
  assert.match(submit, /DATE_PAST/);
});

test('chapters into the YouTube copy: an old chapter block is replaced, else the lines are added after a blank line', () => {
  const lines = '00:00 المقدمة\n00:15 الحديث\n00:40 الختام';
  assert.equal(withChapters('', lines), lines);
  assert.equal(withChapters('وصف الفيديو', lines), `وصف الفيديو\n\n${lines}`);
  assert.equal(withChapters('وصف الفيديو\n\n00:00 قديم\n00:20 قديم ثان\n', lines), `وصف الفيديو\n\n${lines}`);
  assert.equal(withChapters('00:00 قديم\n00:30 قديم', lines), lines);
  // a time inside the description is not a chapter block
  assert.equal(withChapters('اللقاء عند 0:00 بتوقيت الرياض', lines), `اللقاء عند 0:00 بتوقيت الرياض\n\n${lines}`);
  assert.equal(withChapters('00:00 بداية\nنص بعدها', lines), `00:00 بداية\nنص بعدها\n\n${lines}`);
  assert.equal(withChapters('وصف', '  '), 'وصف');
});

test('the new keys clash with nothing: Ctrl+Shift+M sends, N and Shift+N step through open notes', () => {
  const k = (code, mods = {}) => ({ code, key: '', ctrlKey: !!mods.ctrl, metaKey: false, shiftKey: !!mods.shift, altKey: false });
  assert.equal(matchShortcut(k('KeyM', { ctrl: true, shift: true }), 'video'), 'send-review');
  assert.equal(matchShortcut(k('KeyM', { ctrl: true, shift: true }), 'photo'), 'send-review');
  assert.equal(matchShortcut(k('KeyM', { ctrl: true }), 'video'), 'export');
  assert.equal(matchShortcut(k('KeyN'), 'video'), 'note-next');
  assert.equal(matchShortcut(k('KeyN', { shift: true }), 'video'), 'note-prev');
  for (const scope of ['video', 'photo']) {
    const seen = new Map();
    for (const s of SHORTCUTS.filter((x) => x.scopes.includes(scope)))
      for (const c of s.combos) {
        assert.ok(!seen.has(c), `${scope}: ${c} is ${seen.get(c)} and ${s.id}`);
        seen.set(c, s.id);
      }
  }
});

test('the wiring keeps the work cycle: work_submit with the work’s own accounts and time, nothing approved, a reviewed file held', () => {
  const send = read('src/components/studio/send-review.tsx');
  assert.match(send, /rpc\('work_submit', \{\s*p_work: w\.id,/);
  assert.match(send, /p_channels: pub \? w\.channels : null/);
  assert.match(send, /p_proposed: pub \? w\.proposed_at : null/);
  assert.match(send, /data-hold': HOLD\.studioNewVersion/);
  assert.match(send, /p\.saveVersion\('للمراجعة من الاستوديو'\)/);
  for (const f of ['send-review.tsx', 'work-bar.tsx', 'work-links.tsx', 'editor.tsx', 'photo-editor.tsx', 'project-shell.tsx']) {
    const src = read(`src/components/studio/${f}`);
    assert.doesNotMatch(src, /work_decide|work_approve|work_publish|'approve'/, f);
  }
  const links = read('src/components/studio/work-links.tsx');
  assert.match(links, /rpc\('work_text_save', \{ p_work: workRef, p_target: 'youtube'/);
  assert.match(links, /rpc\('studio_project_for_work'/);
  assert.match(links, /canOpenStudio\(account\) && caps\.has\(STUDIO_CAP\)/);
  // notes are written through the database function, never inserted directly
  assert.doesNotMatch(links, /from\('media_notes'\)\.insert/);
  assert.match(links, /setNoteDone\(rpc, n\.id, !n\.done_at\)/);
  // the work page shows the button only to studio holders and only on open works
  assert.match(read('src/components/work/item.tsx'), /\{!x\.closed_at && <WorkStudioButton /);
});
