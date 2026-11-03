// The idle-time broker (src/idle.ts, src/copy-queue.ts; D12, Desktop_Power_Ideas.md P-30 and P-08): when background
// work may run, what to do with each job, the queue of wanted copies, and the bridge's checks of what a page sends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITIES, activityOf, mediaRefOf, QUEUE_LIMITS, queueAskOf } from '../src/bridge.ts';
import { CopyQueue, MAX_WANTED } from '../src/copy-queue.ts';
import { HOLDS, holdOf, isWork, MAX_WIDTH, QUIET_MS, quietAt, STOP_AFTER_MS, stepsFor } from '../src/idle.ts';
import { copiesLine, trayTooltip } from '../src/words.ts';

const free = { power: 'ac', speedLimit: 100, busy: null, activities: [], asked: false, lastInput: 0, now: 1_000_000 };
const token = 'A'.repeat(43);
const asset = '0a1b2c3d-0000-4000-8000-00000000abcd';

test('background work runs only on mains power, at full speed, with nothing exporting, playing or asked, and nobody working', () => {
  assert.equal(holdOf(free), null);
  assert.equal(holdOf({ ...free, power: 'battery' }), 'battery');
  assert.equal(holdOf({ ...free, speedLimit: 99 }), 'throttled', 'Windows holds the processor back for heat or power');
  assert.equal(holdOf({ ...free, busy: 'export' }), 'export');
  assert.equal(holdOf({ ...free, busy: 'upload' }), 'upload');
  for (const a of ['playing', 'scrubbing', 'measuring']) assert.equal(holdOf({ ...free, activities: ['none', a] }), a);
  assert.equal(holdOf({ ...free, activities: ['none'] }), null, '«none» holds nothing');
  assert.equal(holdOf({ ...free, asked: true }), 'asked', 'a copy the person asked for comes first');
  assert.equal(holdOf({ ...free, lastInput: free.now - QUIET_MS + 1 }), 'input');
  assert.equal(holdOf({ ...free, lastInput: free.now - QUIET_MS }), null, 'a few seconds after the last key or click');
  assert.equal(holdOf({ ...free, power: 'battery', busy: 'export', lastInput: free.now }), 'battery', 'the most lasting reason is said');
  assert.deepEqual([...HOLDS], ['battery', 'throttled', 'export', 'upload', 'measuring', 'playing', 'scrubbing', 'asked', 'input']);
});

test('a hold of input ends by itself, and the broker looks again then', () => {
  const f = { ...free, lastInput: free.now - 1000 };
  assert.equal(quietAt(f), f.lastInput + QUIET_MS);
  assert.equal(quietAt(free), null);
  assert.equal(quietAt({ ...f, busy: 'export' }), null, 'another hold does not end on a timer');
});

test('a key, a click, a touch or a drag is working; moving the pointer and scrolling are reading', () => {
  for (const type of ['keyDown', 'rawKeyDown', 'mouseDown', 'touchStart', 'pointerDown']) assert.equal(isWork({ type }), true, type);
  assert.equal(isWork({ type: 'mouseMove', modifiers: ['leftbuttondown'] }), true, 'a drag');
  for (const e of [{ type: 'mouseMove' }, { type: 'mouseMove', modifiers: ['shift'] }, { type: 'mouseWheel' }, { type: 'gestureScrollUpdate' }, { type: 'keyUp' }, { type: 'char' }, { type: 'mouseUp' }]) assert.equal(isWork(e), false, JSON.stringify(e));
});

test('held, running jobs pause and a job paused too long stops; free, paused jobs resume before waiting ones start, up to the width', () => {
  const jobs = [
    { name: 'a', state: 'running' },
    { name: 'b', state: 'paused', pausedAt: free.now - 1000 },
    { name: 'c', state: 'paused', pausedAt: free.now - STOP_AFTER_MS },
    { name: 'd', state: 'waiting' },
  ];
  assert.deepEqual(stepsFor(jobs, 'input', 2, free.now), { start: [], pause: ['a'], resume: [], stop: ['c'] });
  assert.deepEqual(stepsFor(jobs, null, 2, free.now), { start: [], pause: [], resume: ['b'], stop: ['c'] }, 'a keeps running, b resumes; c waited too long');
  assert.deepEqual(stepsFor(jobs, null, 3, free.now), { start: [], pause: [], resume: ['b', 'c'], stop: [] });
  assert.deepEqual(stepsFor([{ name: 'x', state: 'waiting' }, { name: 'y', state: 'waiting' }], null, 1, free.now), { start: ['x'], pause: [], resume: [], stop: [] }, 'one at a time, the first first');
  assert.deepEqual(stepsFor([{ name: 'x', state: 'running' }, { name: 'y', state: 'running' }], null, 1, free.now), { start: [], pause: ['y'], resume: [], stop: [] }, 'the width went down');
  for (const w of [0, -1, NaN, 9]) assert.ok(stepsFor([{ name: 'x', state: 'waiting' }, { name: 'y', state: 'waiting' }, { name: 'z', state: 'waiting' }, { name: 'q', state: 'waiting' }], null, w, free.now).start.length <= MAX_WIDTH, String(w));
});

test('the queue keeps one entry per copy, in the order of the window that wants it soonest, and drops what nobody wants', () => {
  const q = new CopyQueue();
  const one = q.want(1, [{ name: 'p1', key: 'k1' }, { name: 'p2', key: 'k2' }, { name: 'p1', key: 'k1' }]);
  assert.deepEqual(one.added.map((e) => e.name), ['p1', 'p2']);
  assert.deepEqual(q.view(1).map((e) => [e.name, e.state]), [['p1', 'probing'], ['p2', 'probing']]);
  q.want(2, [{ name: 'p2', key: 'k2' }, { name: 'p3', key: 'k3' }]);
  assert.deepEqual(q.ordered().map((e) => e.name), ['p1', 'p2', 'p3'], 'p2 is second for the first window and first for the second');
  assert.deepEqual(q.owners('p2'), [1, 2]);
  const again = q.want(1, [{ name: 'p3', key: 'k3' }]);
  assert.deepEqual(again.dropped.map((e) => e.name), ['p1'], 'p2 is still the second window\'s');
  assert.deepEqual(q.forget(2).map((e) => e.name), ['p2']);
  assert.equal(q.forget(9).length, 0);
  assert.ok(q.set('p3', { state: 'paused', pausedAt: 5 }));
  assert.equal(q.get('p3').pausedAt, 5);
  q.set('p3', { state: 'running' });
  assert.equal(q.get('p3').pausedAt, undefined, 'only a paused entry has a pause time');
  assert.equal(q.set('gone', { state: 'ready' }), false);
  assert.deepEqual(q.counts(), { making: 1, waiting: 0 });
  assert.deepEqual(Object.keys(q.view(1)[0]).sort(), ['done', 'name', 'state', 'total', 'why'], 'a window is told names and states, never a key or a path');
  const many = q.want(3, Array.from({ length: MAX_WANTED + 5 }, (_, i) => ({ name: `n${i}`, key: `k${i}` })));
  assert.equal(many.added.length, MAX_WANTED);
});

test('an activity is a word of a fixed list', () => {
  assert.deepEqual([...ACTIVITIES], ['none', 'playing', 'scrubbing', 'measuring']);
  for (const a of ACTIVITIES) assert.equal(activityOf(a), a);
  for (const bad of ['Playing', 'exporting', '', null, undefined, 1, {}, ['playing']]) assert.equal(activityOf(bad), null, String(bad));
});

test('the queue names sources only as media does, a bounded list with a width of 1 to 3, refused whole', () => {
  assert.deepEqual(mediaRefOf({ token }), { token });
  assert.deepEqual(mediaRefOf({ asset, version: 2 }), { asset, version: 2 });
  for (const bad of [{ token: 'x' }, { token, asset }, { asset, version: 0 }, { asset: 'not-a-uuid', version: 1 }, { asset, version: 1, path: 'C:\\x.mov' }, { path: 'C:\\x.mov' }, 'C:\\x.mov', null, []]) assert.equal(mediaRefOf(bad), null, JSON.stringify(bad));
  assert.deepEqual(queueAskOf({ items: [{ token }, { asset, version: 1 }], width: 2 }), { items: [{ token }, { asset, version: 1 }], width: 2 });
  assert.deepEqual(queueAskOf({ items: [], width: 1 }), { items: [], width: 1 }, 'an empty list wants nothing');
  for (const bad of [{ items: [{ token }], width: 0 }, { items: [{ token }], width: 4 }, { items: [{ token }], width: 1.5 }, { items: [{ token }, { file: 'C:\\x' }], width: 1 }, { items: 'x', width: 1 }, { width: 1 }, { items: Array(QUEUE_LIMITS.items + 1).fill({ token }), width: 1 }, null, []]) assert.equal(queueAskOf(bad), null, JSON.stringify(bad).slice(0, 80));
});

test('the tray says how many copies are being made, or why they wait, and nothing when there are none', () => {
  assert.equal(copiesLine({ making: 0, waiting: 0, hold: 'input' }), null);
  assert.equal(copiesLine({ making: 1, waiting: 2, hold: null }), 'نسخ خفيفة للمعاينة: تُنشأ 1 من 3 في وقت فراغ الجهاز');
  assert.equal(copiesLine({ making: 1, waiting: 2, hold: 'playing' }), 'نسخ خفيفة للمعاينة: 3 تنتظر انتهاء التشغيل');
  for (const h of HOLDS) assert.ok(copiesLine({ making: 0, waiting: 1, hold: h }).length > 20, h);
  assert.equal(trayTooltip(null, 0), 'مركز الاتصال المؤسسي', 'as before, with nothing to make');
  assert.equal(trayTooltip(null, 0, { making: 1, waiting: 0, hold: null }).split('\n').length, 2);
});
