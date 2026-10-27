// The native contract the site reads (src/lib/native; Mobile_Apps_Plan.md 5.2, Desktop_App_Plan.md 5.2):
// detection of the desktop bridge, feature by feature; the helpers falling back to the browser; which
// notices reach the tray; and «معلومات الجهاز».
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, FEATURES, keepAwake, markBusy, native, nativeOf, notifyNative, onNoticeOpen, readBridge, setBadge } from '../src/lib/native/index.ts';
import { DECIDE_TITLE, decisionCount, freshDecisions, noticesFor, RAISE_AT_ONCE } from '../src/lib/native/notices.ts';
import { CHIP_GUIDE, chipFromRenderer, deviceLines, factsFromApp, needsChipGuide } from '../src/lib/native/device.ts';
import { supportLines } from '../src/lib/studio/support.ts';

const d1 = Object.freeze({ platform: 'desktop', shell: 'electron', version: '0.1.0', bridge: 1 });
function d2(log = []) {
  let opener = null;
  return {
    log,
    open: (go) => opener?.(go),
    bridge: {
      platform: 'desktop',
      shell: 'electron',
      version: '0.2.0',
      bridge: 1,
      info: async () => ({ version: '0.2.0' }),
      power: { keepAwake: async (r) => (log.push(['keepAwake', r]), 7), release: async (id) => (log.push(['release', id]), true) },
      life: { busy: async (r) => (log.push(['busy', r]), true), idle: async () => (log.push(['idle']), true) },
      notify: { show: async (n) => (log.push(['show', n]), true), badge: async (n) => (log.push(['badge', n]), true), onOpen: (fn) => (opener = fn) },
    },
  };
}
const inWindow = (bridge) => {
  globalThis.window = bridge === undefined ? {} : { commsHubNative: bridge };
};
test.afterEach(() => {
  delete globalThis.window;
});

test('a browser has no shell: web, nothing offered', () => {
  const n = nativeOf(undefined);
  assert.equal(n.platform, 'web');
  assert.equal(n.raw, null);
  for (const f of Object.keys(FEATURES)) assert.equal(n.has(f), false, f);
  assert.equal(native().platform, 'web', 'no window at all (the server)');
});

test('only a well-formed shell object is read', () => {
  assert.equal(readBridge(d1)?.version, '0.1.0');
  for (const bad of [null, 'desktop', { ...d1, platform: 'web' }, { ...d1, platform: 'windows' }, { ...d1, version: 'latest' }, { ...d1, bridge: 0 }, { ...d1, bridge: 1.5 }, { ...d1, shell: 3 }]) {
    assert.equal(readBridge(bad), null, JSON.stringify(bad));
  }
});

test('features are detected by their methods, so the D1 application offers none and D2 all five', () => {
  const old = nativeOf(d1);
  assert.equal(old.platform, 'desktop');
  for (const f of Object.keys(FEATURES)) assert.equal(old.has(f), false, `D1 ${f}`);
  const now = nativeOf(d2().bridge);
  for (const f of ['info', 'keepAwake', 'busy', 'notify', 'badge']) assert.equal(now.has(f), true, `D2 ${f}`);
  const half = { ...d2().bridge, power: { keepAwake: async () => 1 } };
  assert.equal(nativeOf(half).has('keepAwake'), false, 'a feature needs all of its methods');
});

test('versions compare number by number', () => {
  assert.equal(compareVersions('0.10.0', '0.9.3'), 1);
  assert.equal(compareVersions('0.2.0', '0.2.0'), 0);
  assert.equal(compareVersions('0.1.9', '0.2.0'), -1);
  assert.equal(compareVersions('1.0.0-beta', '1.0.0'), 0, 'only the three numbers count');
});

test('in the application: the laptop kept awake, the window busy, notices, the badge, a clicked notice', async () => {
  const app = d2();
  inWindow(app.bridge);
  const awake = await keepAwake('export');
  const idle = await markBusy('export');
  assert.equal(await notifyNative({ title: 'انتهى التصدير', body: 'a.mp4' }), true);
  await setBadge(3.7);
  await setBadge(-2);
  await awake();
  await idle();
  assert.deepEqual(app.log, [['keepAwake', 'export'], ['busy', 'export'], ['show', { title: 'انتهى التصدير', body: 'a.mp4' }], ['badge', 3], ['badge', 0], ['release', 7], ['idle']]);
  const went = [];
  const stop = onNoticeOpen((go) => went.push(go));
  app.open('/work/CH-101');
  stop();
  app.open('/requests');
  assert.deepEqual(went, ['/work/CH-101']);
});

test('in a browser, or the D1 application, the helpers do what the browser did and never throw', async () => {
  for (const bridge of [undefined, d1]) {
    inWindow(bridge);
    const awake = await keepAwake('export');
    const idle = await markBusy('upload');
    assert.equal(await notifyNative({ title: 'x' }), false);
    await setBadge(1);
    await awake();
    await idle();
    assert.equal(typeof onNoticeOpen(() => undefined), 'function');
  }
});

test('a refusing application does not break the export', async () => {
  const app = d2();
  app.bridge.power.keepAwake = async () => {
    throw new Error('refused');
  };
  app.bridge.notify.show = async () => {
    throw new Error('refused');
  };
  inWindow(app.bridge);
  const awake = await keepAwake('export');
  await awake();
  assert.equal(await notifyNative({ title: 'x' }), false);
});

const row = (id, tier = 'decide', read_at = null) => ({ id, tier, body: `إشعار ${id}`, read_at, go: { page: 'item', id } });

test('the first read raises nothing; later only new unread «يحتاج قرارك» items', () => {
  const first = freshDecisions(null, [row('a'), row('b', 'info')]);
  assert.deepEqual(first.raise, []);
  const second = freshDecisions(first.seen, [row('c'), row('d', 'attention'), row('e', 'decide', '2026-10-20'), row('a'), row('b', 'info')]);
  assert.deepEqual(second.raise.map((n) => n.id), ['c']);
  assert.deepEqual(freshDecisions(second.seen, [row('c'), row('a')]).raise, [], 'nothing twice');
  assert.equal(decisionCount([row('a'), row('c'), row('e', 'decide', 'x'), row('d', 'attention')]), 2);
});

test('up to three notices one by one, more as one that counts them', () => {
  const href = (n) => `/items/${n.go.id}`;
  assert.deepEqual(noticesFor([row('a')], href), [{ title: DECIDE_TITLE, body: 'إشعار a', go: '/items/a' }]);
  assert.equal(noticesFor(['a', 'b', 'c'].map((x) => row(x)), href).length, RAISE_AT_ONCE);
  assert.deepEqual(noticesFor(['a', 'b', 'c', 'd'].map((x) => row(x)), href), [{ title: DECIDE_TITLE, body: 'إشعارات جديدة تحتاج قرارك: 4', go: null }]);
  assert.equal(DECIDE_TITLE, 'يحتاج قرارك', 'the tier label of the attention model');
});

const laptopInfo = {
  version: '0.2.0',
  cores: 12,
  cpu: 'AMD Ryzen 5 6600H with Radeon Graphics',
  memory: 16310259712,
  freeDisk: 51e9,
  gpu: { active: 'AMD Radeon(TM) Graphics', chips: [{ name: 'NVIDIA GeForce RTX 3050 Laptop GPU', vendor: 'NVIDIA', active: false }, { name: 'AMD Radeon(TM) Graphics', vendor: 'AMD', active: true }], software: false },
};

test('«معلومات الجهاز» from the application, with the guide when the stronger chip is idle', () => {
  const f = { ...factsFromApp(laptopInfo), hardwareEncoder: true };
  const lines = deviceLines(f);
  assert.deepEqual(lines.map((l) => l.label), ['يعمل في', 'المعالج', 'الذاكرة', 'المساحة الحرة', 'بطاقة الرسوميات المستعملة', 'بطاقات أخرى في الجهاز', 'ترميز الفيديو بالعتاد']);
  assert.equal(lines[0].value, 'تطبيق سطح المكتب، الإصدار 0.2.0');
  assert.equal(lines[1].value, 'AMD Ryzen 5 6600H with Radeon Graphics، 12 نواة');
  assert.equal(needsChipGuide(f), true);
  assert.equal(needsChipGuide({ ...f, chips: f.chips.map((c) => ({ ...c, active: c.vendor === 'NVIDIA' })) }), false, 'already on the stronger chip');
  assert.match(CHIP_GUIDE, /مركز الاتصال المؤسسي/);
  assert.equal(factsFromApp({ cores: 2 }), null);
});

test('«معلومات الجهاز» in a browser names the chip WebGL reports', () => {
  assert.equal(chipFromRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Laptop GPU (0x000025A2) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'NVIDIA GeForce RTX 3050 Laptop GPU');
  assert.equal(chipFromRenderer('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'AMD Radeon(TM) Graphics');
  assert.equal(chipFromRenderer('Apple M2'), 'Apple M2');
  assert.equal(chipFromRenderer(null), null);
  const lines = deviceLines({ app: null, cores: 8, cpu: null, memory: 8e9, memoryAtLeast: true, freeDisk: null, gpu: 'Intel Iris Xe', chips: [], software: false, hardwareEncoder: false });
  assert.equal(lines[0].value, 'المتصفح');
  assert.equal(lines.find((l) => l.label === 'الذاكرة').value, 'نحو 8.0 ج.ب أو أكثر');
  assert.equal(lines.find((l) => l.label === 'ترميز الفيديو بالعتاد').ok, false);
});

test('the studio says when it runs in the application, and says nothing new in a browser', () => {
  const base = { webcodecs: true, mp4: true, webm: true, aac: 'native', opfs: true, persisted: null, quota: null, usage: null };
  assert.equal(supportLines({ ...base, desktop: null }).length, 3);
  const app = supportLines({ ...base, desktop: { version: '0.2.0', background: true } });
  assert.equal(app.length, 4);
  assert.equal(app[0].text, 'يعمل الاستوديو في تطبيق سطح المكتب (الإصدار 0.2.0): يستمر التصدير والنافذة مصغّرة، ولا ينام الحاسوب أثناءه.');
});

test('no emoji in any new interface text', async () => {
  const fs = await import('node:fs');
  for (const f of ['src/lib/native/index.ts', 'src/lib/native/notices.ts', 'src/lib/native/device.ts', 'src/lib/native/releases.ts', 'src/components/native/device-info.tsx', 'src/components/native/desktop-app.tsx']) {
    assert.equal(/\p{Extended_Pictographic}/u.test(fs.readFileSync(f, 'utf8')), false, f);
  }
});

// D3: the releases the site offers, and the application's update (src/lib/native/releases.ts).
const latestYml = `version: 0.3.0
files:
  - url: CommsHub-Setup-0.3.0-x64.exe
    sha512: abc123==
    size: 111527803
path: CommsHub-Setup-0.3.0-x64.exe
sha512: abc123==
releaseDate: '2026-10-21T08:00:00.000Z'
`;

test('D3: latest.yml as electron-builder writes it, and nothing else', async () => {
  const { parseLatest, downloadUrl, DESKTOP_FEED } = await import('../src/lib/native/releases.ts');
  const r = parseLatest(latestYml);
  assert.deepEqual(r, { version: '0.3.0', file: 'CommsHub-Setup-0.3.0-x64.exe', size: 111527803, date: '2026-10-21T08:00:00.000Z' });
  assert.equal(downloadUrl(r), `${DESKTOP_FEED}/CommsHub-Setup-0.3.0-x64.exe`);
  for (const bad of ['', 'not yaml', latestYml.replace('0.3.0', 'latest'), latestYml.replaceAll('CommsHub-Setup-0.3.0-x64.exe', '../evil.exe'), latestYml.replaceAll('CommsHub-Setup-0.3.0-x64.exe', 'https://example.com/x.exe'), 'x'.repeat(30000)]) {
    assert.equal(parseLatest(bad), null, bad.slice(0, 40));
  }
});

test('D3: the site\'s feed is the application\'s feed', async () => {
  const fs = await import('node:fs');
  const { DESKTOP_FEED } = await import('../src/lib/native/releases.ts');
  const app = fs.readFileSync('desktop/src/update.ts', 'utf8');
  assert.ok(app.includes(`export const PRODUCTION_FEED = '${DESKTOP_FEED}';`));
});

test('D3: an application older than the site needs, a newer release, and the update said in Arabic', async () => {
  const { tooOld, newer, updateLine, MINIMUM_DESKTOP } = await import('../src/lib/native/releases.ts');
  assert.equal(MINIMUM_DESKTOP, '0.2.0');
  assert.equal(tooOld('0.1.0'), true, 'the D1 application');
  assert.equal(tooOld('0.2.0'), false);
  assert.equal(tooOld(null), false, 'a browser');
  assert.equal(newer({ version: '0.3.1', file: 'a.exe', size: null, date: null }, '0.3.0'), true);
  assert.equal(newer({ version: '0.3.0', file: 'a.exe', size: null, date: null }, '0.3.0'), false);
  assert.equal(newer(null, '0.3.0'), false);
  assert.equal(updateLine({ state: 'downloading', version: '0.3.1', percent: 40 }), 'جارٍ تنزيل الإصدار 0.3.1 (40٪)…');
  assert.equal(updateLine({ state: 'ready', version: '0.3.1', percent: 100 }), 'الإصدار 0.3.1 جاهز، ويُثبَّت عند إنهاء التطبيق.');
  for (const state of ['idle', 'checking', 'none', 'error']) assert.match(updateLine({ state, version: null, percent: null }), /[\u0600-\u06ff]/);
});

test('D3: update is detected by its two methods; D2 has none', () => {
  const app = d2();
  assert.equal(nativeOf(app.bridge).has('update'), false);
  assert.equal(nativeOf({ ...app.bridge, bridge: 2, update: { status: async () => ({}), restart: async () => 'nothing' } }).has('update'), true);
});

// D4: files used in place, the cache folder and «مسح بيانات هذا الجهاز» (bridge version 3).
test('D4: files, cache and clearData are detected by their methods', () => {
  const v3 = {
    ...d2().bridge,
    bridge: 3,
    files: { fromDropped: async () => null, check: async () => ({ ok: false }), forget: async () => true, pick: async () => [] },
    cache: { library: async () => ({}), usage: async () => ({}), sweep: async () => ({}), clear: async () => ({}), onProgress: () => undefined },
    data: { clear: async () => ({}) },
  };
  const n = nativeOf(v3);
  for (const f of ['files', 'cache', 'clearData']) assert.equal(n.has(f), true, f);
  assert.equal(nativeOf({ ...v3, cache: { ...v3.cache, onProgress: undefined } }).has('cache'), false, 'every method of a feature');
  for (const f of ['files', 'cache', 'clearData']) assert.equal(nativeOf(d2().bridge).has(f), false, `D2 has no ${f}`);
});

test('D4: the studio names a library copy in the application\'s folder as the application does', async () => {
  const { folderName, libraryName } = await import('../src/lib/studio/cache.ts');
  const asset = '0a1b2c3d-0000-4000-8000-00000000abcd';
  assert.equal(folderName(libraryName(asset, 3)), `asset-${asset}-v3.bin`);
  const fs = await import('node:fs');
  assert.match(fs.readFileSync('desktop/src/cache-store.ts', 'utf8'), /return `asset-\$\{asset\}-v\$\{version\}\.bin`;/);
});

// D5: light copies for the preview and editable copies (bridge version 4).
test('D5: media is detected by its six methods; D4 has none', () => {
  const v4 = {
    ...d2().bridge,
    bridge: 4,
    media: { probe: async () => ({}), copies: async () => ({}), proxy: async () => ({}), convert: async () => ({}), cancel: async () => true, onProgress: () => undefined },
  };
  assert.equal(nativeOf(v4).has('media'), true);
  assert.equal(nativeOf({ ...v4, media: { ...v4.media, cancel: undefined } }).has('media'), false, 'every method of the feature');
  assert.equal(nativeOf(d2().bridge).has('media'), false);
});

test('D5: a light or converted copy keeps its own name in the folder, so the sweep spares it while it is in use', async () => {
  const { folderName, libraryName } = await import('../src/lib/studio/cache.ts');
  const asset = '0a1b2c3d-0000-4000-8000-00000000abcd';
  assert.equal(folderName(libraryName(asset, 3)), `asset-${asset}-v3.bin`);
  assert.equal(folderName(`proxy-${asset}-v3-720-r1-ff902.mp4`), `proxy-${asset}-v3-720-r1-ff902.mp4`);
  assert.equal(folderName(`asset-${asset}-v3.bin`), `asset-${asset}-v3.bin`, 'never named twice');
});

test('D5: every word the application gives for a failed copy is read by the site and said in Arabic', async () => {
  const fs = await import('node:fs');
  const site = fs.readFileSync('src/lib/studio/cache.ts', 'utf8');
  const kept = /\/\((space\|[a-z|]+)\)\\s\*\$\//.exec(site);
  assert.ok(kept, 'the site keeps the application\'s own word');
  const words = kept[1].split('|');
  const app = ['desktop/src/media-jobs.ts', 'desktop/src/media-worker.ts', 'desktop/src/native-media.ts'].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  for (const w of ['space', 'decode', 'encode', 'cancelled', 'missing', 'unavailable']) {
    assert.ok(words.includes(w), `the site reads ${w}`);
    assert.ok(app.includes(`'${w}'`), `the application says ${w}`);
  }
  const ui = fs.readFileSync('src/components/studio/source-tools.tsx', 'utf8');
  for (const w of ['space', 'decode', 'encode', 'missing', 'cancelled']) assert.match(ui, new RegExp(`case '${w}':\\s*return '[\\u0600-\\u06ff]`), `${w} in Arabic`);
  assert.ok(ui.includes('إنشاء نسخة خفيفة للمعاينة'), 'the plan\'s own words');
  assert.equal(/'(space|decode|encode|failed)'\s*}/.test(ui), false, 'no raw word shown');
});

// D6: the preview in a window of its own (bridge version 5).
test('D6: windows is detected by its three methods; D5 has none', () => {
  const v5 = { ...d2().bridge, bridge: 5, windows: { screens: async () => [], popOut: async () => ({}), close: async () => true } };
  assert.equal(nativeOf(v5).has('windows'), true);
  assert.equal(nativeOf({ ...v5, windows: { ...v5.windows, close: undefined } }).has('windows'), false);
  assert.equal(nativeOf(d2().bridge).has('windows'), false);
});

test('D6: where the editor playhead is, from its last clock', async () => {
  const { timeAt } = await import('../src/lib/studio/preview-link.ts');
  assert.equal(timeAt({ t: 2_000_000, playing: false, wall: 1000 }, 9000), 2_000_000, 'standing still');
  assert.equal(timeAt({ t: 2_000_000, playing: true, wall: 1000 }, 1500), 2_500_000, 'half a second later');
  assert.equal(timeAt({ t: 2_000_000, playing: true, wall: 1000 }, 99_000, 5_000_000), 5_000_000, 'never past the end');
  assert.equal(timeAt({ t: 0, playing: true, wall: 1000 }, 900), 0, 'never before the start');
});

test('D6: only well-formed messages are heard on the channel', async () => {
  const { readMessage } = await import('../src/lib/studio/preview-link.ts');
  assert.deepEqual(readMessage({ type: 'clock', clock: { t: 1, playing: true, wall: 2, extra: 1 } }), { type: 'clock', clock: { t: 1, playing: true, wall: 2 } });
  assert.deepEqual(readMessage({ type: 'key', key: 'toggle' }), { type: 'key', key: 'toggle' });
  for (const bad of [null, 'hello', { type: 'clock', clock: { t: 'x', playing: true, wall: 2 } }, { type: 'clock', clock: { t: 1, playing: 'yes', wall: 2 } }, { type: 'doc', doc: {} }, { type: 'key', key: 'delete' }, { type: 'bye', from: 'someone' }, { type: 'run' }]) {
    assert.equal(readMessage(bad), null, JSON.stringify(bad));
  }
});

/** Two ends of one channel, as two windows of the same address have. */
function pair() {
  // as a real channel: a message reaches only an end already listening when it was sent
  const a = { onmessage: null, posted: [], postMessage(m) { this.posted.push(m); const to = b.onmessage; queueMicrotask(() => to?.({ data: structuredClone(m) })); }, close() {} };
  const b = { onmessage: null, posted: [], postMessage(m) { this.posted.push(m); const to = a.onmessage; queueMicrotask(() => to?.({ data: structuredClone(m) })); }, close() {} };
  return [a, b];
}
const settle = () => new Promise((r) => setTimeout(r, 10));

test('D6: a preview window opened after the editor gets the project and the clock, and follows them', async () => {
  const { PreviewLeader, PreviewFollower } = await import('../src/lib/studio/preview-link.ts');
  const [lc, fc] = pair();
  const presence = [];
  const keys = [];
  const doc = { sources: [], video: { fps: 30 } };
  const leader = new PreviewLeader('p', { now: () => ({ t: 5, playing: false, wall: 1 }), onPresence: (p) => presence.push(p), onKey: (k) => keys.push(k) }, lc);
  leader.show(doc);
  assert.equal(lc.posted.filter((m) => m.type === 'doc').length, 0, 'nothing is copied while no window listens');
  const got = { docs: [], clocks: [], leader: [] };
  const follower = new PreviewFollower('p', { onDoc: (d) => got.docs.push(d), onClock: (c) => got.clocks.push(c), onLeader: (p) => got.leader.push(p) }, fc);
  await settle();
  assert.deepEqual(presence, [true]);
  assert.equal(got.docs.length, 1);
  assert.deepEqual(got.clocks.at(-1), { t: 5, playing: false, wall: 1 });
  leader.clock({ t: 7, playing: true, wall: 2 });
  follower.key('toggle');
  await settle();
  assert.deepEqual(got.clocks.at(-1), { t: 7, playing: true, wall: 2 });
  assert.deepEqual(keys, ['toggle']);
  follower.dispose();
  await settle();
  assert.deepEqual(presence, [true, false]);
  leader.dispose();
});

test('D6: a preview window opened before the editor is answered once the editor opens, and told when it closes', async () => {
  const { PreviewLeader, PreviewFollower } = await import('../src/lib/studio/preview-link.ts');
  const [lc, fc] = pair();
  const got = { docs: 0, leader: [] };
  new PreviewFollower('p', { onDoc: () => got.docs++, onClock: () => undefined, onLeader: (p) => got.leader.push(p) }, fc);
  await settle();
  const leader = new PreviewLeader('p', { now: () => ({ t: 0, playing: false, wall: 1 }) }, lc);
  leader.show({ sources: [] });
  await settle();
  assert.equal(got.docs, 1, 'the project, once');
  assert.equal(fc.posted.filter((m) => m.type === 'hello').length, 2, 'once on opening, once for the editor: no endless greeting');
  leader.dispose();
  await settle();
  assert.equal(got.leader.at(-1), false);
});

test('D6: a studio panel window is its own address, and only that address leaves out the site frame', async () => {
  const { isPanelWindow } = await import('../src/lib/studio/preview-link.ts');
  const id = '0a1b2c3d-0000-4000-8000-00000000abcd';
  assert.equal(isPanelWindow(`/motion/studio/${id}/preview`), true);
  for (const p of [`/motion/studio/${id}`, '/motion/studio', `/motion/studio/${id}/preview/x`, `/motion/studio/not-an-id/preview`, '/', null]) assert.equal(isPanelWindow(p), false, String(p));
  const fs = await import('node:fs');
  const app = fs.readFileSync('desktop/src/windows.ts', 'utf8');
  assert.ok(app.includes('return `${origin}/motion/studio/${project}/${panel}`;'), 'the application opens exactly that address');
});

// A1: the Android application as the site sees it (Android_Build_Plan.md A1; MVP_draft.md 64).
const a1 = Object.freeze({ platform: 'android', shell: 'capacitor', version: '0.1.0', bridge: 1 });

test('A1: the Android shell is read, and offers nothing until its methods are there', () => {
  const n = nativeOf(a1);
  assert.equal(n.platform, 'android');
  assert.equal(n.version, '0.1.0');
  for (const f of Object.keys(FEATURES)) assert.equal(n.has(f), false, `bare Android shell has no ${f}`);
  const full = {
    ...a1,
    appUpdate: { status: async () => ({}), start: async () => 'started' },
    download: { save: async () => true, open: async () => true },
    share: { file: async () => true },
    push: { state: async () => 'prompt', request: async () => 'granted', token: async () => null, onOpen: () => undefined, onReceive: () => undefined },
    links: { verified: async () => true },
    lock: { state: async () => ({ available: true, on: false }), set: async () => true },
    capture: { take: async () => null },
    incoming: { take: async () => [] },
    upload: { start: async () => 'u1', status: async () => ({}), cancel: async () => true },
  };
  const all = nativeOf(full);
  for (const f of ['appUpdate', 'download', 'share', 'push', 'links', 'lock', 'capture', 'incoming', 'upload']) assert.equal(all.has(f), true, f);
  for (const f of ['notify', 'update', 'files', 'media', 'windows']) assert.equal(all.has(f), false, `the desktop feature ${f} is not the phone's`);
  assert.equal(nativeOf({ ...full, push: { ...full.push, onReceive: undefined } }).has('push'), false, 'every method of a feature');
  assert.equal(nativeOf(d2().bridge).has('appUpdate'), false, 'the desktop offers none of them');
});

test('A1: each application has its own floor, and a browser none', async () => {
  const { tooOld, MINIMUM_DESKTOP, MINIMUM_ANDROID } = await import('../src/lib/native/releases.ts');
  assert.equal(MINIMUM_ANDROID, '0.1.0');
  assert.equal(tooOld('0.1.0'), true, 'the desktop when no platform is named, as before');
  assert.equal(tooOld('0.1.0', 'android'), false, 'the first Android release is enough');
  assert.equal(tooOld('0.0.9', 'android'), true);
  assert.equal(tooOld(MINIMUM_DESKTOP, 'desktop'), false);
  assert.equal(tooOld('0.0.1', 'web'), false);
  assert.equal(tooOld('0.0.1', 'ios'), false, 'no iPhone application yet');
});

const apk = {
  version: '0.2.0',
  code: 200,
  file: 'CommsHub-0.2.0.apk',
  size: 9_876_543,
  sha256: 'a'.repeat(64),
  minimum: '0.1.0',
  notes: ['إشعارات «يحتاج قرارك» على شاشة القفل.', '  '],
  date: '2026-11-01T08:00:00.000Z',
};

test('A1: latest.json of the Android application, and nothing else', async () => {
  const { parseAndroidLatest, apkDownloadUrl, ANDROID_FEED } = await import('../src/lib/native/releases.ts');
  const r = parseAndroidLatest(JSON.stringify(apk));
  assert.deepEqual(r, { ...apk, notes: ['إشعارات «يحتاج قرارك» على شاشة القفل.'] });
  assert.equal(apkDownloadUrl(r), `${ANDROID_FEED}/CommsHub-0.2.0.apk`);
  assert.equal(parseAndroidLatest(JSON.stringify({ ...apk, minimum: undefined, notes: undefined, date: 'soon' })).minimum, null);
  const bad = [
    '',
    'not json',
    '[]',
    JSON.stringify({ ...apk, version: 'latest' }),
    JSON.stringify({ ...apk, code: 0 }),
    JSON.stringify({ ...apk, code: 1.5 }),
    JSON.stringify({ ...apk, file: '../evil.apk' }),
    JSON.stringify({ ...apk, file: 'https://example.com/x.apk' }),
    JSON.stringify({ ...apk, file: 'CommsHub.exe' }),
    JSON.stringify({ ...apk, size: 0 }),
    JSON.stringify({ ...apk, size: 400_000_000 }),
    JSON.stringify({ ...apk, sha256: 'A'.repeat(64) }),
    JSON.stringify({ ...apk, sha256: 'abc' }),
    JSON.stringify({ ...apk, minimum: 'any' }),
    'x'.repeat(30000),
  ];
  for (const b of bad) assert.equal(parseAndroidLatest(b), null, b.slice(0, 60));
  assert.equal(parseAndroidLatest(JSON.stringify({ ...apk, notes: Array(12).fill('سطر') })).notes.length, 8, 'at most eight lines');
});

test('A1: an Android application must update when older than the site needs or than the floor of the newest release', async () => {
  const { apkMustUpdate, parseAndroidLatest } = await import('../src/lib/native/releases.ts');
  const r = parseAndroidLatest(JSON.stringify({ ...apk, minimum: '0.1.5' }));
  assert.equal(apkMustUpdate('0.1.4', r), true, 'below the floor of the newest release');
  assert.equal(apkMustUpdate('0.1.5', r), false);
  assert.equal(apkMustUpdate('0.0.9', null), true, 'below the floor of the site itself, feed or not');
  assert.equal(apkMustUpdate(null, r), false, 'a browser');
});

test('A1 and the desktop: a link mailed from the sign-in screen comes back only where it can be used', async () => {
  const { mailReturn, BROWSER_ONLY } = await import('../src/lib/native/entry.ts');
  const o = 'https://comms-hub-three.vercel.app';
  assert.deepEqual(mailReturn('web', false, o), { to: `${o}/` }, 'a browser: as before');
  assert.deepEqual(mailReturn('desktop', false, o), { browser: true }, 'the desktop sends it to the system browser, which has no part of the request');
  assert.deepEqual(mailReturn('android', false, o), { browser: true }, 'before its links are verified');
  assert.deepEqual(mailReturn('android', true, o), { to: `${o}/app/return` });
  assert.deepEqual(mailReturn('ios', true, o), { browser: true });
  assert.match(BROWSER_ONLY, /^يكتمل هذا من المتصفح/);
});

test('A1: /app/return forwards to the root with the same query, and nowhere else', async () => {
  const { GET } = await import('../src/app/app/return/route.ts');
  const at = (url) => GET(new Request(url));
  const one = at('https://comms-hub-three.vercel.app/app/return?code=abc&type=recovery');
  assert.equal(one.status, 303);
  assert.equal(one.headers.get('location'), '/?code=abc&type=recovery');
  assert.equal(at('https://comms-hub-three.vercel.app/app/return').headers.get('location'), '/');
  assert.equal(at('https://comms-hub-three.vercel.app/app/return?next=//evil.example').headers.get('location'), '/?next=//evil.example', 'a query, never a place to go');
  assert.equal(one.headers.get('cache-control'), 'no-store');
});

test('A1: the sign-in screen asks where a mailed link returns, for every link it mails', async () => {
  const fs = await import('node:fs');
  const gate = fs.readFileSync('src/components/auth-gate.tsx', 'utf8');
  assert.equal(gate.includes('`${window.location.origin}/`,'), false, 'no fixed return address left in a request');
  assert.equal((gate.match(/emailRedirectTo: returnTo\(\)/g) ?? []).length, 2, 'first sign-in and the confirmation sent again');
  assert.equal((gate.match(/\bredirectTo: returnTo\(\)/g) ?? []).length, 1, 'and the password reset');
  assert.equal((gate.match(/if \(browserOnly\) return fail\(BROWSER_ONLY\);/g) ?? []).length, 3, 'nothing is mailed from an application that cannot receive it');
});

test('A1: «معلومات الجهاز» names the Android application as its own', () => {
  const lines = deviceLines({ app: '0.1.0', appKind: 'android', cores: 8, cpu: null, memory: null, memoryAtLeast: false, freeDisk: null, gpu: null, chips: [], software: false, hardwareEncoder: null });
  assert.equal(lines[0].value, 'تطبيق الهاتف، الإصدار 0.1.0');
  assert.equal(deviceLines({ ...factsFromApp(laptopInfo) })[0].value, 'تطبيق سطح المكتب، الإصدار 0.2.0', 'the desktop unchanged');
});

// A3: the Android application's update as the site shows it (src/lib/native/app-update.ts).
const status = (over = {}) => ({ state: 'idle', percent: null, version: null, why: null, current: '0.1.0', feed: JSON.stringify(apk), installAllowed: true, ...over });

test('A3: the application\'s report is read only in its shape', async () => {
  const { readApkStatus } = await import('../src/lib/native/app-update.ts');
  assert.deepEqual(readApkStatus(status()), status());
  assert.equal(readApkStatus(status({ percent: 140 })).percent, 100);
  assert.equal(readApkStatus(status({ why: 'Some <b>raw</b> text' })).why, null, 'a reason is one of the application\'s words');
  assert.equal(readApkStatus(status({ feed: 'x'.repeat(30000) })).feed, null);
  for (const bad of [null, 'idle', status({ state: 'done' }), status({ current: 'latest' })]) assert.equal(readApkStatus(bad), null, JSON.stringify(bad));
});

test('A3: which window: required first, then what changed, then a newer release once a day after «لاحقاً»', async () => {
  const { apkWindow, LATER_MS } = await import('../src/lib/native/app-update.ts');
  const now = Date.parse('2026-11-02T08:00:00Z');
  const newer = status();
  assert.equal(apkWindow({ status: null, now, later: null, seen: '0.1.0' }).kind, 'none', 'a browser');
  assert.equal(apkWindow({ status: newer, now, later: null, seen: '0.1.0' }).kind, 'optional');
  assert.equal(apkWindow({ status: newer, now, later: { version: '0.2.0', until: now + 1000 }, seen: '0.1.0' }).kind, 'none', 'put off');
  assert.equal(apkWindow({ status: newer, now: now + LATER_MS, later: { version: '0.2.0', until: now + 1000 }, seen: '0.1.0' }).kind, 'optional', 'a day later');
  assert.equal(apkWindow({ status: newer, now, later: { version: '0.1.9', until: now + 1000 }, seen: '0.1.0' }).kind, 'optional', '«لاحقاً» was for another release');
  const floor = status({ feed: JSON.stringify({ ...apk, minimum: '0.1.5' }) });
  const req = apkWindow({ status: floor, now, later: { version: '0.2.0', until: now + 1000 }, seen: '0.1.0' });
  assert.equal(req.kind, 'required', 'the floor overrides «لاحقاً»');
  assert.equal(req.release.version, '0.2.0');
  assert.deepEqual(apkWindow({ status: status({ current: '0.0.9', feed: null }), now, later: null, seen: '0.0.9' }), { kind: 'required', release: null }, 'too old for the site, feed or not');
  const after = status({ current: '0.2.0' });
  assert.deepEqual(apkWindow({ status: after, now, later: null, seen: '0.1.0' }), { kind: 'whatsNew', version: '0.2.0', notes: ['إشعارات «يحتاج قرارك» على شاشة القفل.'] });
  assert.equal(apkWindow({ status: after, now, later: null, seen: '0.2.0' }).kind, 'none', 'said once');
  assert.equal(apkWindow({ status: after, now, later: null, seen: null }).kind, 'none', 'never at the first opening after installing');
  assert.equal(apkWindow({ status: status({ feed: 'broken' }), now, later: null, seen: '0.1.0' }).kind, 'none');
});

test('A3: the update said in Arabic, and every word the application gives for a stop is read', async () => {
  const { apkLine, apkWhy, apkStartAnswer } = await import('../src/lib/native/app-update.ts');
  assert.equal(apkLine(status({ state: 'downloading', version: '0.2.0', percent: 40 })), 'جارٍ تنزيل الإصدار 0.2.0 (40٪)…');
  assert.equal(apkLine(status()), null);
  for (const s of ['verifying', 'installing']) assert.match(apkLine(status({ state: s })), /[؀-ۿ]/);
  const fs = await import('node:fs');
  const app = fs.readFileSync('mobile/android/app/src/main/java/sa/commshub/app/AppUpdate.java', 'utf8');
  const words = [...app.matchAll(/fail\("([a-z]+)"\)/g)].map((m) => m[1]);
  assert.ok(words.length >= 5);
  const fallback = apkWhy('anything');
  for (const w of new Set([...words, 'cancelled', 'install'])) {
    assert.match(apkWhy(w), /[؀-ۿ]/, w);
    if (w !== 'install') assert.notEqual(apkWhy(w), fallback, `${w} has its own sentence`);
  }
  assert.equal(apkStartAnswer('started'), null);
  for (const r of ['permission', 'busy', 'refused', 'odd']) assert.match(apkStartAnswer(r), /[؀-ۿ]/);
});

test('A3: the site\'s feed is the application\'s, and the bucket is public, read-only and small', async () => {
  const fs = await import('node:fs');
  const { ANDROID_FEED } = await import('../src/lib/native/releases.ts');
  assert.ok(fs.readFileSync('mobile/android/app/build.gradle', 'utf8').includes(`def productionFeed = '${ANDROID_FEED}'`));
  const sql = fs.readFileSync('supabase/migrations/20261026120000_android_releases.sql', 'utf8');
  assert.match(sql, /'android-releases',\s*'android-releases',\s*true,/);
  assert.match(sql, /157286400/);
  assert.doesNotMatch(sql, /create policy/i, 'nobody writes through the site');
  assert.ok(ANDROID_FEED.endsWith('/android-releases/android'));
});

test('A1: no emoji in the new files', async () => {
  const fs = await import('node:fs');
  for (const f of ['src/lib/native/entry.ts', 'src/app/app/return/route.ts', 'src/components/auth-gate.tsx', 'src/components/native/use-native.ts', 'src/lib/native/app-update.ts', 'src/components/native/phone-app.tsx']) {
    assert.equal(/\p{Extended_Pictographic}/u.test(fs.readFileSync(f, 'utf8')), false, f);
  }
});

// --- A4: the site's files on the phone (MVP_draft.md 64.2) ---------------------------------------------------

const FID = '3f2b8c1e-0a4d-4c6b-9e7f-1a2b3c4d5e6f';

test('A4: the site file routes are the application\'s, rule for rule', async () => {
  const fs = await import('node:fs');
  const { FILE_ROUTES } = await import('../src/lib/native/files.ts');
  const java = fs.readFileSync('mobile/android/app/src/main/java/sa/commshub/app/SiteFiles.java', 'utf8');
  const id = /private static final String ID = "([^"]+)";/.exec(java)[1];
  const block = /static final String\[\] ROUTES = \{([\s\S]*?)\};/.exec(java)[1];
  const routes = block
    .split(/,\s*\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/" \+ ID \+ "/g, id).replace(/^"|"$/g, '').replace(/\\\\/g, '\\'));
  assert.deepEqual(routes, [...FILE_ROUTES]);
});

test('A4: which paths a page may name, and the paths the pages build', async () => {
  const { fileAt, filePath } = await import('../src/lib/native/files.ts');
  for (const ok of [fileAt.media(FID), fileAt.media(FID, 3), fileAt.media(FID, undefined, true), fileAt.media(FID, 12, true), fileAt.chat(FID), fileAt.mail(FID), fileAt.inbound(FID, 0), fileAt.inbound(FID, 12)]) {
    assert.equal(filePath(ok), ok, ok);
  }
  assert.equal(fileAt.media(FID, 12, true), `/api/media/${FID}/content?v=12&download=1`);
  for (const no of [null, 3, '', '/', '/privacy.html', `/api/media/${FID}/content?v=0`, `/api/media/${FID}/content?download=1&v=3`, `/api/media/${FID}/content?v=3&x=1`, `/api/media/${FID}/../../health`, `/api/chat/file/${FID}/x`, `/api/mail/inbound/${FID}/123`, `//evil.example/api/chat/file/${FID}`, `https://comms-hub-three.vercel.app/api/chat/file/${FID}`, `api/chat/file/${FID}`, `/api/chat/file/${FID}\n`, `/api/chat/file/not-an-id`]) {
    assert.equal(filePath(no), null, String(no));
  }
});

test('A4: what the phone offers, in order, and nothing in a browser or on the desktop', async () => {
  const { phoneActions, showsInPage } = await import('../src/lib/native/files.ts');
  const both = (f) => f === 'download' || f === 'share';
  assert.deepEqual(phoneActions(both, false), ['open', 'save', 'share']);
  assert.deepEqual(phoneActions(both, true), ['save', 'share'], 'pictures, video and sound show in the page');
  assert.deepEqual(phoneActions((f) => f === 'download', false), ['open', 'save']);
  assert.deepEqual(phoneActions(() => false, false), []);
  assert.deepEqual(phoneActions((f) => nativeOf(d2().bridge).has(f), false), [], 'the desktop application offers none');
  for (const m of ['image/png', 'video/mp4', 'audio/webm', 'IMAGE/JPEG']) assert.equal(showsInPage(m), true, m);
  for (const m of ['application/pdf', 'text/plain', '', null, undefined]) assert.equal(showsInPage(m), false, String(m));
});

test('A4: opening asks for the file as shown; saving and sharing for the download, which the library records', async () => {
  const { askFor } = await import('../src/lib/native/files.ts');
  const f = { name: 'تقرير الربع.pdf', path: `/api/media/${FID}/content?v=2`, downloadPath: `/api/media/${FID}/content?download=1` };
  assert.deepEqual(askFor('open', f), { path: f.path, name: f.name });
  assert.deepEqual(askFor('save', f), { path: f.downloadPath, name: f.name });
  assert.deepEqual(askFor('share', f), { path: f.downloadPath, name: f.name });
  assert.deepEqual(askFor('save', { name: '', path: `/api/chat/file/${FID}` }), { path: `/api/chat/file/${FID}`, name: 'ملف' });
  assert.equal(askFor('save', { name: 'x', path: 'https://evil.example/x' }), null);
  assert.equal(askFor('open', { name: 'a\u0000b\nc', path: `/api/mail/file/${FID}` }).name, 'abc');
});

test('A4: the page asks the application with the path and name only, and a refusal is a plain false', async () => {
  const { onPhone } = await import('../src/lib/native/files.ts');
  const asked = [];
  const bridge = {
    ...a1,
    bridge: 3,
    download: { save: async (x) => (asked.push(['save', x]), true), open: async (x) => (asked.push(['open', x]), true) },
    share: { file: async (x) => (asked.push(['share', x]), false) },
  };
  inWindow(bridge);
  const file = { name: 'صورة.png', path: `/api/chat/file/${FID}` };
  assert.equal(await onPhone('open', file), true);
  assert.equal(await onPhone('save', file), true);
  assert.equal(await onPhone('share', file), false, 'the person put the share sheet off');
  assert.deepEqual(asked, [['open', { path: file.path, name: file.name }], ['save', { path: file.path, name: file.name }], ['share', { path: file.path, name: file.name }]]);
  assert.equal(await onPhone('save', { name: 'x', path: '/privacy.html' }), false, 'never asked');
  assert.equal(asked.length, 3);
  inWindow({ ...bridge, download: { save: async () => { throw new Error('refused'); }, open: async () => true } });
  assert.equal(await onPhone('save', file), false);
  inWindow(undefined);
  assert.equal(await onPhone('save', file), false, 'a browser');
});

test('A4: the asset page, mail attachments and files in «المراسلة» offer the phone\'s actions', async () => {
  const fs = await import('node:fs');
  const asset = fs.readFileSync('src/components/media/asset-page.tsx', 'utf8');
  assert.match(asset, /<PhoneFileButtons\s+file=\{\{ name: asset\.name, path: fileAt\.media\(asset\.id, asset\.current_version\), downloadPath: fileAt\.media\(asset\.id, undefined, true\) \}\}/);
  assert.match(asset, /only=\{\['open'\]\}/, 'an earlier version is only opened');
  assert.match(asset, /fallback=\{\s*<a className="button" href=\{`\/api\/media\/\$\{asset\.id\}\/content\?download=1`\}>/, 'a browser keeps «تنزيل»');
  const mail = fs.readFileSync('src/components/mail/thread.tsx', 'utf8');
  assert.match(mail, /<PhoneFileLink key=\{id\} className="ml-att" file=\{\{ name: f\?\.name \?\? 'مرفق', path: fileAt\.mail\(id\) \}\}>/);
  assert.match(mail, /<PhoneFileLink key=\{i\} className="ml-att" file=\{\{ name: f\.name, path: fileAt\.inbound\(x\.id, i\) \}\}>/);
  const chat = fs.readFileSync('src/components/chat/chat-tab.tsx', 'utf8');
  assert.match(chat, /<PhoneFileLink className="b-file" file=\{\{ name: String\(d\.name \?\? 'ملف'\), path: fileAt\.chat\(String\(d\.file\)\) \}\}>/);
  assert.match(chat, /<PhoneFileButtons small inPage file=/, 'a picture in its window');
  const sheet = fs.readFileSync('src/components/native/phone-file.tsx', 'utf8');
  assert.match(sheet, /if \(!actions\.length \|\| !native\(\)\.has\('download'\)\) return;\s*e\.preventDefault\(\);/, 'a browser follows the link as before');
  for (const f of ['src/lib/native/files.ts', 'src/components/native/phone-file.tsx']) assert.equal(/\p{Extended_Pictographic}/u.test(fs.readFileSync(f, 'utf8')), false, f);
});

