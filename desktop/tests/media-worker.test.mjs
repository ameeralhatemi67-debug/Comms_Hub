// The utility process for real (src/media-worker.ts, src/loopback.ts; D12, Desktop_Power_Ideas.md P-08 and P-30), run
// under plain Node with the pinned FFmpeg (skipped until scripts/fetch-ffmpeg.mjs has run): a light copy read over
// loopback is the copy read from the file, frame for frame; a paused copy stops making progress within a second and,
// resumed, ends as the same copy; the loopback server answers nothing but its running jobs' own addresses.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fork, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { newToken } from '../src/files.ts';
import { servedHeaders, servedRequest, servedUrl } from '../src/loopback.ts';
import { proxyArgs } from '../src/media-jobs.ts';

const vendor = fileURLToPath(new URL('../vendor/ffmpeg/', import.meta.url));
const ffmpeg = path.join(vendor, 'ffmpeg.exe');
const shipped = process.platform === 'win32' && fs.existsSync(ffmpeg);
const token = () => newToken(crypto.randomBytes(32));

test('the loopback address is one token on 127.0.0.1; a request is answered only for a running job, with its own Host', () => {
  const t = token();
  assert.equal(servedUrl(5123, t), `http://127.0.0.1:5123/${t}`);
  for (const [p, x] of [[0, t], [70000, t], [5123, 'short'], [5123, '../x']]) assert.throws(() => servedUrl(p, x), String(p));
  const known = (x) => x === t;
  assert.deepEqual(servedRequest({ method: 'GET', host: '127.0.0.1:5123', url: `/${t}` }, 5123, known), { token: t, head: false });
  assert.deepEqual(servedRequest({ method: 'HEAD', host: '127.0.0.1:5123', url: `/${t}` }, 5123, known), { token: t, head: true });
  for (const bad of [
    { method: 'POST', host: '127.0.0.1:5123', url: `/${t}` },
    { method: 'PUT', host: '127.0.0.1:5123', url: `/${t}` },
  ])
    assert.deepEqual(servedRequest(bad, 5123, known), { status: 405 });
  for (const bad of [
    { method: 'GET', host: 'localhost:5123', url: `/${t}` },
    { method: 'GET', host: 'evil.example:5123', url: `/${t}` },
    { method: 'GET', host: '127.0.0.1:5124', url: `/${t}` },
    { method: 'GET', url: `/${t}` },
    { method: 'GET', host: '127.0.0.1:5123', url: `/${token()}` },
    { method: 'GET', host: '127.0.0.1:5123', url: `/${t}?x=1` },
    { method: 'GET', host: '127.0.0.1:5123', url: `/${t}/` },
    { method: 'GET', host: '127.0.0.1:5123', url: '/C:/Users/x.mov' },
  ])
    assert.deepEqual(servedRequest(bad, 5123, known), { status: 404 }, JSON.stringify(bad));
  const h = servedHeaders(1000, { start: 10, end: 19 });
  assert.equal(h['Content-Range'], 'bytes 10-19/1000');
  assert.equal(h['Content-Length'], '10');
  assert.equal(Object.keys(h).some((k) => /access-control/i.test(k)), false, 'nothing opens the bytes to a browser');
});

/** The utility process under Node, and its messages. */
function startWorker() {
  const child = fork(fileURLToPath(new URL('./support/worker-host.mjs', import.meta.url)), [], { execArgv: ['--experimental-strip-types', '--no-warnings'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const seen = [];
  const waits = [];
  child.on('message', (m) => {
    seen.push({ at: Date.now(), ...m });
    for (const w of waits.slice()) if (w.test(m)) (waits.splice(waits.indexOf(w), 1), clearTimeout(w.timer), w.resolve(m));
  });
  const next = (test, ms = 60000) =>
    new Promise((resolve, reject) => {
      const hit = seen.find((m) => test(m));
      if (hit) return resolve(hit);
      const w = { test, resolve, timer: null };
      waits.push(w);
      w.timer = setTimeout(() => (waits.includes(w) ? (waits.splice(waits.indexOf(w), 1), reject(new Error('no message'))) : undefined), ms);
    });
  return { child, seen, next, send: (m) => child.send(m) };
}
const get = (port, url, { method = 'GET', host = `127.0.0.1:${port}`, headers = {} } = {}) =>
  new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: { host, ...headers } }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
    });
    req.on('error', () => resolve({ status: 0 }));
    req.end();
  });
const frameHashes = (file) => spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-map', '0:v', '-f', 'framemd5', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));

test('a light copy read over loopback is the copy read from the file; paused, it stops within a second; resumed, it ends the same', { skip: !shipped && 'vendor/ffmpeg not fetched', timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comms-hub-worker-'));
  const w = startWorker();
  try {
    const src = path.join(dir, 'src.mpg');
    const made = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=25:duration=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=30', '-c:v', 'mpeg2video', '-q:v', '6', '-c:a', 'mp2', '-f', 'mpeg', src], { encoding: 'utf8' });
    assert.equal(made.status, 0, made.stderr);
    const { port } = await w.next((m) => m.type === 'listening', 10000);
    assert.ok(port > 0, 'the server listens');

    const copy = async (id, out, served, onProgress) => {
      const t = served ? token() : null;
      w.send({ type: 'run', id, exe: ffmpeg, args: proxyArgs(t ? servedUrl(port, t) : src, out, 720), encode: true, background: true, serve: t ? { token: t, file: src } : undefined });
      onProgress?.(t);
      return w.next((m) => m.type === 'done' && m.id === id, 240000);
    };

    const fromFile = path.join(dir, 'file.part');
    const t0 = Date.now();
    assert.equal((await copy('file', fromFile, false)).ok, true);
    const fileMs = Date.now() - t0;

    // over loopback, and the server's answers while it runs
    const fromLoop = path.join(dir, 'loop.part');
    let probes = null;
    const t1 = Date.now();
    const loopDone = copy('loop', fromLoop, true, (t) => {
      probes = (async () => {
        await w.next((m) => m.type === 'progress' && m.id === 'loop', 60000);
        return {
          head: await get(port, `/${t}`, { method: 'HEAD' }),
          range: await get(port, `/${t}`, { method: 'HEAD', headers: { range: 'bytes=0-99' } }),
          post: await get(port, `/${t}`, { method: 'POST' }),
          host: await get(port, `/${t}`, { host: 'localhost:' + port }),
          other: await get(port, `/${token()}`),
          after: () => get(port, `/${t}`),
        };
      })();
    });
    assert.equal((await loopDone).ok, true);
    const loopMs = Date.now() - t1;
    const p = await probes;
    assert.equal(p.head.status, 200);
    assert.equal(Number(p.head.headers['content-length']), fs.statSync(src).size);
    assert.equal(p.head.headers['accept-ranges'], 'bytes');
    assert.equal(p.range.status, 206);
    assert.equal(p.range.headers['content-range'], `bytes 0-99/${fs.statSync(src).size}`);
    assert.deepEqual([p.post.status, p.host.status, p.other.status], [405, 404, 404], 'another method, another Host, another token');
    assert.equal((await p.after()).status, 404, 'a finished job\'s address answers nothing');
    const reference = frameHashes(fromFile);
    assert.ok(reference.length >= 740, `frames: ${reference.length}`);
    assert.deepEqual(frameHashes(fromLoop), reference, 'the same frames, read either way');

    // paused after a second of work, held three seconds, then resumed
    const fromPaused = path.join(dir, 'paused.part');
    const pausedDone = copy('paused', fromPaused, true);
    await w.next((m) => m.type === 'progress' && m.id === 'paused' && m.seconds > 2, 60000);
    const pausedAt = Date.now();
    w.send({ type: 'pause', id: 'paused' });
    await new Promise((r) => setTimeout(r, 4000));
    const told = w.seen.filter((m) => m.type === 'progress' && m.id === 'paused');
    const settled = Math.max(0, ...told.filter((m) => m.at <= pausedAt + 1000).map((m) => m.seconds));
    const later = Math.max(0, ...told.filter((m) => m.at > pausedAt + 1000).map((m) => m.seconds));
    w.send({ type: 'resume', id: 'paused' });
    const done = await pausedDone;
    assert.equal(done.ok, true);
    assert.ok(later <= settled + 0.001, `no progress from one second after the pause: ${settled} s then ${later} s`);
    assert.deepEqual(frameHashes(fromPaused), reference, 'resumed, the same copy');
    console.log(`# copy from the file ${fileMs} ms, over loopback ${loopMs} ms; paused at ${settled.toFixed(2)} s, ${later.toFixed(2)} s three seconds later`);
  } finally {
    w.send({ type: 'stop' });
    await new Promise((r) => setTimeout(r, 300));
    w.child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a paused copy whose source FFmpeg read whole before the pause is ended as held, to be made again later', { skip: !shipped && 'vendor/ffmpeg not fetched', timeout: 180000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comms-hub-held-'));
  const w = startWorker();
  try {
    // a still picture compresses to almost nothing: the whole file is read at once
    const src = path.join(dir, 'still.mpg');
    const made = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=3840x2160:rate=25:duration=60', '-c:v', 'mpeg2video', '-q:v', '31', '-g', '600', '-f', 'mpeg', src], { encoding: 'utf8' });
    assert.equal(made.status, 0, made.stderr);
    assert.ok(fs.statSync(src).size < 8 * 1024 * 1024, `small for its length: ${fs.statSync(src).size} bytes`);
    const { port } = await w.next((m) => m.type === 'listening', 10000);
    const t = token();
    w.send({ type: 'run', id: 'still', exe: ffmpeg, args: proxyArgs(servedUrl(port, t), path.join(dir, 'still.part'), 720), encode: true, background: true, serve: { token: t, file: src } });
    await w.next((m) => m.type === 'progress' && m.id === 'still' && m.seconds > 1, 60000);
    const at = Date.now();
    w.send({ type: 'pause', id: 'still' });
    const done = await w.next((m) => m.type === 'done' && m.id === 'still', 20000);
    const ms = Date.now() - at;
    assert.equal(done.ok, false, 'it did not run on to the end');
    assert.equal(done.why, 'held');
    assert.ok(ms <= 2500, `ended ${ms} ms after the pause`);
    console.log(`# a still source's copy went on after the pause and was ended ${ms} ms later`);
  } finally {
    w.send({ type: 'stop' });
    await new Promise((r) => setTimeout(r, 300));
    w.child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
