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

// ---------------------------------------------------------------------------
// Step 3: «العمل», the work page and the plan editor
// ---------------------------------------------------------------------------
import {
  planChain, planParallel, planCopy, typeTemplate, rowsFromTemplate, templateFromPlan, planPayload, openSteps, curStage,
  stageLine, tabsFor, inTab, workOrder, attentionCounts, workActions, actionOwners, isOverdue, isSoon, lateStages,
  fdate, sdate, riyadhStamp, riyadhInstant,
} from '../src/lib/work/rules.ts';

const W = (over = {}) => ({
  status: 'IN_PRODUCTION', closed_at: null, assignee: 'w@x.sa', created_by: 'w@x.sa', people: [], due: '2026-10-20',
  priority: 'normal', type: 'post', restricted: false, channels: [], review_cycle: null, sched_at: null, pub_at: null,
  proposed_at: null, confirm_pending: false, ...over,
});
const S = (over = {}) => ({ name: 'مرحلة', who: null, due_on: null, ...stage(over), ...over });
const nameOf = (e) => ({ 'w@x.sa': 'خالد', 'd@x.sa': 'سارة', 'dir@x.sa': 'محمد' })[e] ?? e;

test('plan editor: a moved stage keeps the order of what it waits for, and waits only for stages above it', () => {
  const P = [row({ n: 'أ' }), row({ n: 'ب', after: [0] }), row({ n: 'ج', after: [0] }), row({ n: 'د', after: [1, 2] })];
  // Moving «د» to the top: it can no longer wait for anything.
  const up = planMove(P, 3, 0);
  assert.deepEqual(up.plan.map((r) => r.n), ['د', 'أ', 'ب', 'ج']);
  assert.deepEqual(up.plan.map((r) => r.after), [[], [], [1], [1]]);
  assert.equal(up.dropped.length, 2);
  // Moving «ب» below «ج»: its wait for «أ» follows «أ», and «د» still waits for both.
  const down = planMove(P, 1, 2);
  assert.deepEqual(down.plan.map((r) => r.n), ['أ', 'ج', 'ب', 'د']);
  assert.deepEqual(down.plan.map((r) => r.after), [[], [0], [0], [1, 2]]);
  assert.deepEqual(down.dropped, []);
  // Every wait points up after any move.
  for (let f = 0; f < P.length; f++) for (let t = 0; t < P.length; t++)
    planMove(P, f, t).plan.forEach((r, i) => r.after.forEach((j) => assert.ok(j < i, `${f}->${t}`)));
  assert.equal(planMove(P, 1, 9).plan, P, 'out of range does nothing');
});

test('plan editor: chain, parallel and copy; finished stages are left as they are', () => {
  const P = [row({ n: 'أ', done: true }), row({ n: 'ب' }), row({ n: 'ج', after: [0] })];
  assert.deepEqual(planChain(P).map((r) => r.after), [[], [0], [1]]);
  assert.deepEqual(planParallel(P).map((r) => r.after), [[], [], []]);
  const fin = [row({ n: 'أ', done: true, after: [] }), row({ n: 'ب', done: true, after: [0] })];
  assert.deepEqual(planParallel(fin).map((r) => r.after), [[], [0]]);
  const c = planCopy([row({ n: 'أ' }), row({ n: 'ب', after: [0], who: 'w@x.sa', start: T, due: T, id: 'x' }), row({ n: 'ج', after: [1] })], 1);
  assert.deepEqual(c.map((r) => r.n), ['أ', 'ب', 'ب (نسخة)', 'ج']);
  assert.deepEqual(c.map((r) => r.after), [[], [0], [0], [1]]);
  assert.equal(c[2].who, 'w@x.sa', 'the same person and dates');
  assert.equal(c[2].due, T);
  assert.equal(c[2].id, undefined, 'a copy is a new stage');
});

test('templates round-trip, and the plan sent to the database keeps ids, people, waits and durations', () => {
  const rows = rowsFromTemplate(typeTemplate('video'));
  assert.deepEqual(rows.map((r) => [r.n, r.role, r.days, r.after]), TYPE_PLANS.video.map(([n, role, days, after]) => [n, role, days, after]));
  const back = templateFromPlan(rows.map((r, i) => (i === 1 ? { ...r, gate: true, note: ' ملاحظة ' } : r)));
  assert.equal(back[1].gate, true);
  assert.equal(back[1].note, 'ملاحظة');
  const p = planPayload([row({ id: 's1', n: ' أ ', days: 0, start: '2026-10-12', due: '2026-10-14' }), row({ who: '', after: [0] })]);
  assert.deepEqual(p[0], { id: 's1', n: 'أ', role: '', who: 'a@x.sa', start: '2026-10-12', due: '2026-10-14', after: [], days: 3, gate: false, note: '' });
  assert.equal(p[1].who, null);
  assert.equal(p[1].id, null);
});

test('stages: the open ones, the current one, the late ones, and the line the list shows', () => {
  const st = [S({ name: 'النص', who: 'w@x.sa', done_at: 'x', due_on: '2026-10-10' }), S({ name: 'المرئيات', who: 'd@x.sa', after_pos: [0], due_on: '2026-10-11' }), S({ name: 'التدقيق', after_pos: [1] })];
  assert.deepEqual(openSteps(st), [1]);
  assert.equal(curStage(st), 1);
  assert.equal(lateStages(W(), st, T).length, 1, 'a finished stage is never late');
  assert.deepEqual(stageLine(W(), st, T, nameOf), { text: 'المرئيات (سارة) · متأخرة', tone: 'late' });
  assert.equal(stageLine(W({ assignee: null }), st, T, nameOf).text, 'بانتظار الإسناد');
  assert.equal(stageLine(W({ closed_at: 'x' }), st, T, nameOf).text, 'مغلق');
  assert.equal(stageLine(W({ status: 'IN_REVIEW' }), st, T, nameOf, { pending: 2 }).text, 'بانتظار اعتماد جزأين');
  assert.equal(stageLine(W({ status: 'IN_REVIEW', type: 'press' }), st, T, nameOf).text, 'بانتظار اعتماد الحزمة كاملة');
  assert.equal(stageLine(W({ status: 'DRAFT' }), st, T, nameOf).text, 'لم يبدأ الإنتاج · مرحلة متأخرة');
  const done = st.map((s) => ({ ...s, done_at: 'x' }));
  assert.equal(stageLine(W(), done, T, nameOf).text, 'المراحل مكتملة · جاهز للإرسال');
});

test('«العمل»: tabs per role, what each tab holds, the order, and the attention counts', () => {
  assert.deepEqual(tabsFor('director').map((t) => t[0]), ['team', 'all', 'mine', 'requests', 'closed']);
  assert.deepEqual(tabsFor('writer').map((t) => t[1]), ['الكل', 'مهامي', 'المغلقة']);
  assert.deepEqual(tabsFor('member').map((t) => t[1]), ['الكل', 'طلباتي', 'المغلقة']);
  const st = [{ who: 'd@x.sa' }];
  assert.equal(inTab(W(), st, 'mine', 'd@x.sa', 'designer'), true, 'a stage makes it mine');
  assert.equal(inTab(W({ created_by: 'm@x.sa', assignee: null }), [], 'mine', 'm@x.sa', 'member'), true, 'a member sees their requests');
  assert.equal(inTab(W({ closed_at: 'x' }), st, 'all', 'd@x.sa', 'designer'), false);
  assert.equal(inTab(W({ closed_at: 'x' }), st, 'closed', 'd@x.sa', 'designer'), true);
  assert.equal(inTab(W({ assignee: null }), [], 'requests', 'dir@x.sa', 'director'), true);
  const list = [
    W({ id: 'closed', closed_at: '2026-10-11T10:00Z' }), W({ id: 'done', status: 'PUBLISHED' }), W({ id: 'req', assignee: null, due: '2026-10-13' }),
    W({ id: 'later', due: '2026-10-25' }), W({ id: 'soon', due: '2026-10-14' }), W({ id: 'urgent', due: '2026-10-30', priority: 'urgent' }),
  ];
  assert.deepEqual([...list].sort(workOrder).map((w) => w.id), ['urgent', 'soon', 'later', 'req', 'done', 'closed']);
  assert.equal(isOverdue(W({ due: '2026-10-11' }), T), true);
  assert.equal(isOverdue(W({ due: '2026-10-11', assignee: null }), T), false, 'a request is not late');
  assert.equal(isSoon(W({ due: '2026-10-14' }), T), true);
  assert.equal(isSoon(W({ due: '2026-10-15' }), T), false);
  const counts = attentionCounts([
    { w: W({ due: '2026-10-11' }), stages: [] }, { w: W({ status: 'IN_REVIEW', priority: 'urgent' }), stages: [] },
    { w: W(), stages: [{ done_at: null, due_on: '2026-10-01' }] }, { w: W({ assignee: null }), stages: [] },
    { w: W({ due: '2026-10-01', closed_at: 'x' }), stages: [] },
  ], T);
  assert.deepEqual(counts, { late: 1, soon: 0, stages: 1, review: 1, urgent: 1, requests: 1 });
});

test('the work page offers each role only what the database would let it do', () => {
  const base = { stages: [S({ name: 'النص', who: 'w@x.sa' }), S({ name: 'المرئيات', who: 'd@x.sa', after_pos: [0] })], hasText: false, pending: 0, total: 0, decideBlock: '', hasChat: false, nameOf };
  const ids = (x) => workActions({ ...base, ...x }).map((a) => a.id);
  // The writer on the first stage: finish it (the suggested next step), write the text, add media, send for review.
  const writer = workActions({ ...base, w: W(), me: 'w@x.sa', role: 'writer' });
  assert.deepEqual(writer.map((a) => a.id), ['stepdone:0', 'submit', 'plan', 'edittext', 'lib', 'chat']);
  assert.equal(writer[0].next, true);
  assert.match(writer.find((a) => a.id === 'submit').hint, /وتبقى مرحلتان/);
  // The designer waits for the text and is told for whom.
  const designer = workActions({ ...base, w: W(), me: 'd@x.sa', role: 'designer' });
  assert.deepEqual(designer.map((a) => a.id), ['wait:1', 'lib', 'chat']);
  assert.match(designer[0].hint, /تبدأ بعد «النص» \(خالد\)/);
  assert.equal(designer[0].disabled, true);
  // A member who is not on the work: nothing, and the note says who holds what.
  assert.deepEqual(ids({ w: W(), me: 'm@x.sa', role: 'member' }), []);
  assert.match(actionOwners(W(), 'm@x.sa', 'member', nameOf), /الإنتاج والإرسال للمراجعة: خالد/);
  // A request: leaders assign it; its author may edit it.
  assert.deepEqual(ids({ w: W({ assignee: null, created_by: 'm@x.sa' }), me: 'dir@x.sa', role: 'director' }), ['assign', 'details', 'chat', 'restrict', 'close']);
  assert.deepEqual(ids({ w: W({ assignee: null, created_by: 'm@x.sa' }), me: 'm@x.sa', role: 'member' }), ['details', 'chat']);
  // In review: the leader is told why they may not decide.
  const rev = workActions({ ...base, w: W({ status: 'IN_REVIEW' }), me: 'dir@x.sa', role: 'director', decideBlock: 'أرسلتَ هذا العمل للمراجعة بنفسك، فلا تعتمده.' });
  assert.match(rev.find((a) => a.id === 'review').hint, /بنفسك/);
  // Closed: only leaders reopen.
  assert.deepEqual(ids({ w: W({ closed_at: 'x' }), me: 'dir@x.sa', role: 'assistant' }), ['reopen']);
  assert.deepEqual(ids({ w: W({ closed_at: 'x' }), me: 'w@x.sa', role: 'writer' }), []);
  // The publisher sees publishing as coming from «الموافقات والنشر».
  assert.deepEqual(ids({ w: W({ status: 'APPROVED' }), me: 'p@x.sa', role: 'publisher' }), ['schedule', 'pubnow']);
  // A text after approval re-opens review; the hint says so.
  const after = workActions({ ...base, hasText: true, w: W({ status: 'APPROVED', type: 'press' }), me: 'w@x.sa', role: 'writer' });
  assert.match(after.find((a) => a.id === 'edittext').hint, /الحزمة كاملة/);
});

test('dates read in Arabic and in Riyadh time', () => {
  assert.equal(fdate('2026-10-11'), 'الأحد 11 أكتوبر');
  assert.equal(sdate('2026-10-05'), '5 أكتوبر');
  assert.equal(riyadhStamp('2026-10-11T21:30:00Z'), '2026-10-12 00:30');
  assert.equal(riyadhInstant('2026-10-12T00:30'), '2026-10-11T21:30:00.000Z');
});

import { dropIndex } from '../src/lib/work/drag.ts';
import { planWithTemplate } from '../src/lib/work/rules.ts';

test('drag: where a release lands, above or below the middle of a row, and past the ends', () => {
  const rects = [{ top: 0, bottom: 40 }, { top: 46, bottom: 86 }, { top: 92, bottom: 132 }];
  assert.deepEqual(dropIndex(rects, 0, 120), { to: 2, over: 2, before: false }, 'first row to the end');
  assert.deepEqual(dropIndex(rects, 0, 100), { to: 1, over: 2, before: true }, 'first row above the last');
  assert.deepEqual(dropIndex(rects, 2, 5), { to: 0, over: 0, before: true }, 'last row to the top');
  assert.equal(dropIndex(rects, 1, 60).to, 1, 'over itself: no move');
  assert.equal(dropIndex(rects, 1, -50).to, 0, 'above the list: first place');
  assert.equal(dropIndex(rects, 0, 500).to, 2, 'below the list: last place');
  assert.deepEqual(dropIndex(rects, 2, 43), { to: 1, over: 0, before: false }, 'in the gap between two rows: after the upper one');
  assert.equal(dropIndex([], 0, 10), null, 'no rows');
});

test('a template keeps finished stages first and its own stages wait after them', () => {
  const P = [row({ n: 'تمّت', done: true, after: [] }), row({ n: 'قديمة', after: [0] })];
  const next = planWithTemplate(P, typeTemplate('press'));
  assert.deepEqual(next.map((r) => r.n), ['تمّت', 'جمع المعلومات', 'كتابة البيان', 'التدقيق']);
  assert.deepEqual(next.map((r) => r.after), [[], [0], [1], [2]]);
});

test('every database function the work pages call exists in a migration and is granted', () => {
  const all = readdirSync('supabase/migrations').map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n');
  const src = readdirSync('src/components/work').map((f) => readFileSync(`src/components/work/${f}`, 'utf8')).join('\n')
    + readFileSync('src/components/mail/mail-page.tsx', 'utf8');
  const called = new Set([...src.matchAll(/(?:\.rpc|\b(?:call|act)(?:<[^>]*>)?)\(\s*'([a-z_]+)'/g)].map((m) => m[1]));
  assert.ok(called.size >= 20, `found ${called.size}`);
  for (const fn of called) {
    assert.match(all, new RegExp(`create (or replace )?function public\\.${fn}\\(`), fn);
    assert.match(all, new RegExp(`grant execute on function public\\.${fn}\\(|'${fn}\\(`), `${fn} granted`);
  }
});

// ---------------------------------------------------------------------------
// Step 4: «الموافقات والنشر», the review screen, «حسابات المنصات», notifications
// ---------------------------------------------------------------------------
import { diffWords, partLine, accountState, atRisk, accountName, noticeHref } from '../src/lib/work/rules.ts';

test('review: the word difference keeps, adds and removes words in order', () => {
  const d = diffWords('أ ب ج', 'أ د ج');
  assert.deepEqual(d, [['s', 'أ'], ['d', 'ب'], ['a', 'د'], ['s', 'ج']]);
  assert.deepEqual(diffWords('', 'نص جديد'), [['a', 'نص'], ['a', 'جديد']]);
  assert.deepEqual(diffWords('نفس النص', 'نفس  النص'), [['s', 'نفس'], ['s', 'النص']], 'spacing is not a change');
  // Kept words read in the new order, so the new text is always recoverable from the result.
  const r = diffWords('a b c d e', 'a x c e f');
  assert.equal(r.filter(([t]) => t !== 'd').map(([, w]) => w).join(' '), 'a x c e f');
  assert.equal(r.filter(([t]) => t !== 'a').map(([, w]) => w).join(' '), 'a b c d e');
});

test('review: the line under a part says approved, changed since, or sent back', () => {
  const p = { key: 'text', ver: 't3' };
  const nm = (e) => (e === 'dir@x.sa' ? 'محمد' : e);
  assert.match(partLine(p, [{ part: 'text', ver: 't3', approved_by: 'dir@x.sa', approved_at: '2026-10-11T08:00:00Z' }], [], nm), /^معتمد · محمد 11 أكتوبر$/);
  assert.match(partLine(p, [{ part: 'text', ver: 't2', approved_by: 'dir@x.sa', approved_at: '2026-10-11T08:00:00Z' }], [], nm), /^تغيّر بعد اعتماده/);
  assert.equal(partLine(p, [], [{ part: 'text', ver: 't3' }], nm), 'طُلب تعديله ولم يتغيّر بعد');
  assert.equal(partLine(p, [], [{ part: 'text', ver: 't2' }], nm), 'عُدّل بعد طلب التعديل');
  assert.equal(partLine(p, [], [], nm), 'لم يُعتمد بعد');
});

test('accounts: their state now, and the scheduled works their authorisation will not cover', () => {
  const now = '2026-10-12T09:00:00Z';
  const acc = (over) => ({ id: 'a', platform: 'x', label: 'الرسمي', handle: '@x', purpose: null, authorized_until: '2026-12-01T00:00:00Z', publishers: [], mode: 'auto', active: true, fixed: false, ...over });
  assert.deepEqual(accountState(acc({ active: false }), now), ['موقوف', '']);
  assert.equal(accountState(acc({ authorized_until: '2026-10-12T08:00:00Z' }), now)[1], 'danger');
  assert.equal(accountState(acc({ authorized_until: '2026-10-14T00:00:00Z' }), now)[1], 'warn');
  assert.equal(accountState(acc({}), now)[1], 'approved');
  assert.equal(accountState(acc({ platform: 'mail', authorized_until: null }), now)[0], 'متصل');
  const w = { status: 'SCHEDULED', sched_at: '2026-10-20T09:00:00Z', channels: ['a', 'b', 'm'] };
  const list = [acc({ id: 'a', authorized_until: '2026-10-15T00:00:00Z' }), acc({ id: 'b' }), acc({ id: 'm', platform: 'mail', authorized_until: null })];
  assert.deepEqual(atRisk(w, list).map((a) => a.id), ['a']);
  assert.deepEqual(atRisk({ ...w, status: 'APPROVED' }, list), [], 'only scheduled work is at risk');
  assert.deepEqual(atRisk(w, [acc({ id: 'b', active: false })]).map((a) => a.id), ['b'], 'a stopped account fails');
  assert.equal(accountName(list[0]), 'X · الرسمي');
  assert.equal(accountName(list[2]), 'البريد');
  assert.equal(accountName(undefined), 'حساب محذوف');
});

test('notifications open where the work is', () => {
  assert.equal(noticeHref({ page: 'item', id: 'CH-4' }), '/work/CH-4');
  assert.equal(noticeHref({ page: 'review', id: 'CH-4' }), '/approvals/CH-4');
  assert.equal(noticeHref({ page: 'approvals', tab: 'publish' }), '/approvals?tab=publish');
  assert.equal(noticeHref({ page: 'accounts' }), '/channels');
  assert.equal(noticeHref({ page: 'requests' }), '/requests');
  assert.equal(noticeHref({ page: 'project', id: 'p-1' }), '/projects/p-1');
  assert.equal(noticeHref({ page: 'calendar' }), '/calendar');
  assert.equal(noticeHref(null), '/work');
  // Every page the database writes into a notification has a place to go.
  const pages = new Set([...migrations.matchAll(/'page',\s*'([a-z]+)'/g)].map((m) => m[1]));
  for (const p of pages) assert.ok(['item', 'review', 'approvals', 'requests', 'accounts', 'tasks', 'calendar', 'project'].includes(p), `known page ${p}`);
});

test('the work page: the leader opens the review, the publisher schedules, confirms or retries', () => {
  const base = { stages: [], hasText: true, pending: 2, total: 4, decideBlock: '', hasChat: true, nameOf };
  const rev = workActions({ ...base, w: W({ status: 'IN_REVIEW' }), me: 'dir@x.sa', role: 'director' }).find((a) => a.id === 'review');
  assert.deepEqual([rev.label, rev.next, rev.disabled], ['مراجعة واعتماد', true, false]);
  const blocked = workActions({ ...base, decideBlock: 'أرسلتَ هذا العمل للمراجعة بنفسك، فلا تعتمده.', w: W({ status: 'IN_REVIEW' }), me: 'dir@x.sa', role: 'director' }).find((a) => a.id === 'review');
  assert.deepEqual([blocked.label, blocked.next], ['عرض المراجعة', false]);
  const pub = (over, mail = false) => workActions({ ...base, mail, w: W(over), me: 'p@x.sa', role: 'publisher' }).map((a) => a.id);
  assert.deepEqual(pub({ status: 'SCHEDULED' }), ['schedule', 'unsched']);
  assert.deepEqual(pub({ status: 'SCHEDULED', confirm_pending: true }), ['confirmpub', 'declinepub']);
  assert.deepEqual(pub({ status: 'PARTIAL' }), ['retry']);
  assert.deepEqual(pub({ status: 'PUBLISHED' }), []);
  assert.equal(workActions({ ...base, mail: true, w: W({ status: 'APPROVED', type: 'press' }), me: 'p@x.sa', role: 'publisher' }).find((a) => a.id === 'pubnow').label, 'إرسال الآن من البريد');
  // Nobody else gets publishing actions.
  for (const role of ['director', 'assistant', 'writer', 'member'])
    assert.ok(!workActions({ ...base, w: W({ status: 'APPROVED' }), me: 'dir@x.sa', role }).some((a) => ['schedule', 'pubnow', 'retry'].includes(a.id)), role);
});

test('the work pages, their styles and the drag engine have no emoji', () => {
  const files = [...readdirSync('src/components/work').map((f) => `src/components/work/${f}`), 'src/app/work.css', 'src/lib/work/drag.ts', 'src/components/notices.tsx', 'tests/work.test.mjs', 'supabase/tests/approval_rules.sql', 'supabase/migrations/20261012180000_approval_uploader.sql'];
  for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8'), /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, f);
});

import { PostgrestClient } from '@supabase/postgrest-js';
import { countOf, WORKS, STAGES, PARTS, PROJECTS, TASKS, ACTIVE } from '../src/lib/work/rules.ts';

test('the work page asks for its linked mail with a JSON filter, which jsonb accepts (sim-20261015-03: 400 on every work page)', () => {
  const q = (v) => decodeURIComponent(new PostgrestClient('http://x').from('mail_threads').select('id').contains('links', v).url.search);
  // An array is written as a Postgres array literal, which a jsonb column refuses.
  assert.match(q([{ type: 'work', id: 'CH-1' }]), /links=cs\.\{\[object\+Object\]\}/);
  assert.match(q(JSON.stringify([{ type: 'work', id: 'CH-1' }])), /links=cs\.\[\{"type":"work","id":"CH-1"\}\]/);
  const src = readFileSync('src/components/work/data.tsx', 'utf8');
  assert.doesNotMatch(src, /\.contains\('links',\s*\[/);
  assert.match(src, /\.contains\('links',\s*JSON\.stringify\(\[\{ type: 'work', id \}\]\)\)/);
});

test('counts read as Arabic: one and two in words, 3 to 10 plural, 11 and up singular', () => {
  assert.equal(countOf(1, WORKS), 'عمل واحد');
  assert.equal(countOf(2, WORKS), 'عملان');
  assert.equal(countOf(3, WORKS), '3 أعمال');
  assert.equal(countOf(10, STAGES), '10 مراحل');
  assert.equal(countOf(11, WORKS), '11 عملاً');
  assert.equal(countOf(25, STAGES), '25 مرحلة');
  assert.equal(countOf(0, TASKS), '0 مهام');
  assert.equal(countOf(103, PARTS), '103 أجزاء');
  assert.equal(countOf(1, PROJECTS), 'مشروع واحد');
  assert.equal(countOf(1, ACTIVE), 'عمل نشط');
  assert.equal(countOf(4, ACTIVE), '4 نشطة');
  // No interface line writes a bare number before these plurals any more.
  const files = ['src/components/home.tsx', ...readdirSync('src/components/work').map((f) => `src/components/work/${f}`)];
  for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8'), /\}\s?(أعمال|مراحل|أجزاء|مشاريع|نشطة|مهام)(?![\u0600-\u06FF])/u, f);
});
