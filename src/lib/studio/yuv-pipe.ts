// The export's BT.709 conversion off the page's thread (export.ts; MVP_draft.md 62.10). Where the encoder runs on the
// processor, each composed frame leaves the page as a VideoFrame of the canvas, and a worker reads it (VideoFrame.copyTo,
// which does not hold the page while the pixels are read), turns it into I420 with yuv.ts's own arithmetic and sends it
// back as a BT.709 limited-range VideoFrame. The page draws the next frames meanwhile; frames come back in the order
// they were sent. The arithmetic is yuv-simd.ts's WebAssembly, four pixels at a time, with i420Into for the last
// columns of a width that is not a multiple of 16, and i420Into alone where WebAssembly's lanes are missing (the worker
// is made from its text). The bytes are those of rgbaToI420 over getImageData on the page, which stays the way where
// no worker can be made (tests/studio-export-power.test.mjs and qa/studio-export-yuv.cjs hold them equal). Measured on
// 2026-11-03 and 04 with no graphics chip, a 1080p frame cost the page's thread about 23 ms that way; in a worker the
// conversion is about 3 ms with WebAssembly and 13 ms without. Browser only.
import { BT709_SPACE, i420Into } from './yuv.ts';
import { simdModule } from './yuv-simd.ts';

/** Workers by default: one converts while the other reads, and the encoder takes a third core. */
export const YUV_WORKERS = 2;

const workerText = () => `"use strict";
const i420Into = ${i420Into.toString()};
const space = ${JSON.stringify(BT709_SPACE)};
let mod = null;
let size = 0;
let convert = null;
let rgba = null;
let yuv = null;
// the pixels at 0 of the module's memory and the planes after them; plain buffers where there is no module
const ready = (w, h) => {
  if (size === w * h) return;
  size = w * h;
  convert = null;
  if (mod) {
    try {
      const memory = new WebAssembly.Memory({ initial: Math.ceil((size * 4 + size * 3 / 2) / 65536) });
      convert = new WebAssembly.Instance(mod, { env: { memory } }).exports.convert;
      rgba = new Uint8Array(memory.buffer, 0, size * 4);
      yuv = new Uint8Array(memory.buffer, size * 4, size * 3 / 2);
      return;
    } catch {
      convert = null;
    }
  }
  rgba = new Uint8Array(size * 4);
  yuv = new Uint8Array(size * 3 / 2);
};
self.onmessage = async (e) => {
  if ('module' in e.data) {
    mod = e.data.module;
    return;
  }
  const { id, frame, w, h } = e.data;
  try {
    ready(w, h);
    await frame.copyTo(rgba, { rect: { x: 0, y: 0, width: w, height: h }, format: 'RGBA', colorSpace: 'srgb' });
    const timestamp = frame.timestamp;
    const duration = frame.duration;
    frame.close();
    const x1 = convert ? w - (w % 16) : 0;
    if (convert) convert(w, h, x1);
    if (x1 < w) i420Into(rgba, w, h, yuv, x1);
    const out = new VideoFrame(yuv, { format: 'I420', codedWidth: w, codedHeight: h, timestamp, duration: duration ?? undefined, colorSpace: space });
    self.postMessage({ id, frame: out, simd: !!convert }, [out]);
  } catch (err) {
    try { frame.close(); } catch {}
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};`;

let compiled: WebAssembly.Module | null | undefined;
/** The conversion's module, compiled once (null where WebAssembly or its 128-bit lanes are missing). */
function simd(): WebAssembly.Module | null {
  if (compiled !== undefined) return compiled;
  try {
    const bytes = simdModule();
    compiled = typeof WebAssembly !== 'undefined' && WebAssembly.validate(bytes) ? new WebAssembly.Module(bytes) : null;
  } catch {
    compiled = null;
  }
  return compiled;
}

type Waiting = { resolve: (f: VideoFrame) => void; reject: (e: Error) => void };

export class YuvPipe {
  /** Frames the page may send before it waits for the oldest to come back. */
  readonly depth: number;
  private readonly workers: Worker[];
  private readonly waiting = new Map<number, Waiting>();
  private seq = 0;
  private turn = 0;
  private failed: Error | null = null;
  private readonly url: string;
  private readonly w: number;
  private readonly h: number;
  /** Whether the workers converted with WebAssembly (known from the first frame back). */
  simd: boolean | null = null;

  private constructor(url: string, workers: Worker[], w: number, h: number) {
    this.url = url;
    this.workers = workers;
    this.w = w;
    this.h = h;
    this.depth = workers.length + 1;
    for (const w of workers) {
      w.onmessage = (e: MessageEvent<{ id: number; frame?: VideoFrame; simd?: boolean; error?: string }>) => {
        const job = this.waiting.get(e.data.id);
        this.waiting.delete(e.data.id);
        if (!job) return e.data.frame?.close();
        this.simd ??= e.data.simd ?? null;
        if (e.data.frame) job.resolve(e.data.frame);
        else job.reject(new Error(e.data.error || 'YUV_WORKER'));
      };
      w.onerror = () => this.fail(new Error('YUV_WORKER'));
    }
  }

  /** Workers for frames of w by h, or null where this browser cannot make them (the page converts, as before). */
  static open(w: number, h: number, count = YUV_WORKERS): YuvPipe | null {
    if (count < 1 || w % 2 || h % 2) return null;
    if (typeof Worker === 'undefined' || typeof VideoFrame === 'undefined' || typeof Blob === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    let url = '';
    const made: Worker[] = [];
    try {
      url = URL.createObjectURL(new Blob([workerText()], { type: 'text/javascript' }));
      const module = simd();
      for (let i = 0; i < count; i++) {
        const worker = new Worker(url);
        worker.postMessage({ module });
        made.push(worker);
      }
      return new YuvPipe(url, made, w, h);
    } catch {
      for (const x of made) x.terminate();
      if (url) URL.revokeObjectURL(url);
      return null;
    }
  }

  /** One frame of the canvas, taken by the pipe (it is closed here), back as BT.709 I420; in the order sent. */
  convert(frame: VideoFrame): Promise<VideoFrame> {
    if (this.failed) {
      frame.close();
      return Promise.reject(this.failed);
    }
    const id = ++this.seq;
    const worker = this.workers[this.turn++ % this.workers.length];
    const p = new Promise<VideoFrame>((resolve, reject) => this.waiting.set(id, { resolve, reject }));
    // a later frame's failure is read when its turn comes; until then it must not be reported as unhandled
    p.catch(() => undefined);
    try {
      worker.postMessage({ id, frame, w: this.w, h: this.h }, [frame]);
    } catch (e) {
      frame.close();
      this.fail(e instanceof Error ? e : new Error('YUV_WORKER'));
    }
    return p;
  }

  private fail(e: Error) {
    this.failed ??= e;
    for (const job of this.waiting.values()) job.reject(this.failed);
    this.waiting.clear();
  }

  close() {
    this.fail(new Error('closed'));
    for (const w of this.workers) w.terminate();
    URL.revokeObjectURL(this.url);
  }
}
