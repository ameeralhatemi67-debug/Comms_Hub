/* Two lower thirds of «تصاميم ريبين» built around the Hedayah emblem drawn as true vector strokes (emblem.js), and the
   design options they share: the metal (gold, silver, rose, bronze or any colour), a light that runs around the metal,
   a pattern, the title's font, the band's length, where the design sits, its size, its height above the bottom edge,
   a drop shadow, a glow and floating glints. Drawn into the 1280 x 720 logical canvas like every lower third.

   - Liquid Gold (rp-liquid): a drop of molten metal falls and splashes into a disc, the emblem writes itself inside it,
     metal flows out of the disc into a band with a living edge, the band cools into a dark glass panel from the disc
     outward, and the subtitle drips out of its underside. While shown, the edges ripple, highlights flow away from the
     disc, drops gather under the band and fall.
   - Ivory Plaque (rp-ivory): a reading of the owner's reference sheet. An ivory badge carries the emblem, a gold rule
     draws the ivory bar out of it, a navy band slides out for the subtitle, and a side plaque with a navy wave pops in
     at the far end with the Hedayah wordmark.

   Mirroring («يسار») flips the shapes only: text, the wordmark and anything with a direction are drawn upright. Every
   length that the canvas reads in device pixels (blur, shadow offset, pattern tiles) is scaled by the render scale
   and the design's own size, so the preview, the thumbnails and every export size look the same. */
import { kit } from './renderers.js';
import { emblemStroke, emblemShine } from './emblem.js';

const { EZ, S, TAU, clamp, lerp, frac, rnd, shade, hexToRgb, sparkle, drawLogo, rstate, rtotal } = kit;
const W = 1280, H = 720;
const sm = t => t * t * (3 - 2 * t);
const isAr = s => /[؀-ۿ]/.test(s || '');

/* ---------- metal ---------- */
const hex2 = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
const mixHex = (a, b, k) => { const A = hexToRgb(a), B = hexToRgb(b); return '#' + hex2(lerp(A[0], B[0], k)) + hex2(lerp(A[1], B[1], k)) + hex2(lerp(A[2], B[2], k)); };
const alphaOf = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };

/* Five tones of each metal, darkest first. Silver is cooler and harder than gold; rose and bronze are warmer. */
export const METALS = {
  gold: ['#3f2a07', '#8a611f', '#c9993f', '#ebc873', '#fff3cc'],
  silver: ['#262c33', '#646d78', '#a7b0bb', '#dee3e9', '#ffffff'],
  rose: ['#43231c', '#93584a', '#cf917e', '#f0c6b6', '#fff3ee'],
  bronze: ['#331d09', '#7a4a1e', '#b2763b', '#dea76d', '#ffe8c9'],
};
export function metalOf(P) {
  const m = METALS[P.metal]; if (m) return m;
  const b = /^#[0-9a-f]{6}$/i.test(P.accent || '') ? P.accent : '#c9993f';
  return [shade(b, 0, .72), shade(b, 0, .38), b, shade(b, 255, .38), shade(b, 255, .84)];
}
/** A CSS picture of a metal, for the choice buttons. */
export const metalCss = M => `linear-gradient(135deg, ${M[4]} 0%, ${M[3]} 22%, ${M[2]} 48%, ${M[1]} 68%, ${M[3]} 88%, ${M[4]} 100%)`;
const tone = (M, v) => { v = clamp(v) * 4; const i = Math.min(3, Math.floor(v)); return mixHex(M[i], M[i + 1], v - i); };

/* Polished metal across a band: light above, a dark core, a reflected light below. */
function metalBevel(c, x0, y0, x1, y1, M) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, M[4]); g.addColorStop(.16, M[3]); g.addColorStop(.42, M[2]); g.addColorStop(.62, M[1]); g.addColorStop(.84, M[2]); g.addColorStop(1, M[3]);
  return g;
}
/* Molten metal: bright and dark bands that travel along the line by `phase`, so the metal seems to flow. */
function metalFlow(c, x0, y0, x1, y1, M, phase, cycles = 2.6) {
  const g = c.createLinearGradient(x0, y0, x1, y1), n = 28;
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = TAU * (u * cycles - phase);
    let v = .5 + .3 * Math.sin(a) + .17 * Math.sin(a * 2.3 + 1.7 + phase * 2.1);
    v = sm(clamp(v));
    g.addColorStop(u, tone(M, .14 + .86 * v));
  }
  return g;
}

/* ---------- device lengths ---------- */
let zoom = 1;                                          // the design's own size during a draw
const px = v => v * kit.scale * zoom;                  // a design length in device pixels (blur and offsets ignore transforms)
function shadowOn(c, color, blur, oy = 0) { c.shadowColor = color; c.shadowBlur = px(blur); c.shadowOffsetX = 0; c.shadowOffsetY = px(oy); }
function shadowOff(c) { c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0; }

/* ---------- polygons ---------- */
const signed = pts => { let s = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]); return s; };
/* Adds a closed polygon, always turning the same way, so overlapping pieces of one path fill as their union. */
function addPoly(path, pts) {
  if (!pts || pts.length < 3) return;
  const p = signed(pts) < 0 ? pts.slice().reverse() : pts;
  path.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) path.lineTo(p[i][0], p[i][1]); path.closePath();
}
function linePath(c, pts, close = false) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); if (close) c.closePath(); }
const lengthOf = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };
function circlePts(cx, cy, r, n = 72, wob = null) {
  const out = []; for (let i = 0; i < n; i++) { const a = i / n * TAU, q = wob ? r * (1 + wob(a)) : r; out.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]); }
  return out;
}
function arcPts(cx, cy, r, a0, a1, n) { const out = []; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return out; }
function quadPts(x0, y0, cx, cy, x1, y1, n = 8) { const out = []; for (let i = 0; i <= n; i++) { const u = i / n, v = 1 - u; out.push([v * v * x0 + 2 * v * u * cx + u * u * x1, v * v * y0 + 2 * v * u * cy + u * u * y1]); } return out; }
/* A polygon with rounded corners, as points. `rad` is each corner's radius; a radius too large for its sides shrinks. */
function roundPoly(pts, rad, seg = 10) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const P = pts[i], A = pts[(i + n - 1) % n], B = pts[(i + 1) % n];
    let ux = A[0] - P[0], uy = A[1] - P[1], vx = B[0] - P[0], vy = B[1] - P[1];
    const la = Math.hypot(ux, uy), lb = Math.hypot(vx, vy); ux /= la; uy /= la; vx /= lb; vy /= lb;
    const th = Math.acos(clamp(ux * vx + uy * vy, -1, 1)), tn = Math.tan(th / 2);
    let d = rad[i] / tn; d = Math.min(d, la * .5, lb * .5); const r = d * tn;
    if (r < .5) { out.push([P[0], P[1]]); continue; }
    const t1 = [P[0] + ux * d, P[1] + uy * d], t2 = [P[0] + vx * d, P[1] + vy * d];
    let bx = ux + vx, by = uy + vy; const bl = Math.hypot(bx, by); bx /= bl; by /= bl;
    const k = r / Math.sin(th / 2), cx = P[0] + bx * k, cy = P[1] + by * k;
    const a0 = Math.atan2(t1[1] - cy, t1[0] - cx); let a1 = Math.atan2(t2[1] - cy, t2[0] - cx), da = a1 - a0;
    while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; a1 = a0 + da;
    for (const q of arcPts(cx, cy, r, a0, a1, seg)) out.push(q);
  }
  return out;
}
/* The concave corner where a straight edge (y = line) meets a circle: liquid never makes a sharp corner. `up` puts the
   fillet above the line, `dir` (-1 or 1) on the circle's left or right. Returns a polygon that also overlaps both. */
function fillet(cx, cy, R, line, rf, up, dir = -1) {
  const fy = up ? line - rf : line + rf, dy = cy - fy, reach = (R + rf) ** 2 - dy * dy;
  if (rf < .5 || reach <= 0) return null;
  const fx = cx + dir * Math.sqrt(reach), tx = cx + (fx - cx) * R / (R + rf), ty = cy + (fy - cy) * R / (R + rf);
  const a0 = up ? Math.PI / 2 : -Math.PI / 2;
  let a1 = Math.atan2(ty - fy, tx - fx), da = a1 - a0;
  while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
  return [...arcPts(fx, fy, rf, a0, a0 + da, 10), [cx, cy], [fx - dir * 2, up ? line + 14 : line - 14]];
}

/* ---------- light along a line ---------- */
/* A light running along `pts`: `at` (0 to 1) is where its head is. Added to what is beneath, so it only brightens. */
function comet(c, pts, at, len, color, width, glow, alpha = 1) {
  if (alpha <= .01 || pts.length < 2) return;
  const total = lengthOf(pts); if (total < 2) return;
  const head = frac(at) * (total + len);
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round'; c.globalAlpha *= alpha;
  linePath(c, pts); c.setLineDash([len, total + len * 2]); c.lineDashOffset = len - head;
  const fade = Math.sin(Math.PI * clamp(head / (total + len)));          // it enters and leaves the line softly
  c.globalAlpha *= .35 + .65 * fade;
  c.shadowColor = color; c.shadowBlur = px(glow); c.strokeStyle = color; c.lineWidth = width * 1.2; c.globalAlpha *= .5; c.stroke();
  c.globalAlpha /= .5; c.globalCompositeOperation = 'source-over'; c.shadowBlur = 0; c.strokeStyle = '#ffffff'; c.lineWidth = width * .5; c.globalAlpha *= .85; c.stroke();
  c.restore();
}
const closed = pts => [...pts, pts[0]];

/* ---------- layers: soft reveals and masked patterns under any transform ---------- */
const pool = {};
function scratch(name, w, h) {
  let cv = pool[name];
  if (!cv) cv = pool[name] = document.createElement('canvas');
  if (cv.width < w || cv.height < h) { cv.width = Math.max(cv.width, w); cv.height = Math.max(cv.height, h); }
  const x = cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; shadowOff(x); x.clearRect(0, 0, w, h);
  return x;
}
function deviceBox(c, box) {
  const M = c.getTransform(), xs = [], ys = [];
  for (const [x, y] of [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]]) { xs.push(M.a * x + M.c * y + M.e); ys.push(M.b * x + M.d * y + M.f); }
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(c.canvas.width, Math.ceil(Math.max(...xs))), y1 = Math.min(c.canvas.height, Math.ceil(Math.max(...ys)));
  return { M, x0, y0, w: x1 - x0, h: y1 - y0 };
}
/* Draws `paint` into a layer covering `box`, keeps it where `mask(x)` (a fill style in design units) is opaque, lays it down. */
function masked(c, name, box, paint, mask) {
  const d = deviceBox(c, box); if (d.w < 1 || d.h < 1) return;
  const x = scratch(name, d.w, d.h), M = d.M;
  x.setTransform(M.a, M.b, M.c, M.d, M.e - d.x0, M.f - d.y0);
  paint(x);
  x.globalCompositeOperation = 'destination-in'; x.globalAlpha = 1; shadowOff(x); x.fillStyle = mask(x);
  x.fillRect(box.x - 4000, box.y - 4000, box.w + 8000, box.h + 8000);
  c.save(); shadowOff(c); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(x.canvas, 0, 0, d.w, d.h, d.x0, d.y0, d.w, d.h); c.restore();
}
/* A soft wipe: `p` (0 to 1) uncovers what `paint` draws inside `box`, from the emblem's side. */
function reveal(c, box, p, paint, soft = 90) {
  if (p <= 0) return;
  if (p >= 1) { paint(c); return; }
  const f = p * (box.w + soft), edge = box.x + box.w - f;
  masked(c, 'reveal', { x: box.x, y: box.y - 20, w: box.w, h: box.h + 40 }, paint, x => {
    const g = x.createLinearGradient(edge, 0, edge + soft, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)'); return g;
  });
}

/* ---------- text ---------- */
const FAMILY = {
  plex: '"IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif',
  kufi: '"Reem Kufi","IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif',
  ruqaa: '"Aref Ruqaa","IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif',
  system: '"Segoe UI",Tahoma,system-ui,sans-serif',
};
const WEIGHT = { plex: 700, kufi: 600, ruqaa: 700, system: 800 };
const titleFont = P => ({ family: FAMILY[P.font] || FAMILY.plex, weight: WEIGHT[P.font] || 700 });
const subFont = P => P.font === 'system' ? { family: FAMILY.system, weight: 700 } : { family: FAMILY.plex, weight: 600 };
function widthOf(c, str, size, f) { c.font = `${f.weight} ${size}px ${f.family}`; c.direction = isAr(str) ? 'rtl' : 'ltr'; return c.measureText(str || '').width; }
function fit(c, str, size, f, maxW, minK = .5) { const w = widthOf(c, str, size, f); return w > maxW ? Math.max(size * minK, size * maxW / w) : size; }
/* Text anchored at its emblem-side end (`x` in design units). Under the mirror it is drawn upright and grows the other way. */
function say(c, str, x, y, size, f, color, mir, align = 'right') {
  if (!str) return;
  c.save(); c.translate(x, y); if (mir) c.scale(-1, 1);
  c.font = `${f.weight} ${size}px ${f.family}`; c.fillStyle = color; c.textBaseline = 'alphabetic'; c.direction = isAr(str) ? 'rtl' : 'ltr';
  c.textAlign = align === 'center' ? 'center' : (align === 'right') !== mir ? 'right' : 'left';
  c.fillText(str, 0, 0); c.restore();
}

/* ---------- patterns ---------- */
const TILE = { emblem: 72, girih: 64, rings: 48, waves: 64, dots: 16, hatch: 12, grain: 40 };
function star8(x, cx, cy, r, rot = Math.PI / 8) {
  x.beginPath();
  for (let k = 0; k < 16; k++) { const a = rot + k * Math.PI / 8, q = k % 2 ? r * .56 : r; k ? x.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q) : x.moveTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); }
  x.closePath(); x.stroke();
}
const WRAP = [[0, 0], [1, 0], [0, 1], [1, 1]];
const DRAW_TILE = {
  emblem(x, T) {
    for (const [i, j] of [[.5, .5], ...WRAP]) emblemStroke(x, i * T, j * T, T * .3, { style: x.strokeStyle, weight: 1.2 });
    for (const [i, j] of [[.5, 0], [0, .5], [.5, 1], [1, .5]]) { x.save(); x.translate(i * T, j * T); x.rotate(Math.PI / 4); x.strokeRect(-2.2, -2.2, 4.4, 4.4); x.restore(); }
  },
  girih(x, T) {
    for (const [i, j] of [[.5, .5], ...WRAP]) star8(x, i * T, j * T, T * .25);
    x.beginPath();
    for (const [i, j] of WRAP) { const sx = Math.sign(.5 - i), sy = Math.sign(.5 - j); x.moveTo(i * T + sx * T * .18, j * T + sy * T * .18); x.lineTo(T / 2 - sx * T * .18, T / 2 - sy * T * .18); }
    x.stroke();
  },
  rings(x, T) { for (const [i, j] of [[.5, .5], ...WRAP]) { x.beginPath(); x.arc(i * T, j * T, T / 2, 0, TAU); x.stroke(); } },
  waves(x, T) {
    for (let j = -1; j < 9; j++) { x.beginPath(); for (let i = 0; i <= 32; i++) { const u = i / 32 * T; const y = j * T / 8 + 2.4 * Math.sin(u / T * TAU); i ? x.lineTo(u, y) : x.moveTo(u, y); } x.stroke(); }
  },
  dots(x, T) { for (const [i, j] of [[.25, .25], [.75, .75]]) { x.beginPath(); x.arc(i * T, j * T, 1.4, 0, TAU); x.fill(); } },
  hatch(x, T) { x.beginPath(); for (const o of [-T, 0, T]) { x.moveTo(o, T); x.lineTo(o + T, 0); } x.stroke(); },
  grain(x, T) {
    for (let i = 0; i < 260; i++) { x.globalAlpha = .25 + .75 * rnd(i * 1.37 + 2); x.beginPath(); x.arc(rnd(i + .11) * T, rnd(i * 2.3 + .7) * T, .25 + .55 * rnd(i * .7 + 5), 0, TAU); x.fill(); }
    x.globalAlpha = 1;
  },
};
export const PATTERNS = Object.keys(TILE);
const tiles = new Map();
function tileCanvas(kind, ink, k) {
  const T = TILE[kind], n = Math.max(4, Math.round(T * k)), id = `${kind}|${ink}|${n}`;
  let cv = tiles.get(id);
  if (!cv) {
    cv = document.createElement('canvas'); cv.width = cv.height = n;
    const x = cv.getContext('2d'); x.scale(n / T, n / T); x.strokeStyle = ink; x.fillStyle = ink; x.lineWidth = 1; x.lineCap = 'round'; x.lineJoin = 'round';
    DRAW_TILE[kind](x, T);
    if (tiles.size > 48) tiles.clear();
    tiles.set(id, cv);
  }
  return { cv, T, n };
}
function fillPattern(c, kind, ink, box, drift = 0) {
  if (!TILE[kind] || typeof DOMMatrix === 'undefined') return;
  const { cv, T, n } = tileCanvas(kind, ink, kit.scale * zoom), pat = c.createPattern(cv, 'repeat'); if (!pat) return;
  pat.setTransform(new DOMMatrix([T / n, 0, 0, T / n, ((drift % T) + T) % T, 0]));
  c.fillStyle = pat; c.fillRect(box.x, box.y, box.w, box.h);
}
/** Paints a pattern's swatch for the choice buttons. */
export function patternSwatch(canvas, kind, ink, paper) {
  const x = canvas.getContext('2d'); if (!x) return;
  x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = paper; x.fillRect(0, 0, canvas.width, canvas.height);
  if (!TILE[kind] || typeof DOMMatrix === 'undefined') return;
  const k = canvas.width / 64, { cv, T, n } = tileCanvas(kind, ink, k), pat = x.createPattern(cv, 'repeat'); if (!pat) return;
  pat.setTransform(new DOMMatrix([T / n * k, 0, 0, T / n * k, 0, 0])); x.fillStyle = pat; x.fillRect(0, 0, canvas.width, canvas.height);
}

/* ---------- placing the design: side, size and height ---------- */
/* Applies the design's place to the context and returns whether it is mirrored. The layout is drawn for the emblem on the
   right; `box` is its extent there, and the anchor is the emblem's outer edge, so the emblem stays put as the size changes. */
function place(c, P, box, ax, ay) {
  zoom = clamp((Number(P.size) || 100) / 100, .5, 1.4);
  const side = P.side === 'left' || P.side === 'center' ? P.side : 'right', mir = side === 'left';
  const L = ax + (box.x0 - ax) * zoom, R = ax + (box.x1 - ax) * zoom, T = ay + (box.y0 - ay) * zoom;
  let dx = 0;
  if (side === 'center') dx = W / 2 - (L + R) / 2;
  else { if (L < 16) dx = 16 - L; if (R + dx > W - 16) dx = W - 16 - R; }
  let dy = -clamp(Number(P.lift) || 0, 0, 80) / 100 * H; if (T + dy < 10) dy = 10 - T;
  c.translate(0, dy);
  if (mir) { c.translate(W, 0); c.scale(-1, 1); }
  c.translate(ax + dx, ay); c.scale(zoom, zoom); c.translate(-ax, -ay);
  return mir;
}
const shinePhase = (P, t, period) => frac(t * clamp(Number(P.shineSpeed) || 1, .1, 4) / period);
const idleK = P => clamp((Number(P.mIdle) || 0) / 100);

/* =========================================================
   LIQUID GOLD
   ========================================================= */
const LQ = { ox: 1100, oy: 552, mr: 74, left: 208, h: 94, rim: 7 };
const LQ_BOX = { x0: 150, x1: 1192, y0: 440, y1: 664 };

/* A band of liquid from x = xr leftwards to a round front centred at xf. top(x) and bot(x) give its edges. */
function bandPts(xr, xf, rc, yc, top, bot, capWob) {
  const pts = [];
  for (let x = xr; x > xf; x -= 8) pts.push([x, top(x)]);
  const et = top(xf) - (yc - rc), eb = bot(xf) - (yc + rc);
  for (let i = 0; i <= 20; i++) {
    const a = -Math.PI / 2 - i / 20 * Math.PI, sn = Math.sin(a), q = rc * (1 + capWob(a));
    pts.push([xf + Math.cos(a) * q, yc + sn * q + (sn < 0 ? et * -sn : eb * sn)]);
  }
  for (let x = xf + 8; x < xr; x += 8) pts.push([x, bot(x)]);
  pts.push([xr, bot(xr)]);
  return pts;
}
function stadiumPts(x0, x1, yc, h) {
  const r = h / 2; if (x1 - x0 < h) { const m = (x0 + x1) / 2; x0 = m - r; x1 = m + r; }
  return [...arcPts(x1 - r, yc, r, -Math.PI / 2, Math.PI / 2, 14), ...arcPts(x0 + r, yc, r, Math.PI / 2, Math.PI * 1.5, 14)];
}
function teardrop(x, yb, len, r, neck) {
  return [[x - neck, yb - 3], ...quadPts(x - neck, yb - 3, x - r * .7, yb + len * .45, x - r, yb + len, 6).slice(1),
    ...arcPts(x, yb + len, r, Math.PI, 0, 12).slice(1), ...quadPts(x + r, yb + len, x + r * .7, yb + len * .45, x + neck, yb - 3, 6).slice(1)];
}

function drawLiquid(ctx, P, t) {
  const s = rstate(P, t); if (s.b < .0006) return;
  const { b, m, id } = s, M = metalOf(P), c = ctx;
  c.save();
  const { ox, oy, mr, rim } = LQ, ik = idleK(P), flow = clamp((Number(P.flow) || 0) / 100);
  const tf = titleFont(P), sf = subFont(P), hasSub = Boolean(P.subtitle && P.subtitle.trim()), hasKick = Boolean(P.kicker && P.kicker.trim());

  /* the moments of the build */
  const dropP = S(b, 0, .13), splash = S(b, .12, .38), discP = EZ.back(S(b, .11, .3), Math.min(1, m * 1.25));
  const embP = EZ.inOut(S(b, .17, .46)), ext = EZ.outQ(S(b, .27, .66)), thick = EZ.out(S(b, .27, .5)), cool = EZ.inOut(S(b, .42, .78));
  const txP = S(b, .58, .86), subP = EZ.outQ(S(b, .6, .86)), subDrop = EZ.back(S(b, .6, .76), m), subTx = S(b, .7, .96), kickP = EZ.back(S(b, .68, .9), m);
  const settle = S(b, .62, 1), built = S(b, .85, 1);

  /* how far the band reaches: the title's length, or the whole width */
  const tSize0 = 42, titleW = widthOf(c, P.title, tSize0, tf), ssize = 22, subW = hasSub ? widthOf(c, P.subtitle, ssize, sf) + 72 : 0;
  const tR = ox - mr - 32, minLeft = LQ.left;
  const left = P.span === 'full' ? minLeft : clamp(tR - Math.max(titleW + 60, subW + 10, 300), minLeft, tR - 300);
  const mir = place(c, P, { ...LQ_BOX, x0: left - 50 }, 1190, 640);
  const h = LQ.h * (.3 + .7 * thick), yc = oy, rc = h / 2;

  /* the living edge: three travelling waves, still near the disc, stronger while the metal settles */
  const amp = 6.5 * flow * (ik + 1.6 * (1 - settle));
  const env = x => sm(clamp((ox - mr - 4 - x) / 120));
  const wave = (x, seed) => env(x) * amp * (.5 * Math.sin(x * .019 + t * 2.2 + seed) + .3 * Math.sin(x * .043 - t * 3.4 + seed * 1.7) + .2 * Math.sin(x * .008 + t * 1.25 + seed * 2.9));
  const xf = lerp(ox - mr * .3, left + rc, ext);
  const bulge = .26 * (1 - ext) * (.4 + m);
  const bump = x => rc * bulge * Math.exp(-(((x - xf) / (rc * 1.8)) ** 2));
  const top = x => yc - rc - wave(x, 0) - bump(x), bot = x => yc + rc + wave(x, 4.1) + bump(x);
  const capWob = a => flow * (ik + 1.4 * (1 - settle)) * .045 * Math.sin(3 * a + t * 4.6);

  /* the gold body: one path, so it fills, shades and casts one shadow as a single piece of metal */
  const gold = new Path2D(), outline = [];
  const discR = mr * Math.max(0, discP);
  const wobD = .02 * flow * (ik + 1.8 * (1 - settle));
  if (discR > .5) addPoly(gold, circlePts(ox, oy, discR, 84, a => wobD * (Math.sin(6 * a + t * 2.6) + .6 * Math.sin(3 * a - t * 3.7))));
  if (dropP < 1) {                                            // the falling drop
    const y = lerp(oy - 250, oy - 8, dropP * dropP), r = 15, sy = 1 + .8 * dropP, sx = 1 - .22 * dropP;
    const tear = []; for (let i = 0; i < 40; i++) { const a = i / 40 * TAU, sn = Math.sin(a), tail = sn < 0 ? 1 + .9 * (-sn) ** 3 : 1; tear.push([ox + Math.cos(a) * r * sx * (sn < 0 ? 1 - .45 * (-sn) : 1), y + sn * r * sy * tail]); }
    addPoly(gold, tear);
  }
  if (splash > 0 && splash < 1 && s.dir !== 'out') {         // the splash as it lands
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * .34 + (rnd(i + 1) - .5) * .25, v = 130 + 110 * rnd(i + 3), u = splash;
      const r = (3 + 3.4 * rnd(i + 5)) * (1 - u);
      if (r > .6) addPoly(gold, circlePts(ox + Math.cos(a) * v * u, oy - 20 + Math.sin(a) * v * u + 300 * u * u, r, 12));
    }
  }
  const band = ext > .002 ? bandPts(ox, xf, rc * (1 + bulge), yc, top, bot, capWob) : null;
  if (band) {
    addPoly(gold, band);
    const rf = 26 * clamp(ext * 5) * clamp(discP);
    addPoly(gold, fillet(ox, oy, discR, top(ox - mr), rf, true));
    addPoly(gold, fillet(ox, oy, discR, bot(ox - mr), rf, false));
    for (let i = 0; i < band.length - 1; i++) outline.push(band[i]);
  }

  /* the subtitle: a pill that drips out of the band's underside, from the disc outward */
  let pill = null;
  if (hasSub && subP > .002 && band) {
    const ph = 40, prx = ox - mr + 8, pw = Math.min(subW, prx - left - 8), plx = prx - Math.max(ph, pw * subP);
    const pyc = bot(prx - 60) - 8 + ph / 2 - (1 - subDrop) * (ph - 6);
    pill = { prx, plx, pyc, ph };
    addPoly(gold, stadiumPts(plx, prx, pyc, ph));
    addPoly(gold, [[plx + ph / 2, yc], [prx, yc], [prx, pyc], [plx + ph / 2, pyc]]);    // joined to the band whatever its wave
    addPoly(gold, fillet(plx + ph / 2, pyc, ph / 2, bot(plx + ph / 2), 14 * clamp(subP * 4), false, -1));
  }
  /* an optional tab above the band */
  let tab = null;
  if (hasKick && kickP > .01 && band) {
    const kf = { family: FAMILY.plex, weight: 700 }, ks = 18, kw = widthOf(c, P.kicker, ks, kf) + 46, kh = 32, krx = ox - mr - 22;
    const kyc = yc - rc - kh / 2 + 3 - (1 - kickP) * (kh - 4);
    tab = { kf, ks, kw, kh, krx, kyc };
    addPoly(gold, stadiumPts(krx - kw, krx, kyc, kh));
    addPoly(gold, [[krx - kw + kh / 2, kyc], [krx, kyc], [krx, yc], [krx - kw + kh / 2, yc]]);
    addPoly(gold, fillet(krx - kw + kh / 2, kyc, kh / 2, top(krx - kw + kh / 2), 12 * clamp(kickP * 3), true, -1));
  }
  /* drops gathering under the band and falling, while it is shown */
  const falling = [];
  if (P.drips && band && settle > .95 && ik > .01) {
    for (let i = 0; i < 3; i++) {
      const per = 4.4 + i * .7, k = Math.floor((t + i * 1.9) / per), u = frac((t + i * 1.9) / per);
      const x = lerp(left + 60, tR - 40, clamp(.12 + .3 * i + .16 * (rnd(k * 3 + i) - .5)));
      const under = pill && x > pill.plx - 24;                 // under the subtitle the drop gathers on its underside
      if (under && (x < pill.plx + pill.ph * .7 || x > pill.prx - pill.ph * .7)) continue;
      const yb = under ? pill.pyc + pill.ph / 2 : bot(x);
      if (u < .64) { const g = sm(u / .64); addPoly(gold, teardrop(x, yb, 3 + 19 * g, 3.4 + 3.2 * g, 6 + 6 * g)); }
      else { const v = (u - .64) / .36; falling.push({ x, y: yb + 24 + 230 * v * v, r: 6 * (1 - .35 * v), a: (1 - v) * ik }); }
    }
  }

  const flowPhase = t * .2 * (.3 + .7 * flow) * (.25 + .75 * ik) + (1 - ext) * .9;
  const goldFill = metalFlow(c, ox + 80, 0, left - 80, 0, M, flowPhase);
  const glowOn = P.glow !== false;

  if (glowOn && discR > 1) {                                 // warm light behind the disc
    const g = c.createRadialGradient(ox, oy, discR * .8, ox, oy, discR * 1.9);
    g.addColorStop(0, alphaOf(M[3], .3 * clamp(discP))); g.addColorStop(1, alphaOf(M[3], 0));
    c.fillStyle = g; c.fillRect(ox - discR * 2, oy - discR * 2, discR * 4, discR * 4);
  }
  if (P.dropShadow !== false) { c.save(); shadowOn(c, 'rgba(0,0,0,.45)', 24, 10); c.fillStyle = M[1]; c.fill(gold); c.restore(); }
  c.fillStyle = goldFill; c.fill(gold);
  c.save(); c.clip(gold);
  {                                                          // depth: light from above, shade below, a wet streak
    const g = c.createLinearGradient(0, oy - mr, 0, oy + mr + 40);
    g.addColorStop(0, 'rgba(255,255,255,.42)'); g.addColorStop(.3, 'rgba(255,255,255,.06)'); g.addColorStop(.55, 'rgba(0,0,0,0)'); g.addColorStop(.85, 'rgba(0,0,0,.2)'); g.addColorStop(1, 'rgba(0,0,0,.34)');
    c.fillStyle = g; c.fillRect(left - 80, oy - 300, ox + mr - left + 200, 600);
    const rg = c.createRadialGradient(ox - mr * .35, oy - mr * .45, 2, ox - mr * .2, oy - mr * .3, mr * .9);
    rg.addColorStop(0, 'rgba(255,255,255,.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = rg; c.fillRect(ox - mr, oy - mr, mr * 2, mr * 2);
    if (band) {
      c.beginPath(); let first = true;
      for (let x = ox - mr * .6; x > xf; x -= 8) { const y = top(x) + 4.5; first ? c.moveTo(x, y) : c.lineTo(x, y); first = false; }
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2.2; c.lineCap = 'round'; shadowOn(c, 'rgba(255,255,255,.8)', 6); c.stroke(); shadowOff(c);
    }
  }
  c.restore();
  for (const d of falling) {                                 // drops in flight
    c.save(); c.globalAlpha *= d.a; c.fillStyle = metalBevel(c, 0, d.y - d.r, 0, d.y + d.r, M);
    const tear = []; for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, sn = Math.sin(a); tear.push([d.x + Math.cos(a) * d.r * (sn < 0 ? 1 - .5 * -sn : 1), d.y + sn * d.r * (sn < 0 ? 1.7 : 1)]); }
    const p = new Path2D(); addPoly(p, tear); c.fill(p); c.restore();
  }

  /* the glass panel: the band cools from the disc outward into the panel colour */
  if (band) {
    const inner = bandPts(ox, xf, Math.max(1, rc * (1 + bulge) - rim), yc, x => top(x) + rim, x => bot(x) - rim, capWob);
    const panel = new Path2D(); addPoly(panel, inner);
    const xc = lerp(ox - mr * .3, xf - rc - 40, cool);
    const coolPts = []; for (let y = yc - rc - 30; y <= yc + rc + 30; y += 6) coolPts.push([xc + (11 * Math.sin(y * .05 + t * 2.4) + 4 * Math.sin(y * .11 - t * 3.3)) * (1 - cool * .6), y]);
    const coolEdge = coolPts.slice();
    coolPts.push([ox + 400, yc + rc + 30], [ox + 400, yc - rc - 30]);
    const region = new Path2D(); addPoly(region, coolPts);
    if (cool > .001) {
      c.save(); c.clip(panel); c.clip(region);
      const g = c.createLinearGradient(0, yc - rc, 0, yc + rc);
      g.addColorStop(0, shade(P.main, 255, .14)); g.addColorStop(.45, P.main); g.addColorStop(1, shade(P.main, 0, .45));
      c.fillStyle = g; c.fillRect(left - 60, yc - rc - 40, ox - left + 120, h + 80);
      const amt = clamp((Number(P.patternAmt) || 0) / 100);
      if (P.pattern && P.pattern !== 'none' && amt > 0) {
        const pbox = { x: left - 40, y: yc - rc - 20, w: ox - left + 60, h: h + 40 };
        masked(c, 'pattern', pbox, x => { x.save(); x.globalAlpha = .75 * amt; fillPattern(x, P.pattern, M[3], pbox, -t * 6 * ik); x.restore(); }, x => {
          const g2 = x.createLinearGradient(tR - 40, 0, left, 0); g2.addColorStop(0, 'rgba(0,0,0,.25)'); g2.addColorStop(.5, 'rgba(0,0,0,.7)'); g2.addColorStop(1, 'rgba(0,0,0,1)'); return g2;
        });
      }
      const gl = c.createLinearGradient(0, yc - rc, 0, yc + rc * .1);
      gl.addColorStop(0, 'rgba(255,255,255,.2)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gl; c.fillRect(left - 60, yc - rc, ox - left + 120, rc * 1.1);
      c.restore();
      c.save(); c.clip(panel); c.clip(region); linePath(c, inner, true); c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 5; shadowOn(c, 'rgba(0,0,0,.7)', 8, 2); c.stroke(); c.restore();
    }
    if (cool > .001 && cool < .999) {                       // the hot edge where metal turns to glass
      c.save(); c.clip(panel); c.globalCompositeOperation = 'lighter'; linePath(c, coolEdge); c.strokeStyle = alphaOf(M[4], .95 * Math.sin(Math.PI * cool)); c.lineWidth = 5; shadowOn(c, M[3], 22); c.stroke(); c.lineWidth = 2; c.strokeStyle = alphaOf('#ffffff', .8 * Math.sin(Math.PI * cool)); c.stroke(); c.restore();
    }
    /* the title */
    const maxW = tR - (xf - rc) - 30, size = fit(c, P.title, tSize0, tf, maxW);
    reveal(c, { x: xf - rc, y: yc - rc, w: tR - (xf - rc) + 12, h }, txP, x => {
      x.save(); shadowOn(x, 'rgba(0,0,0,.5)', 6, 2); say(x, P.title, tR, yc + size * .36, size, tf, P.text, mir); x.restore();
    });
  }

  /* the disc's glass and the emblem */
  if (discR > rim + 2) {
    const gr = discR - rim - 1;
    c.save();
    const g = c.createRadialGradient(ox - gr * .3, oy - gr * .4, 2, ox, oy, gr);
    g.addColorStop(0, shade(P.main, 255, .22)); g.addColorStop(.6, P.main); g.addColorStop(1, shade(P.main, 0, .5));
    c.fillStyle = g; c.beginPath(); c.arc(ox, oy, gr, 0, TAU); c.fill();
    c.beginPath(); c.arc(ox, oy, gr, 0, TAU); c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 3; shadowOn(c, 'rgba(0,0,0,.6)', 6, 1); c.stroke(); shadowOff(c);
    const R = gr - 9 * (gr / (mr - rim - 1));
    emblemStroke(c, ox, oy, R, { draw: embP, style: metalBevel(c, ox - R, oy - R, ox + R * .4, oy + R, M) });
    if (P.shine && built > 0) emblemShine(c, ox, oy, R, { phase: shinePhase(P, t, 6.8), color: M[4], glow: 7, blur: kit.scale * zoom, alpha: built });
    const gl = c.createLinearGradient(0, oy - gr, 0, oy); gl.addColorStop(0, 'rgba(255,255,255,.16)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    c.beginPath(); c.ellipse(ox, oy - gr * .38, gr * .82, gr * .5, 0, 0, TAU); c.fillStyle = gl; c.fill();
    c.restore();
  }

  /* the subtitle and the tab text */
  if (pill) {
    const size = fit(c, P.subtitle, ssize, sf, pill.prx - pill.plx - 60);
    reveal(c, { x: pill.plx, y: pill.pyc - pill.ph / 2, w: pill.prx - pill.plx - 30, h: pill.ph }, subTx, x => say(x, P.subtitle, pill.prx - 36, pill.pyc + size * .36, size, sf, P.c1, mir));
  }
  if (tab) say(c, P.kicker, tab.krx - 23, tab.kyc + 6.5, tab.ks, tab.kf, shade(P.main, 0, .2), mir);

  /* light running around the metal */
  if (P.shine && built > 0) {
    const ph = shinePhase(P, t, 3.4), col = M[4];
    comet(c, closed(circlePts(ox, oy, discR, 84)), ph, 70, col, 2.4, 12, built);
    if (outline.length > 2) comet(c, outline, frac(ph + .35), 170, col, 2.6, 14, built);
    if (pill) comet(c, closed(stadiumPts(pill.plx, pill.prx, pill.pyc, pill.ph)), frac(ph + .6), 90, col, 2, 10, built);
  }
  /* glints rising off the metal */
  if (P.particles && band) {
    const a0 = S(b, .7, 1);
    for (let i = 0; i < 18; i++) {
      const u = frac(t * (.06 + .05 * rnd(i + 11)) + rnd(i + 3)), x = lerp(xf - rc, ox + mr * .6, rnd(i + 1)), y = yc - rc - 6 - u * (90 + 60 * rnd(i + 7));
      sparkle(c, x, y, 1.6 + 2.8 * rnd(i + 2), i % 3 ? M[4] : M[3], Math.sin(Math.PI * u) * .9 * a0);
    }
  }
  c.restore();
}

/* =========================================================
   IVORY PLAQUE (a reading of the reference sheet)
   ========================================================= */
const IV = { bx: 1096, by: 552, br: 78, x0: 330, top: 500, bot: 606, rad: 22, btop: 566, bbot: 594 };
const IV_BOX = { x0: 128, x1: 1186, y0: 452, y1: 640 };
/* the side plaque, about its centre: a rounded triangle whose long side bows out (the reference's left shape) */
const PLAQUE = { pts: [[-96, 80], [86, 80], [84, -52], [22, -94], [-74, -30]], rad: [22, 14, 40, 70, 64] };

function drawIvory(ctx, P, t) {
  const s = rstate(P, t); if (s.b < .0006) return;
  const { b, m } = s, M = metalOf(P), c = ctx;
  c.save();
  const { bx, by, br, top, bot, rad, btop, bbot } = IV, ik = idleK(P);
  const tf = titleFont(P), sf = subFont(P), plaqueOn = P.plaque !== 'none', hasSub = Boolean(P.subtitle && P.subtitle.trim());

  const badgeP = EZ.back(S(b, 0, .17), m), ringP = EZ.inOut(S(b, .04, .27)), embP = EZ.inOut(S(b, .1, .38));
  const ruleP = EZ.outQ(S(b, .2, .47)), fillP = EZ.out(S(b, .26, .56)), plaqueP = EZ.back(S(b, .44, .66), m), waveP = EZ.out(S(b, .52, .76));
  const bandP = EZ.outQ(S(b, .44, .72)), txP = S(b, .56, .82), subTx = S(b, .66, .92), divP = EZ.out(S(b, .6, .8)), patP = S(b, .5, .86), inside = S(b, .62, .86);
  const built = S(b, .85, 1);

  /* the bar's length: the title's, or the whole width */
  const tSize0 = 42, titleW = widthOf(c, P.title, tSize0, tf), ssize = 20, subW = hasSub ? widthOf(c, P.subtitle, ssize, sf) : 0;
  const tR = bx - br - 26, gap = plaqueOn ? 96 : 40;
  const x0 = P.span === 'full' ? IV.x0 : clamp(tR - Math.max(titleW, subW + 30, 280) - gap, IV.x0, tR - 300);
  const pcx = x0 - 86, pcy = by - 2;
  const mir = place(c, P, { ...IV_BOX, x0: plaqueOn ? pcx - 112 : x0 - 12 }, 1182, 640);
  const barPts = roundPoly([[x0, top], [bx, top], [bx, bot], [x0, bot]], [rad, 0, 0, rad], 8);
  const bar = new Path2D(); addPoly(bar, barPts);

  if (P.glow !== false && badgeP > .01) {
    const g = c.createRadialGradient(bx, by, br * .6, bx, by, br * 2.3);
    g.addColorStop(0, alphaOf(M[3], .3 * clamp(badgeP))); g.addColorStop(1, alphaOf(M[3], 0)); c.fillStyle = g; c.fillRect(bx - br * 2.4, by - br * 2.4, br * 4.8, br * 4.8);
  }

  /* the ivory bar, filling behind its gold rule */
  const fx = lerp(bx, x0 - 20, fillP);
  if (fillP > .001) {
    c.save(); c.beginPath(); c.rect(fx, top - 40, bx - fx + 200, bot - top + 80); c.clip();
    if (P.dropShadow !== false) { c.save(); shadowOn(c, 'rgba(0,0,0,.4)', 22, 9); c.fillStyle = P.c3; c.fill(bar); c.restore(); }
    const g = c.createLinearGradient(0, top, 0, bot); g.addColorStop(0, shade(P.c3, 255, .5)); g.addColorStop(.5, P.c3); g.addColorStop(1, shade(P.c3, 0, .07));
    c.fillStyle = g; c.fill(bar);
    c.save(); c.clip(bar);
    const amt = clamp((Number(P.patternAmt) || 0) / 100) * patP;
    if (P.pattern && P.pattern !== 'none' && amt > 0) {
      const pbox = { x: x0, y: top, w: bx - x0, h: bot - top };
      masked(c, 'pattern', pbox, x => { x.save(); x.globalAlpha = .95 * amt; fillPattern(x, P.pattern, M[2], pbox, -t * 3 * ik); x.restore(); }, x => {
        const g2 = x.createLinearGradient(bx, 0, x0, 0); g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(.55, 'rgba(0,0,0,.45)'); g2.addColorStop(1, 'rgba(0,0,0,.15)'); return g2;
      });
    }
    if (P.shine && built > 0) {                              // a slow sheen over the ivory
      const u = frac(t * clamp(Number(P.shineSpeed) || 1, .1, 4) / 5.2), sx = lerp(bx + 120, x0 - 160, sm(clamp(u / .45)));
      if (u < .45) { const sg = c.createLinearGradient(sx - 90, 0, sx + 90, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(.5, `rgba(255,255,255,${.5 * built})`); sg.addColorStop(1, 'rgba(255,255,255,0)'); c.save(); c.transform(1, 0, -.5, 1, 0, 0); c.translate(by * .5, 0); c.fillStyle = sg; c.fillRect(sx - 90, top, 180, bot - top); c.restore(); }
    }
    const inner = roundPoly([[x0 + 7, top + 7], [bx, top + 7], [bx, bot - 7], [x0 + 7, bot - 7]], [rad - 6, 0, 0, rad - 6], 8);
    linePath(c, inner, true); c.strokeStyle = alphaOf(M[2], .55); c.lineWidth = 1; c.stroke();
    c.restore();
    if (fillP < 1) { const lg = c.createLinearGradient(fx, 0, fx + 60, 0); lg.addColorStop(0, alphaOf(M[4], .9)); lg.addColorStop(1, alphaOf(M[4], 0)); c.fillStyle = lg; c.fillRect(fx, top, 60, bot - top); }
    c.restore();
  }
  /* the gold rule, drawn out of the badge along both edges */
  const upper = [[bx, top], ...barPts.filter(p => p[1] < (top + bot) / 2 && p[0] < bx).sort((a, b2) => b2[0] - a[0])];
  const lower = [[bx, bot], ...barPts.filter(p => p[1] >= (top + bot) / 2 && p[0] < bx).sort((a, b2) => b2[0] - a[0])];
  if (ruleP > .001) {
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = metalBevel(c, 0, top - 2, 0, bot + 2, M); c.lineWidth = 3.4;
    for (const line of [upper, lower]) { const L = lengthOf(line); linePath(c, line); c.setLineDash([L * ruleP, L + 1]); c.stroke(); }
    if (ruleP < 1) for (const line of [upper, lower]) { const L = lengthOf(line), at = L * ruleP; let acc = 0; for (let i = 1; i < line.length; i++) { const d = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]); if (acc + d >= at) { const u = (at - acc) / d, hx = lerp(line[i - 1][0], line[i][0], u), hy = lerp(line[i - 1][1], line[i][1], u); c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = '#fff'; shadowOn(c, M[3], 14); c.beginPath(); c.arc(hx, hy, 3.4, 0, TAU); c.fill(); c.restore(); break; } acc += d; } }
    c.restore();
  }

  /* the navy band for the subtitle, sliding out from under the badge */
  const bl = lerp(bx - 30, x0 + (plaqueOn ? 70 : 40), bandP);
  if (bandP > .001) {
    const sweep = 34, bpts = [[bx + 10, btop], ...quadPts(bl + sweep, btop, bl + 4, btop, bl, bbot, 10), [bx + 10, bbot]];
    const bandPath = new Path2D(); addPoly(bandPath, bpts);
    c.save();
    const g = c.createLinearGradient(0, btop, 0, bbot); g.addColorStop(0, shade(P.main, 255, .16)); g.addColorStop(.5, P.main); g.addColorStop(1, shade(P.main, 0, .35));
    c.fillStyle = g; c.fill(bandPath);
    c.save(); c.clip(bandPath); const hl = c.createLinearGradient(0, btop, 0, btop + 12); hl.addColorStop(0, 'rgba(255,255,255,.22)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = hl; c.fillRect(bl, btop, bx - bl + 20, 12); c.restore();
    const ruleLine = [[bx, btop], [bl + sweep, btop], ...quadPts(bl + sweep, btop, bl + 4, btop, bl, bbot, 10).slice(1), [bl - 26 * bandP, bbot]];
    linePath(c, ruleLine); c.strokeStyle = metalBevel(c, 0, btop - 2, 0, bbot + 2, M); c.lineWidth = 2; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
    c.restore();
    if (P.shine && built > 0) comet(c, ruleLine, frac(shinePhase(P, t, 3.6) + .5), 80, M[4], 1.8, 9, built);
    if (hasSub) {
      const size = fit(c, P.subtitle, ssize, sf, tR - bl - 50);
      reveal(c, { x: bl + 20, y: btop, w: tR - bl, h: bbot - btop }, subTx, x => say(x, P.subtitle, tR + 2, (btop + bbot) / 2 + size * .36, size, sf, P.text, mir));
    }
  }

  /* the title and the divider */
  {
    const tL = x0 + (plaqueOn ? 76 : 30), size = fit(c, P.title, tSize0, tf, tR - tL), base = top + (btop - top) * .5 + size * .38;
    reveal(c, { x: tL - 10, y: top + 2, w: tR - tL + 20, h: btop - top - 4 }, txP, x => say(x, P.title, tR, base, size, tf, P.c1, mir));
    if (plaqueOn && divP > .01) {
      const dx = x0 + 52, mid = (top + btop) / 2, hh = (btop - top - 22) / 2 * divP;
      c.save(); c.strokeStyle = metalBevel(c, 0, mid - hh, 0, mid + hh, M); c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); c.moveTo(dx, mid - hh); c.lineTo(dx, mid + hh); c.stroke();
      c.fillStyle = M[2]; c.beginPath(); c.save(); c.translate(dx, mid - hh - 6); c.rotate(Math.PI / 4); c.rect(-2.6, -2.6, 5.2, 5.2); c.restore(); c.fill(); c.restore();
    }
  }

  /* the badge: ivory disc, double gold ring, the emblem */
  if (badgeP > .01) {
    const r = br * Math.max(.02, badgeP);
    c.save();
    if (P.dropShadow !== false) { shadowOn(c, 'rgba(0,0,0,.42)', 24, 10); c.fillStyle = P.c3; c.beginPath(); c.arc(bx, by, r, 0, TAU); c.fill(); shadowOff(c); }
    const g = c.createRadialGradient(bx - r * .35, by - r * .45, 2, bx, by, r); g.addColorStop(0, shade(P.c3, 255, .6)); g.addColorStop(.7, P.c3); g.addColorStop(1, shade(P.c3, 0, .1));
    c.fillStyle = g; c.beginPath(); c.arc(bx, by, r, 0, TAU); c.fill();
    if (P.pattern && P.pattern !== 'none' && patP > 0) {
      c.save(); c.beginPath(); c.arc(bx, by, Math.max(0, r - 8), 0, TAU); c.clip(); c.globalAlpha *= .35 * patP * clamp((Number(P.patternAmt) || 0) / 100); fillPattern(c, P.pattern, M[2], { x: bx - r, y: by - r, w: r * 2, h: r * 2 }); c.restore();
    }
    c.lineCap = 'round';
    c.strokeStyle = metalBevel(c, bx - r, by - r, bx + r, by + r, M); c.lineWidth = 5;
    c.beginPath(); c.arc(bx, by, Math.max(0, r - 2.5), -Math.PI / 2, -Math.PI / 2 + TAU * ringP); c.stroke();
    c.strokeStyle = alphaOf(M[2], .7); c.lineWidth = 1.2; c.beginPath(); c.arc(bx, by, Math.max(0, r - 10), Math.PI / 2, Math.PI / 2 + TAU * ringP); c.stroke();
    c.strokeStyle = alphaOf(M[2], .55); c.lineWidth = 1; c.beginPath(); c.arc(bx, by, r + 7, -Math.PI / 2, -Math.PI / 2 - TAU * ringP, true); c.stroke();
    const R = (br - 20) * Math.max(.02, badgeP);
    emblemStroke(c, bx, by, R, { draw: embP, style: metalBevel(c, bx - R, by - R, bx + R * .4, by + R, M), weight: 1.04 });
    if (P.shine && built > 0) {
      emblemShine(c, bx, by, R, { phase: shinePhase(P, t, 7.2), color: M[4], glow: 7, blur: kit.scale * zoom, alpha: built });
      comet(c, closed(circlePts(bx, by, r - 2.5, 90)), frac(shinePhase(P, t, 3.6) + .2), 80, M[4], 2.6, 12, built);
    }
    c.restore();
  }
  if (P.shine && built > 0) { comet(c, upper, shinePhase(P, t, 3.6), 150, M[4], 2.2, 12, built); comet(c, lower, frac(shinePhase(P, t, 3.6) + .5), 150, M[4], 2.2, 12, built); }

  /* the side plaque */
  if (plaqueOn && plaqueP > .01) {
    const sc = Math.max(.02, plaqueP), shape = roundPoly(PLAQUE.pts, PLAQUE.rad, 12), plate = new Path2D(); addPoly(plate, shape);
    const back = new Path2D(); addPoly(back, shape.map(([x, y]) => [x - 11, y + 8]));
    c.save(); c.translate(pcx, pcy); c.rotate((1 - plaqueP) * -.4); c.scale(sc, sc);
    if (P.dropShadow !== false) { c.save(); shadowOn(c, 'rgba(0,0,0,.42)', 20, 9); c.fillStyle = M[1]; c.fill(back); c.restore(); }
    c.fillStyle = metalBevel(c, -100, -90, 80, 90, M); c.fill(back);
    const g = c.createLinearGradient(0, -86, 0, 80); g.addColorStop(0, shade(P.c3, 255, .55)); g.addColorStop(1, shade(P.c3, 0, .05)); c.fillStyle = g; c.fill(plate);
    c.save(); c.clip(plate);
    const level = lerp(92, 26, waveP), wv = x => level + (4 + 2 * (1 - waveP)) * Math.sin(x * .055 + t * 1.7 * (.3 + ik)) + 2.4 * Math.sin(x * .12 - t * 2.4 * (.3 + ik));
    const surf = []; for (let x = -110; x <= 110; x += 6) surf.push([x, wv(x)]);
    const water = new Path2D(); addPoly(water, [...surf, [110, 120], [-110, 120]]);
    const ng = c.createLinearGradient(0, level - 8, 0, 90); ng.addColorStop(0, shade(P.main, 255, .12)); ng.addColorStop(1, shade(P.main, 0, .35)); c.fillStyle = ng; c.fill(water);
    linePath(c, surf); c.strokeStyle = metalBevel(c, 0, level - 6, 0, level + 6, M); c.lineWidth = 2.6; c.stroke();
    if (inside > 0) {
      c.save(); c.globalAlpha *= inside;
      if (P.plaque === 'kicker' && P.kicker) { const kf = tf, ks = fit(c, P.kicker, 28, kf, 118); say(c, P.kicker, 4, -14 + ks * .36, ks, kf, P.main, mir, 'center'); }
      else if (P.plaque === 'emblem') { const R = 34; emblemStroke(c, 4, -20, R, { style: metalBevel(c, -R, -54, R, 14, M) }); }
      else { c.save(); c.translate(12, -22); if (mir) c.scale(-1, 1); drawLogo(c, 'wordmark', P.main, 0, 0, 104); c.restore(); }
      c.restore();
    }
    c.restore();
    linePath(c, shape, true); c.strokeStyle = metalBevel(c, -100, -90, 80, 90, M); c.lineWidth = 4.5; c.lineJoin = 'round'; c.stroke();
    c.restore();
    if (P.shine && built > 0) {
      const world = shape.map(([x, y]) => [pcx + x * sc, pcy + y * sc]);
      comet(c, closed(world), frac(shinePhase(P, t, 3.6) + .7), 90, M[4], 2.4, 12, built);
    }
  }

  /* glints that catch on the metal now and then */
  if (P.particles && built > 0) {
    const spots = [[bx - br * .7, by - br * .7], [bx + br * .72, by + br * .5], [x0 + 140, top], [(x0 + bx) / 2, bot], [bx - 260, top], [x0 + 30, bot - 4], [bx - br * .1, by + br]];
    if (plaqueOn) spots.push([pcx + 70, pcy - 80], [pcx - 90, pcy + 74]);
    spots.forEach(([x, y], i) => { const k = Math.max(0, Math.sin(t * (1.1 + .2 * (i % 3)) + i * 2.3)) ** 10; sparkle(c, x, y, 3 + 5 * k, '#ffffff', k * built); });
  }
  c.restore();
}

const BASE = { speed: 1, glow: true, particles: true, dropShadow: true, shine: true, shineSpeed: 1, side: 'right', size: 100, lift: 0, mIn: 60, mOut: 50, mIdle: 60, tHold: 4, tOut: 1.6 };
export const RIBBONS = [
  { id: 'rp-liquid', name: 'Liquid Gold', raw: true, draw: drawLiquid, timing: P => ({ total: rtotal(P) }),
    defaults: { ...BASE, tIn: 3.2, title: 'أثر يمتد', subtitle: 'مركز الاتصال المؤسسي', kicker: '', main: '#11233a', text: '#fbf3df', c1: '#22180a', accent: '#c9993f',
      metal: 'gold', pattern: 'emblem', patternAmt: 22, font: 'plex', span: 'auto', flow: 60, drips: true } },
  { id: 'rp-ivory', name: 'Ivory Plaque', raw: true, draw: drawIvory, timing: P => ({ total: rtotal(P) }),
    defaults: { ...BASE, tIn: 3.0, title: 'أثر يمتد', subtitle: 'مركز الاتصال المؤسسي', kicker: 'حصري', main: '#34485a', text: '#fbf6ea', c1: '#26333f', c3: '#f8f3e8', accent: '#c9993f',
      metal: 'gold', pattern: 'girih', patternAmt: 45, font: 'kufi', span: 'auto', plaque: 'wordmark' } },
];
