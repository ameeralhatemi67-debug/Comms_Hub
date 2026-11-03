// Playing the preview at the machine's strength (Desktop_Power_Ideas.md P-03 and P-04, phase D10; MVP_draft.md 62.5).
// Speed only: what is drawn while playing is the same project at the same moments; only how many pixels the preview
// canvas has, and which copy of a source an element plays, follow the machine. The export never reads either. Pure.
//   «تلقائية» (AutoLevel): while playing, the stage counts the project frames it did not draw in time; a quarter of a
//   second with two or more missed steps the preview down one level of scale.ts PREVIEW_STEPS, and four calm seconds
//   step it up again, never back to a level that missed during the same play. The level a play ends on is the start
//   of the next one, per project shape, on this device.
//   The stream budget (streamPlan): at play start and at a seek, the video streams at the playhead are weighed by
//   their pixels against the decoding the profile measured; the largest on screen play their source, the rest their
//   light copy where one exists. The measurement decodes one stream alone; media elements decoding several at once
//   carry far less (measured on 2026-11-04 on the RTX: three 4K30 streams fell behind on a chip measured at four and
//   at six), so the margin is a third, and elements that keep falling behind lower the budget for the session.

/** A window of the play this long (ms) is judged at once. */
export const AUTO_WINDOW = 250;
/** Missed frames in one window that step the preview down (at least this many, and at least a tenth of the window's). */
export const AUTO_MISSED = 2;
/** Calm milliseconds before a step up. */
export const AUTO_CALM = 4000;
/** Milliseconds after a change of level that are not judged (the canvas is being resized). */
export const AUTO_SETTLE = 500;

export class AutoLevel {
  /** An index into `steps`: 0 is the largest. */
  level: number;
  private readonly steps: readonly number[];
  private windowStart = 0;
  private expected = 0;
  private missed = 0;
  private calmSince = 0;
  private settleUntil = 0;
  /** The largest level that missed during this play: never stepped up to again before the play ends. */
  private ceiling = 0;

  constructor(steps: readonly number[], start: number) {
    this.steps = steps;
    this.level = Math.max(0, Math.min(steps.length - 1, Math.round(start)));
  }

  get value() {
    return this.steps[this.level];
  }

  /** Starts no higher than `level` (what the streams at the playhead can be drawn at). */
  atLeast(level: number) {
    this.level = Math.max(this.level, Math.min(this.steps.length - 1, level));
  }

  /** A play starts at `now` (ms). */
  start(now: number) {
    this.windowStart = now;
    this.calmSince = now;
    this.settleUntil = now + AUTO_SETTLE;
    this.expected = 0;
    this.missed = 0;
    this.ceiling = 0;
  }

  /**
   * One drawn frame at `now` (ms): `expected` project frames were due since the last one and `missed` of them were not
   * drawn. Returns the new level when it changes, else null.
   */
  frame(now: number, expected: number, missed: number): number | null {
    if (now < this.settleUntil) {
      this.windowStart = now;
      this.calmSince = now;
      return null;
    }
    this.expected += expected;
    this.missed += missed;
    if (missed > 0) this.calmSince = now;
    if (now - this.windowStart < AUTO_WINDOW) return null;
    const bad = this.missed >= Math.max(AUTO_MISSED, Math.ceil(this.expected / 10));
    this.windowStart = now;
    this.expected = 0;
    this.missed = 0;
    if (bad && this.level < this.steps.length - 1) {
      this.ceiling = Math.max(this.ceiling, this.level + 1);
      return this.move(now, this.level + 1);
    }
    if (!bad && now - this.calmSince >= AUTO_CALM && this.level > this.ceiling) return this.move(now, this.level - 1);
    return null;
  }

  private move(now: number, level: number) {
    this.level = level;
    this.settleUntil = now + AUTO_SETTLE;
    this.calmSince = now;
    return level;
  }
}

/**
 * The step a play may start at for `load` 4K30 streams decoded at once: full up to one, a half up to two, a quarter
 * beyond (drawing several large videos each frame costs more than the canvas, and a quarter canvas leaves the most).
 */
export function startLevel(load: number): number {
  return load > 2 ? 2 : load > 1 ? 1 : 0;
}

/** The index of the step a share starts at (the nearest step not above it). */
export function stepOf(steps: readonly number[], share: number): number {
  for (let i = 0; i < steps.length; i++) if (steps[i] <= share + 1e-9) return i;
  return steps.length - 1;
}

/** One video stream at the playhead: its clip, its source's pixels a second, how large it is drawn, and whether a light copy exists. */
export type Stream = { clip: string; pixels: number; area: number; copy: boolean };

/** A 4K picture thirty times a second: the unit the budget is counted in. */
export const UHD30 = 3840 * 2160 * 30;
/** The share of the measured decoding the preview counts on, leaving room for drawing and sound. */
export const STREAM_MARGIN = 1 / 3;
/** Elements put back in step within one second that lower the budget, and the share it is lowered to each time. */
export const BEHIND_RESEEKS = 2;
export const BUDGET_STEP = 0.6;

/**
 * How many 4K30 streams the machine carries while drawing, from the profile: its 4K decoding rate (the chip's if it has
 * one), lowered when drawing the effects document takes longer than a 30 fps frame leaves; null with no profile.
 */
export function streamBudget(p: { decode: { h264_2160: { hw: number | null; sw: number | null } }; compose: { effects: number } } | null): number | null {
  if (!p) return null;
  const fps = Math.max(p.decode.h264_2160.hw ?? 0, p.decode.h264_2160.sw ?? 0);
  if (!(fps > 0)) return null;
  const drawing = p.compose.effects > 12 ? 12 / p.compose.effects : 1;
  return (fps / 30) * STREAM_MARGIN * drawing;
}

/**
 * Which streams play their light copy: the largest on screen keep their source while their pixels fit the budget; the
 * rest play their copy where one exists. With no budget (no profile, a browser) every stream with a copy plays it, as
 * the light copies always did (D5).
 */
export function streamPlan(streams: Stream[], budget: number | null): Set<string> {
  const copies = new Set<string>();
  if (budget === null) {
    for (const s of streams) if (s.copy) copies.add(s.clip);
    return copies;
  }
  let used = 0;
  const order = [...streams].sort((a, b) => b.area - a.area || a.clip.localeCompare(b.clip));
  for (const s of order) {
    const cost = s.pixels / UHD30;
    if (used + cost <= budget + 1e-9 || !s.copy) used += cost;
    else copies.add(s.clip);
  }
  return copies;
}
