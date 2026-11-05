// Application check of updates (Desktop_App_Plan.md phase D3; DT-08 and DT-09 of section 12; MVP_draft.md 63.2).
//
// It builds the update check's package twice (desktop/electron-builder.qa.cjs: the release package's code,
// fuses and installer under its own id, name and data folder, with a feed on this laptop), as version N
// and N+1, and serves N+1's latest.yml and installer from a local feed. Then, on this laptop, as the person
// would: install N silently; start it plainly; it finds N+1, downloads it in the background and checks its
// SHA-512; close its window, and the update installs on quit; N+1 is installed and the application's data
// is still there (an update keeps it, D-11). Then a replaced installer: the feed names version N+2 with
// N+1's checksum, but serves an installer with one byte changed; the download is refused and nothing is
// installed. Last, a silent uninstall removes the program, its shortcut, its Windows entry and its data.
// It never touches a real installation of the application: the package is sa.commshub.desktop.qa.
// Signatures (DT-09) are recorded as not applicable: the pilot is unsigned (D-7).
//
// Usage: node qa/desktop-update.cjs   (writes qa/desktop-update.json; about five minutes)
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const h = require('./desktop-helpers.cjs');

const { check, note, result, finish } = h.record('qa/desktop-update.cjs');
const QA_ID = 'sa.commshub.desktop.qa';
const local = process.env.LOCALAPPDATA;
const roaming = process.env.APPDATA;
const installDir = path.join(local, 'Programs', QA_ID);
const dataDir = path.join(roaming, QA_ID);
const exe = path.join(installDir, 'CommsHub.exe');
const bump = (v) => v.replace(/(\d+)$/, (n) => String(Number(n) + 1));
const N = h.pkg.version;
const N1 = bump(N);
const N2 = bump(N1);

/** The Windows entry of the check's package: its version, or null. */
function installedVersion() {
  const out = h.ps(`Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.InstallLocation -like '*\\${QA_ID}' -or $_.UninstallString -like '*\\${QA_ID}\\*' } | ForEach-Object { $_.DisplayVersion }`);
  return out.split(/\r?\n/).filter(Boolean)[0] || null;
}
const uninstaller = () => (fs.existsSync(installDir) ? fs.readdirSync(installDir).find((f) => /^Uninstall .*\.exe$/i.test(f)) : null);
function uninstall() {
  const u = uninstaller();
  if (!u) return null;
  return spawnSync(path.join(installDir, u), ['/S'], { timeout: 120000 }).status;
}
// Any process of the package: the application, and the updater's own installer, which runs from its folder.
const running = () => h.ps(`(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*\\${QA_ID}*' } | Measure-Object).Count`) !== '0';
const updaterDir = path.join(local, `${QA_ID}-updater`);
const shortcutLeft = () => {
  const startMenu = path.join(roaming, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  return fs.existsSync(startMenu) && fs.readdirSync(startMenu).some((f) => f.includes('فحص التحديث'));
};
const closeWindow = () => h.ps(`Get-Process -Name CommsHub -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*\\${QA_ID}\\*' -and $_.MainWindowHandle -ne 0 } | ForEach-Object { $_.CloseMainWindow() | Out-Null }; 'ok'`);
const sha512 = (file) => crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64');

async function buildQa(version, feed) {
  // build.mjs reads the bundled packages' licences from paths esbuild gives relative to its working folder, which esbuild
  // takes once, when it is first loaded: so desktop/ is the working folder before build.mjs is imported, as for `npm run build`
  // (from the repository root it looked in desktop/desktop/node_modules, since D5)
  const here = process.cwd();
  process.chdir(h.desktop);
  const { buildApp } = await import('../desktop/scripts/build.mjs');
  try {
    await buildApp('qa', path.join(h.desktop, 'build'), { version, feed });
  } finally {
    process.chdir(here);
  }
  const r = spawnSync(process.execPath, [path.join(h.desktop, 'node_modules', 'electron-builder', 'cli.js'), '--config', 'electron-builder.qa.cjs', '--win', '--x64', '--publish', 'never'], {
    cwd: h.desktop,
    env: { ...process.env, COMMS_HUB_QA_VERSION: version, COMMS_HUB_QA_FEED: feed },
    encoding: 'utf8',
    timeout: 600000,
    maxBuffer: 1 << 26,
  });
  const dir = path.join(h.desktop, 'dist', 'qa', version);
  const installer = path.join(dir, `CommsHub-QA-Setup-${version}-x64.exe`);
  if (r.status !== 0 || !fs.existsSync(installer)) throw new Error(`the update check's package ${version} did not build: ${(r.stderr || r.stdout || '').slice(-800)}`);
  return { dir, installer, latest: fs.readFileSync(path.join(dir, 'latest.yml'), 'utf8') };
}

(async () => {
  const requests = [];
  let feedFiles = {};
  let site;
  try {
    if (!fs.existsSync(path.join(h.desktop, 'node_modules', 'electron-builder', 'cli.js'))) throw new Error('npm ci in desktop/ first');
    // Leftovers of an earlier run are the check's own package: removed first.
    if (installedVersion() || fs.existsSync(installDir)) {
      note(`An earlier run had left the check's package (${installedVersion()}); it was uninstalled first.`);
      uninstall();
      await h.until(() => !fs.existsSync(exe), 90000, 1000);
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(updaterDir, { recursive: true, force: true });

    // The local feed.
    const serve = (req, res) => {
      const name = decodeURIComponent(req.url.split('?')[0].slice('/feed/'.length));
      requests.push({ at: Date.now(), name, range: req.headers.range || null });
      const body = feedFiles[name];
      if (body === undefined) {
        res.writeHead(404);
        return res.end();
      }
      const data = typeof body === 'string' ? Buffer.from(body) : body;
      res.writeHead(200, { 'content-type': name.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream', 'content-length': data.length });
      res.end(data);
    };
    site = http.createServer((req, res) => (req.url.startsWith('/feed/') ? serve(req, res) : (res.writeHead(404), res.end())));
    const port = await h.listen(site, 0);
    const feed = `http://127.0.0.1:${port}/feed`;

    // Two packages, N and N+1.
    const t0 = Date.now();
    const pN = await buildQa(N, feed);
    const pN1 = await buildQa(N1, feed);
    result.build = { seconds: Math.round((Date.now() - t0) / 1000), versions: [N, N1], installerBytes: fs.statSync(pN1.installer).size };
    const yml = pN1.latest;
    check(`latest.yml names version ${N1}, its installer, size and SHA-512`, new RegExp(`^version: ${N1.replace(/\./g, '\\.')}$`, 'm').test(yml) && yml.includes(`CommsHub-QA-Setup-${N1}-x64.exe`) && yml.includes(sha512(pN1.installer)), yml);
    const appUpdate = path.join(pN.dir, 'win-unpacked', 'resources', 'app-update.yml');
    const updateYml = fs.existsSync(appUpdate) ? fs.readFileSync(appUpdate, 'utf8') : '';
    check('DT-09: the package names no publisher, so the updater checks the SHA-512 only (the pilot is unsigned, D-7)', updateYml !== '' && !/publisherName/.test(updateYml), updateYml);
    feedFiles = {
      'latest.yml': yml,
      [path.basename(pN1.installer)]: fs.readFileSync(pN1.installer),
      [`${path.basename(pN1.installer)}.blockmap`]: fs.readFileSync(`${pN1.installer}.blockmap`),
    };

    // Install N.
    const install = spawnSync(pN.installer, ['/S'], { timeout: 180000 });
    check(`DT-08: version ${N} installs silently for this user`, install.status === 0 && fs.existsSync(exe) && installedVersion() === N, { status: install.status, version: installedVersion() });

    // Start it plainly; it finds N+1 and downloads it in the background.
    let app = spawn(exe, [], { detached: true, stdio: 'ignore' });
    app.unref();
    const fetched = await h.until(() => requests.some((r) => r.name === path.basename(pN1.installer)), 60000, 500);
    await h.sleep(8000);
    const asked = requests.map((r) => r.name);
    check(`DT-08: the application asks the feed and downloads ${N1} in the background`, !!fetched && asked[0] === 'latest.yml', asked);
    const kept = fs.existsSync(path.join(dataDir, 'window-state.json')) || fs.existsSync(dataDir);

    // Close the window: the update installs on quit.
    closeWindow();
    const updated = await h.until(() => installedVersion() === N1 && !running(), 180000, 1000);
    check(`DT-08: closing the window quits, and ${N1} is installed on quit`, !!updated && installedVersion() === N1, installedVersion());
    check('DT-08: an update keeps the application\'s data (D-11)', kept && fs.existsSync(dataDir), { before: kept, after: fs.existsSync(dataDir) });
    const fileVersion = h.ps(`(Get-Item '${exe}').VersionInfo.ProductVersion`);
    check(`DT-08: the program on disk is ${N1}`, fileVersion.startsWith(N1), fileVersion);

    // A replaced installer: N+2's manifest with N+1's checksum, and one byte changed. The updater's downloads
    // are cleared first, as on a laptop that never fetched the genuine file: it keeps the last download, and
    // a file it already holds with the manifest's checksum would simply be used again.
    fs.rmSync(path.join(updaterDir, 'pending'), { recursive: true, force: true });
    const tampered = Buffer.from(feedFiles[path.basename(pN1.installer)]);
    tampered[Math.floor(tampered.length / 2)] ^= 0xff;
    const name2 = `CommsHub-QA-Setup-${N2}-x64.exe`;
    feedFiles = { 'latest.yml': yml.replaceAll(N1, N2), [name2]: tampered };
    const before = requests.length;
    app = spawn(exe, [], { detached: true, stdio: 'ignore' });
    app.unref();
    const got = await h.until(() => requests.slice(before).some((r) => r.name === name2), 60000, 500);
    await h.sleep(10000);
    const pending = path.join(updaterDir, 'pending');
    const left = fs.existsSync(pending) ? fs.readdirSync(pending).filter((f) => f.endsWith('.exe')) : [];
    closeWindow();
    await h.until(() => !running(), 60000, 1000);
    await h.sleep(5000);
    check('DT-09: a replaced installer (one byte changed under a valid manifest) is downloaded and refused by its SHA-512, and nothing is installed', !!got && installedVersion() === N1 && !left.includes(name2), { downloaded: !!got, version: installedVersion(), pending: left });

    // Uninstall. The uninstaller hands its work to a copy of itself and returns at once: wait for all of it.
    await h.until(() => !running(), 60000, 1000);
    const status = uninstall();
    await h.until(() => !fs.existsSync(exe) && !installedVersion() && !shortcutLeft() && !fs.existsSync(dataDir) && !fs.existsSync(updaterDir), 90000, 1000);
    const after = { status, exe: fs.existsSync(exe), version: installedVersion(), shortcut: shortcutLeft(), data: fs.existsSync(dataDir), updater: fs.existsSync(updaterDir) };
    check('DT-08: a silent uninstall removes the program, its Start menu shortcut, its Windows entry and its data (D-11)', status === 0 && !after.exe && !after.version && !after.shortcut && !after.data, after);
    check('DT-08: and the installer\'s own copy with the updater\'s folder (resources/installer.nsh)', !after.updater, after);
    result.signatures = 'Not applicable: the pilot build is unsigned (decision D-7). signtool, codesign, spctl and stapler were not run. Once a certificate exists, electron-builder writes the publisher into app-update.yml and electron-updater checks it on every update.';
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    if (running()) h.ps(`Get-Process -Name CommsHub -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*\\${QA_ID}\\*' } | Stop-Process -Force`);
    if (installedVersion() || fs.existsSync(installDir)) {
      uninstall();
      await h.until(() => !fs.existsSync(exe) && !running(), 90000, 1000);
    }
    site?.close();
  }
  result.requests = requests.map((r) => ({ name: r.name, range: r.range }));
  const failed = finish(path.join(__dirname, 'desktop-update.json'));
  process.exit(failed ? 1 : 0);
})();
