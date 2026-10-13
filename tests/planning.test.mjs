// «التقويم», «المشاريع» and «الطلبات» (Step 5 of Reference_Build_Plan.md): the pure rules in
// src/lib/work/planning.ts, the calendar drag threshold, and what the Step 5 migration must hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  weekStart, monthCells, shiftAnchor, rangeTitle, calEntries, dayCount, dayLoad, grouped, lanesOf, bandsFor, spansFor,
  canRequestMove, moveOnlyDate, canCancelMove, moveBlock, dueMoveIssue, moveWarnings, projState, projProgress, projPeople,
  projNext, projRange, projWorks, projTasks, planWorks, inboxItems, inTabInbox, requestTitle, BUSY_DAY, ALL_ON, CAL_KIND, KEY_ORDER,
} from '../src/lib/work/planning.ts';
import { movedEnough, DRAG_SLOP } from '../src/lib/work/drag.ts';
import { WORK_RPC } from '../src/lib/work/rules.ts';

const T = '2026-10-12';
const NOW = '2026-10-12T06:00:00Z';
const W = (over = {}) => ({
  id: 'CH-1', no: 1, title: 'عمل', type: 'post', status: 'IN_PRODUCTION', priority: 'normal', restricted: false, source: 'plan', requester: null,
  brief: null, created_by: 'lead@x.sa', assignee: 'w@x.sa', people: [], due: '2026-10-16', event_at: null, place: null, channels: [],
  proposed_at: null, sched_at: null, pub_at: null, pub_mode: null, pending_sched: false, confirm_pending: false, move_from: null, move_by: null,
  review_cycle: null, results: {}, closed_at: null, closed_by: null, close_reason: null, created_at: '2026-10-10T06:00:00Z', updated_at: '2026-10-11T06:00:00Z', ...over,
});
const S = (pos, over = {}) => ({
  id: `s${pos}`, work_id: 'CH-1', pos, name: `مرحلة ${pos}`, role: 'writer', who: null, start_on: null, due_on: null, after_pos: pos ? [pos - 1] : [],
  days: 1, note: null, gate: false, gate_by: null, gate_at: null, started_at: null, done_at: null, done_by: null, ...over,
});
const A = (id, platform, over = {}) => ({ id, platform, label: id, handle: `@${id}`, purpose: null, authorized_until: '2026-12-01T00:00:00Z', publishers: ['pub@x.sa'], mode: 'auto', active: true, fixed: false, ...over });
const accounts = [A('ig', 'instagram'), A('x', 'x', { authorized_until: '2026-10-13T00:00:00Z' }), A('yt', 'youtube'), A('mail', 'mail', { handle: null, authorized_until: null, fixed: true })];
const base = { tasks: [], events: [], reminders: [], accounts, me: 'w@x.sa', today: T, nowIso: NOW };

test('days: the week starts on Sunday, a month view is whole weeks, a month moves by month', () => {
  assert.equal(weekStart('2026-10-12'), '2026-10-11'); // Monday 12 October: the week of Sunday 11
  assert.equal(weekStart('2026-10-11'), '2026-10-11');
  const cells = monthCells('2026-10-12');
  assert.equal(cells.length % 7, 0);
  assert.equal(cells[0], '2026-09-27');
  assert.ok(cells.includes('2026-10-31'));
  assert.equal(cells.at(-1), '2026-10-31');
  assert.equal(shiftAnchor('month', '2026-12-20', 1), '2027-01-01');
  assert.equal(shiftAnchor('month', '2026-01-05', -1), '2025-12-01');
  assert.equal(shiftAnchor('week', T, 1), '2026-10-19');
  assert.equal(shiftAnchor('agenda', T, -1), '2026-09-28');
  assert.match(rangeTitle('month', T), /أكتوبر 2026/);
  assert.match(rangeTitle('week', T), /11 أكتوبر إلى 17 أكتوبر 2026/);
});

test('calendar entries: each publishing state, a lane per account, mail in its own lane, Riyadh time', () => {
  const works = [
    { w: W({ id: 'CH-1', status: 'SCHEDULED', channels: ['ig', 'x'], sched_at: '2026-10-14T15:00:00Z' }), stages: [], projects: [] },
    { w: W({ id: 'CH-2', status: 'APPROVED', channels: ['ig'], proposed_at: '2026-10-15T09:00:00Z' }), stages: [], projects: [] },
    { w: W({ id: 'CH-3', status: 'IN_REVIEW', channels: ['ig'], move_from: '2026-10-16T09:00:00Z', proposed_at: '2026-10-17T09:00:00Z', move_by: 'w@x.sa' }), stages: [], projects: [] },
    { w: W({ id: 'CH-4', status: 'IN_PRODUCTION', channels: ['ig'], proposed_at: '2026-10-18T09:00:00Z' }), stages: [], projects: [] },
    { w: W({ id: 'CH-5', status: 'PUBLISHED', channels: ['ig'], pub_at: '2026-10-10T09:00:00Z' }), stages: [], projects: [] },
    { w: W({ id: 'CH-6', type: 'press', status: 'SCHEDULED', channels: ['mail'], sched_at: '2026-10-14T06:00:00Z' }), stages: [], projects: [] },
  ];
  const e = calEntries({ ...base, works });
  const k = (id) => e.filter((x) => x.w?.id === id && x.ch).map((x) => `${x.k}:${x.lane}:${x.date} ${x.time}`);
  assert.deepEqual(k('CH-1').sort(), ['pub:ig:2026-10-14 18:00', 'pub:x:2026-10-14 18:00']);
  assert.deepEqual(k('CH-2'), ['pubok:ig:2026-10-15 12:00']);
  assert.deepEqual(k('CH-3').sort(), ['held:ig:2026-10-16 12:00', 'move:ig:2026-10-17 12:00']);
  assert.deepEqual(k('CH-4'), ['plan:ig:2026-10-18 12:00']);
  assert.deepEqual(k('CH-5'), ['done:ig:2026-10-10 12:00']);
  assert.deepEqual(k('CH-6'), ['pub:mail:2026-10-14 09:00']);
  // Every kind has words and a class; the key under the calendar names each one.
  for (const kind of KEY_ORDER) assert.ok(CAL_KIND[kind][0] && CAL_KIND[kind][1], kind);
  assert.deepEqual(lanesOf(accounts, works.map((x) => x.w)).map((l) => l[0]), ['ig', 'x', 'yt', 'mail', 'ev', 'int']);
});

test('calendar entries: deliveries and stages of assigned, open work only; closed work, mine and project filters', () => {
  const works = [
    { w: W({ id: 'CH-1', due: '2026-10-11' }), stages: [S(0, { due_on: '2026-10-10', who: 'w@x.sa' }), S(1, { due_on: '2026-10-13', who: 'z@x.sa', done_at: '2026-10-12T01:00:00Z' })], projects: ['p1'] },
    { w: W({ id: 'CH-2', assignee: null, created_by: 'm@x.sa' }), stages: [S(0, { due_on: '2026-10-13' })], projects: [] },
    { w: W({ id: 'CH-3', closed_at: '2026-10-11T00:00:00Z' }), stages: [], projects: [] },
    { w: W({ id: 'CH-4', status: 'APPROVED', assignee: 'z@x.sa', created_by: 'z@x.sa' }), stages: [], projects: [] },
  ];
  const e = calEntries({ ...base, works });
  const due = e.filter((x) => x.k === 'due').map((x) => x.w.id);
  assert.deepEqual(due, ['CH-1']); // a request has no owner yet; delivered work has no delivery left
  assert.equal(e.find((x) => x.k === 'due').late, true);
  assert.deepEqual(e.filter((x) => x.k === 'stage').map((x) => `${x.w.id}:${x.si}:${x.late}`), ['CH-1:0:true']);
  assert.ok(!e.some((x) => x.w?.id === 'CH-3'));
  assert.equal(calEntries({ ...base, works, mine: true, me: 'q@x.sa' }).length, 0);
  assert.equal(calEntries({ ...base, works, project: 'p1' }).every((x) => x.w.id === 'CH-1'), true);
  assert.equal(calEntries({ ...base, works, filter: { ...ALL_ON, due: false, stages: false } }).length, 0);
});

test('calendar entries: tasks, events across days, private reminders', () => {
  const tasks = [{ id: 't1', what: 'تغطية', kind: 'other', assignee: 'w@x.sa', assigned_by: 'lead@x.sa', due: '2026-10-11T14:00:00Z', start_on: '2026-10-09', after_ids: [], status: 'open', note: null, project_id: 'p1', work_id: null, group_key: null, priority: 'normal' },
    { id: 't2', what: 'منجزة', kind: 'other', assignee: 'w@x.sa', assigned_by: 'w@x.sa', due: '2026-10-13T14:00:00Z', start_on: null, after_ids: [], status: 'done', note: null, project_id: null, work_id: null, group_key: null, priority: 'normal' }];
  const events = [{ id: 'e1', title: 'المعرض', start_at: '2026-10-13T06:00:00Z', end_at: '2026-10-15T14:00:00Z', place: null, project_id: 'p1', created_by: 'lead@x.sa' }];
  const reminders = [{ id: 'r1', at: '2026-10-12T07:00:00Z', body: 'اتصال' }];
  const e = calEntries({ ...base, works: [], tasks, events, reminders });
  assert.deepEqual(e.filter((x) => x.k === 'task').map((x) => `${x.t.id}:${x.date} ${x.time}:${x.late}`), ['t1:2026-10-11 17:00:true']);
  assert.deepEqual(e.filter((x) => x.k === 'evt').map((x) => `${x.date}:${x.time}`).sort(), ['2026-10-13:09:00', '2026-10-14:', '2026-10-15:']);
  assert.equal(new Set(e.filter((x) => x.k === 'evt').map((x) => x.key)).size, 3, 'each day of a long event has its own key');
  assert.deepEqual(e.filter((x) => x.k === 'rem').map((x) => `${x.date} ${x.time}`), ['2026-10-12 10:00']);
  const spans = spansFor({ works: [], tasks, me: 'w@x.sa', today: T, nowIso: NOW }, '2026-10-11', 7);
  assert.deepEqual(spans.map((s) => `${s.from}-${s.to}:${s.cut0}`), ['0-0:true']);
});

test('warnings that do not block: authorisation gaps, two works on one account within two hours, a busy day', () => {
  const works = [
    { w: W({ id: 'CH-1', status: 'SCHEDULED', channels: ['ig', 'x'], sched_at: '2026-10-14T15:00:00Z' }), stages: [], projects: [] },
    { w: W({ id: 'CH-2', status: 'APPROVED', channels: ['ig'], proposed_at: '2026-10-14T16:30:00Z' }), stages: [], projects: [] },
    { w: W({ id: 'CH-3', status: 'APPROVED', channels: ['ig'], proposed_at: '2026-10-14T18:00:00Z' }), stages: [], projects: [] },
  ];
  const e = calEntries({ ...base, works });
  const on = (id, ch) => e.find((x) => x.w?.id === id && x.ch === ch);
  assert.equal(on('CH-1', 'ig').near.id, 'CH-2');
  assert.equal(on('CH-2', 'ig').near?.id !== undefined, true);
  assert.equal(on('CH-1', 'x').near, undefined, 'only the same account counts');
  assert.equal(on('CH-3', 'ig').near?.id, 'CH-2', 'ninety minutes apart is near');
  assert.equal(on('CH-1', 'x').risk, true, 'X authorisation ends 13 October, before the time');
  assert.equal(on('CH-1', 'ig').risk, undefined);
  const busy = Array.from({ length: BUSY_DAY }, (_, i) => ({ w: W({ id: `CH-${10 + i}`, due: '2026-10-20' }), stages: [], projects: [] }));
  const b = calEntries({ ...base, works: busy });
  assert.equal(dayCount(b, '2026-10-20'), 7);
  assert.equal(dayLoad(b, '2026-10-20').n, 7);
  const warn = moveWarnings(W({ id: 'CH-9', channels: ['ig', 'x'] }), '2026-10-14T15:30:00Z', accounts, e, NOW);
  assert.equal(warn.length, 3, warn.join(' | ')); // X expires, and CH-1 and CH-2 are within two hours on Instagram
  assert.equal(grouped(e.filter((x) => x.w?.id === 'CH-1'))[0].chs.length, 2, 'one row per work and time, its accounts together');
});

test('who moves what: a publish date is a request, deliveries and stages are moved by leaders', () => {
  const sched = W({ status: 'SCHEDULED', sched_at: '2026-10-14T15:00:00Z' });
  assert.equal(canRequestMove(sched, 'w@x.sa', 'writer'), true, 'the owner asks');
  assert.equal(canRequestMove(sched, 'q@x.sa', 'writer'), false, 'someone else does not');
  assert.equal(canRequestMove(sched, 'p@x.sa', 'publisher'), true);
  assert.equal(canRequestMove(W({ status: 'APPROVED' }), 'w@x.sa', 'director'), false, 'approved without a date: nothing to move');
  const moving = W({ status: 'IN_REVIEW', move_from: '2026-10-14T15:00:00Z', move_by: 'w@x.sa', proposed_at: '2026-10-15T15:00:00Z', review_cycle: 2 });
  assert.equal(moveOnlyDate(moving, ['date']), true);
  assert.equal(moveOnlyDate(moving, ['date', 'text']), false);
  assert.equal(canCancelMove(moving, ['date'], 'w@x.sa', 'writer'), true, 'the one who asked withdraws');
  assert.equal(canCancelMove(moving, ['date'], 'q@x.sa', 'writer'), false);
  assert.equal(moveBlock(moving, 'w@x.sa', 'director'), 'أرسلتَ هذا العمل للمراجعة بنفسك، فلا تعتمده.', 'nobody approves the move they asked for');
  assert.equal(moveBlock(moving, 'lead@x.sa', 'assistant'), '');
  assert.equal(moveBlock(moving, 'q@x.sa', 'writer'), 'القرار لمدير الاتصال ومساعده.');
  const stages = [S(0, { due_on: '2026-10-14' }), S(1, { due_on: '2026-10-15', after_pos: [0] }), S(2, { due_on: '2026-10-10', done_at: '2026-10-10T00:00:00Z', after_pos: [] })];
  const w = W({ due: '2026-10-16' });
  assert.match(dueMoveIssue(w, stages, null, '2026-10-14'), /مرحلة 1/, 'a delivery never before an open stage ends');
  assert.equal(dueMoveIssue(w, stages, null, '2026-10-15'), '');
  assert.match(dueMoveIssue(w, stages, 1, '2026-10-17'), /بعد التسليم النهائي/);
  assert.match(dueMoveIssue(w, stages, 1, '2026-10-13'), /تنتظر/, 'a stage never before the open stage it waits for');
  assert.equal(dueMoveIssue(w, stages, 1, '2026-10-14'), '');
});

test('projects: state, progress, people, next date, range', () => {
  const P = { id: 'p1', name: 'م', type: 'campaign', start_on: '2026-10-05', end_on: '2026-10-20', owner: 'lead@x.sa', description: null };
  assert.equal(projState(P, T)[0], 'جارٍ');
  assert.equal(projState({ ...P, start_on: '2026-10-13' }, T)[0], 'قادم');
  assert.equal(projState({ ...P, end_on: '2026-10-11' }, T)[0], 'منتهٍ');
  const works = [
    { w: W({ id: 'CH-1', due: '2026-10-22' }), stages: [S(0, { who: 'a@x.sa', start_on: '2026-10-01', due_on: '2026-10-08', done_at: 'x' }), S(1, { who: 'b@x.sa', due_on: '2026-10-14' })], projects: ['p1'] },
    { w: W({ id: 'CH-2' }), stages: [S(0)], projects: [] },
  ];
  const tasks = [{ id: 't1', what: 'م', assignee: 'c@x.sa', status: 'done', project_id: 'p1', work_id: null, after_ids: [], due: '2026-10-12T10:00:00Z', start_on: null }];
  const ws = projWorks('p1', works);
  const ts = projTasks('p1', works, tasks);
  assert.deepEqual(ws.map((x) => x.w.id), ['CH-1']);
  assert.equal(projProgress(ws, ts), 67, 'one of two stages and one task done');
  assert.deepEqual(projPeople('lead@x.sa', ws, ts).sort(), ['a@x.sa', 'b@x.sa', 'c@x.sa', 'lead@x.sa', 'w@x.sa']);
  assert.deepEqual(projNext(ws, [], T), ['2026-10-14', '«مرحلة 1» في «عمل»']);
  assert.deepEqual(projRange(P, ws), ['2026-10-01', '2026-10-22']);
});

test('a works plan: each work and stage to the least busy in its role, counting what the plan gave out, dated back from its due', () => {
  const load = [
    { email: 'w1@x.sa', display_name: 'و١', role: 'writer', open_stages: 0, open_tasks: 0 },
    { email: 'w2@x.sa', display_name: 'و٢', role: 'writer', open_stages: 1, open_tasks: 0 },
    { email: 'd1@x.sa', display_name: 'د', role: 'designer', open_stages: 0, open_tasks: 0 },
    { email: 'as@x.sa', display_name: 'م', role: 'assistant', open_stages: 0, open_tasks: 0 },
  ];
  const { works, issues } = planWorks([{ title: 'منشور أول', type: 'post', due: '2026-10-20' }, { title: 'بيان', type: 'press', due: '2026-10-22' }, { title: '', type: 'post', due: '' }], load, T, accounts);
  assert.deepEqual(issues, []);
  assert.equal(works.length, 2, 'rows without a title are left out');
  const [post, press] = works;
  assert.equal(post.assignee, 'w1@x.sa');
  assert.deepEqual(post.channels, ['ig', 'x'], 'a post goes on the active accounts, never YouTube or the mailbox');
  assert.deepEqual(press.channels, []);
  assert.deepEqual(post.stages.map((s) => s.n), ['كتابة النص', 'نسخ المنصات', 'المرئيات', 'التدقيق']);
  assert.equal(post.stages.at(-1).due, '2026-10-20');
  assert.ok(post.stages.every((s) => s.due <= '2026-10-20' && s.start >= T && s.start <= s.due));
  // The plan spreads the writers: w1 took the post and its first stage, so w2 gets the next.
  const writers = [post.assignee, ...post.stages.filter((s) => s.role === 'writer').map((s) => s.who), press.assignee];
  assert.ok(writers.includes('w2@x.sa'), writers.join(','));
  assert.deepEqual(post.stages[1].after, [0]);
  const bad = planWorks([{ title: 'قديم', type: 'post', due: '2026-10-01' }], load, T, accounts.filter((a) => a.platform === 'youtube'));
  assert.equal(bad.issues.length, 2, bad.issues.join(' | '));
});

test('requests: one inbox, who decides, who sent it, and the tabs', () => {
  const q = (over) => ({ id: 'q1', kind: 'extension', status: 'pending', requested_by: 'w@x.sa', requested_at: '2026-10-12T05:00:00Z', from_at: null, to_at: '2026-10-15T09:00:00Z', reason: 'سبب',
    decided_by: null, decided_at: null, decision_note: null, extend_work: false, stage_id: 's1', stage_name: 'النص', work_id: 'CH-1', work_title: 'عمل', work_due: '2026-10-16',
    task_id: null, task_what: null, task_assigned_by: null, folder_id: null, folder_name: null, can_decide: false, ...over });
  const requests = [q({}), q({ id: 'q2', kind: 'access', stage_id: null, folder_id: 'f1', folder_name: 'العقود', requested_by: 'z@x.sa', can_decide: true }), q({ id: 'q3', status: 'approved', decided_by: 'lead@x.sa' })];
  const works = [
    { w: W({ id: 'CH-2', assignee: null, created_by: 'm@x.sa' }), stages: [], projects: [] },
    { w: W({ id: 'CH-3', status: 'IN_REVIEW', move_from: '2026-10-14T15:00:00Z', move_by: 'w@x.sa', proposed_at: '2026-10-15T15:00:00Z', review_cycle: 2 }), stages: [], projects: [], pendingKeys: ['date'] },
    { w: W({ id: 'CH-4', status: 'SCHEDULED', confirm_pending: true, sched_at: '2026-10-12T05:00:00Z' }), stages: [], projects: [] },
  ];
  const held = [{ id: 'h1', thread_id: 't1', author: 'w@x.sa', created_at: '2026-10-12T04:00:00Z', subject: 'رد' }];
  const asLead = inboxItems({ requests, works, held, me: 'lead@x.sa', role: 'director' });
  const mine = asLead.filter((x) => inTabInbox(x, 'mine')).map((x) => x.key).sort();
  assert.deepEqual(mine, ['h:h1', 'm:CH-3', 'q:q2', 'w:CH-2']);
  // can_decide comes from the database for the caller: the writer decides none of these.
  const asWriter = inboxItems({ requests: requests.map((r) => ({ ...r, can_decide: false })), works, held, me: 'w@x.sa', role: 'writer' });
  assert.deepEqual(asWriter.filter((x) => inTabInbox(x, 'mine')).map((x) => x.key), []);
  assert.deepEqual(asWriter.filter((x) => inTabInbox(x, 'sent')).map((x) => x.key).sort(), ['h:h1', 'm:CH-3', 'q:q1', 'q:q3']);
  assert.deepEqual(asWriter.filter((x) => inTabInbox(x, 'done')).map((x) => x.key), ['q:q3']);
  const asPub = inboxItems({ requests: requests.map((r) => ({ ...r, can_decide: false })), works, held, me: 'p@x.sa', role: 'publisher' });
  assert.deepEqual(asPub.filter((x) => inTabInbox(x, 'mine')).map((x) => x.key), ['c:CH-4']);
  assert.match(requestTitle(requests[0]), /^طلب تمديد «النص» في «عمل» إلى الخميس 15 أكتوبر$/);
  assert.equal(requestTitle(requests[1]), 'طلب وصول إلى مجلد «العقود»');
});

test('bands and the calendar drag threshold', () => {
  const P = [{ id: 'p1', name: 'م', type: 'campaign', start_on: '2026-10-05', end_on: '2026-10-13', owner: 'x', description: null }];
  const b = bandsFor(P, '2026-10-11', 7);
  assert.deepEqual([b[0].from, b[0].to, b[0].cut0, b[0].cut1], [0, 2, true, false]);
  assert.equal(bandsFor(P, '2026-10-18', 7).length, 0);
  assert.equal(movedEnough(DRAG_SLOP - 1, 0), false, 'a press that barely moves stays a click');
  assert.equal(movedEnough(4, 5), true);
});

test('the Step 5 migration: parts readable only through the visible-only functions, one-step projects, request visibility as the policy', () => {
  const sql = readFileSync('supabase/migrations/20261013120000_work_cycle_planning.sql', 'utf8');
  for (const f of ['work_parts(text)', 'work_pending(text)', 'work_stage_state(uuid)']) assert.ok(sql.includes(`'${f}'`), f);
  assert.match(sql, /foreach f in array array\['work_parts\(text\)', 'work_pending\(text\)', 'work_stage_state\(uuid\)'\] loop\s+execute format\('revoke all on function public\.%s from public, anon, authenticated'/);
  assert.match(sql, /work_view_parts[\s\S]*where public\.work_can_see\(p_work\)/);
  assert.match(sql, /project_create[\s\S]*public\.work_create\(/);
  assert.match(sql, /STAGE_BEFORE_WAIT/);
  assert.ok(!WORK_RPC.includes('work_parts') && !WORK_RPC.includes('work_pending'), 'the pages never call the internal ones');
  // The pages read the parts only through the visible-only functions.
  const data = readFileSync('src/components/work/data.tsx', 'utf8');
  assert.ok(!/rpc\('work_(parts|pending)'/.test(data));
});
