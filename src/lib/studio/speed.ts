// Speed, ramps, reverse and stills of a video clip (MVP_draft.md 62.7), as one calculation from timeline
// time to source time used by the preview, the export, the still frame and the timeline's trims and
// cuts. Pure.
//
//   - `speed` is a constant rate (1 is as filmed); keys on `speed` (keys.ts) make a ramp: straight lines
//     between speed points, or a step where a key holds. The source time at clip time τ is `in` plus the
//     area under the speed from 0 to τ, worked out exactly segment by segment (trapezoids), so the preview
//     and the export agree to the microsecond.
//   - `reverse` plays the same stretch of the source backwards: [in, in + span] from its end to its start.
//   - `hold` is a still: the clip shows the source frame at that source time for its whole length.
//   - A clip that is re-timed in any of these ways is silent (the plan's decision of 2026-10-20).
import type { Clip, Micros } from './schema.ts';
import { cleanKeys, type Key } from './keys.ts';

export const SPEED_MIN = 0.1;
export const SPEED_MAX = 8;
export const clampSpeed = (v: number) => (Number.isFinite(v) ? Math.max(SPEED_MIN, Math.min(SPEED_MAX, v)) : 1);

type Timed = Pick<Clip, 'start' | 'length' | 'in' | 'speed' | 'reverse' | 'hold' | 'keys'>;

/** The clip plays its source at a rate other than 1, backwards, or as a still. */
export const retimed = (c: Partial<Timed>): boolean => (c.speed ?? 1) !== 1 || speedKeys(c).length > 0 || !!c.reverse || isHold(c);
export const isHold = (c: Partial<Timed>): boolean => typeof c.hold === 'number' && Number.isFinite(c.hold);

function speedKeys(c: Partial<Timed>): Key[] {
  return cleanKeys(c.keys?.speed).map((k) => ({ ...k, v: clampSpeed(k.v) }));
}

/** The rate at clip time τ. */
export function speedAt(c: Partial<Timed>, tau: Micros): number {
  const ks = speedKeys(c);
  if (!ks.length) return clampSpeed(c.speed ?? 1);
  if (tau <= ks[0].t) return ks[0].v;
  const last = ks[ks.length - 1];
  if (tau >= last.t) return last.v;
  let i = 0;
  while (i < ks.length - 2 && ks[i + 1].t <= tau) i++;
  const a = ks[i];
  const b = ks[i + 1];
  if (a.ease === 'hold' || b.t <= a.t) return a.v;
  return a.v + ((b.v - a.v) * (tau - a.t)) / (b.t - a.t);
}

/** The source time covered between clip times u0 and u1 (negative when u1 is before u0). */
export function area(c: Partial<Timed>, u0: Micros, u1: Micros): number {
  if (u1 < u0) return -area(c, u1, u0);
  if (u1 === u0) return 0;
  const ks = speedKeys(c);
  if (!ks.length) return clampSpeed(c.speed ?? 1) * (u1 - u0);
  // the speed is straight (or held) between these breakpoints, and constant outside them
  const pts = [u0, ...ks.map((k) => k.t).filter((t) => t > u0 && t < u1), u1];
  let sum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    // a held key keeps its rate flat up to the next key; elsewhere the rate is a straight line
    const held = ks.filter((k) => k.t <= a).pop();
    if (held && held.ease === 'hold' && ks.some((k) => k.t > a)) sum += held.v * (b - a);
    else sum += ((speedAt(c, a) + speedAt(c, b)) / 2) * (b - a);
  }
  return sum;
}

/** How much source the clip shows: the area under its speed over its length (zero for a still). */
export const sourceSpan = (c: Partial<Timed> & Pick<Timed, 'length'>): number => (isHold(c) ? 0 : area(c, 0, c.length));

/**
 * The source time a clip shows at timeline time t. Forward clips run from `in`; reversed clips from the
 * end of their stretch back to `in` (kept a microsecond inside it, where the last frame is); stills stay
 * at `hold`.
 */
export function sourceTime(c: Timed, t: Micros): Micros {
  if (isHold(c)) return Math.max(0, Math.round(c.hold!));
  const tau = Math.max(0, Math.min(c.length, t - c.start));
  const from = c.in ?? 0;
  if (!retimed(c)) return Math.round(from + tau);
  const d = area(c, 0, tau);
  if (c.reverse) return Math.max(from, Math.round(from + sourceSpan(c) - d) - 1);
  return Math.round(from + d);
}

/**
 * The clip time τ (from `from`, forwards when amount > 0, backwards when < 0) at which the clip has
 * covered `amount` of source: the inverse of `area`, by halving (the area grows with τ: speed > 0).
 */
export function timeForArea(c: Partial<Timed>, from: Micros, amount: number): Micros {
  if (!amount) return from;
  const dir = amount > 0 ? 1 : -1;
  const want = Math.abs(amount);
  let lo = 0;
  let hi = want / SPEED_MIN + 1;
  for (let i = 0; i < 60 && hi - lo > 0.5; i++) {
    const m = (lo + hi) / 2;
    if (Math.abs(area(c, from, from + dir * m)) < want) lo = m;
    else hi = m;
  }
  // a whole microsecond that never covers more than the amount (a clip never runs past its source)
  let r = Math.round(from + dir * hi);
  if (Math.abs(area(c, from, r)) > want + 0.5) r -= dir;
  return r;
}

/** The clip length that shows `span` of source from its start (constant speed: span / speed). */
export function lengthForSpan(c: Partial<Timed>, span: number): Micros {
  if (span <= 0) return 0;
  if (!speedKeys(c).length) {
    const v = clampSpeed(c.speed ?? 1);
    const n = Math.round(span / v);
    return n * v > span + 0.5 ? n - 1 : n;
  }
  return timeForArea(c, 0, span);
}

/** The longest the clip may be: until it reaches the end of its source (or its start, reversed). */
export function maxLengthFor(c: Timed, duration: Micros | undefined): Micros {
  if (isHold(c) || !duration) return Number.POSITIVE_INFINITY;
  const from = c.in ?? 0;
  if (!retimed(c)) return Math.max(0, duration - from);
  // forwards the clip may run on to the end of the source; reversed, its end may reach the source's
  // start (its stretch's end stays where it is)
  return Math.max(0, lengthForSpan(c, c.reverse ? from + sourceSpan(c) : duration - from));
}
