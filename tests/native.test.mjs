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
