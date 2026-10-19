// Time in the studio (MVP_draft.md 62): whole microseconds everywhere, frames only where a frame is
// meant (snapping, stepping, export). Pure.
import { US, type Micros } from './schema.ts';

export const toSec = (us: Micros) => us / US;
export const fromSec = (s: number): Micros => Math.round(s * US);

/** The length of one frame, in microseconds (rounded; 1/30 s is 33,333). */
export const frameUs = (fps: number): Micros => Math.round(US / fps);

/** The frame a time falls in (frame 0 starts at 0). */
export const frameAt = (us: Micros, fps: number) => Math.floor((us * fps) / US + 1e-9);

/** The start of frame n. */
export const frameStart = (n: number, fps: number): Micros => Math.round((n * US) / fps);

/** A time moved onto the nearest frame boundary. */
export const snapFrame = (us: Micros, fps: number): Micros => frameStart(Math.round((us * fps) / US), fps);

/** How many frames an export of this length has. */
export const frameCount = (us: Micros, fps: number) => Math.max(0, Math.ceil((us * fps) / US - 1e-9));

const two = (n: number) => String(n).padStart(2, '0');

/** 01:05.12 (minutes, seconds, frame) for the transport; hours only when needed. */
export function timecode(us: Micros, fps: number): string {
  const neg = us < 0;
  const f = frameAt(Math.abs(us), fps);
  const sec = Math.floor(f / fps);
  const fr = f - sec * fps;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${neg ? '-' : ''}${h ? `${h}:${two(m)}` : two(m)}:${two(s)}.${two(fr)}`;
}

/** 1:05 or 0:07 for lengths in lists. */
export function shortTime(us: Micros): string {
  const s = Math.round(us / US);
  return `${Math.floor(s / 60)}:${two(s % 60)}`;
}

/** mm:ss (the review notes' form, MVP_draft.md 59.6) to microseconds, or null. */
export function parseMmSs(tc: string): Micros | null {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(tc.trim());
  return m ? (Number(m[1]) * 60 + Number(m[2])) * US : null;
}
