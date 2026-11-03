// The studio's preview player (MVP_draft.md 62). While playing, each visible or audible media clip has
// its own media element, kept in step with the timeline clock (re-seeked when it drifts by more than
// 0.12 s) and drawn onto the canvas; its sound plays at the clip's gain. While paused, frames come from
// Mediabunny, the decoder the export uses, so a paused frame is the exported frame. A clip at another speed
// plays its element at that rate (a ramp changes the rate every frame), silently; a reversed clip and a
// still draw from the decoder while playing too (an element cannot play backwards).
// D10 (playback.ts): under «تلقائية» each project frame is drawn once and the frames missed set the preview's level;
// with a stream budget the largest streams play their source and the rest their light copy. Browser only.
import { canvasOf, durationOf, type Clip, type Micros, type ProjectDoc } from './schema.ts';
import { audibleAt, mixGain, visibleAt } from './timeline.ts';
import { isHold, retimed, sourceTime, speedAt } from './speed.ts';
import { composeFrame, fitSize, transformAt, type Resolver } from './compose.ts';
import type { MediaPool } from './media.ts';
import type { MotionRenderer } from './motion-adapter.ts';
import { wallNow, type Clock } from './preview-link.ts';
import { needOf, rangeOf } from './scrub.ts';
import { BEHIND_RESEEKS, BUDGET_STEP, startLevel, streamPlan, UHD30, type AutoLevel, type Stream } from './playback.ts';

export const DRIFT = 0.12;

export type PlayerOptions = {
  canvas: HTMLCanvasElement;
  pool: MediaPool;
  motion: MotionRenderer;
  getDoc: () => ProjectDoc;
  /** Canvas pixels per project pixel. */
  scale: () => number;
  onTime: (t: Micros, playing: boolean) => void;
  /** Drawn over the frame: safe zones, the selection outline. */
  overlay?: (ctx: CanvasRenderingContext2D, scale: number) => void;
};

export class Player {
  t: Micros = 0;
  playing = false;
  private raf = 0;
  private startPerf = 0;
  private startT = 0;
  /** Every sound off (while a voice-over is recorded, so the microphone does not hear the project). */
  muted = false;
  /** The clips drawn from their media element while playing. */
  private live = new Set<string>();
  /** Told whenever the playhead starts, stops or jumps, with the moment it did: a preview window keeps in step (preview-link.ts). */
  onClock: ((c: Clock) => void) | null = null;
  /** «تلقائية» (playback.ts AutoLevel): the level judged from the frames missed while playing; null at a fixed resolution. */
  auto: AutoLevel | null = null;
  /** Told when «تلقائية» moves the preview to another share of its size. */
  onAuto: ((share: number) => void) | null = null;
  /** The stream budget (playback.ts streamBudget); null, or no budget, plays every light copy as before. */
  budget: (() => number | null) | null = null;
  /** The clips playing their light copy, as the budget decided at play start or the last seek. */
  private copies = new Set<string>();
  /**
   * With a plan (D10): while playing, a clip whose element is catching up keeps the element's last frame instead of
   * asking the paused decoder, and elements that keep falling behind lower the budget for the rest of the session.
   */
  steady = false;
  /** The share of the budget the session has kept to after elements fell behind (playback.ts BUDGET_STEP). */
  private budgetShare = 1;
  /** When elements had to be put back in step lately (ms), to tell a run of them from one. */
  private behind: number[] = [];
  /** The play so far: project frames due, draws, frames not drawn in time, elements put back in step, milliseconds. */
  stats = { due: 0, drawn: 0, missed: 0, reseeks: 0, ms: 0 };
  private lastN = -1;
  private readonly o: PlayerOptions;

  constructor(o: PlayerOptions) {
    this.o = o;
  }

  resolver(): Resolver {
    return {
      motion: this.o.motion,
      image: (id) => this.o.pool.image(id),
      videoFrame: (id, at, clipId) => {
        if (this.playing && clipId && this.live.has(clipId)) {
          const el = this.o.pool.elementOf(clipId) as HTMLVideoElement | null;
          if (el && el.readyState >= 2 && el.videoWidth) return el;
          // catching up after a jump: its last frame, rather than a second decoder of the same file
          if (this.steady && el && el.readyState >= 1 && el.videoWidth) return el;
        }
        return this.o.pool.frameNear(id, at);
      },
    };
  }

  /** The document and scale the pool was last told the sizes for (D10, its kept frames are no larger than drawn). */
  private told: { doc: ProjectDoc | null; scale: number } = { doc: null, scale: 0 };

  private tellSizes(doc: ProjectDoc, scale: number) {
    if (this.told.doc === doc && this.told.scale === scale) return;
    let all = true;
    for (const s of doc.sources) {
      if (s.media !== 'video') continue;
      const info = this.o.pool.info(s.id);
      if (!info?.w || !info.h) {
        all = false;
        continue;
      }
      const n = needOf(doc, s.id, info.w, info.h, scale);
      this.o.pool.setNeed(s.id, n.w, n.h, rangeOf(doc, s.id));
    }
    // told again at the next draw while a source is still being made ready
    if (all) this.told = { doc, scale };
  }

  draw() {
    const ctx = this.o.canvas.getContext('2d');
    if (!ctx) return;
    const scale = this.o.scale();
    const doc = this.o.getDoc();
    this.tellSizes(doc, scale);
    const keep = composeFrame(ctx, doc, this.t, this.resolver(), { scale });
    this.o.motion.forget(keep);
    this.o.overlay?.(ctx, scale);
  }

  /** Where the playhead is: from when and where it started playing, or where it stands. */
  clock(): Clock {
    return this.playing ? { t: this.startT, playing: true, wall: performance.timeOrigin + this.startPerf } : { t: this.t, playing: false, wall: wallNow() };
  }

  play() {
    const end = durationOf(this.o.getDoc());
    if (end <= 0) return;
    if (this.t >= end) this.t = 0;
    this.playing = true;
    this.o.pool.setPlaying(true);
    this.startPerf = performance.now();
    this.startT = this.t;
    this.stats = { due: 0, drawn: 0, missed: 0, reseeks: 0, ms: 0 };
    this.lastN = -1;
    this.behind = [];
    this.sync(true);
    // «تلقائية» never starts above what the streams at the playhead can be drawn at
    if (this.auto) {
      const was = this.auto.level;
      this.auto.atLeast(startLevel(this.load()));
      this.auto.start(this.startPerf);
      if (this.auto.level !== was) this.onAuto?.(this.auto.value);
    }
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
    this.o.onTime(this.t, true);
    this.onClock?.(this.clock());
  }

  pause() {
    this.playing = false;
    this.o.pool.setPlaying(false);
    this.live = new Set();
    cancelAnimationFrame(this.raf);
    this.o.pool.pauseExcept(new Set());
    this.draw();
    this.o.onTime(this.t, false);
    this.onClock?.(this.clock());
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(t: Micros) {
    const end = durationOf(this.o.getDoc());
    this.t = Math.max(0, Math.min(Math.round(t), end));
    if (this.playing) {
      this.startT = this.t;
      this.startPerf = performance.now();
      // the frames are counted from the jump (a jump back would otherwise wait for the frame it left)
      this.lastN = -1;
      this.sync(true);
    }
    this.draw();
    this.o.onTime(this.t, this.playing);
    this.onClock?.(this.clock());
  }

  private loop = (now: number) => {
    if (!this.playing) return;
    const end = durationOf(this.o.getDoc());
    this.t = Math.round(this.startT + (now - this.startPerf) * 1000);
    if (this.t >= end) {
      this.t = end;
      this.pause();
      return;
    }
    this.sync(false);
    const n = Math.floor((this.t * (this.o.getDoc().video?.fps ?? 30)) / 1e6 + 1e-9);
    const due = this.lastN < 0 ? 1 : Math.max(0, n - this.lastN);
    const missed = this.lastN < 0 ? 0 : Math.max(0, due - 1);
    if (due) {
      this.stats.due += due;
      this.stats.missed += missed;
      this.lastN = n;
    }
    this.stats.ms = now - this.startPerf;
    // under «تلقائية» each project frame is drawn once; otherwise at every refresh, as before
    if (!this.auto || due) {
      this.stats.drawn++;
      this.draw();
    }
    if (this.auto && due && this.auto.frame(now, due, missed) !== null) this.onAuto?.(this.auto.value);
    this.o.onTime(this.t, true);
    this.raf = requestAnimationFrame(this.loop);
  };

  /** Keeps each playing clip's element at the clip's place and gain; stops the others. */
  private sync(force: boolean): void {
    const doc = this.o.getDoc();
    const keep = new Set<string>();
    const heard = new Map<string, number>();
    for (const { track, clip } of audibleAt(doc, this.t)) heard.set(clip.id, this.muted ? 0 : Math.max(0, Math.min(1, mixGain(doc, track, clip, this.t))));
    // reversed clips and stills are drawn from the decoder (frameNear), not from an element
    const seen = visibleAt(doc, this.t).filter(({ clip }) => clip.source && !clip.reverse && !isHold(clip) && doc.sources.find((s) => s.id === clip.source)?.media === 'video');
    // which streams play their light copy is decided where playing starts or jumps, never in the middle (playback.ts)
    const plan = () => {
      const b = this.budget?.() ?? null;
      this.copies = streamPlan(this.streams(doc, seen.map((v) => v.clip)), b === null ? null : b * this.budgetShare);
    };
    if (force) plan();
    const clips = new Map<string, (typeof seen)[number]['clip']>();
    for (const v of seen) clips.set(v.clip.id, v.clip);
    for (const { clip } of audibleAt(doc, this.t)) clips.set(clip.id, clip);
    for (const clip of clips.values()) {
      // a clip only heard plays its light copy, as before
      const el = this.o.pool.element(clip.id, clip.source!, this.copies.has(clip.id) || !seen.some((v) => v.clip.id === clip.id));
      if (!el) continue;
      keep.add(clip.id);
      // a light copy may start at another time than its original (media.ts elementOffset)
      const want = sourceTime(clip, this.t) / 1e6 - this.o.pool.elementOffset(clip.source!, clip.id);
      const rate = retimed(clip) ? speedAt(clip, this.t - clip.start) : 1;
      if (Math.abs(el.playbackRate - rate) > 1e-3) {
        try {
          el.playbackRate = rate;
        } catch {
          // a rate the browser refuses: the drift check keeps the picture in step
        }
      }
      if (force || Math.abs(el.currentTime - want) > DRIFT) {
        if (!force) {
          this.stats.reseeks++;
          // a run of elements falling behind: the decoders carry less than measured; the jump is the moment to move a
          // stream to its light copy
          const now = performance.now();
          this.behind = [...this.behind.filter((x) => now - x < 1000), now];
          if (this.steady && this.budget?.() != null && this.behind.length >= BEHIND_RESEEKS) {
            this.behind = [];
            this.budgetShare *= BUDGET_STEP;
            const before = this.copies;
            plan();
            if ([...this.copies].some((c) => !before.has(c))) return this.sync(true);
          }
        }
        try {
          el.currentTime = want;
        } catch {
          // not seekable yet: it will be on the next frame
        }
      }
      const g = heard.get(clip.id) ?? 0;
      el.volume = g;
      el.muted = g === 0;
      if (el.paused) void el.play().catch(() => undefined);
    }
    this.o.pool.pauseExcept(keep);
    this.live = keep;
  }

  /** The pixels a second the playing elements decode, in 4K30 streams (a light copy counts its own size). */
  private load(): number {
    let n = 0;
    for (const id of this.live) {
      const el = this.o.pool.elementOf(id) as HTMLVideoElement | null;
      if (el?.videoWidth) n += (el.videoWidth * el.videoHeight * 30 * Math.max(0.1, el.playbackRate)) / UHD30;
      else {
        const c = this.o.getDoc().video?.tracks.flatMap((t) => t.clips).find((x) => x.id === id);
        const info = c?.source ? this.o.pool.info(c.source) : null;
        if (info?.w && info.h && !this.copies.has(id)) n += (info.w * info.h * 30) / UHD30;
      }
    }
    return n;
  }

  /** The video streams at the playhead, for the budget: their pixels a second, their share of the canvas, their copy. */
  private streams(doc: ProjectDoc, clips: Clip[]): Stream[] {
    const { w: W, h: H } = canvasOf(doc);
    const out: Stream[] = [];
    for (const clip of clips) {
      const info = this.o.pool.info(clip.source!);
      if (!info?.w || !info.h) continue;
      const rate = retimed(clip) ? speedAt(clip, this.t - clip.start) : 1;
      const box = fitSize(info.w, info.h, W, H, clip.fit);
      const k = transformAt(clip, this.t, W, H).scale;
      out.push({ clip: clip.id, pixels: info.w * info.h * 30 * Math.abs(rate), area: Math.min(1, (box.w * k * box.h * k) / (W * H)), copy: this.o.pool.hasCopy(clip.source!) });
    }
    return out;
  }

  /** What the playing elements say of their own frames: decoded and dropped since they started (for the checks). */
  quality(): { total: number; dropped: number } {
    let total = 0;
    let dropped = 0;
    for (const id of this.live) {
      const q = (this.o.pool.elementOf(id) as HTMLVideoElement | null)?.getVideoPlaybackQuality?.();
      if (!q) continue;
      total += q.totalVideoFrames;
      dropped += q.droppedVideoFrames;
    }
    return { total, dropped };
  }

  dispose() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }
}
