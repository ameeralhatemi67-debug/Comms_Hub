// The two chores around a release (Desktop_App_Plan.md 7.4, phase D3; decision D-6). The owner uploads; this
// only prepares and checks, and it never uploads or signs in anywhere.
//   node scripts/release.mjs bump <x.y.z>   raises the version in package.json and the lockfile's two copies
//   node scripts/release.mjs check          proves dist/release/ is ready to upload, and says in what order
// The installed applications update only to a version strictly higher than their own, so `check` also reads the
// published latest.yml (when it can be reached) and refuses a version that would not be offered to anyone.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FEED = 'https://hrghmioxvgkjpnydrxrk.supabase.co/storage/v1/object/public/desktop-releases/windows-x64';
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** 1 when a is higher, -1 when lower, 0 when equal; null if either is not x.y.z. */
export function compare(a, b) {
  const x = SEMVER.exec(a);
  const y = SEMVER.exec(b);
  if (!x || !y) return null;
  for (let i = 1; i <= 3; i++) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) > Number(y[i]) ? 1 : -1;
  return 0;
}

/** The fields of latest.yml that matter (the file electron-builder writes), or null. */
export function readLatest(text) {
  const field = (name) => new RegExp(`^\\s*-?\\s*${name}:\\s*['"]?([^'"\\r\\n]+?)['"]?\\s*$`, 'm').exec(text)?.[1] ?? null;
  const version = field('version');
  const file = field('path');
  const sha512 = field('sha512');
  const size = Number(field('size'));
  if (!version || !SEMVER.test(version) || !file || !/^[\w.-]+\.exe$/.test(file) || !sha512) return null;
  return { version, file, sha512, size: Number.isSafeInteger(size) && size > 0 ? size : null };
}

/** The version raised to `next`, in the text of package.json or of the lockfile (its root and "" package). */
export function bumpText(text, from, next) {
  const json = JSON.parse(text);
  if (json.version !== from) throw new Error(`expected version ${from}, found ${json.version}`);
  json.version = next;
  if (json.packages?.['']?.version === from) json.packages[''].version = next;
  return JSON.stringify(json, null, 2) + (text.endsWith('\n') ? '\n' : '');
}

function bump(next) {
  if (!SEMVER.test(next ?? '')) throw new Error('usage: node scripts/release.mjs bump <x.y.z>');
  const pkgFile = path.join(desktop, 'package.json');
  const lockFile = path.join(desktop, 'package-lock.json');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  if (compare(next, pkg.version) !== 1) throw new Error(`${next} is not higher than ${pkg.version}`);
  fs.writeFileSync(pkgFile, bumpText(fs.readFileSync(pkgFile, 'utf8'), pkg.version, next));
  fs.writeFileSync(lockFile, bumpText(fs.readFileSync(lockFile, 'utf8'), pkg.version, next));
  console.log(`version ${pkg.version} -> ${next} (package.json and package-lock.json). Now: npm run pack, then npm run release:check`);
}

async function publishedVersion() {
  try {
    const res = await fetch(`${FEED}/latest.yml`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    return res.ok ? (readLatest(await res.text())?.version ?? null) : null;
  } catch {
    return null;
  }
}

async function check() {
  const out = path.join(desktop, 'dist', 'release');
  const problems = [];
  const pkg = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));
  const ymlFile = path.join(out, 'latest.yml');
  if (!fs.existsSync(ymlFile)) throw new Error('dist/release/latest.yml is missing: run npm run pack first');
  const latest = readLatest(fs.readFileSync(ymlFile, 'utf8'));
  if (!latest) throw new Error('latest.yml is not the file electron-builder writes');
  if (latest.version !== pkg.version) problems.push(`latest.yml says ${latest.version}, package.json says ${pkg.version}: pack again`);
  if (latest.file !== `CommsHub-Setup-${latest.version}-x64.exe`) problems.push(`unexpected installer name ${latest.file}`);
  const exe = path.join(out, latest.file);
  const map = `${exe}.blockmap`;
  if (!fs.existsSync(exe)) problems.push(`${latest.file} is missing`);
  else {
    const bytes = fs.readFileSync(exe);
    if (latest.size !== null && bytes.length !== latest.size) problems.push(`installer is ${bytes.length} bytes, latest.yml says ${latest.size}`);
    if (crypto.createHash('sha512').update(bytes).digest('base64') !== latest.sha512) problems.push('installer SHA-512 differs from latest.yml: upload would be refused by every application');
    if (bytes.length > 300 * 1024 * 1024) problems.push('installer is over the bucket limit of 300 MB');
  }
  if (!fs.existsSync(map)) problems.push(`${latest.file}.blockmap is missing`);
  const published = await publishedVersion();
  if (published && compare(latest.version, published) !== 1) problems.push(`published version is ${published}: ${latest.version} would be offered to nobody`);
  if (problems.length) {
    for (const p of problems) console.error(`NOT READY: ${p}`);
    process.exitCode = 1;
    return;
  }
  console.log(`READY: ${latest.version}${published ? ` (published now: ${published})` : ' (nothing published yet)'}`);
  console.log(`Upload to Storage > desktop-releases > windows-x64, in this order, from ${out}:`);
  console.log(`  1. ${latest.file}`);
  console.log(`  2. ${latest.file}.blockmap`);
  console.log('  3. latest.yml   (last, replacing the old one)');
}

const [command, arg] = process.argv.slice(2);
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (command === 'bump') bump(arg);
    else if (command === 'check') await check();
    else throw new Error('usage: node scripts/release.mjs bump <x.y.z> | check');
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
