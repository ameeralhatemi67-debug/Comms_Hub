// Fetches the pinned LGPL FFmpeg build (ffmpeg.lock.json) into vendor/ffmpeg for packaging (Desktop_App_Plan.md
// D5, decision D-9). The archive is downloaded into a new empty folder, its size and SHA-256 are checked
// against the pin before anything is opened, and only then is it unpacked, into another new folder, from
// which the programs, the libraries and the licence are copied. Nothing from the archive is run here. A
// vendor/ffmpeg whose recorded hash matches the pin is kept as it is.
// Usage: node scripts/fetch-ffmpeg.mjs   (writes vendor/ffmpeg/, ignored by git)
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(fs.readFileSync(path.join(desktop, 'ffmpeg.lock.json'), 'utf8'));
const vendor = path.join(desktop, 'vendor', 'ffmpeg');
const stamp = path.join(vendor, 'PINNED.json');

/** The files the application ships: the two programs, their libraries, and the licence. */
export const SHIPPED = /^(ffmpeg\.exe|ffprobe\.exe|[a-z0-9_-]+-\d+\.dll|LICENSE\.txt)$/i;

async function download(url, file) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`);
  const out = fs.createWriteStream(file);
  for await (const chunk of res.body) out.write(chunk);
  await new Promise((r) => out.end(r));
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export async function fetchFfmpeg() {
  if (fs.existsSync(stamp) && JSON.parse(fs.readFileSync(stamp, 'utf8')).sha256 === lock.sha256) return { kept: true, files: fs.readdirSync(vendor) };
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'comms-hub-ffmpeg-'));
  const downloads = path.join(work, 'download');
  const unpacked = path.join(work, 'unpacked');
  fs.mkdirSync(downloads);
  fs.mkdirSync(unpacked);
  try {
    const archive = path.join(downloads, lock.file);
    await download(lock.url, archive);
    const size = fs.statSync(archive).size;
    const hash = sha256(archive);
    if (size !== lock.size || hash !== lock.sha256) throw new Error(`the archive is not the pinned one: ${size} bytes, sha256 ${hash}`);
    // Windows' own tar (bsdtar) reads zip archives; another tar on the PATH may take "C:" for a host
    const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    const r = spawnSync(tar, ['-xf', archive, '-C', unpacked], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`could not unpack: ${r.stderr}`);
    const root = path.join(unpacked, fs.readdirSync(unpacked)[0]);
    fs.rmSync(vendor, { recursive: true, force: true });
    fs.mkdirSync(vendor, { recursive: true });
    const copied = [];
    for (const dir of [path.join(root, 'bin'), root]) {
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        if (!SHIPPED.test(name) || copied.includes(name) || !fs.statSync(path.join(dir, name)).isFile()) continue;
        fs.copyFileSync(path.join(dir, name), path.join(vendor, name));
        copied.push(name);
      }
    }
    fs.writeFileSync(stamp, JSON.stringify({ release: lock.release, file: lock.file, sha256: lock.sha256, version: lock.version, files: copied.sort() }, null, 2));
    return { kept: false, files: copied.sort() };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const r = await fetchFfmpeg();
  console.log(`${r.kept ? 'kept' : 'fetched'} ${lock.version}: ${r.files.join(', ')}`);
}
