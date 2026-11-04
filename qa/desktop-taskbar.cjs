// Application check of the taskbar button, of dragging a file out, and of the cache folder's label (D12;
// Desktop_Power_Ideas.md P-26, P-22 and section 12; MVP_draft.md 63.9). It drives the development package on a fixture
// page at 127.0.0.1:3000:
//   - P-26: a start from the jump list opens its place; a second start from it moves the open window there; the page's
//     progress becomes the taskbar's bar, red on failure until the window is looked at, gone when done or when the page
//     goes; anything off the list is refused;
//   - P-22: a file the person chose is dragged out by its token (Windows' own drag is recorded, not performed: Playwright
//     cannot drive it, so the drag itself is an owner walkthrough step); unknown, malformed and forgotten tokens drag nothing;
//   - section 12: «cache.usage» names the folder by its label, never by a path or the Windows user name.
// Usage: node qa/desktop-taskbar.cjs   (writes qa/desktop-taskbar.json)   Needs: npm run pack:dev in desktop/, port 3000 free.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const h = require('./desktop-helpers.cjs');

const { check, note, finish } = h.record('qa/desktop-taskbar.cjs');
const BASE = 'http://127.0.0.1:3000';
const page = (title) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><input type="file" id="f"></body></html>`;

(async () => {
  let site = null;
  try {
    if (!fs.existsSync(h.devExe)) throw new Error(`the development package is missing: ${h.devExe} (npm run pack:dev in desktop/)`);
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000; stop it and run again');
    site = h.pages({ '/': ['text/html; charset=utf-8', page('الرئيسية')], '/motion/studio': ['text/html; charset=utf-8', page('الاستوديو')] });
    await h.listen(site.server, 3000);

    // P-26: a start from the jump list
    const { app, win, mainId, data } = await h.launchDev('taskbar', { args: ['--commshub-go=studio'] });
    const opened = await h.until(() => (win.url() === `${BASE}/motion/studio` ? win.url() : null), 20000);
    check('a start from the jump list («الاستوديو») opens its place on the site', opened === `${BASE}/motion/studio`, win.url());
    const settings = await app.evaluate(({ app: a }) => {
      try {
        return a.getJumpListSettings();
      } catch (e) {
        return { error: String(e) };
      }
    });
    check('Windows keeps a jump list for the application (its settings read back)', typeof settings.minItems === 'number', settings);
    // a second start from the jump list, while the application is open
    const second = spawn(h.devExe, ['--commshub-go=decisions'], { env: { ...process.env, COMMS_HUB_DEV_DATA: data }, stdio: 'ignore' });
    const left = await new Promise((r) => {
      const t = setTimeout(() => r(null), 20000);
      second.on('exit', (code) => (clearTimeout(t), r(code)));
    });
    const moved = await h.until(() => (win.url() === `${BASE}/` ? win.url() : null), 15000);
    check('a second start from the jump list («يحتاج قرارك») leaves at once and moves the open window to its place', left !== null && moved === `${BASE}/`, { left, url: win.url() });
    const third = spawn(h.devExe, ['--commshub-go=https://example.com/'], { env: { ...process.env, COMMS_HUB_DEV_DATA: data }, stdio: 'ignore' });
    await new Promise((r) => third.on('exit', r));
    await h.sleep(1500);
    check('a start that names an address instead of a place moves nothing', win.url() === `${BASE}/`, win.url());

    // P-26: the taskbar's bar
    await win.waitForLoadState('load');
    await app.evaluate(({ BrowserWindow }) => {
      globalThis.__bars = [];
      const set = BrowserWindow.prototype.setProgressBar;
      BrowserWindow.prototype.setProgressBar = function setProgressBar(value, options) {
        globalThis.__bars.push({ value, mode: options && options.mode });
        return set.call(this, value, options);
      };
    });
    const bars = () => app.evaluate(() => globalThis.__bars.splice(0));
    const progress = (v) => win.evaluate((x) => window.commsHubNative.life.progress(x).then((r) => ({ ok: r }), (e) => ({ refused: String(e && e.message) })), v);
    for (const v of [0, 0.25, 0.5]) await progress(v);
    check('the page\'s progress is the taskbar\'s bar', JSON.stringify(await bars()) === JSON.stringify([{ value: 0, mode: 'normal' }, { value: 0.25, mode: 'normal' }, { value: 0.5, mode: 'normal' }]));
    await progress('failed');
    const red = await bars();
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).emit('focus'), mainId);
    const seen = await bars();
    check('a failure turns the bar red at its last fraction, and looking at the window clears it', JSON.stringify(red) === JSON.stringify([{ value: 0.5, mode: 'error' }]) && JSON.stringify(seen) === JSON.stringify([{ value: -1, mode: 'none' }]), { red, seen });
    await progress(0.8);
    await progress('done');
    const done = await bars();
    check('«done» removes the bar', JSON.stringify(done.at(-1)) === JSON.stringify({ value: -1, mode: 'none' }), done);
    await progress(0.3);
    await bars();
    await win.reload();
    await win.waitForLoadState('load');
    const gone = await h.until(async () => ((await app.evaluate(() => globalThis.__bars.slice())).some((b) => b.mode === 'none') ? true : null), 5000);
    check('a bar ends with the document that set it', !!gone, await bars());
    const refused = [];
    for (const v of [1.5, -0.1, 'paused', null, { value: 0.5 }]) refused.push(await progress(v));
    check('anything else is refused by the main process, and shows nothing', refused.every((r) => r.refused) && (await bars()).length === 0, refused);

    // P-22: dragging a file out by its token
    const clip = path.join(h.scratch, 'drag-out.mp4');
    fs.writeFileSync(clip, Buffer.alloc(4096, 1));
    await app.evaluate(({ BrowserWindow }, id) => {
      globalThis.__drags = [];
      const proto = Object.getPrototypeOf(BrowserWindow.fromId(id).webContents);
      proto.startDrag = function startDrag(item) {
        globalThis.__drags.push({ file: item.file, icon: !!item.icon && !item.icon.isEmpty() });
      };
    }, mainId);
    await win.setInputFiles('#f', clip);
    const token = await win.evaluate(() => window.commsHubNative.files.fromDropped(document.getElementById('f').files[0]).then((v) => v && v.token));
    const dragged = await win.evaluate((t) => window.commsHubNative.files.dragOut(t), token);
    const drags = await app.evaluate(() => globalThis.__drags.splice(0));
    check('a file the person chose is dragged out by its token: Windows is handed that file, with the brand mark', dragged === true && drags.length === 1 && path.resolve(drags[0].file) === path.resolve(clip) && drags[0].icon, { dragged, drags });
    const unknown = await win.evaluate(() => window.commsHubNative.files.dragOut('A'.repeat(43)));
    const malformed = await win.evaluate(() => window.commsHubNative.files.dragOut('C:\\Windows\\win.ini').then(() => 'dragged', () => 'refused'));
    await win.evaluate((t) => window.commsHubNative.files.forget(t), token);
    const forgotten = await win.evaluate((t) => window.commsHubNative.files.dragOut(t), token);
    check('an unknown, a malformed or a forgotten token drags nothing', unknown === false && malformed === 'refused' && forgotten === false && (await app.evaluate(() => globalThis.__drags.length)) === 0, { unknown, malformed, forgotten });
    note('The drag itself is Windows\' own and cannot be driven by Playwright: dropping into Explorer is an owner walkthrough step.');

    // section 12: the cache folder's label
    const usage = await win.evaluate(() => window.commsHubNative.cache.usage());
    const user = os.userInfo().username;
    const text = JSON.stringify(usage);
    check('cache.usage names the default folder «المجلد الافتراضي», with no path and no Windows user name', usage.folder === 'المجلد الافتراضي' && usage.isDefault && !text.includes('\\\\') && !text.includes(user), { folder: usage.folder, isDefault: usage.isDefault });
    const chosen = path.join(h.scratch, 'مجلد مختار');
    fs.mkdirSync(chosen, { recursive: true });
    await app.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
    }, chosen);
    const moved2 = await win.evaluate(() => window.commsHubNative.cache.choose());
    check('a chosen folder is named by its last name only', moved2.folder === 'مجلد مختار' && !moved2.isDefault && !JSON.stringify(moved2).includes('\\\\') && !JSON.stringify(moved2).includes(user), { folder: moved2.folder });
    await win.evaluate(() => window.commsHubNative.cache.useDefault());
    await app.close().catch(() => undefined);
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    site?.server.close();
  }
  const failed = finish(path.join(__dirname, 'desktop-taskbar.json'));
  process.exit(failed ? 1 : 0);
})();
