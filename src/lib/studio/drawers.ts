// The export's drawing in workers, the page's half (Desktop_Power_Ideas.md P-07; MVP_draft.md 62.10). `Drawers.open`
// starts a few export-draw.ts workers for one project and size, and gives each what drawing needs: the project, the
// font faces this page has loaded (their files and ranges, read from its style sheets, so a worker falls back from
// one font to another exactly where the page does), the project's pictures, and the brand marks and template assets
// it uses. `draw` sends one frame's decoded video frames, and the composed frames come back in the order sent, as
// VideoFrames the export encodes as it encodes its own canvas. Composed frames are the page's byte for byte where the
// proof has been run (qa/studio-export-draw.cjs); where a worker cannot be started or fails, the export draws on the
// page, the floor. Browser only.
import { canvasOf, durationOf, type ProjectDoc } from './schema.ts';
import { sourceOf } from './timeline.ts';
import type { MediaPool } from './media.ts';

/** A font face as a worker makes it again: its family, its files (absolute addresses) and its descriptors. */
export type FaceSpec = { family: string; src: string; weight: string; style: string; stretch: string; unicodeRange: string };

const clean = (v: string) => v.trim().replace(/^["']|["']$/g, '');

/** Every @font-face rule of this page's style sheets, with its files made absolute, by family. */
function faceRules(): Map<string, FaceSpec[]> {
  const out = new Map<string, FaceSpec[]>();
  const walk = (rules: CSSRuleList, base: string) => {
    for (const r of Array.from(rules)) {
      if (r instanceof CSSFontFaceRule) {
        const s = r.style;
        const family = clean(s.getPropertyValue('font-family'));
        const src = s.getPropertyValue('src').replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (_m, _q, u: string) => `url("${new URL(u, base).href}")`);
        const spec = { family, src, weight: s.getPropertyValue('font-weight') || 'normal', style: s.getPropertyValue('font-style') || 'normal', stretch: s.getPropertyValue('font-stretch') || 'normal', unicodeRange: s.getPropertyValue('unicode-range') || 'U+0-10FFFF' };
        out.set(family, [...(out.get(family) ?? []), spec]);
      } else if ('cssRules' in r) walk((r as CSSGroupingRule).cssRules, base);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules, sheet.href ?? location.href);
    } catch {
      // a sheet from elsewhere cannot be read; the studio's fonts are the site's own
    }
  }
  return out;
}

const norm = (v: string) => v.replace(/\s+/g, '').toLowerCase();
const weightOf = (v: string) => (v === 'normal' ? '400' : v === 'bold' ? '700' : v);

/**
 * The faces this page has loaded, as workers make them again; null when one of them cannot be matched to a rule (the
 * export then draws on the page).
 */
export function loadedFaces(): FaceSpec[] | null {
  const rules = faceRules();
  const out: FaceSpec[] = [];
  for (const f of Array.from(document.fonts as unknown as Iterable<FontFace>)) {
    if (f.status !== 'loaded') continue;
    const family = clean(f.family);
    const match = (rules.get(family) ?? []).find((r) => weightOf(norm(r.weight)) === weightOf(norm(f.weight)) && norm(r.style) === norm(f.style) && norm(r.unicodeRange) === norm(f.unicodeRange));
    if (!match) return null;
    out.push(match);
  }
  return out;
}

type Job = { resolve: (f: VideoFrame) => void; reject: (e: Error) => void };
const DRAW_WORKER = () => new Worker(new URL('./export-draw.ts', import.meta.url), { type: 'module', name: 'export-draw' });

export class Drawers {
  /** Frames the page may send before it waits for the oldest to come back. */
  readonly depth: number;
  private readonly workers: Worker[];
  private readonly waiting = new Map<number, Job>();
  private seq = 0;
  private turn = 0;
  private failed: Error | null = null;

  private constructor(workers: Worker[]) {
    this.workers = workers;
    this.depth = workers.length * 2;
    for (const w of workers) {
      w.onmessage = (e: MessageEvent<{ kind: string; id: number; frame?: VideoFrame; error?: string }>) => {
        if (e.data.kind !== 'frame') return;
        const job = this.waiting.get(e.data.id);
        this.waiting.delete(e.data.id);
        if (!job) return e.data.frame?.close();
        if (e.data.frame) job.resolve(e.data.frame);
        else job.reject(new Error(e.data.error || 'DRAW_WORKER'));
      };
      w.onerror = () => this.fail(new Error('DRAW_WORKER'));
    }
  }

  /**
   * `count` workers drawing `doc` at w by h, or null where they cannot be started here or one does not get ready (the
   * export draws on the page).
   */
  static async open(doc: ProjectDoc, pool: MediaPool, o: { w: number; h: number; watermark: string | null; count: number; make?: () => Worker }): Promise<Drawers | null> {
    if (o.count < 1 || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof VideoFrame === 'undefined' || typeof createImageBitmap === 'undefined') return null;
    const faces = loadedFaces();
    if (!faces) return null;
    const ids = new Set<string>();
    const stickers = new Set<string>();
    let motion = false;
    for (const t of doc.video?.tracks ?? []) {
      for (const c of t.clips) {
        if (c.source && sourceOf(doc, c.source)?.media === 'image') ids.add(c.source);
        if (c.sticker) stickers.add(c.sticker.key);
        if (c.motion) motion = true;
      }
    }
    const made: Worker[] = [];
    try {
      for (let i = 0; i < o.count; i++) {
        const worker = (o.make ?? DRAW_WORKER)();
        made.push(worker);
        const images: [string, ImageBitmap][] = [];
        for (const id of ids) {
          const img = pool.image(id);
          if (img) images.push([id, await createImageBitmap(img)]);
        }
        const ok = new Promise<boolean>((resolve) => {
          worker.onmessage = (e: MessageEvent<{ kind: string }>) => resolve(e.data.kind === 'ready');
          worker.onerror = () => resolve(false);
        });
        worker.postMessage({ kind: 'init', doc, w: o.w, h: o.h, scale: o.w / canvasOf(doc).w, watermark: o.watermark, faces, images, stickers: [...stickers], motion }, images.map(([, b]) => b));
        if (!(await ok)) throw new Error('DRAW_WORKER');
      }
      return new Drawers(made);
    } catch {
      for (const w of made) w.terminate();
      return null;
    }
  }

  /** One frame: its video frames by clip (taken: closed here), back as the composed VideoFrame; in the order sent. */
  draw(t: number, duration: number, frames: [string, ImageBitmap | null][]): Promise<VideoFrame> {
    const bitmaps = frames.map(([, b]) => b).filter((b): b is ImageBitmap => !!b);
    if (this.failed) {
      for (const b of bitmaps) b.close();
      return Promise.reject(this.failed);
    }
    const id = ++this.seq;
    const worker = this.workers[this.turn++ % this.workers.length];
    const p = new Promise<VideoFrame>((resolve, reject) => this.waiting.set(id, { resolve, reject }));
    p.catch(() => undefined);
    try {
      worker.postMessage({ kind: 'draw', id, t, duration, frames }, bitmaps);
    } catch (e) {
      for (const b of bitmaps) b.close();
      this.fail(e instanceof Error ? e : new Error('DRAW_WORKER'));
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
  }
}

/** Whether a project can be drawn by workers at all: a video project with something to draw. */
export const drawable = (doc: ProjectDoc) => doc.kind === 'video' && durationOf(doc) > 0;
