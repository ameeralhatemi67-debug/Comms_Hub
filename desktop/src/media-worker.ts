// The application's utility process (Desktop_App_Plan.md 5.3, phase D5): it runs FFmpeg so heavy work never
// blocks the main process or the window, and a crash here ends the jobs, not the application. It takes
// messages from the main process only (Electron's parent port; no page can reach it) and runs only what the
// main process sends: one of the application's own two programs, with the arguments media-jobs.ts made.
// Copies the person asked for run one at a time, below normal priority so the studio stays smooth; a probe runs
// at once. From D12 (Desktop_Power_Ideas.md P-08, P-30) a copy's source is served to FFmpeg over loopback
// (loopback.ts), so the main process can pause a job by stopping its bytes and resume it later with nothing lost;
// the copies made in idle time start when the main process says, outside that one-at-a-time line, because the
// main process keeps their number. FFmpeg's error lines stay here: the main process is told the kind of failure only.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { Socket } from 'node:net';
import os from 'node:os';
import { LOOPBACK_HOST, servedHeaders, servedRequest } from './loopback.ts';
import { failureOf, readProgress } from './media-jobs.ts';
import { parseRange } from './range.ts';

type Run = { type: 'run'; id: string; exe: string; args: string[]; encode: boolean; background?: boolean; serve?: { token: string; file: string } };
type In = Run | { type: 'cancel'; id: string } | { type: 'pause'; id: string } | { type: 'resume'; id: string } | { type: 'stop' };
export type Out =
  | { type: 'listening'; port: number }
  | { type: 'started'; id: string; pid: number }
  | { type: 'progress'; id: string; seconds: number }
  | { type: 'done'; id: string; ok: true; stdout: string }
  | { type: 'done'; id: string; ok: false; why: 'space' | 'decode' | 'encode' | 'failed' | 'cancelled' };

const port = (process as unknown as { parentPort: { on(e: 'message', fn: (m: { data: In }) => void): void; postMessage(m: Out): void } }).parentPort;
const children = new Map<string, ChildProcess>();
const cancelled = new Set<string>();
const queue: Run[] = [];
let encoding: string | null = null;
const MAX_STDOUT = 4 * 1024 * 1024;

// --- the loopback server ---------------------------------------------------------------------------
const CHUNK = 256 * 1024;
type Served = { id: string; file: string; size: number; paused: boolean; ended: boolean; wake: (() => void)[]; sockets: Set<Socket> };
const served = new Map<string, Served>();
const servedOf = new Map<string, string>();
let listening = 0;

function wakeAll(s: Served) {
  for (const fn of s.wake.splice(0)) fn();
}

/** Sends `from`..`to` of the file, a piece at a time; while the job is paused, nothing is sent. */
async function pump(s: Served, from: number, to: number, res: http.ServerResponse) {
  let closed = false;
  res.once('close', () => {
    closed = true;
    wakeAll(s);
  });
  const fd = await fs.promises.open(s.file, 'r');
  try {
    for (let at = from; at <= to && !closed && !s.ended; ) {
      if (s.paused) {
        await new Promise<void>((r) => s.wake.push(r));
        continue;
      }
      const buf = Buffer.allocUnsafe(Math.min(CHUNK, to - at + 1));
      const { bytesRead } = await fd.read(buf, 0, buf.length, at);
      if (!bytesRead) break;
      at += bytesRead;
      if (!res.write(buf.subarray(0, bytesRead)))
        await new Promise<void>((r) => {
          const done = () => {
            res.off('drain', done);
            res.off('close', done);
            r();
          };
          res.once('drain', done);
          res.once('close', done);
        });
    }
  } finally {
    await fd.close().catch(() => undefined);
    if (!res.writableEnded) res.end();
  }
}

const server = http.createServer((req, res) => {
  const ask = servedRequest({ method: req.method, host: req.headers.host, url: req.url }, listening, (t) => served.has(t));
  if ('status' in ask) {
    res.writeHead(ask.status, { 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  const s = served.get(ask.token)!;
  s.sockets.add(req.socket);
  req.socket.once('close', () => s.sockets.delete(req.socket));
  const range = parseRange(req.headers.range, s.size);
  if (range === 'unsatisfiable') {
    res.writeHead(416, { 'Content-Range': `bytes */${s.size}`, 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  const r = range === 'full' ? null : range;
  res.writeHead(r ? 206 : 200, servedHeaders(s.size, r));
  if (ask.head) {
    res.end();
    return;
  }
  void pump(s, r ? r.start : 0, r ? r.end : s.size - 1, res).catch(() => res.destroy());
});
server.on('clientError', (_err, socket) => socket.destroy());
// Without the server the main process gives FFmpeg the file's path, as before D12, and a held job is stopped instead.
server.on('error', () => undefined);
server.listen(0, LOOPBACK_HOST, () => {
  const a = server.address();
  listening = a && typeof a === 'object' ? a.port : 0;
  if (listening) port.postMessage({ type: 'listening', port: listening });
});

function serve(job: Run) {
  if (!job.serve) return;
  let size = 0;
  try {
    size = fs.statSync(job.serve.file).size;
  } catch {
    size = 0;
  }
  served.set(job.serve.token, { id: job.id, file: job.serve.file, size, paused: false, ended: false, wake: [], sockets: new Set() });
  servedOf.set(job.id, job.serve.token);
}

function unserve(id: string) {
  const token = servedOf.get(id);
  servedOf.delete(id);
  const s = token ? served.get(token) : undefined;
  if (!s || !token) return;
  served.delete(token);
  s.ended = true;
  wakeAll(s);
  for (const socket of s.sockets) socket.destroy();
}

function setPaused(id: string, paused: boolean) {
  const token = servedOf.get(id);
  const s = token ? served.get(token) : undefined;
  if (!s) return;
  s.paused = paused;
  if (!paused) wakeAll(s);
}

// --- the programs ----------------------------------------------------------------------------------
function start(job: Run) {
  serve(job);
  const child = spawn(job.exe, job.args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  children.set(job.id, child);
  // the main process ends this program itself if the application quits mid-job
  if (child.pid) port.postMessage({ type: 'started', id: job.id, pid: child.pid });
  if (job.encode && child.pid) {
    try {
      os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
    } catch {
      // the priority is a courtesy; the job runs either way
    }
  }
  let out = '';
  let err = '';
  let told = 0;
  let pending = '';
  child.stdout!.setEncoding('utf8');
  child.stderr!.setEncoding('utf8');
  child.stdout!.on('data', (chunk: string) => {
    if (!job.encode) {
      if (out.length < MAX_STDOUT) out += chunk;
      return;
    }
    // -progress writes key=value lines; a chunk may end inside one
    pending += chunk;
    const cut = pending.lastIndexOf('\n');
    if (cut < 0) return;
    const p = readProgress(pending.slice(0, cut));
    pending = pending.slice(cut + 1);
    const now = Date.now();
    if (p.seconds !== null && now - told > 250) {
      told = now;
      port.postMessage({ type: 'progress', id: job.id, seconds: p.seconds });
    }
  });
  child.stderr!.on('data', (chunk: string) => {
    err = (err + chunk).slice(-8192);
  });
  let ended = false;
  const end = (code: number | null) => {
    if (ended) return;
    ended = true;
    children.delete(job.id);
    unserve(job.id);
    if (cancelled.delete(job.id)) port.postMessage({ type: 'done', id: job.id, ok: false, why: 'cancelled' });
    else if (code === 0) port.postMessage({ type: 'done', id: job.id, ok: true, stdout: out });
    else port.postMessage({ type: 'done', id: job.id, ok: false, why: failureOf(err) });
    if (job.encode && !job.background) {
      encoding = null;
      next();
    }
  };
  child.on('error', () => end(-1));
  child.on('close', (code) => end(code));
}

function next() {
  if (encoding) return;
  const job = queue.shift();
  if (!job) return;
  encoding = job.id;
  start(job);
}

port.on('message', ({ data }) => {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'run') {
    if (data.encode && !data.background) {
      queue.push(data);
      next();
    } else start(data);
  } else if (data.type === 'cancel') {
    const waiting = queue.findIndex((j) => j.id === data.id);
    if (waiting >= 0) {
      queue.splice(waiting, 1);
      port.postMessage({ type: 'done', id: data.id, ok: false, why: 'cancelled' });
      return;
    }
    const child = children.get(data.id);
    if (child) {
      cancelled.add(data.id);
      child.kill();
    }
  } else if (data.type === 'pause' || data.type === 'resume') {
    setPaused(data.id, data.type === 'pause');
  } else if (data.type === 'stop') {
    // the application is quitting: nothing is left running behind it
    queue.length = 0;
    for (const child of children.values()) child.kill();
    process.exit(0);
  }
});
