// Builds the Android application (mobile/README.md; Android_Build_Plan.md A2).
//   node scripts/build.mjs <debug|qa|release> [direct|play]
// It copies the web folder and the configuration into the Android project (cap sync), writes the
// configuration of the development and check builds (the same file, opening the local site through the
// emulator's address with inspection on), and runs Gradle. A release opens the production address alone
// and is signed only with the owner's key (COMMSHUB_KEYSTORE_PROPERTIES); without it the APK is unsigned.
// It prints the APK's path, size and SHA-256, the figures latest.json needs.
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

const task = `assemble${channel[0].toUpperCase()}${channel.slice(1)}${kind[0].toUpperCase()}${kind.slice(1)}`;
// The update check builds the check package at a version of its own (android/app/build.gradle, checkVersion).
const checkVersion = kind === 'qa' && process.env.COMMSHUB_CHECK_VERSION ? [`-PcheckVersion=${process.env.COMMSHUB_CHECK_VERSION}`] : [];
run(path.join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), [task, ...checkVersion, '--console=plain'], android);

const outDir = path.join(android, 'app', 'build', 'outputs', 'apk', channel, kind);
const apk = fs.readdirSync(outDir).find((f) => f.endsWith('.apk'));
if (!apk) {
  console.error(`no APK in ${outDir}`);
  process.exit(1);
}
const bytes = fs.readFileSync(path.join(outDir, apk));
console.log(JSON.stringify({ apk: path.join(outDir, apk), size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
