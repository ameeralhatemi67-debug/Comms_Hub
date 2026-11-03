// The site's half of the desktop application's D12 (Desktop_Power_Ideas.md P-08 and P-30; MVP_draft.md 63.9): the
// features of bridge version 7 detected by their methods, the activity a page reports, the studio's video sources
// named to the application's queue of light copies with the width scale.ts plans, and what the studio says of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FEATURES, nativeOf, setActivity } from '../src/lib/native/index.ts';
import { COPY_WAITS, copyQueueLine } from '../src/lib/native/copies.ts';
import { currentEntry } from '../src/lib/native/device.ts';
import { DeviceCache, copyWidth } from '../src/lib/studio/cache.ts';
import { plan } from '../src/lib/studio/scale.ts';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const token = 'T'.repeat(43);
const asset = '0a1b2c3d-0000-4000-8000-00000000abcd';
const key = { app: '0.8.0', chrome: '156.0.8078.48', switch: 'none', power: 'ac', chip: { vendorId: 4318, deviceId: 9634, vendor: 'NVIDIA', name: 'RTX', driver: '32.0' } };
const numbers = {
  v: 1,
  encode: { h264_1080: { hw: 300, sw: 60 }, h264_2160: { hw: 90, sw: 15 } },
  decode: { h264_2160: { hw: 200, sw: 40 } },
  lanes: [74.3, 115.2, 144.9],
  compose: { plain: 3, text: 4, effects: 9 },
  exportFps: 76.7,
  support: { hevcEncode: true, av1Encode: false, tenBitEncode: false, hevcDecode: true, av1Decode: true },
  runs: 3,
  spread: 4,
  seconds: 30,
  renderer: 'ANGLE',
};

/** A version 7 desktop bridge with the media tools and the queue, recording what the page sends. */
function v7(log = [], { profile = null } = {}) {
  let onQueue = null;
  return {
    log,
    push: (s) => onQueue?.(s),
    bridge: {
      platform: 'desktop',
      shell: 'electron',
      version: '0.8.0',
      bridge: 7,
      info: async () => ({ version: '0.8.0', cores: 12, memory: 16e9 }),
      life: { busy: async () => true, idle: async () => true, activity: async (k) => (log.push(['activity', k]), true) },
      profile: { read: async () => profile, save: async () => null },
      media: {
        probe: async () => ({}),
        copies: async (ref) => (log.push(['copies', ref]), { proxy: null, convert: null, names: { proxy: {}, convert: '' } }),
        proxy: async () => ({}),
        convert: async () => ({}),
        cancel: async () => true,
        onProgress: () => undefined,
        queue: async (ask) => (log.push(['queue', ask]), { hold: null, width: ask.width, items: [] }),
        queued: async () => ({ hold: null, width: 1, items: [] }),
        onQueue: (fn) => (onQueue = fn),
      },
    },
  };
}
const dir = () => ({ getDirectoryHandle: async () => dir(), getFileHandle: async () => Promise.reject(new Error('none')) });
function inApp(bridge) {
  globalThis.window = bridge === undefined ? {} : { commsHubNative: bridge };
  Object.defineProperty(globalThis, 'navigator', { value: { storage: { getDirectory: async () => dir(), persist: async () => true } }, configurable: true, writable: true });
}
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
test.afterEach(() => {
  delete globalThis.window;
  if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
});

test('D12: activity and the copy queue are detected by their methods; version 6 has neither', () => {
  const n = nativeOf(v7().bridge);
  assert.equal(n.has('activity'), true);
  assert.equal(n.has('copyQueue'), true);
  assert.deepEqual([...FEATURES.copyQueue], ['media.queue', 'media.queued', 'media.onQueue']);
  const b = v7().bridge;
  const six = { ...b, bridge: 6, life: { busy: b.life.busy, idle: b.life.idle }, media: { ...b.media, queue: undefined, queued: undefined, onQueue: undefined } };
  assert.equal(nativeOf(six).has('activity'), false);
  assert.equal(nativeOf(six).has('copyQueue'), false);
  assert.equal(nativeOf(six).has('media'), true, 'the D5 tools stay');
  assert.equal(nativeOf({ ...b, media: { ...b.media, onQueue: undefined } }).has('copyQueue'), false, 'every method of the feature');
});

test('D12: the activity reaches the application, and nothing happens in a browser or an older application, even when it refuses', async () => {
  const log = [];
  inApp(v7(log).bridge);
  await setActivity('playing');
  await setActivity('none');
  assert.deepEqual(log, [['activity', 'playing'], ['activity', 'none']]);
  inApp(undefined);
  await setActivity('playing');
  const refusing = v7().bridge;
  refusing.life.activity = async () => Promise.reject(new Error('refused'));
  inApp(refusing);
  await setActivity('scrubbing');
});

test('D12: the width of the queue is scale.ts\'s copiesAtOnce from this page\'s own measurement, the floor without one', async () => {
  inApp(undefined);
  assert.equal(await copyWidth(), plan(null).copiesAtOnce);
  assert.equal(plan(null).copiesAtOnce, 1, 'today\'s behaviour: one copy at a time');
  inApp(v7([], { profile: { current: key, entries: [{ at: 1, key, numbers }] } }).bridge);
  assert.equal(await copyWidth(), plan(numbers, { cores: 12, memory: 16e9 }, 'auto').copiesAtOnce);
  inApp(v7([], { profile: { current: { ...key, chrome: '152.0.7977.130' }, entries: [{ at: 1, key, numbers }] } }).bridge);
  assert.equal(await copyWidth(), 1, 'a measurement of another Chromium is not this page\'s');
  assert.equal(currentEntry({ current: key, entries: [{ at: 1, key, numbers }, { at: 2, key, numbers: { ...numbers, exportFps: 1 } }] }).numbers.exportFps, 1, 'the newest');
});

test('D12: every video source the pool opens is named to the queue once, a moment later; a closed project wants nothing', async () => {
  const log = [];
  const app = v7(log, { profile: { current: key, entries: [{ at: 1, key, numbers }] } });
  inApp(app.bridge);
  const c = await DeviceCache.open();
  assert.ok(c && c.hasCopyQueue);
  await c.copies({ token });
  await c.copies({ asset, version: 2 });
  await c.copies({ token });
  assert.equal(log.filter((x) => x[0] === 'queue').length, 0, 'not at once: a project opens many sources together');
  await sleep(250);
  const sent = log.filter((x) => x[0] === 'queue');
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0][1].items, [{ token }, { asset, version: 2 }], 'in the order opened, each once');
  assert.equal(sent[0][1].width, plan(numbers, { cores: 12, memory: 16e9 }, 'auto').copiesAtOnce);
  let heard = null;
  const stop = c.onQueue((s) => (heard = s));
  app.push({ hold: 'playing', width: 2, items: [{ name: 'proxy-x.mp4', state: 'paused', done: 1, total: 4, why: null }] });
  assert.equal(heard.hold, 'playing');
  assert.equal(c.queued.items[0].state, 'paused');
  stop();
  c.stopQueue();
  const last = log.filter((x) => x[0] === 'queue').at(-1);
  assert.deepEqual(last[1].items, [], 'the application stops making them');
});

test('D12: in a browser the studio names nothing and says nothing of copies', async () => {
  inApp({});
  const c = await DeviceCache.open();
  assert.ok(c);
  assert.equal(c.hasCopyQueue, false);
  assert.equal(c.queued, null);
  assert.equal(await c.copies({ token }), null);
  assert.equal(copyQueueLine(c.queued), null);
});

test('D12: the studio says how many light copies are ready and why the rest wait', () => {
  const item = (state) => ({ name: `proxy-${state}.mp4`, state, done: 0, total: 0, why: null });
  assert.equal(copyQueueLine({ hold: null, width: 1, items: [] }), null);
  assert.equal(copyQueueLine({ hold: null, width: 1, items: [item('light'), item('failed')] }), null, 'nothing to make, nothing said');
  assert.equal(copyQueueLine({ hold: null, width: 1, items: [item('ready'), item('ready')] }), 'النسخ الخفيفة للمعاينة جاهزة على هذا الجهاز: 2.');
  assert.equal(copyQueueLine({ hold: null, width: 2, items: [item('ready'), item('running'), item('waiting')] }), 'يُنشئ التطبيق نسخاً خفيفة للمعاينة حين يكون الجهاز متفرغاً: 1 جاهزة من 3، وتُنشأ 1 الآن.');
  assert.equal(copyQueueLine({ hold: 'playing', width: 2, items: [item('paused'), item('waiting')] }), 'يُنشئ التطبيق نسخاً خفيفة للمعاينة حين يكون الجهاز متفرغاً: 0 جاهزة من 2، والباقي ينتظر انتهاء التشغيل.');
  const holds = fs.readFileSync('desktop/src/idle.ts', 'utf8').match(/HOLDS = Object\.freeze\(\[([^\]]+)\]/)[1].match(/'(\w+)'/g).map((w) => w.slice(1, -1));
  assert.deepEqual(Object.keys(COPY_WAITS).sort(), holds.sort(), 'every reason the application gives is said');
});

test('D12: no emoji and no raw state word in the studio\'s new text', () => {
  const text = fs.readFileSync('src/lib/native/copies.ts', 'utf8') + fs.readFileSync('desktop/src/words.ts', 'utf8');
  assert.equal(/\p{Extended_Pictographic}/u.test(text), false);
  for (const s of ['paused', 'waiting', 'running']) assert.equal(copyQueueLine({ hold: null, width: 1, items: [{ name: 'p.mp4', state: s, done: 0, total: 0, why: null }] }).includes(s), false, s);
});
