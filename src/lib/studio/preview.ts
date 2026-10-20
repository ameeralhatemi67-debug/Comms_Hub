// The studio's preview player (MVP_draft.md 62). While playing, each visible or audible media clip has
// its own media element, kept in step with the timeline clock (re-seeked when it drifts by more than
// 0.12 s) and drawn onto the canvas; its sound plays at the clip's gain. While paused, frames come from
// Mediabunny, the decoder the export uses, so a paused frame is the exported frame. A clip at another speed
// plays its element at that rate (a ramp changes the rate every frame), silently; a reversed clip and a
// still draw from the decoder while playing too (an element cannot play backwards). Browser only.
import { durationOf, type Micros, type ProjectDoc } from './schema.ts';
import { audibleAt, clipGain, visibleAt } from './timeline.ts';
import { isHold, retimed, sourceTime, speedAt } from './speed.ts';
import { composeFrame, type Resolver } from './compose.ts';
import type { MediaPool } from './media.ts';
import type { MotionRenderer } from './motion-adapter.ts';

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
  /** The clips drawn from their media element while playing. */
  private live = new Set<string>();
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
          const el = this.o.pool.element(clipId, id) as HTMLVideoElement | null;
          if (el && el.readyState >= 2 && el.videoWidth) return el;
        }
        return this.o.pool.frameNear(id, at);
      },
    };
  }

  draw() {
    const ctx = this.o.canvas.getContext('2d');
    if (!ctx) return;
    const scale = this.o.scale();
    const keep = composeFrame(ctx, this.o.getDoc(), this.t, this.resolver(), { scale });
    this.o.motion.forget(keep);
    this.o.overlay?.(ctx, scale);
  }

  play() {
    const end = durationOf(this.o.getDoc());
    if (end <= 0) return;
    if (this.t >= end) this.t = 0;
    this.playing = true;
    this.startPerf = performance.now();
    this.startT = this.t;
    this.sync(true);
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
    this.o.onTime(this.t, true);
  }

  pause() {
    this.playing = false;
    this.live = new Set();
    cancelAnimationFrame(this.raf);
    this.o.pool.pauseExcept(new Set());
    this.draw();
    this.o.onTime(this.t, false);
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
      this.sync(true);
    }
    this.draw();
    this.o.onTime(this.t, this.playing);
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
    this.draw();
    this.o.onTime(this.t, true);
    this.raf = requestAnimationFrame(this.loop);
  };

  /** Keeps each playing clip's element at the clip's place and gain; stops the others. */
  private sync(force: boolean) {
    const doc = this.o.getDoc();
    const keep = new Set<string>();
    const heard = new Map<string, number>();
    for (const { track, clip } of audibleAt(doc, this.t)) heard.set(clip.id, Math.max(0, Math.min(1, clipGain(track, clip, this.t))));
    // reversed clips and stills are drawn from the decoder (frameNear), not from an element
    const seen = visibleAt(doc, this.t).filter(({ clip }) => clip.source && !clip.reverse && !isHold(clip) && doc.sources.find((s) => s.id === clip.source)?.media === 'video');
    const clips = new Map<string, (typeof seen)[number]['clip']>();
    for (const v of seen) clips.set(v.clip.id, v.clip);
    for (const { clip } of audibleAt(doc, this.t)) clips.set(clip.id, clip);
    for (const clip of clips.values()) {
      const el = this.o.pool.element(clip.id, clip.source!);
      if (!el) continue;
      keep.add(clip.id);
      const want = sourceTime(clip, this.t) / 1e6;
      const rate = retimed(clip) ? speedAt(clip, this.t - clip.start) : 1;
      if (Math.abs(el.playbackRate - rate) > 1e-3) {
        try {
          el.playbackRate = rate;
        } catch {
          // a rate the browser refuses: the drift check keeps the picture in step
        }
      }
      if (force || Math.abs(el.currentTime - want) > DRIFT) {
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

  dispose() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }
}
