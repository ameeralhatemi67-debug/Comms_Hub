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
  for (const f of ['src/lib/native/index.ts', 'src/lib/native/notices.ts', 'src/lib/native/device.ts', 'src/components/native/device-info.tsx']) {
    assert.equal(/\p{Extended_Pictographic}/u.test(fs.readFileSync(f, 'utf8')), false, f);
  }
});
