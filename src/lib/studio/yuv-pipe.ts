// The export's BT.709 conversion off the page's thread (export.ts; MVP_draft.md 62.10). Where the encoder runs on the
// processor, each composed frame leaves the page as a VideoFrame of the canvas, and a worker reads it (VideoFrame.copyTo,
// which does not hold the page while the pixels are read), turns it into I420 with yuv.ts's own arithmetic (i420Into,
// the worker is made from its text) and sends it back as a BT.709 limited-range VideoFrame. The page draws the next
// frames meanwhile; frames come back in the order they were sent. The bytes are those of rgbaToI420 over getImageData
// on the page, which stays the way where no worker can be made (qa/studio-export-yuv.cjs holds them equal by hash).
// Measured on 2026-11-03 with no graphics chip, the page's way cost about 23 ms a 1080p frame on the page's thread.
// Browser only.
import { BT709_SPACE, i420Into } from './yuv.ts';

/** Workers by default: one converts while the other reads, and the encoder takes a third core. */
export const YUV_WORKERS = 2;

const workerText = () => `"use strict";
const i420Into = ${i420Into.toString()};
const space = ${JSON.stringify(BT709_SPACE)};
let rgba = null;
self.onmessage = async (e) => {
  const { id, frame, w, h } = e.data;
  try {
    if (!rgba || rgba.length !== w * h * 4) rgba = new Uint8ClampedArray(w * h * 4);
    await frame.copyTo(rgba, { rect: { x: 0, y: 0, width: w, height: h }, format: 'RGBA', colorSpace: 'srgb' });
    const timestamp = frame.timestamp;
    const duration = frame.duration;
    frame.close();
    const yuv = new Uint8Array(w * h * 3 / 2);
    i420Into(rgba, w, h, yuv);
    const out = new VideoFrame(yuv, { format: 'I420', codedWidth: w, codedHeight: h, timestamp, duration: duration ?? undefined, colorSpace: space });
    self.postMessage({ id, frame: out }, [out]);
  } catch (err) {
    try { frame.close(); } catch {}
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};`;

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

  private constructor(url: string, workers: Worker[], w: number, h: number) {
    this.url = url;
    this.workers = workers;
    this.w = w;
    this.h = h;
    this.depth = workers.length + 1;
    for (const w of workers) {
      w.onmessage = (e: MessageEvent<{ id: number; frame?: VideoFrame; error?: string }>) => {
        const job = this.waiting.get(e.data.id);
        this.waiting.delete(e.data.id);
        if (!job) return e.data.frame?.close();
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
      for (let i = 0; i < count; i++) made.push(new Worker(url));
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
