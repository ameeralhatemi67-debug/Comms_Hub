// The Android application's rules that live in files (Android_Build_Plan.md A2; MVP_draft.md 64; AGENTS.md):
// the compiled address, the builds, the permissions, the desktop's wording and routes kept equal, and no
// emoji. The rules in Java are held by the JVM tests (android/app/src/test).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL_ORIGIN, localConfig } from '../scripts/config.mjs';

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(mobile, '..');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const app = path.join(mobile, 'android', 'app');
const java = (name) => read(app, 'src', 'main', 'java', 'sa', 'commshub', 'app', `${name}.java`);
const PRODUCTION = 'https://comms-hub-three.vercel.app';

test('a release opens the production address alone, over https, uninspectable', () => {
  const c = JSON.parse(read(mobile, 'capacitor.config.json'));
  assert.equal(c.appId, 'sa.commshub.app');
  assert.equal(c.appName, 'مركز الاتصال المؤسسي');
  assert.equal(c.server.url, PRODUCTION);
  assert.equal(c.server.cleartext, undefined);
  assert.equal(c.server.allowNavigation, undefined, 'no other address is opened in the window');
  assert.equal(c.android.webContentsDebuggingEnabled, false);
  assert.equal(c.android.allowMixedContent, false);
  assert.equal(c.loggingBehavior, 'none');
  assert.equal(c.plugins.SystemBars.insetsHandling, 'disable', 'the window pads the web view itself');
});

test('the address is the desktop\'s and the site\'s', () => {
  assert.match(read(root, 'desktop', 'src', 'origins.ts'), new RegExp(`export const PRODUCTION_ORIGIN = '${PRODUCTION}';`));
  assert.match(read(app, 'build.gradle'), new RegExp(`def productionOrigin = '${PRODUCTION}'`));
});

test('a development or check build is the same file opening the local site', () => {
  const release = JSON.parse(read(mobile, 'capacitor.config.json'));
  const local = localConfig(release);
  assert.equal(LOCAL_ORIGIN, 'http://127.0.0.1:3000');
  assert.match(read(root, 'desktop', 'src', 'origins.ts'), new RegExp(`export const DEVELOPMENT_ORIGIN = '${LOCAL_ORIGIN}';`), 'the desktop\'s development address');
  assert.equal(local.server.url, LOCAL_ORIGIN);
  assert.equal(local.server.cleartext, true);
  assert.equal(local.server.errorPath, release.server.errorPath);
  assert.equal(local.android.webContentsDebuggingEnabled, true);
  assert.equal(local.appId, release.appId);
  assert.equal(release.server.url, PRODUCTION, 'the release file is not changed by it');
});

test('builds: the release list holds the production address alone; the check package has its own id; the key comes from outside', () => {
  const g = read(app, 'build.gradle');
  assert.match(g, /defaultConfig \{[\s\S]*?buildConfigField "String", "ALLOWED_ORIGINS", "\\"\$\{productionOrigin\}\\""/);
  assert.match(g, /def localOrigin = 'http:\/\/127\.0\.0\.1:3000'/);
  assert.equal((g.match(/\$\{productionOrigin\},\$\{localOrigin\}/g) ?? []).length, 2, 'debug and qa only');
  assert.match(g, /qa \{[\s\S]*?applicationIdSuffix '\.qa'/);
  assert.match(g, /debug \{[\s\S]*?applicationIdSuffix '\.dev'/);
  assert.match(g, /System\.getenv\('COMMSHUB_KEYSTORE_PROPERTIES'\)/);
  assert.doesNotMatch(g, /storePassword ['"]/, 'no password written in the build');
  assert.match(read(mobile, 'android', 'variables.gradle'), /minSdkVersion = 29/);
  assert.match(read(mobile, 'android', 'variables.gradle'), /targetSdkVersion = 36/);
  const ignore = read(mobile, 'android', '.gitignore');
  for (const p of ['*.jks', '*.keystore', 'keystore.properties', 'google-services.json']) assert.ok(ignore.split('\n').includes(p), p);
});

test('permissions: the site, the microphone and notices, nothing else; no backup; cleartext only to the emulator in debug and check builds', () => {
  const m = read(app, 'src', 'main', 'AndroidManifest.xml');
  const asked = [...m.matchAll(/<uses-permission android:name="([^"]+)"/g)].map((x) => x[1]).sort();
  assert.deepEqual(asked, ['android.permission.INTERNET', 'android.permission.MODIFY_AUDIO_SETTINGS', 'android.permission.POST_NOTIFICATIONS', 'android.permission.RECORD_AUDIO']);
  assert.match(m, /android:allowBackup="false"/);
  assert.match(m, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
  assert.match(read(app, 'src', 'main', 'res', 'xml', 'network_security_config.xml'), /<base-config cleartextTrafficPermitted="false" \/>/);
  assert.doesNotMatch(read(app, 'src', 'main', 'res', 'xml', 'network_security_config.xml'), /cleartextTrafficPermitted="true"/);
  for (const t of ['debug', 'qa']) assert.match(read(app, 'src', t, 'res', 'xml', 'network_security_config.xml'), /<domain includeSubdomains="false">127\.0\.0\.1<\/domain>/);
  assert.match(read(app, 'src', 'main', 'res', 'xml', 'file_paths.xml'), /<cache-path name="shared" path="shared\/" \/>/);
  assert.doesNotMatch(read(app, 'src', 'main', 'res', 'xml', 'file_paths.xml'), /external-path/);
  const chrome = java('ShellChromeClient');
  assert.match(chrome, /asked\.size\(\) == 1 && asked\.contains\(MICROPHONE\)/);
  assert.match(chrome, /callback\.invoke\(origin, false, false\)/, 'location refused');
});

test('A3: only the APK channel installs its own updates; the feed is the site\'s; the check package reads its own', () => {
  const direct = read(app, 'src', 'direct', 'AndroidManifest.xml');
  assert.deepEqual([...direct.matchAll(/<uses-permission android:name="([^"]+)"/g)].map((x) => x[1]), ['android.permission.REQUEST_INSTALL_PACKAGES']);
  assert.match(direct, /<receiver\s+android:name="\.InstallReceiver"\s+android:exported="false" \/>/);
  assert.equal(fs.existsSync(path.join(app, 'src', 'play', 'AndroidManifest.xml')), false, 'Google Play\'s copy may not install packages');
  const g = read(app, 'build.gradle');
  const site = /export const ANDROID_FEED = '([^']+)';/.exec(read(root, 'src', 'lib', 'native', 'releases.ts'))[1];
  assert.match(g, new RegExp(`def productionFeed = '${site}'`));
  assert.match(g, /def checkFeed = 'http:\/\/127\.0\.0\.1:3002\/android'/);
  assert.match(g, /defaultConfig \{[\s\S]*?buildConfigField "String", "UPDATE_FEED", "\\"\$\{productionFeed\}\\""/);
  assert.equal((g.match(/\$\{checkFeed\}/g) ?? []).length, 1, 'the check package only');
  assert.match(g, /onVariants\(selector\(\)\.withBuildType\('qa'\)\)/, 'a version given to a build only for the check package');
  const update = java('AppUpdate');
  for (const step of ['MessageDigest.getInstance("SHA-256")', 'GET_SIGNING_CERTIFICATES', 'getApkContentsSigners()', 'theirs.getLongVersionCode() <= mine.getLongVersionCode()', 'canRequestPackageInstalls()', 'PackageInstaller.SessionParams.MODE_FULL_INSTALL']) {
    assert.ok(update.includes(step), step);
  }
  assert.match(update, /new URL\(BuildConfig\.UPDATE_FEED \+ "\/" \+ URLEncoder\.encode\(file, "UTF-8"\)\)/, 'the address is built from the compiled feed, never taken from the page');
  assert.match(java('CommsHubShell'), /Navigation\.isAllowed\(Shell\.currentUrl\(\), Shell\.ALLOWED\)/);
});

test('A4: a page names a site file by its path; the application builds the address on the page\'s origin and answers ok only', () => {
  const plugin = java('CommsHubShell');
  assert.match(plugin, /SiteFiles\.address\(Shell\.currentUrl\(\), call\.getString\("path"\), Shell\.ALLOWED\)/);
  assert.match(plugin, /out\.put\("ok", ok\);/);
  assert.doesNotMatch(plugin, /getString\("(url|address|uri|href)"\)/, 'no method takes an address');
  for (const m of ['downloadSave', 'downloadOpen', 'shareFile']) assert.match(plugin, new RegExp(`public void ${m}\\(PluginCall call\\) \\{\\s*siteFile\\(call,`), m);
  const files = java('Downloads');
  assert.match(files, /FileProvider\.getUriForFile\(activity, activity\.getPackageName\(\) \+ "\.fileprovider", file\)/);
  assert.match(files, /new File\(new File\(activity\.getCacheDir\(\), "shared"\), hex\.toString\(\)\)/, 'only the folder file_paths.xml names');
  assert.match(files, /Intent\.FLAG_GRANT_READ_URI_PERMISSION/);
  assert.doesNotMatch(files, /DownloadManager/, 'never the system\'s download service');
  assert.match(files, /total > SiteFiles\.ASK_TO_SHARE/);
});

test('A4: Capacitor\'s cookie and HTTP interfaces and its cookie handler are taken off once its plugins are loaded', () => {
  const shell = java('Shell');
  assert.match(shell, /CAPACITOR_INTERFACES = \{ "CapacitorCookiesAndroidInterface", "CapacitorHttpAndroidInterface" \}/);
  assert.match(shell, /for \(String name : CAPACITOR_INTERFACES\) web\.removeJavascriptInterface\(name\);\s*java\.net\.CookieHandler\.setDefault\(null\);/);
  assert.match(java('MainActivity'), /super\.load\(\);\s*if \(bridge != null\) \{\s*bridge\.getWebView\(\)\.setWebChromeClient\(new ShellChromeClient\(bridge\)\);\s*Shell\.narrow\(bridge\.getWebView\(\)\);/);
  const cap = path.join(mobile, 'node_modules', '@capacitor', 'android', 'capacitor', 'src', 'main', 'java', 'com', 'getcapacitor', 'plugin');
  for (const [file, name] of [['CapacitorCookies.java', 'CapacitorCookiesAndroidInterface'], ['CapacitorHttp.java', 'CapacitorHttpAndroidInterface']]) {
    assert.match(read(cap, file), new RegExp(`addJavascriptInterface\\(this, "${name}"\\)`), `Capacitor still names ${name}`);
  }
});

test('A5: pushes are data messages shown by the application, and no token is made before notices are allowed', () => {
  const m = read(app, 'src', 'main', 'AndroidManifest.xml');
  assert.match(m, /android:name="\.ShellApp"/);
  assert.match(m, /<service\s+android:name="\.PushService"\s+android:exported="false">\s*<intent-filter>\s*<action android:name="com\.google\.firebase\.MESSAGING_EVENT" \/>/);
  assert.match(m, /firebase_messaging_auto_init_enabled" android:value="false"/);
  assert.match(m, /firebase_analytics_collection_enabled" android:value="false"/);
  const plugin = java('CommsHubShell');
  assert.match(plugin, /@Permission\(alias = "notices", strings = \{ Manifest\.permission\.POST_NOTIFICATIONS \}\)/);
  assert.match(plugin, /if \(!ShellApp\.configured\(\) \|\| !"granted"\.equals\(pushStateNow\(\)\)\) \{\s*call\.resolve\(none\);/, 'a token only once allowed');
  const service = java('PushService');
  assert.match(service, /if \(MainActivity\.inFront\(\)\) \{\s*CommsHubShell\.received\(\);\s*return;/, 'nothing shown in front');
  assert.match(service, /putExtra\(EXTRA_GO, go\)\.putExtra\(EXTRA_KEY, key\(context\)\)/);
  assert.match(service, /PendingIntent\.FLAG_IMMUTABLE/);
  assert.match(java('MainActivity'), /boolean ours = PushService\.ours\(this, intent\);[\s\S]*if \(ours\) CommsHubShell\.open\(go\);/, 'another application\'s intent opens nothing');
});

test('A5: Firebase\'s identifiers come from outside at build time, per build id; no Google services plugin or file in the repository', () => {
  const g = read(app, 'build.gradle');
  assert.match(g, /def servicesFile = System\.getenv\('COMMSHUB_GOOGLE_SERVICES'\)/);
  assert.match(g, /firebaseFields\(delegate, 'sa\.commshub\.app'\)/);
  assert.match(g, /firebaseFields\(delegate, 'sa\.commshub\.app\.dev'\)/);
  assert.match(g, /firebaseFields\(delegate, 'sa\.commshub\.app\.qa'\)/);
  assert.doesNotMatch(g, /apply plugin: 'com\.google\.gms\.google-services'/);
  assert.match(read(mobile, 'android', 'variables.gradle'), /firebaseMessagingVersion = '25\.1\.3'/);
  const tracked = fs.readdirSync(app).concat(fs.readdirSync(path.join(app, 'src', 'main')));
  assert.equal(tracked.includes('google-services.json'), false);
  const qa = read(app, 'src', 'qa', 'AndroidManifest.xml');
  assert.match(qa, /android:name="\.QaPush"/, 'the check\'s receiver is the check package\'s only');
  assert.equal(fs.existsSync(path.join(app, 'src', 'main', 'java', 'sa', 'commshub', 'app', 'QaPush.java')), false);
  const strings = read(app, 'src', 'main', 'res', 'values', 'strings.xml');
  for (const [name, text] of [['push_decide', 'يحتاج قرارك'], ['push_attention', 'للانتباه'], ['push_messages', 'الرسائل']]) {
    assert.match(strings, new RegExp(`<string name="${name}">${text}</string>`), name);
  }
});

test('the back key asks the page\'s open window first, as Escape does', () => {
  const main = java('MainActivity');
  assert.match(main, /document\.querySelectorAll\('dialog\[open\]'\)/);
  assert.match(main, /new Event\('cancel', \{ cancelable: true \}\)/);
  assert.match(main, /if \(!e\.defaultPrevented\) d\.close\(\)/, 'a window that refuses to be put off stays');
  assert.match(main, /if \("true"\.equals\(handled\)\) return;\s*if \(w\.canGoBack\(\)\)/);
  const site = read(root, 'src', 'components', 'native', 'phone-app.tsx');
  assert.match(site, /onCancel=\{\(e\) => \{\s*e\.preventDefault\(\);\s*if \(closable\) onClose\(\);/, 'the required window refuses its cancel');
});

test('the desktop\'s connection routes and note, word for word', () => {
  const desk = read(root, 'desktop', 'src', 'navigation.ts');
  const nav = java('Navigation');
  const routes = /const CONNECT_ROUTES = \[([^\]]+)\]/.exec(desk)[1].match(/'[^']+'/g).map((s) => s.slice(1, -1));
  const ours = /CONNECT_ROUTES = Collections\.unmodifiableList\(Arrays\.asList\(([^)]+)\)\)/.exec(nav)[1].match(/"[^"]+"/g).map((s) => s.slice(1, -1));
  assert.deepEqual(ours, routes);
  assert.equal(/PLATFORM_CONNECT = "([^"]+)"/.exec(nav)[1], /const PLATFORM_CONNECT = '([^']+)'/.exec(desk)[1]);
  const note = /export const CONNECT_NOTE = '([^']+)'/.exec(desk)[1];
  assert.match(read(app, 'src', 'main', 'res', 'values', 'strings.xml'), new RegExp(`<string name="connect_note">${note}</string>`));
});

test('the connection screen says what the desktop\'s says', () => {
  const desk = read(root, 'desktop', 'src', 'offline.html');
  const ours = read(mobile, 'www', 'offline.html');
  for (const line of ['تعذّر الوصول إلى المركز', 'تحقّق من اتصالك بالإنترنت، ثم أعد المحاولة.', 'تعذّر التحقق من أمان الاتصال', 'لم يُفتح المركز لأن شهادة الأمان لم تُقبل. أعد المحاولة لاحقاً.', 'إعادة المحاولة']) {
    assert.ok(desk.includes(line), `desktop: ${line}`);
    assert.ok(ours.includes(line), `android: ${line}`);
  }
  assert.doesNotMatch(ours, /<(script|link|img)[^>]+(src|href)="https?:/, 'nothing fetched from anywhere');
  // Capacitor serves the screen from the application's own local address, so «إعادة المحاولة» asks the
  // application for the site again rather than reloading that address.
  assert.match(ours, /<a class="again" id="again" href="\/again">إعادة المحاولة<\/a>/);
  assert.match(java('ShellWebViewClient'), /\+ "again";[\s\S]*if \(again != null && url\.equals\(again\)\) \{\s*view\.loadUrl\(bridge\.getAppUrl\(\)\);/);
});

test('Capacitor\'s routes to files on the phone are refused, and the site\'s error pages are left as they are', () => {
  const client = java('ShellWebViewClient');
  assert.match(client, /path\.startsWith\("\/_capacitor_file_"\) \|\| path\.startsWith\("\/_capacitor_content_"\)/);
  assert.match(client, /public void onReceivedHttpError\([^)]*\) \{\s*\/\/[^\n]*\n\s*\}/, 'no offline screen for a page of the site');
  assert.match(client, /handler\.cancel\(\);/);
  assert.match(java('Downloads'), /conn\.setInstanceFollowRedirects\(false\);/, 'redirects followed by hand, the cookie only on the list');
  assert.match(java('Downloads'), /if \(Navigation\.isAllowed\(at, Shell\.ALLOWED\)\) \{\s*String cookie/);
});

test('the interface texts are Arabic, and no emoji anywhere in the application', () => {
  const strings = read(app, 'src', 'main', 'res', 'values', 'strings.xml');
  for (const name of ['app_name', 'connect_note', 'connect_continue', 'connect_cancel', 'download_started', 'download_done', 'download_failed', 'download_in_page', 'no_app', 'save_started', 'save_done_gallery', 'open_started', 'open_failed', 'open_no_viewer', 'share_started', 'share_failed', 'share_title', 'share_large', 'share_continue', 'downloads_channel', 'downloads_channel_about', 'downloads_progress']) {
    const m = new RegExp(`<string name="${name}">([^<]+)</string>`).exec(strings);
    assert.ok(m && /[\u0600-\u06ff]/.test(m[1]), name);
  }
  const files = [
    path.join(mobile, 'capacitor.config.json'),
    path.join(mobile, 'www', 'offline.html'),
    path.join(mobile, 'scripts', 'build.mjs'),
    path.join(mobile, 'scripts', 'config.mjs'),
    path.join(app, 'build.gradle'),
    path.join(app, 'src', 'main', 'AndroidManifest.xml'),
    path.join(app, 'src', 'main', 'res', 'values', 'strings.xml'),
    ...fs.readdirSync(path.join(app, 'src', 'main', 'java', 'sa', 'commshub', 'app')).map((f) => path.join(app, 'src', 'main', 'java', 'sa', 'commshub', 'app', f)),
  ];
  for (const f of files) assert.equal(/\p{Extended_Pictographic}/u.test(fs.readFileSync(f, 'utf8')), false, f);
});
