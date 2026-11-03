// The idle-time broker's rules (Desktop_Power_Ideas.md P-30, phase D12): when the laptop's own background work may
// run. Background work is the fixed jobs nobody is waiting for: today the light copies made automatically (P-08).
// It runs only while the application is open, on mains power, with the processor at its full advertised speed
// (Windows lowers that limit when the laptop is too hot or saving power), when no window is exporting, uploading,
// playing, scrubbing or measuring, when no copy the person asked for is being made, and when nobody pressed a key or
// a button in the application for a few seconds. Moving the pointer and scrolling are reading, and hold nothing;
// dragging with a button held is working. Held, a running job is paused, not lost; held for minutes, it is stopped
// and starts again later, so a paused job never keeps its memory long. Nothing here is scheduled in the site (E-1):
// this is the laptop's own housekeeping while the application is open. Pure; native.ts collects the facts and
// native-media.ts runs the jobs.
import type { Activity, Reason } from './bridge.ts';

/** Why background work waits, the most lasting first. */
export const HOLDS = Object.freeze(['battery', 'throttled', 'export', 'upload', 'measuring', 'playing', 'scrubbing', 'asked', 'input'] as const);
export type Hold = (typeof HOLDS)[number];

/** How long after the last key or click the person counts as idle again. */
export const QUIET_MS = 3000;
/** A job paused this long is stopped (its part file removed) and starts again later. */
export const STOP_AFTER_MS = 3 * 60_000;
/** Light copies made at once, at most (scale.ts copiesAtOnce asks for 1 to 3). */
export const MAX_WIDTH = 3;

export type Facts = {
  power: 'ac' | 'battery';
  /** Windows' advertised speed limit for the processor, in percent; 100 until it says otherwise. */
  speedLimit: number;
  busy: Reason | null;
  activities: Iterable<Activity>;
  /** A copy the person asked for is being made now. */
  asked: boolean;
  lastInput: number;
  now: number;
};

export function holdOf(f: Facts): Hold | null {
  if (f.power === 'battery') return 'battery';
  if (f.speedLimit < 100) return 'throttled';
  if (f.busy) return f.busy;
  const doing = new Set(f.activities);
  for (const a of ['measuring', 'playing', 'scrubbing'] as const) if (doing.has(a)) return a;
  if (f.asked) return 'asked';
  if (f.now - f.lastInput < QUIET_MS) return 'input';
  return null;
}

/** When a hold of input ends by itself, so the broker looks again then; null for any other state. */
export function quietAt(f: Facts): number | null {
  return holdOf(f) === 'input' ? f.lastInput + QUIET_MS : null;
}

/** An input event that counts as working: a key, a click, a touch, or the pointer moved with a button held. */
export function isWork(input: { type: string; modifiers?: readonly string[] }): boolean {
  switch (input.type) {
    case 'keyDown':
    case 'rawKeyDown':
    case 'mouseDown':
    case 'touchStart':
    case 'pointerDown':
      return true;
    case 'mouseMove':
    case 'touchMove':
      return (input.modifiers ?? []).some((m) => m === 'leftbuttondown' || m === 'middlebuttondown' || m === 'rightbuttondown');
    default:
      return false;
  }
}

/** A background job as the broker sees it. */
export type JobView = { name: string; state: 'waiting' | 'running' | 'paused'; pausedAt?: number };
export type Steps = { start: string[]; pause: string[]; resume: string[]; stop: string[] };

/**
 * What to do with the background jobs, in queue order. Held: every running job pauses, and one paused too long
 * stops. Free: paused jobs resume first, then waiting ones start, up to `width` running at once; a running job
 * beyond the width (the width went down) pauses.
 */
export function stepsFor(jobs: readonly JobView[], hold: Hold | null, width: number, now: number): Steps {
  const s: Steps = { start: [], pause: [], resume: [], stop: [] };
  const w = Math.max(1, Math.min(MAX_WIDTH, Math.floor(width) || 1));
  const tooLong = (j: JobView) => j.state === 'paused' && j.pausedAt !== undefined && now - j.pausedAt >= STOP_AFTER_MS;
  if (hold) {
    for (const j of jobs) {
      if (j.state === 'running') s.pause.push(j.name);
      else if (tooLong(j)) s.stop.push(j.name);
    }
    return s;
  }
  let slots = w;
  for (const j of jobs) {
    if (j.state === 'running') {
      if (slots > 0) slots--;
      else s.pause.push(j.name);
    }
  }
  for (const j of jobs) {
    if (j.state === 'paused') {
      if (slots > 0) {
        slots--;
        s.resume.push(j.name);
      } else if (tooLong(j)) s.stop.push(j.name);
    }
  }
  for (const j of jobs) {
    if (j.state === 'waiting' && slots > 0) {
      slots--;
      s.start.push(j.name);
    }
  }
  return s;
}
