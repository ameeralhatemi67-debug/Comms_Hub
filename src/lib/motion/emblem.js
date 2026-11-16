/* The Hedayah emblem as vector strokes, so a design can draw it on, run light along it and give it any metal.

   The emblem is four interlaced capsules (a straight band with a half circle at each end) turned 0, 45, 90 and 135
   degrees about one centre; their eight ends are the eight lobes. Measured against the white mask the site ships
   (public/motion/logo_src-emblem.png, 768 x 769): centre (384, 384.5), cap radius 104.75, half length 269, stroke
   20.625, all in mask pixels. Drawn at those numbers, 98% of the mask's ink coincides (tests/motion-ribbons.test.mjs).
   Sizes here are fractions of the outer radius R, the mask's half width (384 pixels). */

const TAU = Math.PI * 2;
export const EMBLEM = { r: 104.75 / 384, half: 269 / 384, stroke: 20.625 / 384 };

/** The length of one capsule's centre line, in units of R. */
export const CAPSULE_LENGTH = 4 * EMBLEM.half + TAU * EMBLEM.r;

/** Capsule k (0 to 3) as a closed centre line. It starts on the right side's lower end, so a dash runs the same way on every capsule. */
export function capsulePath(c, cx, cy, R, k, rot = 0) {
  const a = k * Math.PI / 4 + rot, r = EMBLEM.r * R, h = EMBLEM.half * R;
  const ux = Math.sin(a), uy = -Math.cos(a), vx = Math.cos(a), vy = Math.sin(a);
  c.moveTo(cx + vx * r - ux * h, cy + vy * r - uy * h);
  c.lineTo(cx + vx * r + ux * h, cy + vy * r + uy * h);
  c.arc(cx + ux * h, cy + uy * h, r, a, a - Math.PI, true);
  c.lineTo(cx - vx * r - ux * h, cy - vy * r - uy * h);
  c.arc(cx - ux * h, cy - uy * h, r, a - Math.PI, a - TAU, true);
  c.closePath();
}

/** All four capsules in one path. */
export function emblemPath(c, cx, cy, R, rot = 0) {
  c.beginPath();
  for (let k = 0; k < 4; k++) capsulePath(c, cx, cy, R, k, rot);
}

/* Each capsule starts a little after the one before, so the emblem writes itself rather than appearing. */
const STAGGER = .14;
const part = (p, k) => Math.max(0, Math.min(1, (p - k * STAGGER) / (1 - 3 * STAGGER)));

/**
 * Strokes the emblem. `draw` (0 to 1) writes it on capsule by capsule; `style` is any stroke style (a metal gradient);
 * `weight` multiplies the true stroke and stays 1 unless a design has a reason.
 */
export function emblemStroke(c, cx, cy, R, { draw = 1, style = '#ffffff', weight = 1, rot = 0, alpha = 1 } = {}) {
  if (draw <= 0 || alpha <= .003 || R <= .5) return;
  const per = CAPSULE_LENGTH * R;
  c.save(); c.globalAlpha *= alpha; c.strokeStyle = style; c.lineWidth = EMBLEM.stroke * R * weight; c.lineCap = 'round'; c.lineJoin = 'round';
  if (draw >= 1) { emblemPath(c, cx, cy, R, rot); c.stroke(); c.restore(); return; }
  for (let k = 0; k < 4; k++) {
    const q = part(draw, k); if (q <= 0) continue;
    c.beginPath(); capsulePath(c, cx, cy, R, k, rot); c.setLineDash([per * q, per]); c.stroke();
  }
  c.restore();
}

/**
 * One light tracing the emblem: it runs once around each capsule in turn, so over a cycle (`phase` 0 to 1) it has
 * followed every lobe. `len` is its length as a share of a capsule. It brightens the metal beneath and nothing else.
 */
export function emblemShine(c, cx, cy, R, { phase = 0, len = .12, color = '#fff6dc', glow = 6, weight = 1, rot = 0, alpha = 1, blur = 1 } = {}) {
  if (alpha <= .01 || R <= .5) return;
  const per = CAPSULE_LENGTH * R, dash = per * len, u = ((phase % 1) + 1) % 1, k = Math.min(3, Math.floor(u * 4)), at = (u * 4 - k) * (per + dash);
  const fade = Math.sin(Math.PI * Math.min(1, at / (per + dash)));       // it enters and leaves each capsule softly
  c.save(); c.lineCap = 'round'; c.globalAlpha *= alpha * (.35 + .65 * fade);
  c.beginPath(); capsulePath(c, cx, cy, R, k, rot);
  c.setLineDash([dash, per + dash]); c.lineDashOffset = dash - at;
  c.globalCompositeOperation = 'lighter'; c.shadowColor = color; c.shadowBlur = glow * blur;
  c.strokeStyle = color; c.lineWidth = EMBLEM.stroke * R * weight * .9; c.globalAlpha *= .7; c.stroke();
  c.shadowBlur = 0; c.globalCompositeOperation = 'source-over'; c.globalAlpha /= .7; c.strokeStyle = '#ffffff'; c.lineWidth = EMBLEM.stroke * R * weight * .45; c.globalAlpha *= .8; c.stroke();
  c.restore();
}
