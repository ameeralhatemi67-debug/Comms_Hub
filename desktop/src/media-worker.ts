// The application's utility process (Desktop_App_Plan.md 5.3, phase D5): it runs FFmpeg so heavy work never
// blocks the main process or the window, and a crash here ends the jobs, not the application. It takes
// messages from the main process only (Electron's parent port; no page can reach it) and runs only what the
// main process sends: one of the application's own two programs, with the arguments media-jobs.ts made.
// Encodings run one at a time, below normal priority so the studio stays smooth; a probe runs at once.
// FFmpeg's error lines stay here: the main process is told the kind of failure only.
import { spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import { failureOf, readProgress } from './media-jobs.ts';

type Run = { type: 'run'; id: string; exe: string; args: string[]; encode: boolean };
type In = Run | { type: 'cancel'; id: string } | { type: 'stop' };
export type Out =
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

function start(job: Run) {
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
    if (cancelled.delete(job.id)) port.postMessage({ type: 'done', id: job.id, ok: false, why: 'cancelled' });
    else if (code === 0) port.postMessage({ type: 'done', id: job.id, ok: true, stdout: out });
    else port.postMessage({ type: 'done', id: job.id, ok: false, why: failureOf(err) });
    if (job.encode) {
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
    if (data.encode) {
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
  } else if (data.type === 'stop') {
    // the application is quitting: nothing is left running behind it
    queue.length = 0;
    for (const child of children.values()) child.kill();
    process.exit(0);
  }
});
