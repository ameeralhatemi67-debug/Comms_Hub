import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  statusLabels, typeLabels, textLabels, TYPE_PLANS, STAGE_LIBRARY, stageState, cleared, gatePending, waitsFor, dependents,
  planMove, planInsert, planRemove, planCalc, planIssues, backSchedule, stepImpact, taskImpact, partsOf, partState,
  pendingParts, decideBlock, youtubeOk, publishOutcome, failedChannels, autoPick, dueNote, dayAdd, workErrorText,
  WORK_ERROR_CODES, WORK_RPC, isApprover, isUrgentApprover, canCreateWork, canPublish, canAssignTasksToOthers,
  canSeeWork, textEditable, isWhole,
} from '../src/lib/work/rules.ts';

const T = '2026-10-12';
const migrations = readdirSync('supabase/migrations').filter((f) => f.includes('work_cycle'))
  .map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n');
const reference = readFileSync('reference/comms-hub-reference-v5.html', 'utf8');

const row = (over = {}) => ({ n: 'مرحلة', role: '', who: 'a@x.sa', start: '', due: '', after: [], days: 1, gate: false, note: '', ...over });
const stage = (over = {}) => ({ done_at: null, started_at: null, gate: false, gate_by: null, after_pos: [], ...over });

test('every status, type and text has Arabic wording, and no emoji anywhere', () => {
  for (const s of ['DRAFT', 'IN_PRODUCTION', 'IN_REVIEW', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'PARTIAL', 'FAILED'])
    assert.match(statusLabels[s], /[؀-ۿ]/, s);
  assert.equal(statusLabels.CHANGES_REQUESTED, 'بحاجة إلى تعديل');
  assert.equal(statusLabels.APPROVED, 'جاهز للنشر');
  for (const t of Object.keys(TYPE_PLANS)) { assert.ok(typeLabels[t]); assert.ok(textLabels[t]); }
  for (const f of ['src/lib/work/rules.ts', ...readdirSync('supabase/migrations').filter((x) => x.includes('work_cycle')).map((x) => `supabase/migrations/${x}`), 'supabase/tests/work_rules.sql'])
    assert.doesNotMatch(readFileSync(f, 'utf8'), /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, f);
});

test('stage templates and the stage library are the reference\'s, and every wait points up', () => {
  for (const [type, plan] of Object.entries(TYPE_PLANS)) {
    const m = reference.match(new RegExp(`\\n  ${type}:\\s*\\{ar:[^\\n]*\\n\\s*plan:(\\[\\[.*?\\]\\])\\}`));
    assert.ok(m, `reference plan for ${type}`);
    assert.deepEqual(plan, JSON.parse(m[1]), type);
    plan.forEach(([, , days, after], i) => { assert.ok(days >= 1); after.forEach((j) => assert.ok(j < i, `${type} ${i}`)); });
  }
  const lib = reference.match(/var STAGE_LIB = (\[\[.*?\]\]);/);
  assert.deepEqual(STAGE_LIBRARY, JSON.parse(lib[1]));
});

test('a stage starts when what it waits for is cleared; an approval point holds what follows', () => {
  const S = [stage(), stage({ after_pos: [0] }), stage({ after_pos: [0, 1] })];
  assert.deepEqual([0, 1, 2].map((i) => stageState(S, i)), ['ready', 'waiting', 'waiting']);
  S[0] = stage({ done_at: 'x' });
  assert.deepEqual([0, 1, 2].map((i) => stageState(S, i)), ['done', 'ready', 'waiting']);
  assert.deepEqual(waitsFor(S, 2), [1]);
  const G = [stage({ done_at: 'x', gate: true }), stage({ after_pos: [0] })];
  assert.equal(gatePending(G[0]), true);
  assert.equal(cleared(G[0]), false);
  assert.equal(stageState(G, 1), 'waiting');
  G[0] = { ...G[0], gate_by: 'dir@x.sa' };
  assert.equal(stageState(G, 1), 'ready');
  assert.deepEqual(dependents([stage(), stage({ after_pos: [0] }), stage({ after_pos: [1] }), stage()], 0), [1, 2]);
});

test('plan editor: moving a stage drops a wait that would point down, and says so', () => {
  const P = [row({ n: 'أ' }), row({ n: 'ب', after: [0] }), row({ n: 'ج', after: [1] })];
  const { plan, dropped } = planMove(P, 0, 2);
  assert.deepEqual(plan.map((r) => r.n), ['ب', 'ج', 'أ']);
  assert.deepEqual(plan.map((r) => r.after), [[], [0], []]);
  assert.equal(dropped.length, 1);
  assert.match(dropped[0], /«ب» لم تعد تنتظر «أ»/);
  const ins = planInsert(P, 1, row({ n: 'جديدة', after: [0] }));
  assert.deepEqual(ins.map((r) => r.after), [[], [0], [0], [2]]);
  const rm = planRemove(P, 1);
  assert.deepEqual(rm.map((r) => r.after), [[], []]);
});

test('plan editor: dates backwards from the due date respect waits and durations', () => {
  const dates = backSchedule(TYPE_PLANS.video, '2026-10-30', T);
  assert.equal(dates[4].due, '2026-10-30');
  TYPE_PLANS.video.forEach(([, , days, after], i) => {
    after.forEach((j) => assert.ok(dates[i].start > dates[j].due, `stage ${i} after ${j}`));
    assert.equal(dates[i].start, dayAdd(dates[i].due, -(days - 1)));
  });
  const fwd = planCalc([row({ days: 2 }), row({ days: 1, after: [0] })], 'fwd', T);
  assert.deepEqual(fwd.map((r) => [r.start, r.due]), [[T, '2026-10-13'], ['2026-10-14', '2026-10-14']]);
  const near = backSchedule(TYPE_PLANS.post, T, T);
  assert.ok(near.every((d) => d.start >= T), 'never before today');
});

test('plan editor: the same problems the database refuses, and warnings that do not stop a save', () => {
  const codes = (P, due) => planIssues(P, due).errs.map((e) => e.code);
  assert.deepEqual(codes([row(), row({ after: [1] })]), ['PLAN_ORDER']);
  assert.deepEqual(codes([row({ start: '2026-10-20', due: '2026-10-25' })], '2026-10-22'), ['PLAN_AFTER_DUE']);
  assert.deepEqual(codes([row({ start: '2026-10-20', due: '2026-10-19' })]), ['PLAN_START_AFTER_END']);
  assert.deepEqual(codes([row({ due: '2026-10-15' }), row({ start: '2026-10-14', due: '2026-10-16', after: [0] })]), ['PLAN_BEFORE_DEPENDENCY']);
  assert.deepEqual(codes([row({ due: '2026-10-15' }), row({ start: '2026-10-15', due: '2026-10-16', after: [0] })]), [], 'same day is allowed');
  assert.deepEqual(codes([row({ done: true, start: '2026-10-20', due: '2026-10-19' })]), [], 'finished stages are not checked again');
  assert.deepEqual(codes([row({ n: ' ' })]), ['PLAN_NAME']);
  assert.deepEqual(planIssues([row({ who: '' })]).warns.length, 2);
  for (const c of ['PLAN_ORDER', 'PLAN_AFTER_DUE', 'PLAN_START_AFTER_END', 'PLAN_BEFORE_DEPENDENCY', 'PLAN_NAME'])
    assert.match(migrations, new RegExp(`'${c}'`), c);
});

test('extension: what moves after a stage, as in the database rule run', () => {
  const S = [
    { name: 'النص', who: 'w', start_on: T, due_on: '2026-10-13', after_pos: [], done_at: 'x' },
    { name: 'التصوير', who: 'p', start_on: '2026-10-13', due_on: '2026-10-14', after_pos: [0], done_at: null },
    { name: 'المونتاج', who: 'p', start_on: '2026-10-15', due_on: '2026-10-16', after_pos: [1], done_at: null },
  ];
  const im = stepImpact(S, 1, '2026-10-16', '2026-10-18', '2026-10-17');
  assert.equal(im.shifts.length, 1);
  assert.deepEqual(im.shifts[0].to, ['2026-10-16', '2026-10-17']);
  assert.equal(im.overDue, false);
  assert.equal(im.overPub, false);
  assert.equal(stepImpact(S, 1, '2026-10-19', '2026-10-18').overDue, true);
  const tasks = [
    { id: 't1', what: 'فرز', assignee: 'f', due: '2026-10-13T14:00:00Z', start_on: null, after_ids: [], status: 'open' },
    { id: 't2', what: 'رفع', assignee: 'm', due: '2026-10-14T14:00:00Z', start_on: '2026-10-14', after_ids: ['t1'], status: 'open' },
  ];
  assert.deepEqual(taskImpact(tasks, 't1', '2026-10-15').shifts.map((s) => [s.id, s.days]), [['t2', 2]]);
  assert.deepEqual(taskImpact(tasks, 't1', '2026-10-13').shifts, []);
});

const ig = { id: 'a1', platform: 'instagram', label: 'الرسمي', handle: '@co', purpose: null, authorized_until: '2026-12-01T00:00:00Z', publishers: ['pub'], mode: 'auto', active: true, fixed: false };
const x = { ...ig, id: 'a2', platform: 'x', handle: '@co_x', authorized_until: '2026-10-01T00:00:00Z' };

test('approval binds to the version of each part: a change re-opens only that part', () => {
  const base = { type: 'post', text: { n: 1 }, variants: [{ platform: 'instagram', n: 1, body: 'نسخة' }, { platform: 'linkedin', n: 1, body: 'لا حساب' }],
    assets: [{ id: 'f1', name: 'ملصق.png', current_version: 3 }], channels: [ig], proposed_at: '2026-10-14T15:00:00Z' };
  const parts = partsOf(base);
  assert.deepEqual(parts.map((p) => p.key), ['text', 'v:instagram', 'a:f1', 'dest', 'date']);
  assert.equal(parts.find((p) => p.key === 'date').ver, 's:2026-10-14T15:00');
  const approvals = parts.map((p) => ({ part: p.key, ver: p.ver }));
  assert.equal(pendingParts(parts, approvals).length, 0);
  const edited = partsOf({ ...base, text: { n: 2 } });
  assert.deepEqual(pendingParts(edited, approvals).map((p) => p.key), ['text']);
  assert.equal(partState(edited[0], approvals), 'outdated');
  const renamed = partsOf({ ...base, channels: [{ ...ig, handle: '@co2' }] });
  assert.deepEqual(pendingParts(renamed, approvals).map((p) => p.key), ['dest']);
  const newFile = partsOf({ ...base, assets: [{ id: 'f1', name: 'ملصق.png', current_version: 4 }] });
  assert.deepEqual(pendingParts(newFile, approvals).map((p) => p.key), ['a:f1']);
  assert.equal(partsOf({ ...base, channels: [{ ...ig, platform: 'mail', handle: null }] }).find((p) => p.key === 'dest').label, 'جهة الإرسال');
  assert.ok(isWhole('press') && isWhole('email') && isWhole('announce') && !isWhole('post'));
});

test('who decides: leaders only, never on what they sent; urgent by the director or the assistant', () => {
  const w = { status: 'IN_REVIEW', review_cycle: 1, closed_at: null, priority: 'normal' };
  assert.equal(decideBlock(w, 'wri', 'dir', 'director'), '');
  assert.match(decideBlock(w, 'wri', 'wri', 'writer'), /لمدير الاتصال ومساعده/);
  assert.match(decideBlock(w, 'asst', 'asst', 'assistant'), /بنفسك/);
  assert.equal(decideBlock({ ...w, priority: 'urgent' }, 'wri', 'asst', 'assistant'), '', 'owner decision of 2026-10-12');
  assert.match(decideBlock({ ...w, status: 'APPROVED' }, 'wri', 'dir', 'director'), /ليس بانتظار قرار/);
  assert.ok(isApprover('admin') && isUrgentApprover('assistant') && !isUrgentApprover('publisher'));
  // The database says the same in its only two places that decide it.
  for (const fn of ['work_approver', 'work_urgent_approver'])
    assert.match(migrations, new RegExp(`function public\\.${fn}\\(\\)[^$]*\\$\\$ select public\\.media_acts\\(array\\['director','assistant'\\]\\) \\$\\$`), fn);
});

test('roles: the publisher does not create, only the publisher publishes, the producer assigns tasks', () => {
  assert.equal(canCreateWork('publisher'), false);
  assert.equal(canCreateWork('member'), true);
  assert.equal(canPublish('director'), false);
  assert.equal(canPublish('publisher'), true);
  assert.equal(canAssignTasksToOthers('producer'), true);
  assert.equal(canAssignTasksToOthers('writer'), false);
});

test('a restricted work is seen by leaders and the people on it only', () => {
  const w = { restricted: true, assignee: 'pro', created_by: 'dir', people: [] };
  const st = [{ who: 'wri' }];
  assert.equal(canSeeWork(w, st, 'mem', 'member'), false);
  assert.equal(canSeeWork(w, st, 'des', 'designer'), false);
  assert.equal(canSeeWork(w, st, 'wri', 'writer'), true);
  assert.equal(canSeeWork(w, st, 'asst', 'assistant'), true);
  assert.equal(canSeeWork({ ...w, restricted: false }, st, 'mem', 'member'), true);
  assert.equal(textEditable({ status: 'IN_REVIEW', closed_at: null }), false);
  assert.equal(textEditable({ status: 'APPROVED', closed_at: null }), true);
});

test('YouTube carries video only', () => {
  assert.equal(youtubeOk('post', ['instagram', 'youtube'], ['image']), false);
  assert.equal(youtubeOk('post', ['youtube'], ['video']), true);
  assert.equal(youtubeOk('video', ['youtube'], []), true);
  assert.equal(youtubeOk('design', ['instagram'], []), true);
});

test('publishing simulation: an expired account fails, the retry sends it alone', () => {
  const when = '2026-10-12T10:00:00Z';
  const first = publishOutcome(['a1', 'a2'], ['a1', 'a2'], [ig, x], when);
  assert.equal(first.status, 'PARTIAL');
  assert.deepEqual(failedChannels({ channels: ['a1', 'a2'], results: first.results }), ['a2']);
  const later = '2026-10-12T11:00:00Z';
  const retry = publishOutcome(['a1', 'a2'], ['a2'], [ig, { ...x, authorized_until: '2026-12-01T00:00:00Z' }], later, first.results);
  assert.equal(retry.status, 'PUBLISHED');
  assert.equal(retry.results.a1.at, when, 'the account that succeeded is not sent again');
  assert.equal(publishOutcome(['a2'], ['a2'], [{ ...x, active: false, authorized_until: null }], when).status, 'FAILED');
});

test('automatic assignment picks the least busy person in the role', () => {
  const load = [
    { email: 'k@x.sa', display_name: 'خالد', role: 'writer', open_stages: 3, open_tasks: 1 },
    { email: 'l@x.sa', display_name: 'لمى', role: 'writer', open_stages: 1, open_tasks: 1 },
    { email: 's@x.sa', display_name: 'سارة', role: 'designer', open_stages: 0, open_tasks: 0 },
  ];
  assert.equal(autoPick('writer', load).who, 'l@x.sa');
  assert.match(autoPick('writer', load).why, /الأقل حملاً/);
  assert.match(autoPick('designer', load).why, /الوحيد/);
  assert.equal(autoPick('publisher', load).who, '');
});

test('due dates read late, today, soon or delivered against the Riyadh day', () => {
  const w = (due, status = 'IN_PRODUCTION') => ({ due, status, closed_at: null, assignee: 'a' });
  assert.deepEqual(dueNote(w('2026-10-10'), T), { text: 'متأخر يومين', tone: 'late' });
  assert.equal(dueNote(w(T), T).text, 'يستحق اليوم');
  assert.equal(dueNote(w('2026-10-13'), T).text, 'يستحق غداً');
  assert.equal(dueNote(w('2026-10-20'), T).text, 'بعد 8 أيام');
  assert.equal(dueNote(w('2026-10-10', 'PUBLISHED'), T).tone, 'ok');
  assert.equal(dueNote({ ...w('2026-10-20'), assignee: null }, T).text, 'المطلوب 2026-10-20');
});

test('every error the database raises has Arabic wording', () => {
  const raised = new Set([...migrations.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]));
  // work_decide_block() returns its code, and work_decide raises it.
  for (const c of ['FORBIDDEN_DECIDE', 'NOT_IN_REVIEW', 'SELF_APPROVAL', 'URGENT_APPROVER']) {
    assert.match(migrations, new RegExp(`then '${c}'`), c);
    raised.add(c);
  }
  assert.ok(raised.size > 30);
  const generic = workErrorText('nothing known');
  for (const code of raised) assert.ok(WORK_ERROR_CODES.includes(code) || workErrorText(code) !== generic, code);
  assert.equal(workErrorText('ERROR: SELF_APPROVAL'), 'لا تعتمد ما أرسلته أو رفعته بنفسك.');
  assert.equal(workErrorText('ERROR: FORBIDDEN_DECIDE'), 'القرار لمدير الاتصال ومساعده.', 'the longest code wins');
  assert.match(workErrorText('something else'), /حاول مجدداً|أعد المحاولة/);
  assert.equal(workErrorText('STAGE_DENIED'), 'هذا الانتقال غير متاح لدورك أو لحالة الأصل الحالية.', 'library wording for library codes');
});

test('every work function the pages will call exists in a migration', () => {
  for (const fn of WORK_RPC) assert.match(migrations, new RegExp(`create (or replace )?function public\\.${fn}\\(`), fn);
  // ...and is callable by signed-in people.
  for (const fn of WORK_RPC) assert.match(migrations, new RegExp(`'${fn}\\(`), `${fn} granted`);
});
