// The site's half of the desktop application's D12 (Desktop_Power_Ideas.md P-08 and P-30; MVP_draft.md 63.9): the
// features of bridge version 7 detected by their methods, the activity a page reports, the studio's video sources
// named to the application's queue of light copies with the width scale.ts plans, and what the studio says of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dragOutFile, FEATURES, fileToken, nativeOf, setActivity, setTaskbarProgress } from '../src/lib/native/index.ts';
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

test('D12: a copy taken up at the pause only asks, so a queue the studio stopped stays stopped', async () => {
  // found by qa/desktop-idle.cjs on 2026-11-05: the take-up's ask named its one source to an emptied queue, and the
  // application, which replaces a window's whole list, dropped every other copy it was making
  const log = [];
  const app = v7(log, { profile: { current: key, entries: [{ at: 1, key, numbers }] } });
  inApp(app.bridge);
  const c = await DeviceCache.open();
  c.stopQueue();
  const before = log.filter((x) => x[0] === 'queue').length;
  await c.copies({ token }, { want: false });
  await sleep(250);
  assert.equal(log.filter((x) => x[0] === 'queue').length, before, 'nothing named');
  await c.copies({ token });
  await sleep(250);
  assert.deepEqual(log.filter((x) => x[0] === 'queue').at(-1)[1].items, [{ token }], 'opening a source still names it');
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

test('D12, P-26: the taskbar shows how far the work is, a hundredth at a time, «done» and «failed»; nothing elsewhere', async () => {
  const log = [];
  const b = v7(log).bridge;
  b.bridge = 8;
  b.life.progress = async (st) => (log.push(['progress', st]), true);
  assert.equal(nativeOf(b).has('taskbar'), true);
  assert.equal(nativeOf(v7().bridge).has('taskbar'), false, 'version 7 has no taskbar');
  inApp(b);
  for (const v of [0, 0.001, 0.004, 0.25, 0.251, 0.5, 2, Number.NaN]) await setTaskbarProgress(v);
  await setTaskbarProgress('failed');
  await setTaskbarProgress(0.25);
  await setTaskbarProgress('done');
  assert.deepEqual(log.filter((x) => x[0] === 'progress').map((x) => x[1]), [0, 0.25, 0.5, 1, 'failed', 0.25, 'done'], 'each hundredth once, at most 1, never NaN; after a word the fraction is sent again');
  inApp(undefined);
  await setTaskbarProgress(0.5);
  const refusing = { ...b, life: { ...b.life, progress: async () => Promise.reject(new Error('refused')) } };
  inApp(refusing);
  await setTaskbarProgress(0.9);
});

test('D12, P-22: a file on this laptop gets a token and is dragged out by it; a handle gives its own file; nothing elsewhere', async () => {
  const log = [];
  const b = v7(log).bridge;
  b.bridge = 8;
  b.files = {
    pick: async () => [],
    fromDropped: async (f) => (log.push(['fromDropped', f.name]), f.name === 'export.mp4' ? { token, name: f.name } : null),
    check: async () => ({ ok: true }),
    forget: async () => true,
    dragOut: async (t) => (log.push(['dragOut', t]), t === token),
  };
  assert.equal(nativeOf(b).has('dragOut'), true);
  inApp(b);
  const file = new File(['x'], 'export.mp4');
  assert.equal(await fileToken(file), token);
  const handle = { getFile: async () => file };
  assert.equal(await fileToken(handle), token, "the saved handle's own file");
  assert.equal(await fileToken(new File(['x'], 'bytes.bin')), null, 'not a file the application can name');
  assert.equal(await dragOutFile(token), true);
  assert.equal(await dragOutFile('B'.repeat(43)), false);
  b.files.dragOut = async () => Promise.reject(new Error('refused'));
  assert.equal(await dragOutFile(token), false, 'a refusal drags nothing and throws nothing');
  inApp(undefined);
  assert.equal(await fileToken(file), null);
  assert.equal(await dragOutFile(token), false);
});

test('D12: the cache folder is shown by its label; an older application\'s path shows only its last name', async () => {
  const { folderLabelOf } = await import('../src/lib/studio/cache.ts');
  assert.equal(folderLabelOf({ folder: 'المجلد الافتراضي', isDefault: true }), 'المجلد الافتراضي');
  assert.equal(folderLabelOf({ folder: 'Shoots', isDefault: false }), 'Shoots');
  const win = (...parts) => parts.join(String.fromCharCode(92));
  assert.equal(folderLabelOf({ folder: win('C:', 'Users', 'someone', 'AppData', 'Roaming', 'sa.commshub.desktop', 'StudioCache'), isDefault: true }), 'المجلد الافتراضي', "an older application's default path");
  assert.equal(folderLabelOf({ folder: win('D:', 'Media', 'Shoots', 'CommsHub Studio Cache'), isDefault: false }), 'Shoots', "an older application's chosen path");
  const ui = fs.readFileSync('src/components/studio/cache-panel.tsx', 'utf8');
  assert.match(ui, /folderLabelOf\(folder\)/);
  assert.equal(/\{folder\.folder\}/.test(ui), false);
});

test('D12, P-20: the card import is detected by its four methods; what is said of a card, its copy and each failure', async () => {
  const { CARD_WORDS, cardDone, cardLine, cardWhy } = await import('../src/lib/native/copies.ts');
  const b = v7().bridge;
  b.bridge = 9;
  b.files = { pick: async () => [], fromDropped: async () => null, check: async () => ({ ok: true }), forget: async () => true, dragOut: async () => true, importCard: async () => null, copyCard: async () => null, cancelCard: async () => true, onCard: () => undefined };
  assert.equal(nativeOf(b).has('cardImport'), true);
  assert.equal(nativeOf({ ...b, files: { ...b.files, onCard: undefined } }).has('cardImport'), false);
  assert.equal(CARD_WORDS.hint, 'تُنسخ الملفات ويُتحقَّق منها قبل استعمالها.', 'the words of Desktop_Power_Ideas.md P-20, verbatim');
  assert.equal(cardLine('EOS_DIGITAL', 3, '2.1 ج.ب'), 'في «EOS_DIGITAL»: 3 ملفات (2.1 ج.ب).');
  assert.equal(cardLine('X', 1, '1 م.ب'), 'في «X»: 1 ملف (1 م.ب).');
  assert.equal(cardLine('X', 12, '1 م.ب'), 'في «X»: 12 ملفاً (1 م.ب).');
  assert.equal(cardDone(0, 'Shoot'), 'لم يُنسخ أي ملف.');
  assert.match(cardDone(2, 'Shoot'), /^نُسخ ملفان|^نُسخ 2 ملفان/);
  for (const w of ['changed', 'mismatch', 'gone', 'space', 'cancelled', 'inside', 'failed']) assert.ok(cardWhy(w).length > 3 && !cardWhy(w).includes(w), w);
  assert.equal(cardWhy('anything else'), cardWhy('failed'));
  // every word the application gives is one the site says
  const app = fs.readFileSync('desktop/src/native-files.ts', 'utf8') + fs.readFileSync('desktop/src/card-copy.ts', 'utf8');
  for (const w of ['changed', 'mismatch', 'gone', 'space', 'cancelled', 'inside', 'failed']) assert.ok(app.includes(`'${w}'`), `the application says ${w}`);
});

test('D12, P-20: a card\'s videos join the light-copy queue as soon as they are copied in', async () => {
  const log = [];
  inApp(v7(log).bridge);
  const c = await DeviceCache.open();
  c.wantFiles([{ token, media: 'video' }, { token: 'P'.repeat(43), media: 'image' }]);
  await sleep(250);
  const sent = log.filter((x) => x[0] === 'queue');
  assert.deepEqual(sent.at(-1)[1].items, [{ token }], 'the video only');
});

test('63.6.1: a device is measured, never measured, or stale for the first reason of app, chip and driver', async () => {
  const { measureKeyId, measureLine, measureState } = await import('../src/lib/native/device.ts');
  const entry = (over = {}, at = 1) => ({ at, key: { ...key, ...over, chip: { ...key.chip, ...(over.chip ?? {}) } }, numbers });
  assert.equal(measureState(null), null, 'the application has not answered: nothing is said');
  assert.deepEqual(measureState({ current: key, entries: [] }), { kind: 'never' });
  assert.deepEqual(measureState({ current: key, entries: [entry()] }), { kind: 'measured' });
  assert.deepEqual(measureState({ current: key, entries: [entry({ power: 'battery' })] }), { kind: 'measured' }, 'mains or battery is not a reason');
  assert.deepEqual(measureState({ current: key, entries: [entry({ app: '0.7.1' })] }), { kind: 'stale', why: 'app' });
  assert.deepEqual(measureState({ current: key, entries: [entry({ chrome: '152.0.7977.130' })] }), { kind: 'stale', why: 'app' }, 'Chromium comes with the application');
  assert.deepEqual(measureState({ current: key, entries: [entry({ switch: 'low', chip: { vendorId: 4098, deviceId: 5761 } })] }), { kind: 'stale', why: 'chip' });
  assert.deepEqual(measureState({ current: key, entries: [entry({ switch: 'high' })] }), { kind: 'stale', why: 'chip' }, 'another switch is another chip');
  assert.deepEqual(measureState({ current: key, entries: [entry({ chip: { driver: '31.0' } })] }), { kind: 'stale', why: 'driver' });
  assert.deepEqual(measureState({ current: key, entries: [entry({ app: '0.7.1', chip: { driver: '31.0' } })] }), { kind: 'stale', why: 'app' }, 'one reason, the first that differs');
  // this chip's own newest measurement decides: an update is not taken for a change of chip
  const amdNewer = entry({ app: '0.8.0', switch: 'low', chip: { vendorId: 4098, deviceId: 5761 } }, 9);
  const rtxOlder = entry({ app: '0.7.1' }, 2);
  assert.deepEqual(measureState({ current: key, entries: [rtxOlder, amdNewer] }), { kind: 'stale', why: 'app' });
  assert.deepEqual(measureState({ current: key, entries: [amdNewer] }), { kind: 'stale', why: 'chip' });
  assert.equal(measureLine({ kind: 'measured' }), null);
  assert.equal(measureLine(null), null);
  assert.equal(measureLine({ kind: 'never' }), 'لم يُقَس هذا الجهاز بعد، فيعمل الاستوديو بأبسط إعداداته. القياس نحو نصف دقيقة، ولا يُرسل شيء خارج الجهاز.');
  assert.equal(measureLine({ kind: 'stale', why: 'app' }), 'تغيّر إصدار التطبيق منذ آخر قياس، فعاد الاستوديو إلى أبسط إعداداته حتى يُقاس الجهاز من جديد.');
  assert.equal(measureLine({ kind: 'stale', why: 'chip' }), 'تغيّرت بطاقة الرسوميات منذ آخر قياس، فعاد الاستوديو إلى أبسط إعداداته حتى يُقاس الجهاز من جديد.');
  assert.equal(measureLine({ kind: 'stale', why: 'driver' }), 'تغيّر برنامج تشغيل البطاقة منذ آخر قياس، فعاد الاستوديو إلى أبسط إعداداته حتى يُقاس الجهاز من جديد.');
  assert.equal(/\p{Extended_Pictographic}/u.test(measureLine({ kind: 'never' }) + measureLine({ kind: 'stale', why: 'driver' })), false);
  // «لاحقاً» is kept for one key: any change of application, Chromium, switch, chip or driver is another key; power is not
  const id = measureKeyId(key);
  for (const other of [{ app: '0.8.1' }, { chrome: '156.0.1' }, { switch: 'low' }, { chip: { ...key.chip, deviceId: 1 } }, { chip: { ...key.chip, driver: '33' } }]) assert.notEqual(measureKeyId({ ...key, ...other }), id, JSON.stringify(other));
  assert.equal(measureKeyId({ ...key, power: 'battery' }), id);
});

test('63.6.1: the page knows it is busy while it told the application so, and stops knowing when it ends', async () => {
  const { markBusy, onPageBusy, pageBusy } = await import('../src/lib/native/index.ts');
  const b = v7().bridge;
  inApp(b);
  let heard = 0;
  const stop = onPageBusy(() => heard++);
  assert.equal(pageBusy(), false);
  const end = await markBusy('export');
  assert.equal(pageBusy(), true);
  await end();
  await end();
  assert.equal(pageBusy(), false, 'ended once, whatever calls it twice');
  assert.equal(heard, 2);
  stop();
  inApp(undefined);
  await markBusy('export');
  assert.equal(pageBusy(), false, 'a browser is never busy for the application');
});

test('P-28: a saved download is heard and acted on by its id; what the notice says; a browser and version 9 have none', async () => {
  const { actOnDownload, downloadOf, onDownloadDone } = await import('../src/lib/native/index.ts');
  const { downloadLine, NEVER_OPENS, OPEN_LABEL, SHOW_LABEL, WHY_LINE } = await import('../src/lib/native/downloads.ts');
  const log = [];
  let done = null;
  const answers = { open: { ok: false, why: 'unmarked' }, show: { ok: true } };
  const b = {
    ...v7().bridge,
    bridge: 10,
    downloads: {
      open: async (id) => (log.push(['open', id]), answers.open),
      show: async (id) => (log.push(['show', id]), answers.show),
      onDone: (fn) => (done = fn),
    },
  };
  assert.deepEqual(FEATURES.openDownload, ['downloads.open', 'downloads.show', 'downloads.onDone']);
  assert.equal(nativeOf(b).has('openDownload'), true);
  assert.equal(nativeOf({ ...b, bridge: 9, downloads: undefined }).has('openDownload'), false, 'version 9 has none');
  assert.equal(nativeOf({ ...b, downloads: { ...b.downloads, onDone: undefined } }).has('openDownload'), false, 'every method of the feature');
  inApp(b);
  const heard = [];
  const stop = onDownloadDone((d) => heard.push(d));
  done({ id: token, name: 'تقرير.pdf', kind: 'document' });
  done({ id: token, name: 'tool.exe', kind: null });
  for (const bad of [null, {}, { id: 'short', name: 'x', kind: null }, { id: token, name: '', kind: null }, { id: token, name: 'x', kind: 'program' }, { id: token, name: 'x'.repeat(201), kind: null }]) done(bad);
  done({ id: token, name: 'x', kind: 'document', path: 'C:/x' });
  assert.deepEqual(heard, [{ id: token, name: 'تقرير.pdf', kind: 'document' }, { id: token, name: 'tool.exe', kind: null }, { id: token, name: 'x', kind: 'document' }], 'only well-formed downloads, and nothing more than id, name and kind');
  assert.equal(downloadOf({ id: token, name: 'x', kind: 'document', path: 'C:/x' }).path, undefined);
  stop();
  assert.equal(done, null, 'stops listening');
  assert.deepEqual(await actOnDownload('open', token), { ok: false, why: 'unmarked' });
  assert.deepEqual(await actOnDownload('show', token), { ok: true });
  answers.open = { ok: false, why: 'something else' };
  assert.deepEqual(await actOnDownload('open', token), { ok: false, why: 'failed' }, 'an unknown reason is a failure');
  b.downloads.open = async () => Promise.reject(new Error('refused'));
  assert.deepEqual(await actOnDownload('open', token), { ok: false, why: 'failed' });
  assert.deepEqual(log, [['open', token], ['show', token], ['open', token]]);
  inApp(undefined);
  assert.deepEqual(await actOnDownload('open', token), { ok: false, why: 'gone' }, 'a browser opens nothing');
  assert.equal(typeof onDownloadDone(() => undefined), 'function');

  assert.equal(downloadLine({ id: token, name: 'تقرير.pdf', kind: 'document' }), 'حُفظ «تقرير.pdf».');
  assert.equal(OPEN_LABEL, 'فتح بالبرنامج الافتراضي');
  assert.equal(SHOW_LABEL, 'إظهار في المجلد');
  assert.equal(WHY_LINE.kind, NEVER_OPENS);
  assert.deepEqual(Object.keys(WHY_LINE).sort(), ['failed', 'gone', 'kind', 'unmarked']);
  for (const t of [OPEN_LABEL, SHOW_LABEL, NEVER_OPENS, ...Object.values(WHY_LINE)]) assert.equal(/\p{Extended_Pictographic}/u.test(t), false, t);
  const notice = fs.readFileSync(new URL('../src/components/native/desktop-downloads.tsx', import.meta.url), 'utf8');
  assert.match(notice, /\{SAVED_BEFORE\}\s*<bdi>\{last\.name\}<\/bdi>\s*\{SAVED_AFTER\}/, 'the name is isolated, so a Latin ending keeps the marks in place');
  const shell = fs.readFileSync(new URL('../src/components/shell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /<DesktopDownloads \/>/, 'the shell carries the notice on every page');
});

test('the account card says in one line what the application adds for every member, and in a second the studio\'s gains to those the studio opens to', () => {
  const card = fs.readFileSync(new URL('../src/components/native/desktop-app.tsx', import.meta.url), 'utf8');
  const everyone = 'تطبيق سطح المكتب أقوى من المتصفح: تصل إشعارات «يحتاج قرارك» إلى الجهاز ويظهر عددها على شريط المهام، وتُفتح المستندات والصور والمقاطع التي تنزّلها في برامجها.';
  const studio = 'وفي الاستوديو يقيس قدرة الجهاز، ويسرّع المعاينة وتعديل الصور، ويصدّر عدة أشكال معاً، ويصنع النسخ الخفيفة في أوقات الفراغ، ويفتح صيغ الفيديو التي لا يقرؤها المتصفح، ويعرض المعاينة على شاشة ثانية، ويُظهر تقدّم التصدير على شريط المهام، وتُسحب منه ملفات هذا الجهاز إلى البرامج الأخرى.';
  assert.ok(card.includes(`<p data-desktop-strength>${everyone}</p>`), 'every member\'s line, unconditioned');
  assert.ok(card.includes(`{studio && <p data-desktop-strength="studio">${studio}</p>}`), 'the studio\'s line only with studio access');
  assert.equal(card.split(everyone).length, 2);
  assert.equal(card.split(studio).length, 2);
  // every member's line names nothing of the studio
  for (const w of ['الاستوديو', 'المعاينة', 'النسخ الخفيفة', 'قدرة الجهاز', 'شاشة ثانية', 'تُسحب']) assert.equal(everyone.includes(w), false, w);
  // since D11 the export runs several shapes in lanes and the export panel sends its progress to the taskbar, and photo
  // adjustments follow the plan's workers: the studio's line names them, every member's line does not
  const panel = fs.readFileSync(new URL('../src/components/studio/export-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /await exportLanes\(\)/);
  assert.match(panel, /setTaskbarProgress\(/);
  const photo = fs.readFileSync(new URL('../src/components/studio/photo-editor.tsx', import.meta.url), 'utf8');
  assert.match(photo, /setPhotoWorkers\(photoWorkers\)/);
  assert.ok(studio.includes('ويصدّر عدة أشكال معاً') && studio.includes('ويُظهر تقدّم التصدير على شريط المهام') && studio.includes('وتعديل الصور'));
  for (const line of [everyone, studio]) assert.equal(/\p{Extended_Pictographic}/u.test(line), false);
  assert.equal(/تقدّم|أشكال|تعديل الصور/.test(everyone), false);
  // «الحساب» asks the studio tab's own check
  const page = fs.readFileSync(new URL('../src/components/supporting.tsx', import.meta.url), 'utf8');
  assert.match(page, /const studio = useStudioTab\(\);/);
  assert.match(page, /<DesktopAppPanel studio=\{studio\} \/>/);
  const tabs = fs.readFileSync(new URL('../src/components/studio/motion-tabs.tsx', import.meta.url), 'utf8');
  assert.match(tabs, /if \(!useStudioTab\(\)\) return null;/, 'the tab bar asks the same');
  assert.match(tabs, /return studioTabVisible\(account, \{ viewAs: state\.role, hasCap: caps\.has \}\);/);
  const spec = fs.readFileSync(new URL('../MVP_draft.md', import.meta.url), 'utf8');
  assert.ok(spec.includes(`«${everyone}»`) && spec.includes(`«${studio}»`), 'MVP_draft.md 63.2 holds the same words');
});
