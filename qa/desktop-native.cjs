// Application check of the desktop application's native layer (Desktop_App_Plan.md phase D2; DT-07 of
// section 12; MVP_draft.md 63). It drives the development package (desktop/dist/dev) with Playwright's
// Electron support on a fixture page at 127.0.0.1:3000, the local site's address on its compiled list.
//
// Part 1, the bridge, version 1: its shape; «معلومات الجهاز»'s facts; the laptop kept awake and let go;
// a hold that only its own window can release and that ends with its document; every refused request;
// a busy window not slowed, hidden instead of closed, and a question before quitting;
// native notices only for someone not looking, and a click that brings the window back and opens the
// page; the taskbar count; closing that quits, and «إبقاء التطبيق في شريط المهام».
// Part 2, DT-07: the site's real notifications hook (src/components/notices.tsx) on the fixture, with a
// stand-in list: the first read raises nothing; a new «يحتاج قرارك» item raises a native notice and the
// count while the window is minimised; a click opens the work.
// Part 3, with nothing attached: Playwright keeps every page visible and unthrottled, so what a minimised
// window really does is measured on a plainly started application (qa/desktop-helpers.cjs): an idle
// minimised window is slowed like a browser tab, a busy one is not, and the notifications hook still
// reads its list once a minute while the window is minimised.
//
// Native notices are recorded inside the main process, not shown; dialogs answer as the check says; the
// system's sleep blocker is real and recorded on its way (qa/desktop-helpers.cjs). Nothing signs in.
// Usage: node qa/desktop-native.cjs   (writes qa/desktop-native.json)   Needs: npm run pack:dev in desktop/.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const h = require('./desktop-helpers.cjs');

const { check, note, result, finish } = h.record('qa/desktop-native.cjs');
const out = path.join(__dirname, 'artifacts', 'desktop-native');
const BASE = 'http://127.0.0.1:3000';
const NOTE = 'إشعارات تحتاج قرارك';

const page = (title, body) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
const bridgePage = page(
  'فحص الجسر',
  `<h1>فحص الجسر</h1><a id="second" href="/second">الثانية</a>
  <script>
    window.ticks = 0;
    window.startTicks = () => { window.ticks = 0; clearInterval(window.__t); window.__t = setInterval(() => window.ticks++, 100); };
    window.stopTicks = () => { clearInterval(window.__t); return window.ticks; };
  </script>`,
);
const noticesPage = (rows) => page('فحص الإشعارات', `<div id="root"></div><script>window.__noticeRows = ${JSON.stringify(rows)};</script><script type="module" src="/notices.js"></script>`);

const plainBridgePage = page(
  'فحص الخلفية',
  `<h1>فحص الخلفية</h1>${h.commandLoop(`{
    start: () => { window.ticks = 0; clearInterval(window.__t); window.__t = setInterval(() => window.ticks++, 100); return true; },
    stop: () => { clearInterval(window.__t); return { ticks: window.ticks, visibility: document.visibilityState }; },
    busy: () => window.commsHubNative.life.busy('export'),
    idle: () => window.commsHubNative.life.idle(),
  }`)}`,
);
const plainRows = [{ id: 'p1', tier: 'decide', body: 'اعتماد العمل CH-301', go: { page: 'review', id: 'CH-301' }, created_at: '2026-10-20T10:00:00Z', read_at: null }];
const plainNoticesPage = page(
  'فحص الإشعارات',
  `<div id="root"></div>${h.commandLoop(`{
    add: () => { window.__noticeRows.push({ id: 'p' + (window.__noticeRows.length + 1), tier: 'decide', body: 'اعتماد عمل جديد', go: { page: 'review', id: 'CH-302' }, created_at: new Date().toISOString(), read_at: null }); return window.__noticeRows.length; },
  }`)}<script>window.__noticeRows = ${JSON.stringify(plainRows)};</script><script type="module" src="/notices.js"></script>`,
);

async function bundleNotices() {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'fixtures', 'desktop-notices.tsx')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    outfile: path.join(out, 'notices.js'),
    alias: {
      'next/navigation': path.join(__dirname, 'fixtures', 'fake-next.tsx'),
      'next/link': path.join(__dirname, 'fixtures', 'fake-next.tsx'),
      '@/lib/supabase/client': path.join(__dirname, 'fixtures', 'fake-notices.ts'),
    },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
    absWorkingDir: h.root,
  });
  return fs.readFileSync(path.join(out, 'notices.js'), 'utf8');
}

const call = (win, expr, arg) => win.evaluate(new Function('arg', `return (async () => { try { return { ok: await (${expr}) }; } catch (e) { return { error: String(e && e.message || e) }; } })();`), arg);
const refusedErr = (r) => !!r.error && /refused/.test(r.error);

async function partOne(state) {
  let { app, win, mainId, inMain } = await h.launchDev('bridge');
  await h.instrument(app);
  await h.until(() => win.url() === `${BASE}/`, 20000);
  await win.waitForLoadState('load');
  const rec = () => h.recorded(app);

  // 1. The shape of version 1.
  const shape = await win.evaluate(() => {
    const n = window.commsHubNative;
    return {
      keys: Object.keys(n),
      fields: { platform: n.platform, shell: n.shell, version: n.version, bridge: n.bridge },
      groups: { power: Object.keys(n.power), life: Object.keys(n.life), notify: Object.keys(n.notify), update: Object.keys(n.update), files: Object.keys(n.files), cache: Object.keys(n.cache), data: Object.keys(n.data), windows: Object.keys(n.windows), media: Object.keys(n.media), gpu: Object.keys(n.gpu), profile: Object.keys(n.profile) },
      frozen: [n, n.power, n.life, n.notify, n.update, n.files, n.cache, n.data, n.windows, n.media, n.gpu, n.profile].every((o) => Object.isFrozen(o)),
      fns: [n.info, n.power.keepAwake, n.power.release, n.life.busy, n.life.idle, n.notify.show, n.notify.badge, n.notify.onOpen].every((f) => typeof f === 'function'),
    };
  });
  check(
    'the bridge is version 7: who the application is, then info, power, life (with activity), notify, update, files, cache, data, windows, media (with the queue), gpu and profile',
    JSON.stringify(shape.keys) === JSON.stringify(['platform', 'shell', 'version', 'bridge', 'info', 'power', 'life', 'notify', 'update', 'files', 'cache', 'data', 'windows', 'media', 'gpu', 'profile']) &&
      JSON.stringify(shape.fields) === JSON.stringify({ platform: 'desktop', shell: 'electron', version: h.pkg.version, bridge: 7 }) &&
      JSON.stringify(shape.groups) === JSON.stringify({ power: ['keepAwake', 'release'], life: ['busy', 'idle', 'activity'], notify: ['show', 'badge', 'onOpen'], update: ['status', 'restart'], files: ['pick', 'fromDropped', 'check', 'forget'], cache: ['library', 'cancel', 'has', 'usage', 'choose', 'useDefault', 'limit', 'sweep', 'clear', 'onProgress'], data: ['clear'], windows: ['screens', 'popOut', 'close'], media: ['probe', 'copies', 'proxy', 'convert', 'cancel', 'onProgress', 'queue', 'queued', 'onQueue'], gpu: ['state', 'choose', 'restart'], profile: ['read', 'save'] }) &&
      shape.fns,
    shape,
  );
  check('the bridge and each of its groups cannot be changed by the page', shape.frozen, shape);

  // 2. «معلومات الجهاز».
  const info = await call(win, 'window.commsHubNative.info()');
  const i = info.ok || {};
  state.info = i;
  check('info names the version, processor, memory, free disk and the chip in use, and no path', i.version === h.pkg.version && i.cores > 0 && i.memory > 1e9 && i.freeDisk > 0 && i.gpu && i.gpu.chips.length > 0 && i.gpu.chips.filter((c) => c.active).length <= 1 && !JSON.stringify(i).includes('\\'), i);

  // 3. The laptop kept awake, and let go.
  const hold = await call(win, 'window.commsHubNative.power.keepAwake("export")');
  let r = await rec();
  const blocker = r.blockers[r.blockers.length - 1];
  const started = blocker && (await app.evaluate(({ powerSaveBlocker }, id) => powerSaveBlocker.isStarted(id), blocker.id));
  check('keepAwake starts the system\'s blocker that keeps the laptop from sleeping (screen may sleep)', Number.isInteger(hold.ok) && blocker && blocker.type === 'prevent-app-suspension' && started === true, { hold, blocker, started });
  const childEvent = app.waitForEvent('window');
  await win.evaluate(() => void window.open('/second'));
  const child = await childEvent;
  await child.waitForLoadState('load');
  const foreignRelease = await call(child, 'window.commsHubNative.power.release(arg)', hold.ok);
  const stillOn = await app.evaluate(({ powerSaveBlocker }, id) => powerSaveBlocker.isStarted(id), blocker.id);
  check('another window cannot release a hold it did not take', foreignRelease.ok === false && stillOn === true, { foreignRelease, stillOn });
  await child.close();
  const released = await call(win, 'window.commsHubNative.power.release(arg)', hold.ok);
  const again = await call(win, 'window.commsHubNative.power.release(arg)', hold.ok);
  const stopped = await app.evaluate(({ powerSaveBlocker }, id) => powerSaveBlocker.isStarted(id), blocker.id);
  check('release lets the laptop sleep again, once', released.ok === true && again.ok === false && stopped === false, { released, again, stopped });
  const hold2 = await call(win, 'window.commsHubNative.power.keepAwake("upload")');
  r = await rec();
  const b2 = r.blockers[r.blockers.length - 1];
  await win.reload();
  await win.waitForLoadState('load');
  const afterReload = await h.until(async () => (await rec()).blockers.find((b) => b.id === b2.id && b.stopped), 5000);
  check('a hold ends with its document: loading the page again lets the laptop sleep', Number.isInteger(hold2.ok) && !!afterReload, { hold2, b2 });

  // 4. Every request outside the rules is refused.
  const bad = {
    reason: await call(win, 'window.commsHubNative.power.keepAwake("render")'),
    id: await call(win, 'window.commsHubNative.power.release("1")'),
    busy: await call(win, 'window.commsHubNative.life.busy("")'),
    foreignLink: await call(win, 'window.commsHubNative.notify.show({ title: "x", go: "https://example.com/" })'),
    schemeLink: await call(win, 'window.commsHubNative.notify.show({ title: "x", go: "//example.com/" })'),
    long: await call(win, 'window.commsHubNative.notify.show({ title: "x".repeat(121) })'),
    noTitle: await call(win, 'window.commsHubNative.notify.show({ body: "x" })'),
    badge: await call(win, 'window.commsHubNative.notify.badge(-1)'),
  };
  check('a request outside the rules is refused by the main process (reason, hold, link, length, count)', Object.values(bad).every(refusedErr), bad);
  r = await rec();
  check('a refused request starts nothing and shows nothing', r.blockers.filter((b) => !b.stopped).length === 0 && r.notes.length === 0, r);

  // 5. Busy: the window is never throttled (measured for real in part 3).
  const busy = await call(win, 'window.commsHubNative.life.busy("export")');
  const throttlingBusy = await inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).webContents.getBackgroundThrottling());
  check('busy turns the window\'s background throttling off', busy.ok === true && throttlingBusy === false, { busy, throttlingBusy });
  r = await rec();
  check('the tray says what runs', r.tips.some((t) => t.startsWith('مركز الاتصال المؤسسي: جارٍ التصدير')), r.tips);

  // 6. Closing a busy window hides it; the tray brings it back.
  await inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).close());
  await h.sleep(500);
  const hidden = await inMain(({ BrowserWindow }, [id]) => {
    const w = BrowserWindow.fromId(id);
    return w ? { exists: true, visible: w.isVisible() } : { exists: false };
  });
  r = await rec();
  check('closing the window during an export hides it, and the work goes on', hidden.exists && hidden.visible === false, hidden);
  check('a notice says the export goes on (once)', r.notes.length === 1 && r.notes[0].title === 'التصدير مستمر', r.notes);
  await app.evaluate(() => globalThis.__tray.emit('click'));
  const back = await h.until(() => inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).isVisible()), 3000);
  check('the tray icon brings the window back', back === true, String(back));

  // 7. Quitting during an export asks first; «متابعة التصدير» keeps it.
  await app.evaluate(({ app: a }) => {
    globalThis.__answer = 0;
    a.quit();
  });
  await h.sleep(800);
  r = await rec();
  const alive = await inMain(({ BrowserWindow }, [id]) => !!BrowserWindow.fromId(id));
  const q = r.dialogs[0];
  check('quitting during an export asks first, in Arabic, and the first answer keeps working', q && q.message === 'يجري تصدير الآن.' && JSON.stringify(q.buttons) === JSON.stringify(['متابعة التصدير', 'إنهاء وإيقاف التصدير']) && q.defaultId === 0 && q.cancelId === 0 && alive, { q, alive });

  // 8. Idle again: throttled again.
  const idle = await call(win, 'window.commsHubNative.life.idle()');
  const throttlingIdle = await inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).webContents.getBackgroundThrottling());
  check('idle gives the window back its ordinary pace', idle.ok === true && throttlingIdle === true, { idle, throttlingIdle });

  // 9. Native notices: for someone not looking; a click brings the window back and opens the page.
  const notesBefore = (await rec()).notes.length;
  await inMain(({ BrowserWindow }, [id]) => {
    const w = BrowserWindow.fromId(id);
    w.show();
    w.focus();
  });
  const focused = await h.until(() => inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).isFocused()), 3000);
  if (focused) {
    const inFront = await call(win, 'window.commsHubNative.notify.show({ title: "انتهى التصدير", body: "a.mp4" })');
    check('a notice for a window in front is not shown (the page already says it)', inFront.ok === false && (await rec()).notes.length === notesBefore, inFront);
  } else {
    note('Windows did not give the window focus during the check, so the in-front case was not observed.');
  }
  await win.evaluate(() => {
    window.__went = [];
    window.commsHubNative.notify.onOpen((go) => window.__went.push(go));
  });
  await inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).minimize());
  await h.sleep(300);
  const shown = await call(win, 'window.commsHubNative.notify.show({ title: "يحتاج قرارك", body: "اعتماد CH-101", go: "/work/CH-101?tab=review" })');
  r = await rec();
  const last = r.notes[r.notes.length - 1];
  check('a notice for a minimised window is shown, with its title and text', shown.ok === true && last && last.title === 'يحتاج قرارك' && last.body === 'اعتماد CH-101', { shown, last });
  await app.evaluate(() => globalThis.__notes[globalThis.__notes.length - 1].emit('click'));
  const opened = await h.until(async () => {
    const st = await inMain(({ BrowserWindow }, [id]) => {
      const w = BrowserWindow.fromId(id);
      return { visible: w.isVisible(), minimized: w.isMinimized() };
    });
    const went = await win.evaluate(() => window.__went.slice());
    return st.visible && !st.minimized && went.length ? { ...st, went } : null;
  }, 5000);
  check('clicking the notice brings the window back and hands the page where to go', opened && opened.went[0] === '/work/CH-101?tab=review', opened);
  await win.reload();
  await win.waitForLoadState('load');
  await inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).minimize());
  await h.sleep(300);
  await call(win, 'window.commsHubNative.notify.show({ title: "يحتاج قرارك", body: "x", go: "/second" })');
  await app.evaluate(() => globalThis.__notes[globalThis.__notes.length - 1].emit('click'));
  const moved = await h.until(() => win.url() === `${BASE}/second`, 5000);
  check('a page that said nothing is moved to the notice\'s address itself', moved === true, win.url());

  // 10. The taskbar count.
  const before = (await rec()).overlays.length;
  await call(win, 'window.commsHubNative.notify.badge(3)');
  await call(win, 'window.commsHubNative.notify.badge(12)');
  await call(win, 'window.commsHubNative.notify.badge(0)');
  r = await rec();
  const ov = r.overlays.slice(before);
  check(
    'the taskbar shows the count (16 and 32 pixels), says it for screen readers, and clears at zero',
    ov.length === 3 && JSON.stringify(ov[0].factors) === '[1,2]' && JSON.stringify(ov[0].bytes) === JSON.stringify([16 * 16 * 4, 32 * 32 * 4]) && ov[0].description === `${NOTE}: 3` && ov[1].description === `${NOTE}: 12` && ov[2].empty === true,
    ov,
  );
  check('the tray marks it too (a dot and the tooltip)', r.images >= 3 && r.tips.some((t) => t.includes(`${NOTE}: 3`)), { images: r.images, tips: r.tips.slice(-3) });

  // 11. Not busy and not kept: closing the window quits (D-10).
  const exited = new Promise((resolve) => app.once('close', () => resolve(true)));
  await inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).close());
  const quit = await Promise.race([exited, h.sleep(10000).then(() => false)]);
  check('closing the window quits when nothing runs and the tray is not kept (D-10)', quit === true, String(quit));

  // 12. «إبقاء التطبيق في شريط المهام».
  ({ app, win, mainId, inMain } = await h.launchDev('kept', { settings: { keepInTray: true } }));
  await h.instrument(app);
  await win.waitForLoadState('load');
  await inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).close());
  await h.sleep(500);
  const kept = await inMain(({ BrowserWindow }, [id]) => {
    const w = BrowserWindow.fromId(id);
    return w ? { exists: true, visible: w.isVisible() } : { exists: false };
  });
  await inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).show());
  await inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).close());
  await h.sleep(500);
  r = await h.recorded(app);
  check('with «إبقاء التطبيق في شريط المهام» on, closing hides the window instead of quitting', kept.exists && kept.visible === false, kept);
  check('and says so once', r.notes.length === 1 && r.notes[0].title === 'مركز الاتصال المؤسسي', r.notes);
  const gone = new Promise((resolve) => app.once('close', () => resolve(true)));
  await app.evaluate(({ app: a }) => a.quit());
  const quitKept = await Promise.race([gone, h.sleep(10000).then(() => false)]);
  check('quitting from the tray with nothing running asks nothing and quits', quitKept === true, String(quitKept));
}

async function partTwo(state) {
  const rows = [
    { id: 'n1', tier: 'decide', body: 'اعتماد العمل CH-201', go: { page: 'review', id: 'CH-201' }, created_at: '2026-10-20T10:00:00Z', read_at: null },
    { id: 'n2', tier: 'info', body: 'نُشر العمل CH-150', go: { page: 'item', id: 'CH-150' }, created_at: '2026-10-20T09:00:00Z', read_at: null },
  ];
  state.server.routes['/'] = ['text/html; charset=utf-8', noticesPage(rows)];
  const { app, win, inMain } = await h.launchDev('notices');
  await h.instrument(app);
  await h.until(() => win.url() === `${BASE}/`, 20000);
  // The window started before the recording did: load the page again under it.
  await win.reload();
  const loaded = await h.until(() => win.evaluate(() => document.getElementById('count')?.textContent === '2:2' && typeof window.noticesReload === 'function'), 15000);
  let r = await h.recorded(app);
  check('DT-07: the first read raises nothing, and the taskbar counts the one decision waiting', loaded && r.notes.length === 0 && r.overlays.some((o) => o.description === `${NOTE}: 1`), { notes: r.notes, overlays: r.overlays });

  await inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).minimize());
  await h.sleep(500);
  await win.evaluate(() => {
    window.__noticeRows.push({ id: 'n3', tier: 'decide', body: 'اعتماد العمل CH-202', go: { page: 'review', id: 'CH-202' }, created_at: '2026-10-20T11:00:00Z', read_at: null });
    window.__noticeRows.push({ id: 'n4', tier: 'attention', body: 'طلب تعديل على CH-180', go: { page: 'item', id: 'CH-180' }, created_at: '2026-10-20T11:01:00Z', read_at: null });
    return window.noticesReload();
  });
  r = await h.recorded(app);
  check('DT-07: a new «يحتاج قرارك» item raises a native notice while the window is minimised; other tiers do not', r.notes.length === 1 && r.notes[0].title === 'يحتاج قرارك' && r.notes[0].body === 'اعتماد العمل CH-202', r.notes);
  check('DT-07: and the count rises', r.overlays[r.overlays.length - 1].description === `${NOTE}: 2`, r.overlays.slice(-2));

  await app.evaluate(() => globalThis.__notes.find((n) => n.body === 'اعتماد العمل CH-202').emit('click'));
  const went = await h.until(async () => {
    const navs = await win.evaluate(() => window.__navs.slice());
    const visible = await inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).isVisible() && !BrowserWindow.fromId(id).isMinimized());
    return visible && navs.length ? navs : null;
  }, 5000);
  check('DT-07: clicking it brings the window back and opens the work through the site\'s own router', went && went[0] === '/approvals/CH-202', went);

  await win.evaluate(() => window.noticesRead(null));
  r = await h.recorded(app);
  check('DT-07: reading them clears the count', r.overlays[r.overlays.length - 1].empty === true, r.overlays.slice(-1));
  await h.closeAll();
}

async function partThree(state, channel) {
  const { send, heard } = channel;
  const ask = async (cmd, ms = 15000) => {
    const since = Date.now();
    send(cmd);
    const name = cmd.split(':')[0];
    const hit = await heard((t) => t.startsWith(`${name}=`) || t.startsWith(`${name}!`), ms, since);
    return hit ? hit.text.slice(name.length + 1) : null;
  };
  // An idle window, then a busy one, each minimised for three seconds of a 100 ms timer.
  state.channel.page = 'bridge';
  const plain = h.launchPlain('plain-bridge');
  try {
    const up = await heard((t) => t.startsWith('ready='), 30000);
    check('nothing attached: the application started plainly and its page answers', !!up, up && up.text);
    const measure = async () => {
      plain.minimise();
      await h.sleep(1500);
      await ask('start');
      await h.sleep(3000);
      const r = JSON.parse((await ask('stop', 20000)) || 'null');
      plain.restore();
      await h.sleep(800);
      return r;
    };
    const idle = await measure();
    const busy = await ask('busy');
    const working = await measure();
    await ask('idle');
    const after = await measure();
    state.background = { idle, busy: working, afterIdle: after };
    check('nothing attached: an idle minimised window is hidden and slowed like a browser tab (timers about once a second)', idle && idle.visibility === 'hidden' && idle.ticks <= 8, idle);
    check('nothing attached: a busy minimised window stays visible to its page and keeps time (an export goes on at full speed)', busy === 'true' && working && working.visibility === 'visible' && working.ticks >= 25, { busy, working });
    check('nothing attached: once idle, the minimised window is slowed again', after && after.visibility === 'hidden' && after.ticks <= 8, after);
  } finally {
    plain.close();
  }

  // The notifications hook, minimised, with nobody calling the page: its own minute's reload.
  state.channel.page = 'notices';
  const notices = h.launchPlain('plain-notices');
  try {
    const up = await heard((t) => t.startsWith('load:'), 30000);
    check('nothing attached: the notifications page read its list', !!up, up && up.text);
    await h.sleep(1500);
    notices.minimise();
    await h.sleep(2000);
    const added = await ask('add');
    const t0 = Date.now();
    const load = await heard((t) => t === `load:hidden:${added}`, 80000, t0);
    state.timerSeconds = load ? Math.round((load.at - t0) / 1000) : null;
    check('DT-07, nothing attached: minimised and hidden, the hook reads its list again on its own within the minute, so a new decision reaches the tray', !!load && state.timerSeconds <= 62, { added, seconds: state.timerSeconds, heard: load && load.text });
  } finally {
    notices.close();
  }
}

(async () => {
  const state = {};
  try {
    if (!fs.existsSync(h.devExe)) throw new Error(`the development package is missing: ${h.devExe} (npm run pack:dev in desktop/)`);
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000; stop it and run again');
    const noticesJs = await bundleNotices();
    const channel = h.commandChannel();
    const routes = { '/': ['text/html; charset=utf-8', bridgePage], '/second': ['text/html; charset=utf-8', page('الثانية', '<h1>الثانية</h1>')], '/notices.js': ['text/javascript; charset=utf-8', noticesJs], ...channel.routes };
    const site = h.pages(routes);
    state.server = { routes };
    await h.listen(site.server, 3000);
    try {
      await partOne(state);
      await h.closeAll();
      await partTwo(state);
      await h.closeAll();
      state.channel = {};
      routes['/'] = (req, res) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(state.channel.page === 'notices' ? plainNoticesPage : plainBridgePage);
      };
      await partThree(state, channel);
    } finally {
      site.server.close();
    }
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
  }
  result.device = state.info;
  result.background = state.background;
  result.timerSeconds = state.timerSeconds;
  const failed = finish(path.join(__dirname, 'desktop-native.json'));
  process.exit(failed ? 1 : 0);
})();
