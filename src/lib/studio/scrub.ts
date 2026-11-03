// The paused preview's frame cache, «ذاكرة الإطارات للتنقل» (Desktop_Power_Ideas.md P-02, phase D10; MVP_draft.md
// 62.5): the frames decoded on the way to the playhead and just after it are kept, so a step back, a step forward or a
// return to a moment is drawn at once instead of decoded again from the key frame. Speed only:
//   - which frame: a time takes the last frame that starts at most a microsecond after it, the export's own rule
//     (export.ts frameFor), and a kept frame answers a time only while the next frame is known to start after it;
//   - its size: a power-of-two share of the source, never smaller than the largest size any clip of the source is
//     drawn at on the preview (so the layout of compose.ts is the same, to the bit, as with the full frame);
//   - how many: as many as the plan's megabytes hold (scale.ts frameCacheMB), the least recently shown let go first.
// A budget of 0 is the floor: media.ts then decodes as it always did. Pure: no canvas is made here (C is the canvas).
import { canvasOf, type ProjectDoc } from './schema.ts';

/** A time takes the last frame starting at most this long after it, in seconds (export.ts frameFor). */
export const EPS = 1e-6;
/** Shares of a source's size a frame may be kept at. */
export const DIVISORS = Object.freeze([8, 4, 2, 1]);
/** The most an entry or exit movement, or a transition, enlarges a clip (transitions.ts: «تكبير» from 1.6). */
export const MOVEMENT_HEADROOM = 1.6;

/**
 * The share of a source's size its frames are kept at: the largest power of two that divides both sides exactly
 * and still leaves the frame at least `need` (preview pixels). 1 is the whole frame.
 */
export function divisorFor(w: number, h: number, needW: number, needH: number): number {
  for (const d of DIVISORS) {
    if (d === 1) return 1;
    if (w % d || h % d) continue;
    if (w / d >= Math.ceil(needW - 1e-6) && h / d >= Math.ceil(needH - 1e-6)) return d;
  }
  return 1;
}

/**
 * The largest size, in preview pixels, at which the whole frame of a source of size w x h is drawn by any clip of the
 * document: fitted into the canvas as compose.ts fits it, at the clip's largest scale (keys included), enlarged by its
 * crop, with room for a movement or a transition. `scale` is preview pixels per project pixel.
 */
export function needOf(doc: ProjectDoc, sourceId: string, w: number, h: number, scale: number): { w: number; h: number } {
  const { w: W, h: H } = canvasOf(doc);
  let need = 0;
  for (const track of doc.video?.tracks ?? []) {
    track.clips.forEach((c, i) => {
      if (c.source !== sourceId) return;
      const crop = c.crop;
      const nw = w * (crop ? 1 - crop.l - crop.r : 1);
      const nh = h * (crop ? 1 - crop.t - crop.b : 1);
      if (nw <= 0 || nh <= 0) return;
      const k = c.fit === 'cover' ? Math.max(W / nw, H / nh) : Math.min(W / nw, H / nh);
      const scales = [c.transform?.scale ?? 1, ...(c.keys?.scale ?? []).map((key) => key.v)];
      const next = track.clips[i + 1];
      const moves = !!(c.animIn || c.animOut || c.transition || (next && next.transition && next.start <= c.start + c.length));
      need = Math.max(need, k * Math.max(...scales) * (moves ? MOVEMENT_HEADROOM : 1));
    });
  }
  return { w: w * need * scale, h: h * need * scale };
}

/** One kept frame: where it starts, where the next one starts (when known), its canvas and size. */
export type Kept<C> = {
  from: number;
  /** Where the next frame starts (to) once it has been seen; until then the frame's own length says (open). */
  to: number;
  open: boolean;
  canvas: C;
  bytes: number;
  d: number;
  used: number;
};

/** The frames kept for every source of a pool, under one budget in bytes. */
export class FrameStore<C> {
  private lists = new Map<string, Kept<C>[]>();
  private total = 0;
  private clock = 0;
  budget: number;
  private readonly release: (c: C, bytes: number) => void;

  constructor(budget: number, release: (c: C, bytes: number) => void) {
    this.budget = budget;
    this.release = release;
  }

  get bytes() {
    return this.total;
  }

  count(id?: string) {
    if (id) return this.lists.get(id)?.length ?? 0;
    let n = 0;
    for (const l of this.lists.values()) n += l.length;
    return n;
  }

  /** The index of the last frame of the list starting at most `s + EPS`, or -1. */
  private at(list: Kept<C>[], s: number) {
    let lo = 0;
    let hi = list.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].from <= s + EPS) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found;
  }

  /** The kept frame the export would take at `s` (seconds), kept at share d, or null. Marks it as just shown. */
  find(id: string, s: number, d: number): Kept<C> | null {
    const list = this.lists.get(id);
    if (!list) return null;
    const i = this.at(list, s);
    if (i < 0) return null;
    const f = list[i];
    if (f.d !== d || !(s + EPS < f.to)) return null;
    f.used = ++this.clock;
    return f;
  }

  /** The kept frame starting at `from`, at share d, if any. */
  get(id: string, from: number, d: number): Kept<C> | null {
    const list = this.lists.get(id);
    if (!list) return null;
    const i = this.at(list, from);
    const f = i >= 0 ? list[i] : null;
    return f && Math.abs(f.from - from) < 1e-9 && f.d === d ? f : null;
  }

  /**
   * Keeps a decoded frame. `to` is where its own length ends; it stays open until `close` says where the next frame
   * starts. A frame already kept at that start is replaced.
   */
  put(id: string, f: { from: number; to: number; canvas: C; bytes: number; d: number }): Kept<C> {
    let list = this.lists.get(id);
    if (!list) this.lists.set(id, (list = []));
    const kept: Kept<C> = { ...f, open: true, used: ++this.clock };
    const i = this.at(list, f.from);
    if (i >= 0 && Math.abs(list[i].from - f.from) < 1e-9) {
      this.total -= list[i].bytes;
      this.release(list[i].canvas, list[i].bytes);
      list[i] = kept;
    } else list.splice(i + 1, 0, kept);
    this.total += f.bytes;
    return kept;
  }

  /** The frame after `f` in the same decoded run starts at `next` (Infinity: `f` is the source's last frame). */
  close(f: Kept<C>, next: number) {
    f.to = next;
    f.open = false;
  }

  /** Lets go of a source's frames, or of those not kept at share `keep`. */
  drop(id: string, keep?: number) {
    const list = this.lists.get(id);
    if (!list) return;
    const left: Kept<C>[] = [];
    for (const f of list) {
      if (keep !== undefined && f.d === keep) left.push(f);
      else {
        this.total -= f.bytes;
        this.release(f.canvas, f.bytes);
      }
    }
    if (left.length) this.lists.set(id, left);
    else this.lists.delete(id);
  }

  /** Lets go of the least recently shown frames until the budget holds, never one of `pinned`. */
  evict(pinned: ReadonlySet<C> = new Set()) {
    if (this.total <= this.budget) return;
    const all: [string, Kept<C>][] = [];
    for (const [id, list] of this.lists) for (const f of list) if (!pinned.has(f.canvas)) all.push([id, f]);
    all.sort((a, b) => a[1].used - b[1].used);
    const gone = new Set<Kept<C>>();
    for (const [, f] of all) {
      if (this.total <= this.budget) break;
      gone.add(f);
      this.total -= f.bytes;
      this.release(f.canvas, f.bytes);
    }
    for (const [id, list] of this.lists) {
      const left = list.filter((f) => !gone.has(f));
      if (left.length) this.lists.set(id, left);
      else this.lists.delete(id);
    }
  }

  clear() {
    for (const id of [...this.lists.keys()]) this.drop(id);
  }
}
