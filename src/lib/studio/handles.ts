// Handles of the selected item on the studio's canvas (MVP_draft.md 62.5): its four corners scale it
// about its centre, the round handle above it turns it (Shift steps of 15 degrees), its body moves it
// (snapping to the canvas's middle lines). Canvas pixels throughout; `k` is screen pixels per canvas
// pixel, so the handles keep their size on screen at any zoom. Pure.
import type { Box } from './compose.ts';
import type { Transform } from './schema.ts';

export const HANDLE_PX = 11;
export const ROTATE_GAP_PX = 30;
export type Handle = 'scale' | 'rotate' | null;
type Pt = { x: number; y: number };

/** A canvas point in the box's own unturned frame, with the centre at 0,0. */
export function toLocal(b: Box, p: Pt): Pt {
  const r = (-b.rotation * Math.PI) / 180;
  const dx = p.x - b.cx;
  const dy = p.y - b.cy;
  return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) };
}

/** Which handle of the box is under the point, if any. */
export function handleAt(b: Box, p: Pt, k: number): Handle {
  const l = toLocal(b, p);
  const tol = (HANDLE_PX + 4) / k;
  const top = -b.h / 2;
  if (Math.hypot(l.x, l.y - (top - ROTATE_GAP_PX / k)) <= tol) return 'rotate';
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) if (Math.abs(l.x - (sx * b.w) / 2) <= tol && Math.abs(l.y - (sy * b.h) / 2) <= tol) return 'scale';
  return null;
}

/** The transform after dragging a handle from `from` to `to`. */
export function dragHandle(h: Exclude<Handle, null>, tr: Transform, b: Box, from: Pt, to: Pt, shift = false): Transform {
  if (h === 'scale') {
    const d0 = Math.hypot(from.x - b.cx, from.y - b.cy) || 1;
    const d1 = Math.hypot(to.x - b.cx, to.y - b.cy);
    const scale = Math.max(0.03, Math.min(12, tr.scale * (d1 / d0)));
    return { ...tr, scale: Math.round(scale * 1000) / 1000 };
  }
  const a0 = Math.atan2(from.y - b.cy, from.x - b.cx);
  const a1 = Math.atan2(to.y - b.cy, to.x - b.cx);
  let rot = tr.rotation + ((a1 - a0) * 180) / Math.PI;
  rot = ((((rot + 180) % 360) + 360) % 360) - 180;
  if (shift) rot = Math.round(rot / 15) * 15;
  return { ...tr, rotation: Math.round(rot * 10) / 10 };
}

/** A moved centre, snapped to the canvas's middle lines within 1.5% of its size. */
export function snapCentre(x: number, y: number, W: number, H: number): Pt & { snapX: boolean; snapY: boolean } {
  const snapX = Math.abs(x - W / 2) < W * 0.015;
  const snapY = Math.abs(y - H / 2) < H * 0.015;
  return { x: Math.round(snapX ? W / 2 : x), y: Math.round(snapY ? H / 2 : y), snapX, snapY };
}

/** Preview resolutions, as in desktop editors: the canvas is drawn at this share of its size on screen. */
export const RESOLUTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'كاملة' },
  { value: 1 / 2, label: '1/2' },
  { value: 1 / 3, label: '1/3' },
  { value: 1 / 4, label: '1/4' },
  { value: 1 / 8, label: '1/8' },
  { value: 1 / 16, label: '1/16' },
  { value: 1 / 32, label: '1/32' },
];
export const resolutionLabel = (v: number) => RESOLUTIONS.find((r) => Math.abs(r.value - v) < 1e-6)?.label ?? 'كاملة';

/** The canvas's pixel width for a box this wide on screen, at a resolution, never above the project. */
export function canvasWidth(projectW: number, screenW: number, dpr: number, resolution: number): number {
  const full = Math.min(projectW, Math.round(screenW * Math.min(2, Math.max(1, dpr))));
  return Math.max(16, Math.round(full * (RESOLUTIONS.some((r) => Math.abs(r.value - resolution) < 1e-6) ? resolution : 1)));
}
