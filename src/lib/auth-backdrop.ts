// The rules of the sign-in screen's moving background (the brand rosette repeated over the page, which turns
// golden and spins near the pointer). Pure: the drawing is src/components/auth-backdrop.tsx. The rosette is the
// logo's: four capsules turned 0, 45, 90 and 135 degrees (public/brand/comms-hub-logo.svg).

export type Rgb = readonly [number, number, number];

/** One rosette: where it sits, its own phase and turning side, and how far it has been spun by the pointer. */
export type Cell = { x: number; y: number; phase: number; dir: 1 | -1; spin: number; grow: number; vel: number };

/** The logo's gold, and the fallback for the muted tone when the page gives none. */
export const GOLD: Rgb = [232, 196, 108];
export const MUTED_FALLBACK: Rgb = [200, 216, 191];

/** Distance between neighbouring rosettes, in pixels: wide enough that the pattern stays quiet. */
export const SPACING = 96;
/** How far the pointer's light reaches, in pixels. */
export const REACH = 190;

/** How fast a fully lit rosette spins, in radians per second (a very calm turn, about one every 10 seconds). */
export const SPIN_SPEED = 0.6;

/** A resting rosette's size, and the size it reaches when fully lit (the lit size is the one it always had). */
export const REST_SCALE = 0.11;
export const MAX_SCALE = 0.216;

/** The spring that grows a rosette when the pointer comes near: underdamped, so it overshoots the maximum and settles. */
export const SPRING = { stiffness: 70, damping: 8.4 } as const;

/** One step of that spring toward `target` (semi-implicit, stable for steps up to 50 ms). */
export function springStep(grow: number, vel: number, target: number, dt: number): { grow: number; vel: number } {
  const v = vel + (SPRING.stiffness * (target - grow) - SPRING.damping * vel) * dt;
  return { grow: grow + v * dt, vel: v };
}

/** How strongly a resting rosette is drawn (0 to 1): low, so the pattern melts into the background. */
export const IDLE_ALPHA = 0.035;

/** Half the length of a capsule at scale 1, as in the logo (the rect is 120 by 36). */
export const CAPSULE = { half: 60, thick: 18, radius: 18 } as const;

/** A value between 0 and 1 that is the same for the same input: a phase for a rosette. */
export function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Rosettes in staggered rows covering the page, with one row and one column beyond each edge. */
export function layout(width: number, height: number, spacing: number = SPACING): Cell[] {
  const cells: Cell[] = [];
  if (!(width > 0) || !(height > 0) || !(spacing > 0)) return cells;
  const rowH = spacing * 0.866;
  const rows = Math.ceil(height / rowH) + 2;
  const cols = Math.ceil(width / spacing) + 2;
  let n = 0;
  for (let r = -1; r < rows - 1; r++) {
    for (let c = -1; c < cols - 1; c++) {
      cells.push({
        x: c * spacing + (r % 2 === 0 ? 0 : spacing / 2),
        y: r * rowH,
        phase: hash01(++n) * Math.PI * 2,
        dir: hash01(n + 9000) < 0.5 ? 1 : -1,
        spin: 0,
        grow: 0,
        vel: 0,
      });
    }
  }
  return cells;
}

/** 0 outside the reach, 1 at the pointer, smooth between. */
export function influence(dx: number, dy: number, reach: number = REACH): number {
  const d = Math.hypot(dx, dy);
  if (!(reach > 0) || d >= reach) return 0;
  const t = 1 - d / reach;
  return t * t * (3 - 2 * t);
}

/** A colour from two, by t in [0, 1] (outside is held). */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** A colour written as #rgb or #rrggbb; anything else gives the fallback. */
export function parseHex(text: string | null | undefined, fallback: Rgb = MUTED_FALLBACK): Rgb {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((text ?? '').trim());
  if (!m) return fallback;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export const rgba = (c: Rgb, a: number) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

/** The look of one rosette at a moment: how strongly it is lit (0 to 1) gives its colour, strength, size and turning. */
/** `grow` is the sprung size (it may pass 1 for a moment); it defaults to the light itself. */
export function look(f: number, t: number, cell: Pick<Cell, 'phase' | 'dir'>, muted: Rgb, grow: number = f) {
  const lit = Math.max(0, Math.min(1, f));
  return {
    color: mix(muted, GOLD, Math.pow(lit, 0.8)),
    alpha: IDLE_ALPHA + 0.012 * Math.sin(t * 0.5 + cell.phase) + (0.95 - IDLE_ALPHA) * lit,
    // always turning, slowly; the pointer's light adds to it elsewhere (Cell.spin)
    angle: cell.dir * (t * 0.12 + cell.phase) + Math.sin(t * 0.3 + cell.phase) * 0.15,
    // a slow breath, each rosette on its own beat, instead of bobbing up and down
    scale: (REST_SCALE + (MAX_SCALE - REST_SCALE) * Math.max(0, grow)) * (1 + 0.1 * Math.sin(t * 0.45 + cell.phase)),
  };
}
