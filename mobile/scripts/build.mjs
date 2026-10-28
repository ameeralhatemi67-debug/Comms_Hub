// Builds the Android application (mobile/README.md; Android_Build_Plan.md A2).
//   node scripts/build.mjs <debug|qa|release> [direct|play]
// It copies the web folder and the configuration into the Android project (cap sync), writes the
// configuration of the development and check builds (the same file, opening the local site through the
// emulator's address with inspection on), and runs Gradle. A release opens the production address alone
// and is signed only with the owner's key (COMMSHUB_KEYSTORE_PROPERTIES); without it the APK is unsigned.
// It prints the APK's path, size and SHA-256, the figures latest.json needs. A release of the play channel is an
// Android App Bundle for Google Play (A8), signed with the same key; Play builds the phones' APKs from it.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localConfig } from './config.mjs';

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const android = path.join(mobile, 'android');
const kind = process.argv[2];
const channel = process.argv[3] ?? 'direct';
if (!['debug', 'qa', 'release'].includes(kind) || !['direct', 'play'].includes(channel)) {
  console.error('usage: node scripts/build.mjs <debug|qa|release> [direct|play]');
  process.exit(2);
}

// Gradle 8.14 of Capacitor's template runs on Java 17 to 21; Android Studio's own Java may be newer, so a
// JDK for Gradle can be named apart from JAVA_HOME (mobile/README.md).
const env = { ...process.env, ...(process.env.COMMSHUB_JAVA_HOME ? { JAVA_HOME: process.env.COMMSHUB_JAVA_HOME } : {}) };

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const release = JSON.parse(fs.readFileSync(path.join(mobile, 'capacitor.config.json'), 'utf8'));
run('npx', ['cap', 'sync', 'android'], mobile);
for (const type of ['debug', 'qa']) {
  const dir = path.join(android, 'app', 'src', type, 'assets');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'capacitor.config.json'), JSON.stringify(localConfig(release), null, 2) + '\n');
}

// Google Play takes an Android App Bundle (A8): a release of the play channel is bundled, every other build assembled.
const bundle = kind === 'release' && channel === 'play';
const task = `${bundle ? 'bundle' : 'assemble'}${channel[0].toUpperCase()}${channel.slice(1)}${kind[0].toUpperCase()}${kind.slice(1)}`;
// The update check builds the check package at a version of its own (android/app/build.gradle, checkVersion).
const checkVersion = kind === 'qa' && process.env.COMMSHUB_CHECK_VERSION ? [`-PcheckVersion=${process.env.COMMSHUB_CHECK_VERSION}`] : [];
run(path.join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), [task, ...checkVersion, '--console=plain'], android);

const outDir = bundle ? path.join(android, 'app', 'build', 'outputs', 'bundle', 'playRelease') : path.join(android, 'app', 'build', 'outputs', 'apk', channel, kind);
const ext = bundle ? '.aab' : '.apk';
const apk = fs.readdirSync(outDir).find((f) => f.endsWith(ext));
if (!apk) {
  console.error(`no ${ext} in ${outDir}`);
  process.exit(1);
}
const bytes = fs.readFileSync(path.join(outDir, apk));
console.log(JSON.stringify({ [bundle ? 'aab' : 'apk']: path.join(outDir, apk), size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));

// A signed release must be the key the site names in /.well-known/assetlinks.json, or Android will not open the
// site's links in it (A6, MVP_draft.md 64.4). An unsigned release (no key given) is not checked.
if (kind === 'release') {
  const signer = bundle ? bundleSignerOf(path.join(outDir, apk)) : signerOf(path.join(outDir, apk));
  if (signer) {
    const site = sitePrints();
    if (!site.includes(signer)) {
      console.error(`The ${bundle ? 'bundle' : 'APK'} is signed with ${signer}, but public/.well-known/assetlinks.json names ${site.join(', ') || 'no certificate'}.`);
      console.error('Put this certificate\'s SHA-256 fingerprint in assetlinks.json (mobile/README.md, "Links that open the application"), push it, then publish the release.');
      process.exit(3);
    }
    console.log(`The site's assetlinks.json names this release's certificate (${signer}).`);
  }
}

/** The SHA-256 of the APK's signing certificate as AA:BB:..., or null when it is not signed. */
function signerOf(file) {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) return null;
  const tools = fs.readdirSync(path.join(sdk, 'build-tools')).sort().pop();
  const apksigner = path.join(sdk, 'build-tools', tools, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
  const r = spawnSync(apksigner, ['verify', '--print-certs', file], { env, encoding: 'utf8', shell: process.platform === 'win32' });
  const m = /certificate SHA-256 digest: ([0-9a-f]{64})/i.exec(r.stdout || '');
  return r.status === 0 && m ? m[1].toUpperCase().match(/../g).join(':') : null;
}

/**
 * The SHA-256 of an App Bundle's signing certificate as AA:BB:..., or null when it is not signed. A bundle is signed
 * as a JAR is, so the JDK's keytool reads it. Play App Signing keeps the same key (mobile/README.md, "Google Play"),
 * so the bundle's certificate is the one phones see.
 */
function bundleSignerOf(file) {
  const keytool = env.JAVA_HOME ? path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool') : 'keytool';
  const r = spawnSync(keytool, ['-printcert', '-jarfile', file], { env, encoding: 'utf8' });
  const m = /SHA256:\s*((?:[0-9A-F]{2}:){31}[0-9A-F]{2})/i.exec(r.stdout || '');
  return r.status === 0 && m ? m[1].toUpperCase() : null;
}

/** The fingerprints the site's assetlinks.json names for this application. */
function sitePrints() {
  const links = JSON.parse(fs.readFileSync(path.join(mobile, '..', 'public', '.well-known', 'assetlinks.json'), 'utf8'));
  return links.filter((l) => l.target?.package_name === 'sa.commshub.app').flatMap((l) => l.target.sha256_cert_fingerprints ?? []).map((f) => String(f).toUpperCase());
}
